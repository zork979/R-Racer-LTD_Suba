import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (Number(process.versions.node.split('.')[0]) !== 24) { console.error('Install Node.js 24 LTS first.'); process.exit(1); }
if (existsSync('.env')) { console.log('.env already exists; your configuration was preserved. Run npm start.'); process.exit(0); }
const password = randomBytes(15).toString('base64url') + '!9';
let env = readFileSync('.env.example', 'utf8').replace(/^JWT_SECRET=$/m, `JWT_SECRET=${randomBytes(48).toString('hex')}`).replace(/^ADMIN_PASSWORD=$/m, `ADMIN_PASSWORD=${password}`);
writeFileSync('.env', env, { mode: 0o600 });
console.log(`Local configuration created.\n\nAdmin email: admin@rracer.local\nAdmin password: ${password}\n\nKeep these details private. You can also find them in .env.\nRun npm start, then open http://localhost:8000`);
