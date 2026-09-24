import {MongoMemoryReplSet} from 'mongodb-memory-server-core';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
// Isolated replica set; never connects to MONGO_URI or the client's database.
await mkdir('test-output',{recursive:true});
const dbPath=await mkdtemp(path.resolve('test-output/mongo-'));
const repl=await MongoMemoryReplSet.create({instanceOpts:[{dbPath,args:['--nounixsocket']}],replSet:{count:1,storageEngine:'wiredTiger'},binary:{version:'7.0.24'}});
try{
  const child=spawn(process.execPath,['--test','--test-concurrency=1','tests/backend.test.js','tests/notifications.test.js'],{stdio:'inherit',env:{...process.env,TEST_MONGO_URI:repl.getUri()}});
  process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>{if(signal)console.error(`MongoDB test process stopped by ${signal}.`);resolve(code??1);});});
}finally{await repl.stop();await rm(dbPath,{recursive:true,force:true});}
