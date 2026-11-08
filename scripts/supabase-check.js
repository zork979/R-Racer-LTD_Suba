import { openDatabase } from '../server/database.js';
import { loadSupabaseEnv, reportSetupError } from './supabase-env.js';
let db;
try {
  db=await openDatabase(loadSupabaseEnv());
  const counts={};for(const entity of ['users','cars','images','bookings','enquiries'])counts[entity]=(await db.find(entity)).length;
  for(const image of await db.find('images'))if(image.mediaId && !(await db.mediaInfo(image.mediaId)))throw new Error('An image record has no storage metadata. Complete the migration before deployment.');
  const image=(await db.find('images')).find(i=>i.mediaId);
  if(image){const media=await db.getMedia(image.mediaId);if(!media?.bytes.length)throw new Error('Image download verification failed.');}
  console.log('Supabase PostgreSQL and private image Storage checks passed.');console.log(JSON.stringify(counts,null,2));
  console.log('Keep SUPABASE_SECRET_KEY and SUPABASE_DATABASE_URL on the server.');
} catch(e){console.error(reportSetupError(e));process.exitCode=1;}
finally{await db?.close();}
