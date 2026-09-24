import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { MongoClient, ObjectId, Binary } from "mongodb";
import { openSupabaseDatabase } from "./supabase-database.js";

export const newId = () => randomBytes(12).toString("hex");
const collections = new Set([
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
]);
const plain = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
const objectId = (id) =>
  typeof id === "string" && /^[a-f\d]{24}$/i.test(id) ? new ObjectId(id) : id;
function matches(row, query) {
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
export async function openDatabase(c) {
  if (c.driver === "supabase") return openSupabaseDatabase(c);
  const context = new AsyncLocalStorage();
  let client,
    mongo,
    sqlite,
    queue = Promise.resolve();
  async function lock(fn) {
    if (context.getStore()) return fn();
    const previous = queue;
    let release;
    queue = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
  if (c.driver === "mongodb") {
    client = new MongoClient(c.mongoUri, { serverSelectionTimeoutMS: 15000 });
    await client.connect();
    mongo = client.db(c.mongoDb);
    await mongo.collection("users").createIndex({ email: 1 }, { unique: true });
    await mongo.collection("sessions").createIndex({ expiresAt: 1 });
    await mongo.collection("bookings").createIndex({ carId: 1, startDate: 1 });
    await mongo.collection("enquiries").createIndex({ createdAt: -1 });
    await mongo
      .collection("notifications")
      .createIndex({ status: 1, nextAttemptAt: 1 });
  } else {
    const { DatabaseSync } = await import("node:sqlite");
    mkdirSync(c.dataDir, { recursive: true });
    sqlite = new DatabaseSync(path.join(c.dataDir, "rracer.sqlite"));
    sqlite.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(collection,id));
      CREATE UNIQUE INDEX IF NOT EXISTS user_email ON records(json_extract(payload,'$.email')) WHERE collection='users';
      CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, bytes BLOB NOT NULL, mime TEXT NOT NULL);`);
  }
  const check = (n) => {
    if (!collections.has(n)) throw new Error("Invalid collection");
  };
  const options = () =>
    context.getStore()?.session ? { session: context.getStore().session } : {};
  const mongoQuery = (q) => ({
    ...q,
    ...(q._id !== undefined ? { _id: objectId(q._id) } : {}),
  });
  const db = {
    driver: c.driver,
    async find(name, query = {}) {
      check(name);
      if (mongo)
        return plain(
          await mongo
            .collection(name)
            .find(mongoQuery(query), options())
            .toArray(),
        );
      return lock(() =>
        sqlite
          .prepare("SELECT payload FROM records WHERE collection=?")
          .all(name)
          .map((r) => JSON.parse(r.payload))
          .filter((r) => matches(r, query)),
      );
    },
    async get(name, id) {
      return (await db.find(name, { _id: String(id) }))[0] || null;
    },
    async create(name, data) {
      check(name);
      const row = { ...data, _id: data._id || newId() };
      if (mongo)
        await mongo
          .collection(name)
          .insertOne({ ...row, _id: objectId(row._id) }, options());
      else
        await lock(() =>
          sqlite
            .prepare("INSERT INTO records(collection,id,payload) VALUES(?,?,?)")
            .run(name, row._id, JSON.stringify(row)),
        );
      return row;
    },
    async update(name, id, patch) {
      check(name);
      const { _id, ...fields } = patch;
      if (mongo) {
        return plain(
          await mongo
            .collection(name)
            .findOneAndUpdate(
              { _id: objectId(id) },
              { $set: fields },
              { ...options(), returnDocument: "after" },
            ),
        );
      }
      return lock(() => {
        const current = sqlite
          .prepare("SELECT payload FROM records WHERE collection=? AND id=?")
          .get(name, id);
        if (!current) return null;
        const row = { ...JSON.parse(current.payload), ...fields };
        sqlite
          .prepare("UPDATE records SET payload=? WHERE collection=? AND id=?")
          .run(JSON.stringify(row), name, id);
        return row;
      });
    },
    async remove(name, id) {
      check(name);
      if (mongo)
        await mongo
          .collection(name)
          .deleteOne({ _id: objectId(id) }, options());
      else
        await lock(() =>
          sqlite
            .prepare("DELETE FROM records WHERE collection=? AND id=?")
            .run(name, id),
        );
    },
    async transaction(fn) {
      if (context.getStore()) return fn();
      if (mongo) {
        const session = client.startSession();
        try {
          return await session.withTransaction(() =>
            context.run({ session }, fn),
          );
        } finally {
          await session.endSession();
        }
      }
      return lock(() =>
        context.run({ transaction: true }, async () => {
          sqlite.exec("BEGIN IMMEDIATE");
          try {
            const result = await fn();
            sqlite.exec("COMMIT");
            return result;
          } catch (e) {
            sqlite.exec("ROLLBACK");
            throw e;
          }
        }),
      );
    },
    async putMedia(id, bytes, mime) {
      if (mongo)
        await mongo
          .collection("media")
          .insertOne({ _id: id, bytes: new Binary(bytes), mime });
      else
        await lock(() =>
          sqlite
            .prepare("INSERT INTO media(id,bytes,mime) VALUES(?,?,?)")
            .run(id, bytes, mime),
        );
    },
    async getMedia(id) {
      if (mongo) {
        const row = await mongo.collection("media").findOne({ _id: id });
        return row
          ? { bytes: Buffer.from(row.bytes.buffer), mime: row.mime }
          : null;
      }
      return lock(() => {
        const r = sqlite
          .prepare("SELECT bytes,mime FROM media WHERE id=?")
          .get(id);
        return r ? { ...r, bytes: Buffer.from(r.bytes) } : null;
      });
    },
    async removeMedia(id) {
      if (mongo) await mongo.collection("media").deleteOne({ _id: id });
      else
        await lock(() =>
          sqlite.prepare("DELETE FROM media WHERE id=?").run(id),
        );
    },
    async close() {
      if (client) await client.close();
      if (sqlite) sqlite.close();
    },
  };
  return db;
}
