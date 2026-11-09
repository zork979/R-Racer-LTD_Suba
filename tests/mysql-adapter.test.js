import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWhere,
  matches,
  mysqlOptions,
  sha256,
  openMysqlDatabase,
  entities,
} from "../server/mysql-database.js";

test("MySQL/MariaDB database adapter unit test suite", async (t) => {
  await t.test("entities and collections are defined correctly", () => {
    assert.equal(entities.length, 10);
    assert.ok(entities.includes("users"));
    assert.ok(entities.includes("cars"));
    assert.ok(entities.includes("images"));
    assert.ok(entities.includes("bookings"));
    assert.ok(entities.includes("slots"));
    assert.ok(entities.includes("enquiries"));
    assert.ok(entities.includes("settings"));
    assert.ok(entities.includes("audit"));
    assert.ok(entities.includes("sessions"));
    assert.ok(entities.includes("notifications"));
  });

  await t.test("mysqlOptions parses individual and URL configuration", () => {
    const fromFields = mysqlOptions({
      mysqlHost: "mysql.hostinger.com",
      mysqlPort: 3306,
      mysqlUser: "u911703995_user",
      mysqlPassword: "secure_password",
      mysqlDatabase: "u911703995_rracer",
      mysqlPoolMax: 7,
      mysqlSsl: true,
    });
    assert.equal(fromFields.host, "mysql.hostinger.com");
    assert.equal(fromFields.port, 3306);
    assert.equal(fromFields.user, "u911703995_user");
    assert.equal(fromFields.password, "secure_password");
    assert.equal(fromFields.database, "u911703995_rracer");
    assert.equal(fromFields.connectionLimit, 7);
    assert.deepEqual(fromFields.ssl, { rejectUnauthorized: false });
    assert.equal("maxAllowedPacket" in fromFields, false);

    const fromUrl = mysqlOptions({
      mysqlUrl: "mysql://custom_user:custom_pass@db.internal:3307/custom_rracer?ssl=true",
    });
    assert.equal(fromUrl.host, "db.internal");
    assert.equal(fromUrl.port, 3307);
    assert.equal(fromUrl.user, "custom_user");
    assert.equal(fromUrl.password, "custom_pass");
    assert.equal(fromUrl.database, "custom_rracer");
    assert.deepEqual(fromUrl.ssl, { rejectUnauthorized: false });
    assert.equal("maxAllowedPacket" in fromUrl, false);
  });

  await t.test("buildWhere constructs valid parameterized SQL for complex queries", () => {
    const params1 = [];
    const sql1 = buildWhere({ email: "user@example.test" }, params1);
    assert.equal(
      sql1,
      "JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.email')) = ?"
    );
    assert.deepEqual(params1, ["user@example.test"]);

    const params2 = [];
    const sql2 = buildWhere(
      {
        _id: "record-123",
        status: { $in: ["pending", "confirmed"] },
        price: { $gte: 100, $lte: 500 },
        deletedAt: null,
      },
      params2
    );
    assert.ok(sql2.includes("`id` = ?"));
    assert.ok(sql2.includes("IN (?, ?)"));
    assert.ok(sql2.includes(">= ?"));
    assert.ok(sql2.includes("<= ?"));
    assert.ok(sql2.includes("IS NULL"));
    assert.deepEqual(params2, [
      "record-123",
      "pending",
      "confirmed",
      "100",
      "500",
    ]);

    const params3 = [];
    const sql3 = buildWhere(
      {
        $or: [
          { role: "admin" },
          { email: "guest@example.test" },
        ],
      },
      params3
    );
    assert.ok(sql3.includes(" OR "));
    assert.deepEqual(params3, ["admin", "guest@example.test"]);
  });

  await t.test("matches evaluator handles equality, comparison and $or queries", () => {
    const row = {
      _id: "car-1",
      brand: "Volkswagen",
      price: 2500,
      isAvailable: true,
      tags: ["deal", "family"],
    };
    assert.ok(matches(row, { brand: "Volkswagen" }));
    assert.ok(matches(row, { price: { $gte: 2000, $lt: 3000 } }));
    assert.ok(matches(row, { isAvailable: true }));
    assert.ok(matches(row, { $or: [{ brand: "BMW" }, { brand: "Volkswagen" }] }));
    assert.ok(!matches(row, { brand: "Ferrari" }));
    assert.ok(!matches(row, { price: { $lt: 2000 } }));
  });

  await t.test("adapter operations using mock pool with transactions and media storage", async () => {
    const tables = new Map();
    for (const e of entities) tables.set(e, new Map());
    const mediaTable = new Map();

    // Mock connection that simulates mysql2 pool and connection methods
    function createMockConnection() {
      let inTx = false;
      const conn = {
        async query(sql, values = []) {
          // Check migrations table
          if (sql.includes("information_schema.tables")) {
            return [[{ TABLE_NAME: "migrations" }], []];
          }
          if (sql.startsWith("SET TRANSACTION") || sql.startsWith("SET FOREIGN_KEY_CHECKS")) {
            return [{}, []];
          }
          if (sql === "START TRANSACTION" || sql.startsWith("BEGIN")) {
            inTx = true;
            return [{}, []];
          }
          if (sql === "COMMIT") {
            inTx = false;
            return [{}, []];
          }
          if (sql === "ROLLBACK") {
            inTx = false;
            return [{}, []];
          }

          // INSERT into media
          if (sql.startsWith("INSERT INTO `media`")) {
            const [id, bytes, mime, sizeBytes, hash] = values;
            mediaTable.set(id, { id, bytes, mime, size_bytes: sizeBytes, sha256: hash });
            return [{ affectedRows: 1 }, []];
          }
          // SELECT from media
          if (sql.startsWith("SELECT") && sql.includes("FROM `media` WHERE `id` = ?")) {
            const [id] = values;
            const row = mediaTable.get(id);
            return [row ? [row] : [], []];
          }
          // DELETE from media
          if (sql.startsWith("DELETE FROM `media`")) {
            const [id] = values;
            mediaTable.delete(id);
            return [{ affectedRows: 1 }, []];
          }

          // Entity queries: match table name
          for (const entity of entities) {
            // INSERT
            if (sql.startsWith(`INSERT INTO \`${entity}\``)) {
              const [id, payload] = values;
              const table = tables.get(entity);
              if (table.has(id)) {
                const err = new Error(`Duplicate entry '${id}' for key 'PRIMARY'`);
                err.code = "ER_DUP_ENTRY";
                err.errno = 1062;
                err.sqlState = "23000";
                throw err;
              }
              // Email uniqueness check for users
              if (entity === "users") {
                const parsed = JSON.parse(payload);
                const emailLower = (parsed.email || "").toLowerCase();
                for (const existing of table.values()) {
                  if ((existing.email || "").toLowerCase() === emailLower) {
                    const err = new Error(`Duplicate entry '${emailLower}' for key 'uk_users_email'`);
                    err.code = "ER_DUP_ENTRY";
                    err.errno = 1062;
                    err.sqlState = "23000";
                    throw err;
                  }
                }
              }
              // Slots uniqueness check
              if (entity === "slots") {
                const parsed = JSON.parse(payload);
                const key = `${parsed.carId}:${parsed.day}`;
                for (const existing of table.values()) {
                  if (`${existing.carId}:${existing.day}` === key) {
                    const err = new Error(`Duplicate entry '${key}' for key 'uk_slots_car_day'`);
                    err.code = "ER_DUP_ENTRY";
                    err.errno = 1062;
                    err.sqlState = "23000";
                    throw err;
                  }
                }
              }

              table.set(id, JSON.parse(payload));
              return [{ affectedRows: 1 }, []];
            }

            // SELECT with id
            if (sql.startsWith("SELECT") && sql.includes(`FROM \`${entity}\` WHERE \`id\` = ?`)) {
              const [id] = values;
              const item = tables.get(entity).get(id);
              return [item ? [{ payload: JSON.stringify(item) }] : [], []];
            }

            // UPDATE
            if (sql.startsWith(`UPDATE \`${entity}\` SET \`payload\` = ? WHERE \`id\` = ?`)) {
              const [payload, id] = values;
              tables.get(entity).set(id, JSON.parse(payload));
              return [{ affectedRows: 1 }, []];
            }

            // DELETE
            if (sql.startsWith(`DELETE FROM \`${entity}\` WHERE \`id\` = ?`)) {
              const [id] = values;
              tables.get(entity).delete(id);
              return [{ affectedRows: 1 }, []];
            }

            // SELECT with WHERE
            if (sql.startsWith(`SELECT \`payload\` FROM \`${entity}\``)) {
              const items = Array.from(tables.get(entity).values()).map((p) => ({
                payload: JSON.stringify(p),
              }));
              return [items, []];
            }
          }

          return [[], []];
        },
        async beginTransaction() {
          inTx = true;
        },
        async commit() {
          inTx = false;
        },
        async rollback() {
          inTx = false;
        },
        release() {},
      };
      return conn;
    }

    const mockPool = {
      async query(sql, values) {
        const conn = createMockConnection();
        return conn.query(sql, values);
      },
      async getConnection() {
        return createMockConnection();
      },
      async end() {},
    };

    const db = await openMysqlDatabase({ driver: "mariadb" }, { pool: mockPool });
    assert.equal(db.driver, "mariadb");

    // Test create & get
    const user = await db.create("users", {
      name: "Admin User",
      email: "admin@example.test",
      role: "admin",
    });
    assert.ok(user._id);
    const fetched = await db.get("users", user._id);
    assert.equal(fetched.name, "Admin User");
    assert.equal(fetched.email, "admin@example.test");

    // Test uniqueness constraint triggers ER_DUP_ENTRY
    await assert.rejects(
      async () => {
        await db.create("users", {
          name: "Duplicate User",
          email: "ADMIN@example.test",
          role: "user",
        });
      },
      (err) => {
        assert.equal(err.code, "ER_DUP_ENTRY");
        assert.equal(err.errno, 1062);
        return true;
      }
    );

    // Test slots conflict triggers ER_DUP_ENTRY
    const slot1 = await db.create("slots", {
      _id: "car1:2026-12-01",
      carId: "car1",
      day: "2026-12-01",
      bookingId: "b1",
    });
    assert.ok(slot1._id);

    await assert.rejects(
      async () => {
        await db.create("slots", {
          _id: "car1:2026-12-01",
          carId: "car1",
          day: "2026-12-01",
          bookingId: "b2",
        });
      },
      (err) => {
        assert.equal(err.code, "ER_DUP_ENTRY");
        return true;
      }
    );

    // Test update
    const updated = await db.update("users", user._id, { phone: "07123456789" });
    assert.equal(updated.phone, "07123456789");

    // Test find with filter
    const found = await db.find("users", { role: "admin" });
    assert.equal(found.length, 1);
    assert.equal(found[0].email, "admin@example.test");

    // Test transaction
    const txResult = await db.transaction(async () => {
      const car = await db.create("cars", { brand: "Audi", model: "R8" });
      return car;
    });
    assert.equal(txResult.brand, "Audi");
    const carFound = await db.get("cars", txResult._id);
    assert.equal(carFound.model, "R8");

    // Test media storage & SHA-256 verification
    const imageBytes = Buffer.from("fake-binary-image-data-for-testing");
    const imageMime = "image/webp";
    const imageId = "media-test-123";

    await db.putMedia(imageId, imageBytes, imageMime);
    const media = await db.getMedia(imageId);
    assert.ok(media);
    assert.equal(media.mime, imageMime);
    assert.equal(media.bytes.toString(), imageBytes.toString());

    const meta = await db.mediaInfo(imageId);
    assert.ok(meta);
    assert.equal(meta.sha256, sha256(imageBytes));
    assert.equal(meta.size_bytes, imageBytes.length);

    await db.removeMedia(imageId);
    const deleted = await db.getMedia(imageId);
    assert.equal(deleted, null);

    // Test remove record
    await db.remove("users", user._id);
    const afterRemove = await db.get("users", user._id);
    assert.equal(afterRemove, null);

    await db.close();
  });
});
