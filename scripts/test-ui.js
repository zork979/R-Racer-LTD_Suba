import {build} from 'esbuild';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
await mkdir('test-output',{recursive:true});
await build({entryPoints:['tests/ui.integration.jsx'],outfile:'test-output/ui.test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic'});
const child=spawn(process.execPath,['--test','test-output/ui.test.mjs'],{stdio:'inherit'});
process.exitCode=await new Promise((resolve,reject)=>{
  child.once('error',reject);
  child.once('exit',(code,signal)=>{
    if(signal)console.error(`UI test process stopped by ${signal}.`);
    resolve(code ?? 1);
  });
});
