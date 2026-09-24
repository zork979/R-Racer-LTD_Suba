import {testDatabaseConfig} from './helpers/database-config.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../server/config.js';
import { openDatabase } from '../server/database.js';
import { initialise } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { refreshBundledImages } from '../server/bundled-images.js';
import { emailLinks, emailText } from '../src/email-handoff.js';
import { createEnquiryDraft, recipientAddress } from '../server/enquiry-email.js';

test('Customer email drafts and supplied photo library', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'rracer-drafts-'));
  const delivered = [];
  const c = config({ production:false, driver:process.env.TEST_MONGO_URI ? 'mongodb' : 'sqlite', mongoUri:process.env.TEST_MONGO_URI, mongoDb:'rracer_drafts_'+Date.now(), dataDir:dir, secret:'notification-test-secret-over-thirty-two-characters', adminEmail:'admin@example.test', adminPassword:'Admin-password-123!', seedDemo:true, smtpHost:null, smtpUser:null, smtpPass:null, mailFrom:'dealership@example.test', notificationEmail:'alerts@example.test', notificationSender:async mail=>delivered.push(mail) ,...testDatabaseConfig()});
  const db = await openDatabase(c); await initialise(db,c);
  const app = createApp(db,c), server = app.listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r)); const base='http://127.0.0.1:'+server.address().port;
  const admin={}, user={}; let enquiry;
  async function request(client,url,method='GET',body,status=200) {
    const r=await fetch(base+'/api'+url,{method,headers:{'Content-Type':'application/json',...(client.cookie?{Cookie:client.cookie}:{}),...(client.csrf?{'X-CSRF-Token':client.csrf}:{})},body:body?JSON.stringify(body):undefined});
    const data=await r.json(); assert.equal(r.status,status,JSON.stringify(data));
    if(r.headers.get('set-cookie'))client.cookie=r.headers.get('set-cookie').split(';')[0];
    if(data.csrfToken)client.csrf=data.csrfToken; return data;
  }
  try {
    await request(admin,'/auth/login','POST',{email:c.adminEmail,password:c.adminPassword});
    await request(user,'/auth/signup','POST',{name:'Driver Example',email:'driver@example.test',phone:'+447400123456',password:'Customer-password-123!'},201);
    const cars=await db.find('cars'), sale=cars.find(x=>x.carType==='buy'), rental=cars.find(x=>x.carType==='rent');
    await t.test('purchase drafts use saved vehicle, account email and configured recipient',async()=>{
      enquiry=await request(user,'/enquiries','POST',{name:'Buyer Example',email:'spoof@example.test',to:'spoof@example.test',phone:'+447400654321',carId:sale._id,carTitle:'Spoofed car',pricePerDay:1,type:'purchase',message:'Can I arrange a viewing on Saturday?'},201);
      const {emailDraft:d}=enquiry;
      assert.equal(d.to,c.notificationEmail); assert.match(d.subject,/Purchase/);
      for(const value of [sale.title,sale._id,sale.brand,sale.model,String(sale.year),Number(sale.pricePerDay).toFixed(2),sale.transmission,sale.fuelType,'Buyer Example','driver@example.test','+447400654321','Saturday',enquiry.reference])assert.ok(d.body.includes(value),value);
      assert.ok(!d.body.includes('spoof@example.test')); assert.ok(!d.body.includes('Spoofed car'));
      assert.ok(d.body.includes(c.appUrl+'/cars/'+sale._id));
      const [stored]=await db.find('enquiries');assert.equal(stored.email,'driver@example.test');assert.equal(stored.emailStatus,'draft_prepared');
      assert.equal((await db.find('notifications')).length,0);assert.equal(delivered.length,0);
    });
    await t.test('rental drafts include canonical dates and total; overlap protection is retained',async()=>{
      const date=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
      const input={carId:rental._id,startDate:date(15),endDate:date(18),total:1,message:'Please call me about collection.'};
      const {booking,emailDraft:d}=await request(user,'/bookings','POST',input,201);
      assert.equal(booking.days,3);assert.equal(booking.total,rental.pricePerDay*3);
      for(const value of [rental.title,date(15),date(18),'Driver Example','+447400123456','Please call me',Number(booking.total).toFixed(2),booking.reference])assert.ok(d.body.includes(value),value);
      assert.match(d.body,/not a confirmed booking/);assert.equal(booking.emailStatus,'draft_prepared');
      await request(user,'/bookings','POST',input,409);assert.equal((await db.find('bookings')).length,1);
    });
    await t.test('general enquiries work with no SMTP settings and preserve special characters',async()=>{
      const message='Price & availability? #2026 + extra\nI’m interested 🚗\n&bcc=other@example.test';
      const {emailDraft:d}=await request(user,'/enquiries','POST',{name:'Visitor',message},201);
      assert.match(d.body,/no vehicle selected/);
      const links=emailLinks(d), gmail=new URL(links.gmail), mailto=new URL(links.mailto);
      assert.equal(gmail.origin,'https://mail.google.com');assert.equal(gmail.searchParams.get('to'),c.notificationEmail);
      assert.equal(gmail.searchParams.get('body'),d.body);assert.equal(mailto.searchParams.get('body'),d.body);
      assert.equal(mailto.searchParams.get('subject'),d.subject);assert.equal(gmail.searchParams.get('bcc'),null);assert.equal(mailto.searchParams.get('bcc'),null);
      assert.match(d.body,/I’m interested 🚗/);assert.ok(!/(?<!\r)\n/.test(d.body));
      assert.ok(emailText(d).includes(message.replaceAll('\n','\r\n')));
    });
    await t.test('enquiry drafts require sign-in and CSRF; invalid/spam requests create nothing',async()=>{
      const before=(await db.find('enquiries')).length;
      await request({},'/enquiries','POST',{name:'Guest',message:'Question'},401);
      await request({cookie:user.cookie},'/enquiries','POST',{name:'Driver',message:'Question'},403);
      await request(user,'/enquiries','POST',{name:'Invalid',message:''},400);
      const spam=await request(user,'/enquiries','POST',{website:'bot'},201);assert.equal(spam.emailDraft,undefined);
      assert.equal((await db.find('enquiries')).length,before);
    });
    await t.test('admin can change the recipient without touching SMTP or restarting',async()=>{
      const settings=await request({},'/settings'); assert.equal(settings.enquiryEmail,c.notificationEmail);
      await request(user,'/admin/settings','PUT',{...settings,enquiryEmail:'new-inbox@example.test'},403);
      await request(admin,'/admin/settings','PUT',{...settings,enquiryEmail:'other@example.test,bcc@example.test'},400);
      await request(admin,'/admin/settings','PUT',{...settings,enquiryEmail:'new-inbox@example.test'});
      const {emailDraft:d}=await request(user,'/enquiries','POST',{name:'Driver',message:'Use the new recipient.'},201);
      assert.equal(d.to,'new-inbox@example.test');assert.equal((await request({},'/settings')).enquiryEmail,d.to);
    });
    await t.test('old email alerts are preserved but SMTP test and retry endpoints cannot send',async()=>{
      const old=await db.create('notifications',{kind:'enquiry',status:'pending',subject:'Previous queued alert',text:'Historical request',createdAt:new Date().toISOString()});
      assert.equal(app.locals.notifications,undefined);
      await request({},'/admin/notifications','GET',null,401);await request(user,'/admin/notifications','GET',null,403);
      const summary=await request(admin,'/admin/notifications');assert.deepEqual(summary,{mode:'email_client',recipient:'new-inbox@example.test'});
      for(const route of ['test','verify',encodeURIComponent(old._id)+'/retry'])await request(admin,'/admin/notifications/'+route,'POST',{},409);
      assert.deepEqual(await db.get('notifications',old._id),old);assert.equal(delivered.length,0);
    });
    await t.test('photo library is administrator-only and preserves existing galleries',async()=>{
      await request(user,'/admin/image-library','GET',null,403);
      const library=await request(admin,'/admin/image-library');assert.equal(library.length,9);
      for(const item of library){const r=await fetch(base+item.url);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/image\/jpeg/);}
      const image=(await request(admin,'/admin/image-library','POST',{key:'mustang-front'},201)).image;assert.equal(image.url,'/media/cars2-1.jpg');
      await request(admin,'/admin/image-library','POST',{key:'../../private'},400);
      const old=await db.create('images',{url:'/media/mustang-front.webp'}),upload=await db.create('images',{url:'/api/media/keep-original-upload'});
      const car=await db.create('cars',{title:'Unchanged customer car',images:[upload._id,old._id]});
      await refreshBundledImages(db);await refreshBundledImages(db);
      assert.equal((await db.get('images',old._id)).url,'/media/cars2-1.jpg');assert.equal((await db.get('images',upload._id)).url,upload.url);assert.deepEqual((await db.get('cars',car._id)).images,[upload._id,old._id]);
    });
  } finally { await new Promise(r=>server.close(r));await db.close();await rm(dir,{recursive:true,force:true}); }
});

test('draft encoding preserves a full-length Unicode message and rejects recipient injection',()=>{
  const message='🚗 &? #+ é '.repeat(200);
  const draft=createEnquiryDraft({kind:'enquiry',record:{_id:'0123456789abcdef01234567',type:'purchase',message,createdAt:'2026-09-22T12:00:00Z'},customer:{name:'Buyer',email:'buyer@example.test'},car:{_id:'car-1',title:'Car\r\nBcc: other@example.test',year:2024,pricePerDay:1234,carType:'buy'},recipient:'sales+website@example.test',appUrl:'https://rracer.example.test'});
  assert.ok(!/[\r\n]/.test(draft.subject));
  const links=emailLinks(draft);for(const url of Object.values(links)){const parsed=new URL(url);assert.equal(parsed.searchParams.get('body'),draft.body);assert.equal(parsed.searchParams.get('bcc'),null);}
  assert.ok(emailText(draft).includes(message));
  assert.equal(decodeURIComponent(new URL(links.mailto).pathname),draft.to);
  for(const address of ['sales@example.test\r\nBcc: other@example.test','sales@example.test,other@example.test','a@b.test?bcc=other@b.test','bad'])assert.throws(()=>recipientAddress(address));
});
