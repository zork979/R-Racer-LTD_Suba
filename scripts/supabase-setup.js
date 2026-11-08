import { readFile } from 'node:fs/promises';
import { createPostgresPool } from '../server/supabase-database.js';
import { createImageStorage } from '../server/supabase-storage.js';
import { loadSupabaseEnv, reportSetupError } from './supabase-env.js';
let pool;
try {
  const c=loadSupabaseEnv();pool=await createPostgresPool(c);
  await pool.query(await readFile(new URL('../supabase/migrations/001_rracer.sql',import.meta.url),'utf8'));
  await createImageStorage(c).setup();
  console.log('Supabase schema and private image bucket are ready. No accounts or demo cars were created.');
  console.log('Next: npm run supabase:migrate -- --dry-run, then npm run supabase:migrate to copy your local records and images.');
} catch(e) {console.error(reportSetupError(e));process.exitCode=1;}
finally{await pool?.end();}
