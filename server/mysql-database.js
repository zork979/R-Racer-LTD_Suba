import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

export const entities = [
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
];

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

const check = (n) => {
  if (!entities.includes(n)) throw new Error("Invalid collection");
};

export function matches(row, query) {
  return Object.entries(query).every(([key, val]) => {
    if (key === "$or") return val.some((q) => matches(row, q));
    const current = row[key];
    if (val && typeof val === "object" && !Array.isArray(val))
      return Object.entries(val).every(
        ([op, x]) =>
          ({
            $in: () => x.includes(current),
            $ne: () => current !== x,
            $lt: () => current < x,
            $gt: () => current > x,
            $gte: () => current >= x,
            $lte: () => current <= x,
          })[op]?.() ?? false,
      );
    return current === val;
  });
}

export function buildWhere(query, params) {
  const parts = [];
  for (const [key, val] of Object.entries(query)) {
    if (key === "$or") {
      if (!Array.isArray(val) || val.length === 0) {
        parts.push("0=1");
      } else {
        const orClauses = val.map((sub) => `(${buildWhere(sub, params)})`);
        parts.push(`(${orClauses.join(" OR ")})`);
      }
      continue;
    }

    const isId = key === "_id" || key === "id";
    const col = isId ? "`id`" : `JSON_UNQUOTE(JSON_EXTRACT(\`payload\`, '$.${key}'))`;

    if (val && typeof val === "object" && !Array.isArray(val)) {
      for (const [op, x] of Object.entries(val)) {
        if (op === "$in") {
          if (!Array.isArray(x) || x.length === 0) {
            parts.push("0=1");
          } else {
            const placeholders = x.map(() => "?").join(", ");
            parts.push(`${col} IN (${placeholders})`);
            for (const item of x) params.push(String(item));
          }
        } else if (op === "$ne") {
          parts.push(`(${col} != ? OR ${col} IS NULL)`);
          params.push(String(x));
        } else if (op === "$lt") {
          parts.push(`${col} < ?`);
          params.push(String(x));
        } else if (op === "$lte") {
          parts.push(`${col} <= ?`);
          params.push(String(x));
        } else if (op === "$gt") {
          parts.push(`${col} > ?`);
          params.push(String(x));
        } else if (op === "$gte") {
          parts.push(`${col} >= ?`);
          params.push(String(x));
        }
      }
    } else if (val === null) {
      parts.push(`(${col} IS NULL OR ${col} = 'null')`);
    } else {
      parts.push(`${col} = ?`);
      params.push(String(val));
    }
  }
  return parts.length ? parts.join(" AND ") : "1=1";
}

