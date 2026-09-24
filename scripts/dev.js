import { spawn } from 'node:child_process';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const backend = spawn(process.execPath, ['--watch', 'server/index.js'], { stdio: 'inherit' });
const frontend = spawn(npm, ['exec', 'vite'], { stdio: 'inherit', shell: process.platform === 'win32' });
function stop() { backend.kill(); frontend.kill(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
