import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { startStorageServer } from '../tests/helpers/storage-server.js';
import { normalisePgliteProtocol } from '../tests/helpers/pglite-protocol.js';

// Never uses SUPABASE_DATABASE_URL or a hosted database. Creates/drops only random test databases.
const url=process.env.TEST_POSTGRES_ADMIN_URL;
const parsed=url?new URL(url):null;
if(parsed&&!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname))throw new Error('Automated tests require PostgreSQL on localhost. Remote database cleanup is forbidden.');
const admin=url?new pg.Pool({connectionString:url,ssl:false}):null;
const storage=await startStorageServer();
const schema=await readFile(new URL('../supabase/migrations/001_rracer.sql',import.meta.url),'utf8');
let database,wasm,wire;
async function stopWasm(){
  if(wire){await wire.stop();wire=null;}
  // Socket close callbacks detach asynchronously; drain them before destroying WASM.
  await new Promise(setImmediate);await new Promise(setImmediate);
  if(wasm){await wasm.close();wasm=null;}
}
const rolesSQL=['anon','authenticated','service_role'].map(role=>`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`).join(';');
try {
  if(admin)await admin.query(rolesSQL);
  const suites=['tests/backend.test.js','tests/notifications.test.js','tests/supabase.integration.js','ui'];
  const requested=process.argv[process.argv.indexOf('--suite')+1];
  if(process.argv.includes('--suite')&&!suites.includes(requested))throw new Error('Unknown test suite.');
  for(const suite of process.argv.includes('--suite')?[requested]:suites) {
    let target;
    if(admin){
      database='rracer_test_'+randomBytes(8).toString('hex');await admin.query(`CREATE DATABASE "${database}"`);
      target=new URL(url);target.pathname='/'+database;
      const pool=new pg.Pool({connectionString:target.toString(),ssl:false});
      try{await pool.query(schema);await pool.query(schema);}finally{await pool.end();}
    }else{
      wasm=await PGlite.create();await wasm.exec(rolesSQL);await wasm.exec(schema);await wasm.exec(schema);
      normalisePgliteProtocol(wasm);
      const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
      wire=new PGLiteSocketServer({db:wasm,host:'127.0.0.1',port,maxConnections:10,debug:process.env.DEBUG_PGLITE==='true'});await wire.start();
      target=new URL(`postgresql://postgres:postgres@127.0.0.1:${port}/postgres`);
    }
    storage.buckets.clear();storage.objects.clear();storage.buckets.set('rracer-images',{id:'rracer-images',name:'rracer-images',public:false});
    const command=suite==='ui'?['scripts/test-ui.js']:['--test',suite];
    const child=spawn(process.execPath,command,{stdio:'inherit',env:{...process.env,TEST_SUPABASE_DATABASE_URL:target.toString(),TEST_SUPABASE_URL:storage.url,TEST_SUPABASE_SECRET_KEY:storage.secret,TEST_SUPABASE_POOL_MAX:admin?'5':'1'}});
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
    if(code)throw new Error('Supabase compatibility suite failed: '+suite);
    if(admin){await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);database=null;}
    if(wire)await stopWasm();
  }
  console.log(`All SQL/API/migration/DOM workflows passed using ${admin?'native local PostgreSQL':'PGlite (PostgreSQL WASM over the pg wire protocol, pool size 1)'}. Storage used a local HTTP test double; no hosted Supabase project was accessed.`);
}finally{
  if(database)await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  await admin?.end();await stopWasm();await storage.close();
}