export function mysqlOptions(c) {
  let opts = {
    waitForConnections: true,
    connectionLimit: c.mysqlPoolMax || 10,
    queueLimit: 0,
    maxAllowedPacket: 64 * 1024 * 1024,
    timezone: "+00:00",
    charset: "utf8mb4",
    supportBigNumbers: true,
    bigNumberStrings: false,
  };

  if (c.mysqlUrl) {
    const url = new URL(c.mysqlUrl);
    opts.host = url.hostname;
    opts.port = Number(url.port || 3306);
    opts.user = decodeURIComponent(url.username);
    opts.password = decodeURIComponent(url.password);
    opts.database = url.pathname.replace(/^\//, "");
    if (url.searchParams.get("ssl") === "true") {
      opts.ssl = { rejectUnauthorized: false };
    }
  } else {
    opts.host = c.mysqlHost || "127.0.0.1";
    opts.port = Number(c.mysqlPort || 3306);
    opts.user = c.mysqlUser;
    opts.password = c.mysqlPassword;
    opts.database = c.mysqlDatabase || "u911703995_rracer";
    if (c.mysqlSsl) {
      opts.ssl = typeof c.mysqlSsl === "object" ? c.mysqlSsl : { rejectUnauthorized: false };
    }
  }

  return opts;
}

export function createMysqlPool(c) {
  const pool = mysql.createPool(mysqlOptions(c));
  return pool;
}

export const SCHEMA_SQL = `
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS \`users\` (
  \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`payload\` JSON NOT NULL,
  \`email\` VARCHAR(255) GENERATED ALWAYS AS (LOWER(JSON_UNQUOTE(JSON_EXTRACT(\`payload\`, '$.email')))) STORED,
  UNIQUE KEY \`uk_users_email\` (\`email\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE IF NOT EXISTS \`cars\` (
  \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`payload\` JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE IF NOT EXISTS \`images\` (
  \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`payload\` JSON NOT NULL,
  \`media_id\` VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(\`payload\`, '$.mediaId'))) STORED,
  KEY \`idx_images_media\` (\`media_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE IF NOT EXISTS \`bookings\` (
  \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`payload\` JSON NOT NULL,
  \`car_id\` VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(\`payload\`, '$.carId'))) STORED,
  \`user_id\` VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(\`payload\`, '$.userId'))) STORED,
  \`start_date\` VARCHAR(32) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(\`payload\`, '$.startDate'))) STORED,
  KEY \`idx_bookings_car\` (\`car_id\`),
  KEY \`idx_bookings_user\` (\`user_id\`),
  KEY \`idx_bookings_start\` (\`start_date\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE IF NOT EXISTS \`slots\` (
  \`id\` VARCHAR(128) NOT NULL PRIMARY KEY,
  \`payload\` JSON NOT NULL,
  \`car_id\` VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(\`payload\`, '$.carId'))) STORED,
  \`slot_day\` VARCHAR(32) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(\`payload\`, '$.day'))) STORED,
  \`booking_id\` VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(\`payload\`, '$.bookingId'))) STORED,
  UNIQUE KEY \`uk_slots_car_day\` (\`car_id\`, \`slot_day\`),
  KEY \`idx_slots_booking\` (\`booking_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE IF NOT EXISTS \`enquiries\` (
  \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`payload\` JSON NOT NULL,
  \`created_at\` VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(\`payload\`, '$.createdAt'))) STORED,
  KEY \`idx_enquiries_created\` (\`created_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE IF NOT EXISTS \`settings\` (
  \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`payload\` JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE IF NOT EXISTS \`audit\` (
  \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`payload\` JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE IF NOT EXISTS \`sessions\` (
  \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`payload\` JSON NOT NULL,
  \`user_id\` VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(\`payload\`, '$.userId'))) STORED,
  \`expires_at\` VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(\`payload\`, '$.expiresAt'))) STORED,
  KEY \`idx_sessions_user\` (\`user_id\`),
  KEY \`idx_sessions_expiry\` (\`expires_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE IF NOT EXISTS \`notifications\` (
  \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`payload\` JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE IF NOT EXISTS \`media\` (
  \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`bytes\` LONGBLOB NOT NULL,
  \`mime\` VARCHAR(64) NOT NULL,
  \`size_bytes\` BIGINT NOT NULL,
  \`sha256\` VARCHAR(64) NOT NULL,
  \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY \`idx_media_sha256\` (\`sha256\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE IF NOT EXISTS \`migrations\` (
  \`id\` VARCHAR(128) NOT NULL PRIMARY KEY,
  \`applied_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`details\` LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

SET FOREIGN_KEY_CHECKS = 1;
`;

export async function installSchema(connection) {
  let schemaSql = SCHEMA_SQL;
  try {
    schemaSql = await readFile(
      new URL("../mariadb/schema.sql", import.meta.url),
      "utf8"
    );
  } catch {}
  // Split statements by semicolon while ignoring comments
  const statements = schemaSql
    .split(/;\s*[\r\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const statement of statements) {
    if (statement) {
      await connection.query(statement);
    }
  }
}

export async function openMysqlDatabase(
  c,
  { pool: suppliedPool } = {},
) {
  const pool = suppliedPool || createMysqlPool(c);
  const context = new AsyncLocalStorage();

  async function exec(sql, values = []) {
    const target = context.getStore()?.client || pool;
    const [rows] = await target.query(sql, values);
    return rows;
  }

  try {
    const rows = await exec(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'migrations'"
    );
    if (!rows.length) {
      console.log(
        "MariaDB schema not found; installing the R Racer tables (first start only)."
      );
      await installSchema(pool);
    }
  } catch (e) {
    if (!suppliedPool && pool) await pool.end().catch(() => {});
    throw e;
  }

  const db = {
    driver: c.driver || "mariadb",

    async find(name, filters = {}) {
      check(name);
      const params = [];
      const where = buildWhere(filters, params);
      const rows = await exec(
        `SELECT \`payload\` FROM \`${name}\` WHERE ${where} ORDER BY \`id\``,
        params
      );
      return rows
        .map((r) => (typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload))
        .filter((r) => matches(r, filters));
    },

    async get(name, id) {
      check(name);
      const rows = await exec(
        `SELECT \`payload\` FROM \`${name}\` WHERE \`id\` = ?`,
        [String(id)]
      );
      if (!rows.length) return null;
      const payload = rows[0].payload;
      return typeof payload === "string" ? JSON.parse(payload) : payload;
    },

    async create(name, data) {
      check(name);
      const row = {
        ...data,
        _id: String(data._id || randomBytes(12).toString("hex")),
      };
      await exec(
        `INSERT INTO \`${name}\` (\`id\`, \`payload\`) VALUES (?, ?)`,
        [row._id, JSON.stringify(row)]
      );
      return row;
    },

    async update(name, id, patch) {
      check(name);
      const { _id, ...fields } = patch;
      const forUpdate = context.getStore() ? " FOR UPDATE" : "";
      const rows = await exec(
        `SELECT \`payload\` FROM \`${name}\` WHERE \`id\` = ?${forUpdate}`,
        [String(id)]
      );
      if (!rows.length) return null;
      const current =
        typeof rows[0].payload === "string"
          ? JSON.parse(rows[0].payload)
          : rows[0].payload;
      const row = { ...current, ...fields };
      await exec(
        `UPDATE \`${name}\` SET \`payload\` = ? WHERE \`id\` = ?`,
        [JSON.stringify(row), String(id)]
      );
      return row;
    },

    async remove(name, id) {
      check(name);
      await exec(`DELETE FROM \`${name}\` WHERE \`id\` = ?`, [String(id)]);
    },

    async transaction(fn) {
      if (context.getStore()) return fn();
      for (let attempt = 0; ; attempt++) {
        const client = await pool.getConnection();
        try {
          await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
          await client.beginTransaction();
          const result = await context.run({ client }, fn);
          await client.commit();
          return result;
        } catch (e) {
          await client.rollback().catch(() => {});
          const deadlockCodes = [1213, 1205, "ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"];
          if (!deadlockCodes.includes(e.errno || e.code) || attempt >= 3) {
            throw e;
          }
        } finally {
          client.release();
        }
      }
    },

    async putMedia(id, bytes, mime) {
      if (context.getStore())
        throw new Error("Upload image bytes before starting a database transaction.");
      const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      const hash = sha256(buffer);
      await exec(
        "INSERT INTO `media` (`id`, `bytes`, `mime`, `size_bytes`, `sha256`) VALUES (?, ?, ?, ?, ?) " +
          "ON DUPLICATE KEY UPDATE `bytes`=VALUES(`bytes`), `mime`=VALUES(`mime`), `size_bytes`=VALUES(`size_bytes`), `sha256`=VALUES(`sha256`)",
        [id, buffer, mime, buffer.length, hash]
      );
    },

    async getMedia(id) {
      const rows = await exec(
        "SELECT `bytes`, `mime` FROM `media` WHERE `id` = ?",
        [id]
      );
      if (!rows.length) return null;
      return {
        bytes: Buffer.isBuffer(rows[0].bytes)
          ? rows[0].bytes
          : Buffer.from(rows[0].bytes),
        mime: rows[0].mime,
      };
    },

    async mediaInfo(id) {
      const rows = await exec(
        "SELECT `id`, `mime`, `size_bytes`, `sha256`, `created_at` FROM `media` WHERE `id` = ?",
        [id]
      );
      return rows[0] || null;
    },

    async removeMedia(id) {
      if (context.getStore())
        throw new Error("Delete image bytes outside a database transaction.");
      await exec("DELETE FROM `media` WHERE `id` = ?", [id]);
    },

    async close() {
      if (!suppliedPool && pool) {
        await pool.end();
      }
    },
  };

  return db;
}
