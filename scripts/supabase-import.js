import { DatabaseSync } from 'node:sqlite';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { entities, sha256, createPostgresPool } from '../server/supabase-database.js';
import { createImageStorage } from '../server/supabase-storage.js';

// Read a consistent snapshot INCLUDING any committed SQLite WAL records.
export async function readLocalSnapshot(filename, projectRoot) {
  const sqlite=new DatabaseSync(filename,{readOnly:true});
  let records, media;
  try {
    sqlite.exec('BEGIN');
    records=sqlite.prepare('SELECT collection,id,payload FROM records ORDER BY collection,id').all().map(r=>({...r,payload:JSON.parse(r.payload)}));
    media=sqlite.prepare('SELECT id,bytes,mime FROM media ORDER BY id').all().map(r=>({...r,bytes:Buffer.from(r.bytes)}));
    sqlite.exec('COMMIT');
  } finally {sqlite.close();}
  records=records.filter(r=>r.collection!=='sessions'); // Sessions are invalidated on migration; existing passwords stay valid.
  for(const r of records){if(!entities.includes(r.collection)||r.payload._id!==r.id)throw new Error('Unexpected collection or invalid record identity in the source database.');}
  const byId=new Map(media.map(m=>[m.id,m]));
  const urlMap=new Map();
  // Include legacy/bundled photos referenced by galleries or avatars in Storage too.
  async function rewriteUrl(url) {
    if(typeof url!=='string')return url;
    if(urlMap.has(url))return urlMap.get(url);
    const native=url.match(/^\/api\/media\/([a-f\d]{24})$/);
    if(native){if(!byId.has(native[1]))throw new Error('The source database is missing an uploaded image. Restore the full data folder before importing.');return url;}
    const mapping=url.startsWith('/uploads/')?['legacy-uploads',url.slice(9)] : url.startsWith('/media/')?['public/media',url.slice(7)] : null;
    if(!mapping)return url; // Existing external URLs and non-image strings are retained.
    const base=await realpath(path.resolve(projectRoot,mapping[0]));
    const file=await realpath(path.resolve(base,decodeURIComponent(mapping[1])));
    if(!file.startsWith(base+path.sep))throw new Error('An image path leaves its allowed source directory.');
    const ext=path.extname(file).toLowerCase();const mime={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.png':'image/png'}[ext];
    if(!mime)throw new Error('A referenced image has an unsupported format. Convert it before migration.');
    const bytes=await readFile(file);if(bytes.length>10*1024*1024)throw new Error('A referenced legacy photo exceeds the 10 MB migration limit. Resize it before importing.');
    const id=sha256(Buffer.concat([Buffer.from(url),bytes])).slice(0,24);
    if(byId.has(id)&&sha256(byId.get(id).bytes)!==sha256(bytes))throw new Error('Unexpected image ID collision.');
    if(!byId.has(id)){const m={id,bytes,mime};media.push(m);byId.set(id,m);}
    const replacement='/api/media/'+id;urlMap.set(url,replacement);return replacement;
  }
  for(const r of records) {
    if(r.collection==='images'){
      r.payload.url=await rewriteUrl(r.payload.url);
      const m=r.payload.url?.match(/^\/api\/media\/([a-f\d]{24})$/);
      if(m)r.payload.mediaId=m[1];
    }
    if(r.collection==='users')r.payload.image=await rewriteUrl(r.payload.image);
    if(r.collection==='cars'&&Array.isArray(r.payload.images))for(const image of r.payload.images)if(image&&typeof image==='object')image.url=await rewriteUrl(image.url);
  }
  const counts={};for(const entity of entities)counts[entity]=records.filter(r=>r.collection===entity).length;
  const fingerprint=sha256(Buffer.from(JSON.stringify({records,media:media.map(m=>({id:m.id,mime:m.mime,sha256:sha256(m.bytes)})).sort((a,b)=>a.id.localeCompare(b.id))})));
  return {records,media,counts,fingerprint,imageBytes:media.reduce((sum,m)=>sum+m.bytes.length,0)};
}

export async function importSnapshot(snapshot,c,{pool:suppliedPool,storage:suppliedStorage}={}) {
  const pool=suppliedPool||await createPostgresPool(c),storage=suppliedStorage||createImageStorage(c);
  let client;const uploaded=[];
  try {
    await storage.check();client=await pool.connect();await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(727223,3000)');
    const marker='sqlite:'+snapshot.fingerprint;
    const previous=await client.query('SELECT id FROM rracer.migrations WHERE id=$1',[marker]);
    if(previous.rowCount){await client.query('ROLLBACK');return {alreadyImported:true,counts:snapshot.counts,images:snapshot.media.length};}
    // Block concurrent application writes and refuse a populated destination.
    for(const entity of entities) {
      await client.query(`LOCK TABLE rracer."${entity}" IN SHARE ROW EXCLUSIVE MODE`);
      const n=await client.query(`SELECT count(*)::int AS n FROM rracer."${entity}"`);
      if(n.rows[0].n)throw new Error('Destination already contains application records. Import into an empty R Racer schema before starting the website; no existing records were overwritten.');
    }
    const existing=await client.query('SELECT count(*)::int AS n FROM rracer.media');
    if(existing.rows[0].n)throw new Error('Destination already contains media metadata. Use a fresh project or restore a complete backup; migration will not overwrite it.');
    for(const m of snapshot.media) {
      const hash=sha256(m.bytes), objectPath=`imports/${snapshot.fingerprint}/${m.id}`;
      try{await storage.put(objectPath,m.bytes,m.mime);uploaded.push(objectPath);}
      catch(e){
        // A crashed previous import may have left only the object. Reuse it only if identical.
        if(![400,409].includes(e.storageStatus))throw e;
        const old=await storage.get(objectPath);if(sha256(old)!==hash)throw new Error('An existing imported image differs from the source. Import stopped without replacing it.');
      }
      const downloaded=await storage.get(objectPath);if(sha256(downloaded)!==hash)throw new Error('Uploaded image verification failed.');
      await client.query('INSERT INTO rracer.media(id,object_path,mime,size_bytes,sha256) VALUES($1,$2,$3,$4,$5)',[m.id,objectPath,m.mime,m.bytes.length,hash]);
    }
    for(const r of snapshot.records)await client.query(`INSERT INTO rracer."${r.collection}"(id,payload) VALUES($1,$2::jsonb)`,[r.id,JSON.stringify(r.payload)]);
    for(const entity of entities) {
      const count=await client.query(`SELECT count(*)::int AS n FROM rracer."${entity}"`);
      if(count.rows[0].n!==snapshot.counts[entity])throw new Error('Import row-count verification failed.');
    }
    await client.query('INSERT INTO rracer.migrations(id,details) VALUES($1,$2::jsonb)',[marker,JSON.stringify({counts:snapshot.counts,images:snapshot.media.length})]);
    await client.query('COMMIT');
    return {alreadyImported:false,counts:snapshot.counts,images:snapshot.media.length};
  } catch(e) {
    await client?.query('ROLLBACK').catch(()=>{});
    // Never delete uploaded objects after an ambiguous COMMIT outcome. They are private
    // and deterministic; a retry checks the marker and verifies bytes before reusing them.
    if(uploaded.length)e.message+=' Uploaded private objects are retained for a safe retry; records roll back unless the final commit succeeded.';
    throw e;
  } finally {client?.release();if(!suppliedPool)await pool.end();}
}
