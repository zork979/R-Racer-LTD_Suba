import path from 'node:path';
import { root } from '../server/config.js';
import { readLocalSnapshot, importSnapshot } from './supabase-import.js';
import { loadSupabaseEnv, reportSetupError } from './supabase-env.js';
try {
  const index=process.argv.indexOf('--source');
  if(index!==-1&&!process.argv[index+1])throw new Error('Provide a SQLite filename after --source.');
  const source=path.resolve(index===-1?path.join(root,'data/rracer.sqlite'):process.argv[index+1]);
  const snapshot=await readLocalSnapshot(source,root);
  console.log(JSON.stringify({records:snapshot.counts,images:snapshot.media.length,imageBytes:snapshot.imageBytes},null,2));
  if(process.argv.includes('--dry-run'))console.log('Dry run complete. No Supabase connection or writes performed. Existing session cookies will not be migrated.');
  else {
    const result=await importSnapshot(snapshot,loadSupabaseEnv());
    console.log(result.alreadyImported?'This exact snapshot was already imported. No records were changed.':'Migration completed and verified. Existing accounts, IDs, car galleries and business records are preserved. Sign in again using your existing passwords.');
    console.log('Next: npm run supabase:check, then npm run start:supabase.');
  }
} catch(e){console.error(reportSetupError(e));process.exitCode=1;}
