import 'dotenv/config';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
if(process.env.DATABASE_DRIVER==='supabase'){
  const {config}=await import('../server/config.js');
  const {backupSupabase}=await import('./supabase-backup.js');
  await backupSupabase(config());process.exit(0);
}
if((process.env.DATABASE_DRIVER||'sqlite')!=='sqlite'){
  console.log('MongoDB: use Atlas backups or mongodump for your selected database, including media, images, cars, users, bookings, slots, enquiries, settings and notifications. See docs/HOSTINGER.md. This command does not export production credentials.');
  process.exit(0);
}
const {DatabaseSync,backup}=await import('node:sqlite');
const source=path.resolve(process.env.DATA_DIR||'data','rracer.sqlite');
const directory=path.resolve('backups',new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(directory,{recursive:true});
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,path.join(directory,'rracer.sqlite'));}finally{db.close();}
await writeFile(path.join(directory,'RESTORE.txt'),'Stop the application. Copy rracer.sqlite into DATA_DIR, replacing the existing file only after preserving a backup. Remove stale rracer.sqlite-wal and rracer.sqlite-shm files while the application is stopped. Restart the application. Keep .env separately; it is not included in this backup.\n');
console.log('Database and uploaded images backed up to '+directory);
