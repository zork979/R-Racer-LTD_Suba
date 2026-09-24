import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../server/config.js';
import { postgresOptions, openSupabaseDatabase } from '../server/supabase-database.js';
const base={production:false,driver:'supabase',secret:'test-secret-that-is-longer-than-thirty-two-characters',supabaseDatabaseUrl:'postgresql://postgres.project:database-password@host.pooler.supabase.com:5432/postgres',supabaseUrl:'https://project.supabase.co',supabaseSecretKey:'sb_secret_test_example',supabaseSsl:true,seedDemo:false,supabaseCaFile:null,supabaseCaCert:null};
test('Supabase config rejects public keys, placeholders and remote plaintext transport',async()=>{
  assert.throws(()=>config({...base,supabaseSecretKey:'sb_publishable_bad'}),/SUPABASE_SECRET_KEY/);
  assert.throws(()=>config({...base,supabaseDatabaseUrl:'postgresql://postgres.PROJECT_REF:password@POOLER_HOST/postgres'}),/Replace/);
  assert.throws(()=>config({...base,supabaseSsl:false}),/SSL/);
  assert.throws(()=>config({...base,supabaseUrl:'http://project.supabase.co'}),/HTTPS/);
  assert.throws(()=>config({...base,supabasePoolMax:100}),/between 1 and 10/);
  assert.equal(config({...base,production:true,appUrl:'https://rracer.example.test'}).driver,'supabase');
  const options=await postgresOptions(config({...base,supabaseDatabaseUrl:base.supabaseDatabaseUrl+'?sslmode=no-verify'}));
  assert.equal(options.ssl.rejectUnauthorized,true);assert.ok(!options.connectionString.includes('sslmode'));assert.equal(options.max,5);
});
test('serialisation errors retry the entire transaction using one client and do not swallow business errors',async()=>{
  let tries=0,releases=0;const commands=[];
  const client={query:async sql=>{commands.push(sql);return {rows:[]};},release:()=>releases++};
  const pool={query:async()=>({rows:[{ready:true}]}),connect:async()=>client};
  const db=await openSupabaseDatabase(base,{pool,storage:{check:async()=>{}}});
  const result=await db.transaction(async()=>{tries++;if(tries<2){const e=new Error('retry');e.code='40001';throw e;}return 'committed';});
  assert.equal(result,'committed');assert.equal(tries,2);assert.equal(releases,2);assert.equal(commands.filter(x=>x==='ROLLBACK').length,1);assert.equal(commands.filter(x=>x==='COMMIT').length,1);
  let failed=0;await assert.rejects(()=>db.transaction(async()=>{failed++;throw new Error('invalid booking');}),/invalid booking/);assert.equal(failed,1);
});
