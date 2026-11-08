import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { zipSync } from 'fflate';
import { root } from '../server/config.js';

// An explicit allowlist prevents private local files from entering a hosting upload.
const directories=['src','server','scripts','public','legacy-uploads','dist','supabase'];
const files=['package.json','package-lock.json','index.html','vite.config.js'];
const archive={};
async function add(relative) {
  const full=path.join(root,relative);
  for(const entry of await readdir(full,{withFileTypes:true})) {
    if(entry.isSymbolicLink())throw new Error('Refusing to package a symbolic link.');
    if(entry.name.startsWith('.')||/\.(pem|key|crt|sqlite|db|log|zip)$/i.test(entry.name))continue;
    const name=path.posix.join(relative,entry.name);
    if(entry.isDirectory())await add(name);else archive[name]=new Uint8Array(await readFile(path.join(root,name)));
  }
}
for(const directory of directories)await add(directory);
for(const file of files)archive[file]=new Uint8Array(await readFile(path.join(root,file)));
const dest=path.join(root,'release','R-Racer-Hostinger-Upload.zip');
await mkdir(path.dirname(dest),{recursive:true});
await writeFile(dest,zipSync(archive,{level:6}));
console.log('Created '+dest);
console.log('This upload contains no .env, SQLite data, backups, test output or node_modules. Configure server variables in Hostinger. Select Express, Node 24 and server/index.js.');
