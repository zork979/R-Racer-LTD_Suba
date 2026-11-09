#!/usr/bin/env node
import tls from "node:tls";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { root } from "../server/config.js";
import { createPostgresPool, entities, sha256 } from "../server/supabase-database.js";
import { createImageStorage } from "../server/supabase-storage.js";
import { loadSupabaseEnv, reportSetupError } from "./supabase-env.js";
import { escapeSqlString } from "./mariadb-export.js";

if (
  typeof tls.getCACertificates === "function" &&
  typeof tls.setDefaultCACertificates === "function"
) {
  tls.setDefaultCACertificates([
    ...tls.getCACertificates("default"),
    ...tls.getCACertificates("system"),
  ]);
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  const val = process.argv[idx + 1];
  if (!val || val.startsWith("--")) {
    throw new Error(`Provide a value after ${flag}.`);
  }
  return val;
}

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function exportSupabaseToPhpMyAdmin(c, options = {}) {
  const dbName = options.database ?? "u911703995_rracer";
  const includeUseDb = options.useDb !== false && Boolean(dbName);
  const includeSessions = Boolean(options.includeSessions);
  const destGz = path.resolve(
    options.out || path.join(root, "release", `${dbName || "rracer"}_supabase_import.sql.gz`),
  );
  const destManifest = destGz.replace(/\.sql\.gz$/i, "_manifest.json");

  console.log("========================================================");
  console.log("  Supabase -> phpMyAdmin / MariaDB Live Exporter");
  console.log("========================================================");
  console.log(`Source Supabase: ${c.supabaseUrl}`);
  console.log(`Storage Bucket:  ${c.supabaseBucket}`);
  console.log(`Target Database: ${dbName || "(current selected database)"}`);

  const pool = await createPostgresPool(c);
  const storage = createImageStorage(c);
  let client;

  const collections = new Map();
  let mediaRows = [];
  let mediaItems = [];
  let sessionsExcluded = 0;

  try {
    client = await pool.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

    console.log("\nFetching records from Supabase PostgreSQL (rracer schema)...");
    for (const name of entities) {
      const { rows } = await client.query(
        `SELECT id, payload FROM rracer."${name}" ORDER BY id`,
      );
      if (name === "sessions" && !includeSessions) {
        sessionsExcluded = rows.length;
        collections.set(name, []);
        continue;
      }
      collections.set(name, rows);
    }

    const mediaQuery = await client.query(
      "SELECT id, object_path, mime, size_bytes, sha256, created_at FROM rracer.media ORDER BY id",
    );
    mediaRows = mediaQuery.rows;

    await client.query("COMMIT");
  } catch (e) {
    await client?.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client?.release();
    await pool.end();
  }

  let totalBusinessRecords = 0;
  const collectionCounts = {};
  for (const [name, rows] of collections.entries()) {
    collectionCounts[name] = rows.length;
    totalBusinessRecords += rows.length;
    if (name !== "sessions" || includeSessions) {
      console.log(`  * ${name.padEnd(14)}: ${rows.length}`);
    }
  }
  console.log(`- Total business records: ${totalBusinessRecords}`);
  console.log(`- Sessions excluded:      ${sessionsExcluded} (users log in fresh)`);
  console.log(`\nDownloading ${mediaRows.length} media files from Supabase Storage (${c.supabaseBucket})...`);

  let downloadedCount = 0;
  mediaItems = await mapConcurrent(mediaRows, 8, async (m) => {
    const bytes = await storage.get(m.object_path);
    const actualHash = sha256(bytes);
    if (actualHash !== m.sha256) {
      throw new Error(
        `SHA-256 mismatch for media ${m.id} (${m.object_path}): expected ${m.sha256}, got ${actualHash}`,
      );
    }
    downloadedCount++;
    if (downloadedCount % 25 === 0 || downloadedCount === mediaRows.length) {
      console.log(`  Downloaded & verified ${downloadedCount}/${mediaRows.length} images...`);
    }
    return {
      id: m.id,
      mime: m.mime,
      bytes,
      sha256: actualHash,
      createdAt: m.created_at ? new Date(m.created_at) : new Date(),
    };
  });

  const totalMediaBytes = mediaItems.reduce((sum, m) => sum + m.bytes.length, 0);
  console.log(
    `- Verified ${mediaItems.length} images (${(totalMediaBytes / (1024 * 1024)).toFixed(2)} MB)`,
  );

  const schemaPath = path.join(root, "mariadb", "schema.sql");
  const schemaDdl = await readFile(schemaPath, "utf8");
  const timestamp = new Date().toISOString();

  async function* generateSqlChunks() {
    yield `-- ====================================================================\n`;
    yield `-- R Racer Live Supabase -> phpMyAdmin / MariaDB Import Dump\n`;
    yield `-- Target Engine: MariaDB 11.8.9 / MySQL 8.0+\n`;
    yield `-- Target Database: ${dbName || "(selected in phpMyAdmin)"}\n`;
    yield `-- Source Supabase: ${c.supabaseUrl}\n`;
    yield `-- Generated: ${timestamp}\n`;
    yield `-- ====================================================================\n\n`;

    if (includeUseDb) {
      yield `USE \`${dbName.replace(/`/g, "")}\`;\n\n`;
    }

    yield `SET FOREIGN_KEY_CHECKS = 0;\n`;
    yield `SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n`;
    yield `SET NAMES utf8mb4;\n`;
    yield `SET time_zone = '+00:00';\n\n`;

    yield `-- Schema Definition\n`;
    yield schemaDdl;
    yield `\n\n`;

    yield `START TRANSACTION;\n\n`;

    yield `-- Clean existing rows so import is repeatable without duplicate key errors\n`;
    for (const entity of entities) {
      yield `DELETE FROM \`${entity}\`;\n`;
    }
    yield `DELETE FROM \`media\`;\n\n`;

    for (const [col, rows] of collections.entries()) {
      if (!rows.length) continue;
      yield `-- Collection: ${col} (${rows.length} records)\n`;
      for (const r of rows) {
        const escapedId = escapeSqlString(String(r.id));
        const escapedPayload = escapeSqlString(JSON.stringify(r.payload));
        yield `INSERT INTO \`${col}\` (\`id\`, \`payload\`) VALUES ('${escapedId}', '${escapedPayload}');\n`;
      }
      yield `\n`;
    }

    yield `-- Media binary storage (${mediaItems.length} items, ${totalMediaBytes} bytes)\n`;
    for (const m of mediaItems) {
      const escapedId = escapeSqlString(String(m.id));
      const escapedMime = escapeSqlString(String(m.mime));
      const hex = m.bytes.toString("hex");
      const createdUtc = m.createdAt.toISOString().slice(0, 19).replace("T", " ");
      yield `INSERT INTO \`media\` (\`id\`, \`bytes\`, \`mime\`, \`size_bytes\`, \`sha256\`, \`created_at\`) VALUES ('${escapedId}', 0x${hex}, '${escapedMime}', ${m.bytes.length}, '${m.sha256}', '${createdUtc}');\n`;
    }
    yield `\n`;

    const migrationDetails = escapeSqlString(
      JSON.stringify({
        source: "live-supabase",
        supabaseUrl: c.supabaseUrl,
        records: collectionCounts,
        images: mediaItems.length,
        imageBytes: totalMediaBytes,
        exportedAt: timestamp,
      }),
    );
    yield `-- Migration tracking record\n`;
    yield `INSERT INTO \`migrations\` (\`id\`, \`applied_at\`, \`details\`) VALUES ('supabase-live-${timestamp.replace(/[:.]/g, "-")}', NOW(), '${migrationDetails}') ON DUPLICATE KEY UPDATE \`details\` = VALUES(\`details\`);\n\n`;

    yield `COMMIT;\n`;
    yield `SET FOREIGN_KEY_CHECKS = 1;\n`;
    yield `-- ====================================================================\n`;
    yield `-- End of Live Supabase Import Dump\n`;
    yield `-- ====================================================================\n`;
  }

  await mkdir(path.dirname(destGz), { recursive: true });

  console.log(`\nWriting compressed phpMyAdmin import dump to ${destGz}...`);
  const rawHash = createHash("sha256");
  let rawBytesWritten = 0;

  async function* hashingGenerator() {
    for await (const chunk of generateSqlChunks()) {
      const buf = Buffer.from(chunk, "utf8");
      rawHash.update(buf);
      rawBytesWritten += buf.length;
      yield buf;
    }
  }

  await pipeline(
    Readable.from(hashingGenerator()),
    createGzip({ level: 9 }),
    createWriteStream(destGz),
  );

  const gzStat = await stat(destGz);
  const gzHash = sha256(await readFile(destGz));

  const manifest = {
    generatedAt: timestamp,
    sourceUrl: c.supabaseUrl,
    targetDatabase: dbName,
    sessionsExcluded,
    businessRecordsExported: totalBusinessRecords,
    collectionCounts,
    mediaCount: mediaItems.length,
    totalMediaBytes,
    uncompressedBytes: rawBytesWritten,
    compressedBytes: gzStat.size,
    sqlSha256: rawHash.digest("hex"),
    sqlGzSha256: gzHash,
  };
  await writeFile(destManifest, JSON.stringify(manifest, null, 2), "utf8");

  console.log("\n========================================================");
  console.log("  Supabase -> phpMyAdmin Export Completed Successfully!");
  console.log("========================================================");
  console.log(`Uncompressed SQL size: ${(rawBytesWritten / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Compressed .sql.gz:    ${(gzStat.size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Import File:           ${destGz}`);
  console.log(`Manifest File:         ${destManifest}`);
  console.log("\nHow to import into Hostinger phpMyAdmin:");
  console.log(`1. Open Hostinger hPanel > Databases > phpMyAdmin for '${dbName || "your database"}'`);
  console.log(`2. Click the 'Import' tab`);
  console.log(`3. Choose file: ${path.basename(destGz)}`);
  console.log(`4. Click 'Import' / 'Go' at the bottom (phpMyAdmin extracts .sql.gz automatically)`);
  console.log("========================================================");

  return {
    destGz,
    destManifest,
    counts: collectionCounts,
    mediaCount: mediaItems.length,
    totalMediaBytes,
    uncompressedBytes: rawBytesWritten,
    compressedBytes: gzStat.size,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const out = getArg("--out");
    const database = process.argv.includes("--no-use-db")
      ? ""
      : getArg("--database") || "u911703995_rracer";
    const includeSessions = process.argv.includes("--include-sessions");
    await exportSupabaseToPhpMyAdmin(loadSupabaseEnv(), {
      out,
      database,
      useDb: !process.argv.includes("--no-use-db"),
      includeSessions,
    });
  } catch (e) {
    console.error("Supabase export failed:", reportSetupError(e));
    process.exitCode = 1;
  }
}
