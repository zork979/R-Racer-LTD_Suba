import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import tls from 'node:tls';
import pg from 'pg';
import { createImageStorage } from './supabase-storage.js';
import { SUPABASE_ROOT_CA_2021 } from './supabase-ca.js';

export const entities = ['users','cars','images','bookings','slots','enquiries','settings','audit','sessions','notifications'];
const table = name => {
  if (!entities.includes(name)) throw new Error('Invalid collection');
  return `rracer."${name}"`;
};
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// Rebuild PEM certificates from text whose line breaks were lost or escaped,
// e.g. when pasted into a single-line hosting environment variable.
export function normalisePem(text) {
  const blocks = String(text || '').replaceAll('\\n', '\n')
    .match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
  return blocks.map(block => {
    const body = block.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '');
    return `-----BEGIN CERTIFICATE-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
  });
}
async function extraCertificates(c) {
  if (c.supabaseCaCert?.trim()) {
    const certs = normalisePem(c.supabaseCaCert);
    if (!certs.length) throw new Error('SUPABASE_CA_CERT does not contain a PEM certificate. Leave it empty to use the bundled Supabase certificate.');
    return certs;
  }
  if (c.supabaseCaFile?.trim()) {
    try { return normalisePem(await readFile(c.supabaseCaFile, 'utf8')); } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      console.warn(`SUPABASE_CA_CERT_PATH (${c.supabaseCaFile}) was not found on this server; using the bundled Supabase root certificate.`);
    }
  }
  return [];
}
export async function postgresOptions(c) {
  const url = new URL(c.supabaseDatabaseUrl);
  // pg's URL SSL options otherwise override our explicit certificate verification.
  for (const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key);
  // Supabase signs database certificates with its own root CA, which Node.js does
  // not trust by default. Trust it alongside Node's standard public roots, and keep
  // full certificate and hostname verification switched on.
  const ca = c.supabaseSsl === false ? [] : [...await extraCertificates(c), SUPABASE_ROOT_CA_2021, ...tls.rootCertificates];
  return {
    connectionString: url.toString(), max: c.supabasePoolMax || 5,
    ssl: c.supabaseSsl === false ? false : { rejectUnauthorized: true, ca },
    connectionTimeoutMillis: 15000, idleTimeoutMillis: 30000,
    statement_timeout: 30000, application_name: 'rracer',
  };
}
export async function createPostgresPool(c) {
  const pool = new pg.Pool(await postgresOptions(c));
  pool.on('error', () => console.error('A Supabase database connection closed. A fresh connection will be used for the next request.'));
  return pool;
}
function filterSql(query, values) {
  const param = v => { values.push(v); return '$' + values.length; };
  const build = q => Object.entries(q).map(([key, val]) => {
    if (key === '$or') {
      if (!Array.isArray(val)) throw new Error('Invalid OR query');
      return '(' + (val.map(x => '(' + build(x) + ')').join(' OR ') || 'FALSE') + ')';
    }
    let expression;
    const expr = () => expression ||= `(payload -> ${param(key)}::text)`;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return '(' + Object.entries(val).map(([op, x]) => {
        if (op === '$in') {
          if (!Array.isArray(x)) throw new Error('Invalid IN query');
          return x.length ? `${expr()} IN (${x.map(v => param(JSON.stringify(v)) + '::jsonb').join(',')})` : 'FALSE';
        }
        const operators = { $ne:'IS DISTINCT FROM', $lt:'<', $gt:'>', $gte:'>=', $lte:'<=' };
        if (!operators[op]) throw new Error('Invalid query operator');
        return `${expr()} ${operators[op]} ${param(JSON.stringify(x))}::jsonb`;
      }).join(' AND ') + ')';
    }
    return `${expr()} = ${param(JSON.stringify(val))}::jsonb`;
  }).join(' AND ') || 'TRUE';
  return build(query);
}

export async function openSupabaseDatabase(c, { pool: suppliedPool, storage: suppliedStorage } = {}) {
  const pool = suppliedPool || await createPostgresPool(c);
  const storage = suppliedStorage || createImageStorage(c);
  const context = new AsyncLocalStorage();
  const query = (sql, values) => (context.getStore()?.client || pool).query(sql, values);
  try {
    const ready = await pool.query("SELECT to_regclass('rracer.migrations') AS ready");
    if (!ready.rows[0].ready) throw new Error('Supabase schema is not installed. Run npm run supabase:setup first.');
    await storage.check();
  } catch (e) { if (!suppliedPool) await pool.end(); throw e; }
  const db = {
    driver: 'supabase',
    async find(name, filters = {}) {
      const target = table(name), values = [], where = filterSql(filters, values);
      return (await query(`SELECT payload FROM ${target} WHERE ${where} ORDER BY id`, values)).rows.map(r => r.payload);
    },
    async get(name, id) { return (await query(`SELECT payload FROM ${table(name)} WHERE id=$1`, [String(id)])).rows[0]?.payload || null; },
    async create(name, data) {
      const row = { ...data, _id: String(data._id || randomBytes(12).toString('hex')) };
      await query(`INSERT INTO ${table(name)}(id,payload) VALUES($1,$2::jsonb)`, [row._id,JSON.stringify(row)]);
      return row;
    },
    async update(name, id, patch) {
      const { _id, ...fields } = patch;
      return (await query(`UPDATE ${table(name)} SET payload=payload || $2::jsonb WHERE id=$1 RETURNING payload`, [String(id),JSON.stringify(fields)])).rows[0]?.payload || null;
    },
    async remove(name, id) { await query(`DELETE FROM ${table(name)} WHERE id=$1`, [String(id)]); },
    async transaction(fn) {
      if (context.getStore()) return fn();
      // Serialisable transactions plus unique car/day slots prevent overlapping bookings.
      for (let attempt=0; ; attempt++) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
          const result = await context.run({ client }, fn);
          await client.query('COMMIT');
          return result;
        } catch(e) {
          await client.query('ROLLBACK').catch(()=>{});
          if (!['40001','40P01'].includes(e.code) || attempt>=3) throw e;
        } finally { client.release(); }
      }
    },
    async putMedia(id, bytes, mime) {
      if (context.getStore()) throw new Error('Upload image bytes before starting a database transaction.');
      const objectPath = `media/${id}-${randomBytes(8).toString('hex')}`;
      await storage.put(objectPath, bytes, mime);
      try {
        await query('INSERT INTO rracer.media(id,object_path,mime,size_bytes,sha256) VALUES($1,$2,$3,$4,$5)', [id,objectPath,mime,bytes.length,sha256(bytes)]);
      } catch(e) { await storage.remove(objectPath).catch(()=>{}); throw e; }
    },
    async getMedia(id) {
      const row = (await query('SELECT * FROM rracer.media WHERE id=$1',[id])).rows[0];
      return row ? { bytes:await storage.get(row.object_path), mime:row.mime } : null;
    },
    async mediaInfo(id) { return (await query('SELECT * FROM rracer.media WHERE id=$1',[id])).rows[0] || null; },
    async removeMedia(id) {
      if (context.getStore()) throw new Error('Delete image bytes outside a database transaction.');
      const row = await this.mediaInfo(id);
      if (!row) return;
      await storage.remove(row.object_path);
      await query('DELETE FROM rracer.media WHERE id=$1',[id]);
    },
    async close() { if (!suppliedPool) await pool.end(); },
  };
  return db;
}
