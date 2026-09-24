import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../server/database.js';
import {createNotifications} from '../server/notifications.js';

test('Real SMTP adapter delivers only to an isolated local test server',async()=>{
  let received='';const sockets=new Set();
  const smtp=net.createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.write('220 local.test ESMTP\r\n');let buffer='',data=false;
    socket.on('data',chunk=>{buffer+=chunk.toString();let at;while((at=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+2);if(data){if(line==='.') {data=false;socket.write('250 2.0.0 Accepted\r\n');}else received+=line+'\n';}else if(/^EHLO|^HELO/.test(line))socket.write('250 local.test\r\n');else if(/^DATA/.test(line)){data=true;socket.write('354 End with dot\r\n');}else if(/^QUIT/.test(line)){socket.end('221 Bye\r\n');}else socket.write('250 OK\r\n');}});
  });
  smtp.listen(0,'127.0.0.1');await new Promise(r=>smtp.once('listening',r));
  const dir=await mkdtemp(path.join(os.tmpdir(),'rracer-smtp-'));const db=await openDatabase({driver:'sqlite',dataDir:dir});
  const service=createNotifications(db,{production:false,dataDir:dir,smtpHost:'127.0.0.1',smtpPort:smtp.address().port,smtpSecure:false,mailFrom:'R Racer <sender@example.test>',notificationEmail:'admin@example.test',appUrl:'http://localhost:8000'});
  try{
    const connection=await service.verify();assert.equal(connection.ok,true);assert.equal(received,'','Connection verification must not send an email');
    const enquiry=await db.create('enquiries',{name:'Local SMTP Test',email:'customer@example.test',phone:'+441234567890',message:'Integration check',type:'purchase',createdAt:new Date().toISOString()});const alert=await service.enqueue('enquiry',enquiry,enquiry,{_id:'test-car',title:'Test Car',brand:'BMW',model:'320i',year:2020,carType:'buy',pricePerDay:3232,transmission:'automatic',fuelType:'petrol',mileage:17000});const result=await service.deliver(alert._id);
    assert.equal(result.status,'sent');assert.match(received,/To: admin@example.test/);assert.match(received,/Reply-To: customer@example.test/);assert.match(received,/From: R Racer <sender@example.test>/);assert.match(received,/Integration check/);assert.match(received,/Test Car/);
    for(const value of ['BMW','320i','2020','3232.00','+441234567890','text/html','text/plain'])assert.ok(received.includes(value),value);
  }finally{await service.stop();for(const socket of sockets)socket.destroy();await new Promise(r=>smtp.close(r));await db.close();await rm(dir,{recursive:true,force:true});}
});
