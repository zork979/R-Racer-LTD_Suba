#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { root } from "../server/config.js";

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

export function escapeSqlString(str) {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

export async function exportMariaDbDump(options = {}) {
  const source = path.resolve(
    options.source ||
      path.join(
        root,
        "backups",
        "supabase-2026-11-04T17-31-46-087Z",
        "rracer.sqlite"
      )
  );

  const destGz = path.resolve(
    options.out || path.join(root, "release", "u911703995_rracer.sql.gz")
  );
  const destManifest = destGz.replace(/\.sql\.gz$/i, "_manifest.json");

  console.log("========================================================");
  console.log("  R Racer MariaDB Exporter (.sql.gz)");
  console.log("========================================================");
  console.log(`Source backup: ${source}`);
  console.log(`Target database: u911703995_rracer`);
  console.log(`Target engine: MariaDB 11.8.9`);

  const sqlite = new DatabaseSync(source, { readOnly: true });
  let totalRecords, sessionsCount, allRecords, mediaRows;

  try {
    const totalRow = sqlite.prepare("SELECT count(*) as count FROM records").get();
    totalRecords = totalRow.count;

    const sessionsRow = sqlite
      .prepare("SELECT count(*) as count FROM records WHERE collection = ?")
      .get("sessions");
    sessionsCount = sessionsRow ? sessionsRow.count : 0;

    allRecords = sqlite
      .prepare("SELECT collection, id, payload FROM records ORDER BY collection, id")
      .all()
      .map((r) => ({
        collection: r.collection,
        id: r.id,
        payload: JSON.parse(r.payload),
      }));

    mediaRows = sqlite
      .prepare("SELECT id, bytes, mime FROM media ORDER BY id")
      .all()
      .map((r) => ({
        id: r.id,
        bytes: Buffer.from(r.bytes),
        mime: r.mime,
      }));
  } finally {
    sqlite.close();
  }

  // Verify observed counts against requirements
  console.log(`\nRechecking source backup counts:`);
  console.log(`- Total records: ${totalRecords} (expected 243)`);
  console.log(`- Old login sessions: ${sessionsCount} (expected 13)`);
  console.log(`- Uploaded images: ${mediaRows.length} (expected 166)`);

  if (totalRecords !== 243) {
    throw new Error(`Backup total records mismatch: found ${totalRecords}, expected 243`);
  }
  if (sessionsCount !== 13) {
    throw new Error(`Backup sessions count mismatch: found ${sessionsCount}, expected 13`);
  }
  if (mediaRows.length !== 166) {
    throw new Error(`Backup media count mismatch: found ${mediaRows.length}, expected 166`);
  }

  // Filter out old login sessions: sessions are invalidated on migration, users sign in again
  const businessRecords = allRecords.filter((r) => r.collection !== "sessions");
  console.log(`- Business records to export: ${businessRecords.length} (sessions excluded)`);

  const collectionCounts = {};
  for (const r of businessRecords) {
    collectionCounts[r.collection] = (collectionCounts[r.collection] || 0) + 1;
  }
  for (const [col, cnt] of Object.entries(collectionCounts).sort()) {
    console.log(`  * ${col.padEnd(14)}: ${cnt}`);
  }

  const totalMediaBytes = mediaRows.reduce((sum, m) => sum + m.bytes.length, 0);
  console.log(`- Total media size: ${(totalMediaBytes / (1024 * 1024)).toFixed(2)} MB (${totalMediaBytes} bytes)`);

  // Read schema DDL
  const schemaPath = path.join(root, "mariadb", "schema.sql");
  const schemaDdl = await readFile(schemaPath, "utf8");

  // Build SQL dump stream
  const timestamp = new Date().toISOString();
  const mediaHashes = {};
  for (const m of mediaRows) {
    mediaHashes[m.id] = {
      mime: m.mime,
      sizeBytes: m.bytes.length,
      sha256: sha256(m.bytes),
    };
  }

  const manifest = {
    generatedAt: timestamp,
    sourceBackup: source,
    targetDatabase: "u911703995_rracer",
    targetEngine: "MariaDB 11.8.9",
    totalSourceRecords: totalRecords,
    sessionsExcluded: sessionsCount,
    businessRecordsExported: businessRecords.length,
    collectionCounts,
    mediaCount: mediaRows.length,
    totalMediaBytes,
    media: mediaHashes,
  };

  async function* generateSqlChunks() {
    yield `-- ====================================================================\n`;
    yield `-- R Racer MariaDB Production Import Dump\n`;
    yield `-- Target Engine: MariaDB 11.8.9 / MySQL 8.0+\n`;
    yield `-- Target Database: u911703995_rracer\n`;
    yield `-- Generated: ${timestamp}\n`;
    yield `-- Source Snapshot: supabase-2026-11-04T17-31-46-087Z\n`;
    yield `-- phpMyAdmin Ready: Compressed .sql.gz (upload limit 256 MiB)\n`;
    yield `-- ====================================================================\n\n`;

    yield `SET FOREIGN_KEY_CHECKS = 0;\n`;
    yield `SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n`;
    yield `SET NAMES utf8mb4;\n`;
    yield `SET time_zone = '+00:00';\n\n`;

    yield `-- Schema Definition\n`;
    yield schemaDdl;
    yield `\n\n`;

    yield `START TRANSACTION;\n\n`;

    yield `-- Clean existing data to ensure idempotent import into target schema\n`;
    for (const entity of [
      "users",
      "cars",
      "images",
      "bookings",
      "slots",
      "enquiries",
      "settings",
      "audit",
      "sessions",
      "notifications",
      "media",
    ]) {
      yield `DELETE FROM \`${entity}\`;\n`;
    }
    yield `\n`;

    // Group business records by collection
    const byCollection = new Map();
    for (const r of businessRecords) {
      if (!byCollection.has(r.collection)) byCollection.set(r.collection, []);
      byCollection.get(r.collection).push(r);
    }

    for (const [col, records] of byCollection.entries()) {
      yield `-- Collection: ${col} (${records.length} records)\n`;
      for (const r of records) {
        const payloadJson = JSON.stringify(r.payload);
        const escaped = escapeSqlString(payloadJson);
        yield `INSERT INTO \`${col}\` (\`id\`, \`payload\`) VALUES ('${r.id}', '${escaped}');\n`;
      }
      yield `\n`;
    }

    // Export media rows with hex representation
    yield `-- Media binary storage (${mediaRows.length} items, ${totalMediaBytes} bytes)\n`;
    for (const m of mediaRows) {
      const hex = m.bytes.toString("hex");
      const hash = sha256(m.bytes);
      yield `INSERT INTO \`media\` (\`id\`, \`bytes\`, \`mime\`, \`size_bytes\`, \`sha256\`, \`created_at\`) VALUES ('${m.id}', 0x${hex}, '${m.mime}', ${m.bytes.length}, '${hash}', NOW());\n`;
    }
    yield `\n`;

    // Migration marker
    const migrationDetails = escapeSqlString(
      JSON.stringify({
        sourceSnapshot: "supabase-2026-11-04T17-31-46-087Z",
        records: collectionCounts,
        images: mediaRows.length,
        imageBytes: totalMediaBytes,
        importedAt: timestamp,
      })
    );
    yield `-- Migration marker\n`;
    yield `INSERT INTO \`migrations\` (\`id\`, \`applied_at\`, \`details\`) VALUES ('migration-2026-11-04T17-31-46-087Z', NOW(), '${migrationDetails}') ON DUPLICATE KEY UPDATE \`details\`=VALUES(\`details\`);\n\n`;

    yield `COMMIT;\n`;
    yield `SET FOREIGN_KEY_CHECKS = 1;\n`;
    yield `-- ====================================================================\n`;
    yield `-- End of R Racer MariaDB Dump\n`;
    yield `-- ====================================================================\n`;
  }

  await mkdir(path.dirname(destGz), { recursive: true });

  console.log(`\nStreaming SQL dump and compressing with gzip (level 9)...`);
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

  const gzip = createGzip({ level: 9 });
  const outStream = createWriteStream(destGz);

  await pipeline(Readable.from(hashingGenerator()), gzip, outStream);

  const gzStat = await stat(destGz);
  const gzHash = sha256(await readFile(destGz));
  manifest.sqlSha256 = rawHash.digest("hex");
  manifest.sqlGzSha256 = gzHash;
  manifest.uncompressedBytes = rawBytesWritten;
  manifest.compressedBytes = gzStat.size;

  await writeFile(destManifest, JSON.stringify(manifest, null, 2), "utf8");

  console.log("\n========================================================");
  console.log("  MariaDB Export Successfully Generated!");
  console.log("========================================================");
  console.log(`Uncompressed SQL size: ${(rawBytesWritten / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Compressed .sql.gz size: ${(gzStat.size / (1024 * 1024)).toFixed(2)} MB (${gzStat.size} bytes)`);
  console.log(`phpMyAdmin Limit: 256 MiB — fits with ease (${((gzStat.size / (256 * 1024 * 1024)) * 100).toFixed(1)}% of limit)`);
  console.log(`\nGenerated files:`);
  console.log(`1. SQL Import: ${destGz}`);
  console.log(`2. Manifest:   ${destManifest}`);
  console.log(`\nImport instructions:`);
  console.log(`- Open Hostinger hPanel > Databases > phpMyAdmin for u911703995_rracer`);
  console.log(`- Click 'Import', select 'u911703995_rracer.sql.gz', and click 'Go'`);
  console.log("========================================================");

  return {
    destGz,
    destManifest,
    counts: collectionCounts,
    mediaCount: mediaRows.length,
    uncompressedBytes: rawBytesWritten,
    compressedBytes: gzStat.size,
    sqlGzSha256: gzHash,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const srcIdx = process.argv.indexOf("--source");
    const outIdx = process.argv.indexOf("--out");
    await exportMariaDbDump({
      source: srcIdx !== -1 ? process.argv[srcIdx + 1] : undefined,
      out: outIdx !== -1 ? process.argv[outIdx + 1] : undefined,
    });
  } catch (e) {
    console.error("Export failed:", e);
    process.exitCode = 1;
  }
}
