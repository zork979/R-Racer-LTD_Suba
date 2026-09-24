import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { config } from '../server/config.js';
import { createPostgresPool, openSupabaseDatabase, sha256 } from '../server/supabase-database.js';
import { createImageStorage } from '../server/supabase-storage.js';
import { readLocalSnapshot, importSnapshot } from '../scripts/supabase-import.js';
import { testDatabaseConfig } from './helpers/database-config.js';
import { startStorageServer } from './helpers/storage-server.js';

test('Supabase security, migration, transactions and media failures',async t=>{
  const mock=await startStorageServer(),dir=await mkdtemp(path.join(os.tmpdir(),'rracer-migration-'));
  const c=config({...testDatabaseConfig(),production:false,secret:'supabase-test-session-secret-with-more-than-32-characters',supabaseUrl:mock.url,supabaseSecretKey:mock.secret});
  const pool=await createPostgresPool(c),storage=createImageStorage(c);let db;
  try{
    await storage.setup();await storage.setup();db=await openSupabaseDatabase(c,{pool,storage});
    await t.test('private schema denies all browser roles and enables RLS on every table',async()=>{
      const r=await pool.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='rracer' AND c.relkind='r' AND c.relrowsecurity");assert.equal(r.rows[0].n,12);
      for(const role of ['anon','authenticated','service_role']){const permission=await pool.query("SELECT has_schema_privilege($1,'rracer','USAGE') AS allowed",[role]);assert.equal(permission.rows[0].allowed,false);}
    });
    await t.test('SQL filters are parameterised; failed transactions roll back and nested transactions share the connection',async()=>{
      const weird="x' OR TRUE; --";await db.create('settings',{_id:'filter-test',label:weird,amount:12});
      assert.equal((await db.find('settings',{label:weird})).length,1);assert.equal((await db.find('settings',{label:{$in:[]}})).length,0);
      assert.equal((await db.find('settings',{$or:[{amount:{$gte:12}},{label:'no'}]})).length,1);
      assert.equal((await db.find('settings',{missing:{$ne:'present'}})).length,1);
      await assert.rejects(()=>db.transaction(async()=>{await db.create('settings',{_id:'rollback'});await db.transaction(()=>db.update('settings','filter-test',{label:'changed'}));throw new Error('abort');}),/abort/);
      assert.equal(await db.get('settings','rollback'),null);assert.equal((await db.get('settings','filter-test')).label,weird);
      await db.remove('settings','filter-test');
    });
    await t.test('image uploads use Storage bytes and SQL metadata, with compensation on database failure',async()=>{
      const bytes=Buffer.from('test-image-bytes');await db.putMedia('image-1',bytes,'image/webp');
      assert.deepEqual((await db.getMedia('image-1')).bytes,bytes);assert.equal((await db.mediaInfo('image-1')).sha256,sha256(bytes));
      const before=mock.objects.size;await assert.rejects(()=>db.putMedia('image-1',Buffer.from('other'),'image/webp'));assert.equal(mock.objects.size,before);
      await db.removeMedia('image-1');assert.equal(await db.getMedia('image-1'),null);assert.equal(mock.objects.size,0);
      mock.rejectUpload=true;await assert.rejects(()=>db.putMedia('failed',bytes,'image/webp'),/Storage upload failed/);assert.equal(await db.mediaInfo('failed'),null);mock.rejectUpload=false;
    });
    const source=path.join(dir,'rracer.sqlite');const sqlite=new DatabaseSync(source);sqlite.exec('PRAGMA journal_mode=WAL; CREATE TABLE records(collection TEXT,id TEXT,payload TEXT,PRIMARY KEY(collection,id)); CREATE TABLE media(id TEXT PRIMARY KEY,bytes BLOB,mime TEXT)');
    const hash=await bcrypt.hash('Existing-user-password!',10),bytes=Buffer.from('preserved-car-photo');
    const sourceRows=[['users',{_id:'customer1',email:'customer@example.test',password:hash,role:'admin',name:'Existing Admin'}],['cars',{_id:'car1',title:'Existing BMW',images:['photo1']}],['images',{_id:'photo1',url:'/api/media/0123456789abcdef01234567',mediaId:'0123456789abcdef01234567'}],['enquiries',{_id:'enquiry1',carId:'car1',message:'Previous enquiry'}],['settings',{_id:'business',email:'admin@example.test'}],['sessions',{_id:'old-session',userId:'customer1'}]];
    for(const [collection,row] of sourceRows)sqlite.prepare('INSERT INTO records VALUES(?,?,?)').run(collection,row._id,JSON.stringify(row));sqlite.prepare('INSERT INTO media VALUES(?,?,?)').run('0123456789abcdef01234567',bytes,'image/webp');
    let snapshot;
    await t.test('source reader includes committed WAL changes and never mutates the source records',async()=>{
      snapshot=await readLocalSnapshot(source,dir);assert.equal(snapshot.counts.users,1);assert.equal(snapshot.counts.cars,1);assert.equal(snapshot.counts.sessions,0);assert.deepEqual(snapshot.media[0].bytes,bytes);
      assert.equal(sqlite.prepare('SELECT count(*) AS n FROM records').get().n,6);
    });sqlite.close();
    await t.test('import preserves passwords, IDs, ordering and image bytes and can be rerun safely',async()=>{
      const result=await importSnapshot(snapshot,c,{pool,storage});assert.equal(result.alreadyImported,false);
      const user=await db.get('users','customer1');assert.equal(user.password,hash);assert.ok(await bcrypt.compare('Existing-user-password!',user.password));
      assert.deepEqual((await db.get('cars','car1')).images,['photo1']);assert.deepEqual((await db.getMedia('0123456789abcdef01234567')).bytes,bytes);
      assert.equal((await db.find('sessions')).length,0);await db.update('cars','car1',{title:'Edited after migration'});
      const repeated=await importSnapshot(snapshot,c,{pool,storage});assert.equal(repeated.alreadyImported,true);assert.equal((await db.get('cars','car1')).title,'Edited after migration');
      const different={...snapshot,fingerprint:'different-snapshot'};await assert.rejects(()=>importSnapshot(different,c,{pool,storage}),/already contains/);assert.equal((await db.find('users')).length,1);
    });
    await t.test('the actual uploaded project snapshot is readable with all records and uploaded photos',async()=>{
      const uploaded=await readLocalSnapshot(path.resolve('data/rracer.sqlite'),path.resolve('.'));
      assert.ok(uploaded.counts.users>=1);assert.ok(uploaded.counts.cars>=1);assert.ok(uploaded.media.length>=1);
      // This database was created by the isolated test runner, never a configured cloud database.
      await pool.query('TRUNCATE rracer.users,rracer.cars,rracer.images,rracer.bookings,rracer.slots,rracer.enquiries,rracer.settings,rracer.audit,rracer.sessions,rracer.notifications,rracer.media');
      mock.objects.clear();
      let writes=0;
      const interrupted={...storage,put:async(...args)=>{if(++writes===2)throw new Error('Simulated interrupted import');return storage.put(...args);}};
      await assert.rejects(()=>importSnapshot(uploaded,c,{pool,storage:interrupted}),/interrupted import/);
      assert.equal((await db.find('users')).length,0);assert.ok(mock.objects.size>0);
      const result=await importSnapshot(uploaded,c,{pool,storage});assert.equal(result.alreadyImported,false);
      for(const r of uploaded.records)assert.deepEqual(await db.get(r.collection,r.id),JSON.parse(JSON.stringify(r.payload)));
      for(const media of uploaded.media)assert.equal(sha256((await db.getMedia(media.id)).bytes),sha256(media.bytes));
      for(const r of uploaded.records)if(r.collection==='images'&&r.payload.mediaId)assert.ok(uploaded.media.some(m=>m.id===r.payload.mediaId));
    });
    await t.test('backup CLI produces a restorable SQLite snapshot with every record and verified photo',async()=>{
      await promisify(execFile)(process.execPath,[path.resolve('scripts/supabase-backup.js')],{cwd:dir,env:{...process.env,
        NODE_ENV:'development',DATABASE_DRIVER:'supabase',JWT_SECRET:c.secret,
        SUPABASE_DATABASE_URL:c.supabaseDatabaseUrl,SUPABASE_URL:mock.url,SUPABASE_SECRET_KEY:mock.secret,
        SUPABASE_STORAGE_BUCKET:c.supabaseBucket,SUPABASE_DB_SSL:'false',SUPABASE_POOL_MAX:'1',
        SUPABASE_CA_CERT:'',SUPABASE_CA_CERT_PATH:''
      },timeout:30000});
      const [folder]=await readdir(path.join(dir,'backups'));
      const backup=path.join(dir,'backups',folder);
      assert.match(await readFile(path.join(backup,'RESTORE.txt'),'utf8'),/EMPTY Supabase project/);
      const snapshot=await readLocalSnapshot(path.join(backup,'rracer.sqlite'),dir);
      const source=await readLocalSnapshot(path.resolve('data/rracer.sqlite'),path.resolve('.'));
      assert.deepEqual(snapshot.counts,source.counts);
      for(const row of source.records)assert.deepEqual(snapshot.records.find(r=>r.collection===row.collection&&r.id===row.id).payload,row.payload);
      for(const media of source.media)assert.equal(sha256(snapshot.media.find(m=>m.id===media.id).bytes),sha256(media.bytes));
    });
  }finally{await db?.close();await pool.end();await mock.close();await rm(dir,{recursive:true,force:true});}
});
