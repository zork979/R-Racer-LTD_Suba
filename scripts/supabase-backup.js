import { DatabaseSync } from 'node:sqlite';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { entities, createPostgresPool, sha256 } from '../server/supabase-database.js';
import { createImageStorage } from '../server/supabase-storage.js';
import { loadSupabaseEnv, reportSetupError } from './supabase-env.js';

// Run while the website is stopped/read-only so image deletions cannot race a backup.
export async function backupSupabase(c) {
  const directory=path.resolve('backups','supabase-'+new Date().toISOString().replace(/[:.]/g,'-'));
  await mkdir(directory,{recursive:true,mode:0o700});
  const output=new DatabaseSync(path.join(directory,'rracer.sqlite'));
  const pool=await createPostgresPool(c),storage=createImageStorage(c);
  let client;
  try {
    client=await pool.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    output.exec('CREATE TABLE records(collection TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(collection,id)); CREATE TABLE media(id TEXT PRIMARY KEY,bytes BLOB NOT NULL,mime TEXT NOT NULL); BEGIN');
    const put=output.prepare('INSERT INTO records(collection,id,payload) VALUES(?,?,?)');
    for(const name of entities){const {rows}=await client.query(`SELECT id,payload FROM rracer."${name}" ORDER BY id`);for(const row of rows)put.run(name,row.id,JSON.stringify(row.payload));}
    const {rows}=await client.query('SELECT * FROM rracer.media ORDER BY id');
    const putMedia=output.prepare('INSERT INTO media(id,bytes,mime) VALUES(?,?,?)');
    for(const media of rows){const bytes=await storage.get(media.object_path);if(sha256(bytes)!==media.sha256)throw new Error('Backup image verification failed.');putMedia.run(media.id,bytes,media.mime);}
    await client.query('COMMIT');output.exec('COMMIT');
    await writeFile(path.join(directory,'RESTORE.txt'),'Private backup contains accounts, password hashes, business data and uploaded photos. Restore into an EMPTY Supabase project: run supabase:setup, then npm run supabase:migrate -- --source "'+path.join(directory,'rracer.sqlite')+'". Check the target .env.supabase first. Active sessions are not restored; users sign in again. Website source and public assets are backed up separately.\n',{mode:0o600});
    console.log('Verified Supabase backup saved in '+directory);
  } catch(e){await client?.query('ROLLBACK').catch(()=>{});throw e;}
  finally {output.close();client?.release();await pool.end();}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{await backupSupabase(loadSupabaseEnv());}catch(e){console.error(reportSetupError(e));process.exitCode=1;}
}
