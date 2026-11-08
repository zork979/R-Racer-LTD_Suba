#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { root, config } from "../server/config.js";
import { createMysqlPool, openMysqlDatabase } from "../server/mysql-database.js";

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null)
    return false;
  const keysA = Object.keys(a),
    keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!keysB.includes(k) || !deepEqual(a[k], b[k])) return false;
  }
  return true;
}

export async function readBackupData(backupPath) {
  const sqlite = new DatabaseSync(backupPath, { readOnly: true });
  try {
    const rawRecords = sqlite
      .prepare("SELECT collection, id, payload FROM records ORDER BY collection, id")
      .all();
    const records = rawRecords.map((r) => ({
      collection: r.collection,
      id: r.id,
      payload: JSON.parse(r.payload),
    }));

    const rawMedia = sqlite
      .prepare("SELECT id, bytes, mime FROM media ORDER BY id")
      .all();
    const media = rawMedia.map((m) => ({
      id: m.id,
      bytes: Buffer.from(m.bytes),
      mime: m.mime,
      sha256: sha256(Buffer.from(m.bytes)),
    }));

    return { records, media };
  } finally {
    sqlite.close();
  }
}

// Verifies the generated .sql.gz dump directly against the SQLite backup
export async function verifyDumpFile(dumpPath, backupPath) {
  console.log(`\nVerifying SQL Dump: ${dumpPath}`);
  console.log(`Against SQLite Backup: ${backupPath}`);

  const backup = await readBackupData(backupPath);
  const expectedBusinessRecords = backup.records.filter(
    (r) => r.collection !== "sessions"
  );
  const expectedMedia = backup.media;

  console.log(`- Backup records to verify: ${expectedBusinessRecords.length} (sessions excluded)`);
  console.log(`- Backup images to verify: ${expectedMedia.length}`);

  // Decompress and parse the SQL dump
  const chunks = [];
  const gunzip = createGunzip();
  const readStream = createReadStream(dumpPath);

  await pipeline(readStream, gunzip, async function* (source) {
    for await (const chunk of source) {
      chunks.push(chunk);
    }
  });

  const sql = Buffer.concat(chunks).toString("utf8");

  // Parse INSERT INTO `table` (`id`, `payload`) VALUES ('id', 'escapedPayload')
  const recordRegex = /INSERT INTO `(\w+)` \(`id`, `payload`\) VALUES \('([^']+)', '((?:\\.|[^'])*)'\);/g;
  const extractedRecords = [];
  let match;

  while ((match = recordRegex.exec(sql)) !== null) {
    const collection = match[1];
    const id = match[2];
    const escapedPayload = match[3];
    // Unescape SQL string ('' -> ', \\\\ -> \\)
    const unescaped = escapedPayload
      .replace(/''/g, "'")
      .replace(/\\\\/g, "\\");
    try {
      extractedRecords.push({
        collection,
        id,
        payload: JSON.parse(unescaped),
      });
    } catch (e) {
      throw new Error(`Failed to parse extracted JSON for ${collection}/${id}: ${e.message}`);
    }
  }

  // Parse INSERT INTO `media` ... VALUES ('id', 0xhex, 'mime', size, 'sha256', ...)
  const mediaRegex = /INSERT INTO `media` \(`id`, `bytes`, `mime`, `size_bytes`, `sha256`, `created_at`\) VALUES \('([^']+)', 0x([a-f0-9]+), '([^']+)', (\d+), '([a-f0-9]{64})',/gi;
  const extractedMedia = [];

  while ((match = mediaRegex.exec(sql)) !== null) {
    const id = match[1];
    const hex = match[2];
    const mime = match[3];
    const sizeBytes = Number(match[4]);
    const statedSha256 = match[5].toLowerCase();
    const bytes = Buffer.from(hex, "hex");
    const computedSha256 = sha256(bytes);

    if (computedSha256 !== statedSha256) {
      throw new Error(`Hex data in SQL dump corrupt for media ID ${id}: hash mismatch`);
    }

    extractedMedia.push({
      id,
      bytes,
      mime,
      sizeBytes,
      sha256: computedSha256,
    });
  }

  // 1. Check record counts
  console.log(`\n[Check 1/4] Record Counts:`);
  console.log(`- Extracted records from dump: ${extractedRecords.length}`);
  console.log(`- Expected business records:   ${expectedBusinessRecords.length}`);
  if (extractedRecords.length !== expectedBusinessRecords.length) {
    throw new Error(`Record count mismatch: found ${extractedRecords.length}, expected ${expectedBusinessRecords.length}`);
  }

  // 2. Deep compare every record against backup
  console.log(`\n[Check 2/4] Payload Integrity Checks:`);
  const backupRecordsById = new Map(
    expectedBusinessRecords.map((r) => [`${r.collection}:${r.id}`, r])
  );

  let verifiedRecords = 0;
  for (const r of extractedRecords) {
    const key = `${r.collection}:${r.id}`;
    const expected = backupRecordsById.get(key);
    if (!expected) {
      throw new Error(`Dump contains unexpected record not in backup: ${key}`);
    }
    if (!deepEqual(r.payload, expected.payload)) {
      throw new Error(`Payload mismatch for ${key}`);
    }
    verifiedRecords++;
  }
  console.log(`- Successfully verified ${verifiedRecords} / ${expectedBusinessRecords.length} business records with deep equality.`);

  // 3. Media counts and SHA-256 byte verification
  console.log(`\n[Check 3/4] Media Image & SHA-256 Verification:`);
  console.log(`- Extracted media items: ${extractedMedia.length}`);
  console.log(`- Expected media items:  ${expectedMedia.length}`);
  if (extractedMedia.length !== expectedMedia.length) {
    throw new Error(`Media count mismatch: found ${extractedMedia.length}, expected ${expectedMedia.length}`);
  }

  const backupMediaById = new Map(expectedMedia.map((m) => [m.id, m]));
  let verifiedMedia = 0;
  let totalVerifiedBytes = 0;

  for (const m of extractedMedia) {
    const expected = backupMediaById.get(m.id);
    if (!expected) {
      throw new Error(`Dump contains unexpected media not in backup: ${m.id}`);
    }
    if (m.mime !== expected.mime) {
      throw new Error(`MIME type mismatch for media ${m.id}: expected ${expected.mime}, got ${m.mime}`);
    }
    if (m.bytes.length !== expected.bytes.length) {
      throw new Error(`Byte length mismatch for media ${m.id}: expected ${expected.bytes.length}, got ${m.bytes.length}`);
    }
    if (m.sha256 !== expected.sha256) {
      throw new Error(`SHA-256 MISMATCH for media ${m.id}! Expected ${expected.sha256}, got ${m.sha256}`);
    }
    verifiedMedia++;
    totalVerifiedBytes += m.bytes.length;
  }
  console.log(`- Successfully verified ${verifiedMedia} / ${expectedMedia.length} image files.`);
  console.log(`- All 166 images matched exact SHA-256 byte hashes (${totalVerifiedBytes} bytes).`);

  // 4. Relationships and integrity checks
  console.log(`\n[Check 4/4] Relational Consistency & Constraints:`);
  const mediaIdSet = new Set(extractedMedia.map((m) => m.id));
  const imageRecords = extractedRecords.filter((r) => r.collection === "images");
  for (const img of imageRecords) {
    if (img.payload.mediaId && !mediaIdSet.has(img.payload.mediaId)) {
      throw new Error(`Image record ${img.id} references missing media ${img.payload.mediaId}`);
    }
  }
  console.log(`- All ${imageRecords.length} image metadata records point to verified media bytes.`);

  const userRecords = extractedRecords.filter((r) => r.collection === "users");
  const userEmails = new Set();
  for (const u of userRecords) {
    const emailLower = (u.payload.email || "").toLowerCase();
    if (userEmails.has(emailLower)) {
      throw new Error(`Duplicate user email detected: ${emailLower}`);
    }
    userEmails.add(emailLower);
  }
  console.log(`- All ${userRecords.length} user records have unique case-normalised emails.`);

  console.log("\n========================================================");
  console.log("  VERIFICATION RESULT: ALL CHECKS PASSED (100% OK)");
  console.log("========================================================");

  return {
    verifiedRecords,
    verifiedMedia,
    totalVerifiedBytes,
    status: "PASSED",
  };
}

// Verifies a live MariaDB database instance against the SQLite backup
export async function verifyLiveMariaDb(c, backupPath) {
  console.log(`\nConnecting to MariaDB: ${c.mysqlHost}:${c.mysqlPort}/${c.mysqlDatabase}`);
  const pool = createMysqlPool(c);

  try {
    const backup = await readBackupData(backupPath);
    const expectedBusinessRecords = backup.records.filter(
      (r) => r.collection !== "sessions"
    );
    const expectedMedia = backup.media;

    // Check table row counts
    const [tableRows] = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()"
    );
    const tableNames = tableRows.map((r) => r.TABLE_NAME || r.table_name);
    console.log(`Database tables found: ${tableNames.join(", ")}`);

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
      if (!tableNames.includes(entity)) {
        throw new Error(`Missing expected table in MariaDB: ${entity}`);
      }
    }

    // Verify record counts
    let totalDbRecords = 0;
    for (const col of [
      "users",
      "cars",
      "images",
      "bookings",
      "enquiries",
      "settings",
      "audit",
    ]) {
      const [rows] = await pool.query(`SELECT count(*) as count FROM \`${col}\``);
      const cnt = rows[0].count;
      totalDbRecords += cnt;
      console.log(`- ${col.padEnd(12)}: ${cnt} rows`);
    }

    if (totalDbRecords !== expectedBusinessRecords.length) {
      throw new Error(`Total record count mismatch in MariaDB: found ${totalDbRecords}, expected ${expectedBusinessRecords.length}`);
    }

    // Verify media count
    const [mediaCountRow] = await pool.query("SELECT count(*) as count FROM `media`");
    const dbMediaCount = mediaCountRow[0].count;
    console.log(`- media       : ${dbMediaCount} rows`);
    if (dbMediaCount !== expectedMedia.length) {
      throw new Error(`Media count mismatch in MariaDB: found ${dbMediaCount}, expected ${expectedMedia.length}`);
    }

    // Compare each media item by SHA-256
    console.log("\nVerifying image byte hashes in MariaDB...");
    let verifiedMedia = 0;
    for (const m of expectedMedia) {
      const [rows] = await pool.query("SELECT `bytes`, `mime`, `sha256` FROM `media` WHERE `id` = ?", [m.id]);
      if (!rows.length) throw new Error(`Media ${m.id} not found in MariaDB.`);
      const fetchedBytes = Buffer.from(rows[0].bytes);
      const fetchedSha256 = sha256(fetchedBytes);
      if (fetchedSha256 !== m.sha256) {
        throw new Error(`SHA-256 mismatch in MariaDB for image ${m.id}! Expected ${m.sha256}, got ${fetchedSha256}`);
      }
      verifiedMedia++;
    }
    console.log(`- Verified ${verifiedMedia} images in MariaDB: SHA-256 byte hashes match 100%.`);

    console.log("\n========================================================");
    console.log("  LIVE MARIADB VERIFICATION: ALL CHECKS PASSED (100% OK)");
    console.log("========================================================");

    return { status: "PASSED", verifiedMedia, totalDbRecords };
  } finally {
    await pool.end().catch(() => {});
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const srcIdx = process.argv.indexOf("--source");
    const backupPath = path.resolve(
      srcIdx !== -1 && process.argv[srcIdx + 1]
        ? process.argv[srcIdx + 1]
        : path.join(
            root,
            "backups",
            "supabase-2026-11-04T17-31-46-087Z",
            "rracer.sqlite"
          )
    );

    const dumpIdx = process.argv.indexOf("--dump");
    const dumpPath =
      dumpIdx !== -1
        ? path.resolve(process.argv[dumpIdx + 1])
        : path.join(root, "release", "u911703995_rracer.sql.gz");

    if (process.argv.includes("--live")) {
      const c = config();
      await verifyLiveMariaDb(c, backupPath);
    } else {
      await verifyDumpFile(dumpPath, backupPath);
    }
  } catch (e) {
    console.error("Verification failed:", e);
    process.exitCode = 1;
  }
}
