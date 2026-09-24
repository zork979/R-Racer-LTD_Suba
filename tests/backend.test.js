import {testDatabaseConfig} from './helpers/database-config.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {config} from '../server/config.js';
import {openDatabase} from '../server/database.js';
import {initialise} from '../server/seed.js';
import {createApp} from '../server/app.js';

test('Dealership API integration suite',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'rracer-test-'));
  const c=config({production:false,dataDir:dir,driver:process.env.TEST_MONGO_URI?'mongodb':'sqlite',mongoUri:process.env.TEST_MONGO_URI,mongoDb:'rracer_test_'+Date.now(),secret:'test-secret-with-more-than-thirty-two-characters',adminEmail:'admin@example.test',adminPassword:'A-secure-admin-password!',seedDemo:false,maxImages:3,maxImageMB:1,smtpHost:null,smtpUser:null,smtpPass:null,notificationEmail:"alerts@example.test",appUrl:'http://localhost:8000',...testDatabaseConfig()});
  let db=await openDatabase(c);await initialise(db,c);let server=createApp(db,c).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let base='http://127.0.0.1:'+server.address().port;
  const admin={},user={},other={};let car,photos,booking;
  async function request(client,url,method='GET',body,expected=200,headers={}){
    const form=body instanceof FormData;
    const r=await fetch(base+'/api'+url,{method,headers:{...(client.cookie?{Cookie:client.cookie}:{}),...(client.csrf?{'X-CSRF-Token':client.csrf}:{}),...(form?{}:{'Content-Type':'application/json'}),...headers},body:body?(form?body:JSON.stringify(body)):undefined});
    const type=r.headers.get('content-type');const data=type?.includes('application/json')?await r.json():type?.includes('image/')?Buffer.from(await r.arrayBuffer()):await r.text();
    assert.equal(r.status,expected,`${method} ${url}: ${JSON.stringify(data)}`);
    if(r.headers.get('set-cookie'))client.cookie=r.headers.get('set-cookie').split(';')[0];
    if(data.csrfToken)client.csrf=data.csrfToken;
    return data;
  }
  const jpeg=await sharp({create:{width:100,height:80,channels:3,background:'#ce3029'}}).jpeg().toBuffer();
  const upload=()=>{const f=new FormData();f.append('images',new Blob([jpeg],{type:'image/jpeg'}),'car.jpg');return f;};
  const offset=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
  try{
    await t.test('health check and storefront are served',async()=>{
      assert.equal((await request({},'/health')).status,'ok');
      const r=await fetch(base);assert.equal(r.status,200);assert.match(await r.text(),/R Racer Ltd/);
      const deep=await fetch(base+'/cars/some-car');assert.equal(deep.status,200);
    });
    await t.test('admin bootstrap hashes once and login is case-normalised',async()=>{const d=await request(admin,'/auth/login','POST',{email:'ADMIN@example.test',password:c.adminPassword});assert.equal(d.user.role,'admin');assert.ok(!d.user.password);});
    await t.test('customer registration cannot set an admin role',async()=>{const d=await request(user,'/auth/signup','POST',{name:'Customer One',email:'ONE@example.test',phone:'07000111111',password:'A-customer-password!',role:'admin'},201);assert.equal(d.user.role,'user');assert.equal(d.user.email,'one@example.test');});
    await t.test('duplicate email and bad credentials fail safely',async()=>{
      await request({},'/auth/signup','POST',{name:'Duplicate',email:'one@example.test',phone:'123',password:'Strong-password!'},409);
      await request({},'/auth/login','POST',{email:'one@example.test',password:'wrong'},401);
    });
    await t.test('protected routes reject anonymous users, customers and missing CSRF',async()=>{
      await request({},'/upload/images','POST',upload(),401);
      await request(user,'/upload/images','POST',upload(),403);
      await request(user,'/admin/dashboard','GET',undefined,403);
      await request({cookie:admin.cookie},'/cars','POST',{},403);
      await request(admin,'/cars','POST',{},403,{Origin:'https://untrusted.example'});
    });
    await t.test('profile fields cannot escalate role or overwrite password',async()=>{
      const d=await request(user,'/auth/profile','PUT',{name:'Customer One',phone:'07000111112',role:'admin',password:'injected'});assert.equal(d.user.role,'user');
      const another={};await request(another,'/auth/login','POST',{email:'one@example.test',password:'A-customer-password!'});
    });
    await t.test('multiple image uploads are decoded, optimised and retrievable',async()=>{
      const f=upload();f.append('images',new Blob([jpeg],{type:'image/jpeg'}),'second.jpg');photos=(await request(admin,'/upload/images','POST',f,201)).images;
      assert.equal(photos.length,2);const bytes=await request({},photos[0].url.slice(4));const meta=await sharp(bytes).metadata();assert.equal(meta.format,'webp');assert.equal(meta.width,100);
    });
    await t.test('fake image files and oversized uploads are rejected',async()=>{
      const f=new FormData();f.append('images',new Blob(['not-an-image'],{type:'image/jpeg'}),'bad.jpg');await request(admin,'/upload/images','POST',f,400);
      const bad=new FormData();bad.append('images',new Blob(['<script>bad</script>'],{type:'image/svg+xml'}),'bad.svg');await request(admin,'/upload/images','POST',bad,400);
      const large=new FormData();large.append('images',new Blob([Buffer.alloc(1024*1024+1)],{type:'image/jpeg'}),'large.jpg');await request(admin,'/upload/images','POST',large,400);
    });
    await t.test('vehicle creation accepts booleans and ordered galleries',async()=>{
      car=(await request(admin,'/cars','POST',{title:'Test Car',brand:'Test',model:'Tourer',year:2024,carType:'rent',pricePerDay:49.5,mileage:1200,seats:5,previousOwners:2,mot:'2027-01-20',isAvailable:true,featured:true,images:photos.map(p=>p._id)},201)).car;
      assert.equal(car.isAvailable,true);assert.equal(car.images.length,2);assert.equal(car.images[0]._id,photos[0]._id);
    });
    await t.test('invalid numbers, booleans, image references and gallery counts fail',async()=>{
      await request(admin,'/cars/'+car._id,'PUT',{pricePerDay:-10},400);
      await request(admin,'/cars/'+car._id,'PUT',{isAvailable:'yes'},400);
      await request(admin,'/cars/'+car._id,'PUT',{images:['missing']},400);
      await request(admin,'/cars/'+car._id,'PUT',{images:['1','2','3','4']},400);
    });
    await t.test('gallery reorder changes cover; zero fields and MOT edits persist',async()=>{
      const d=await request(admin,'/cars/'+car._id,'PUT',{images:photos.map(p=>p._id).reverse(),mileage:0,previousOwners:0,mot:'2028-02-01',isAvailable:false});
      assert.equal(d.car.images[0]._id,photos[1]._id);assert.equal(d.car.mileage,0);assert.equal(d.car.previousOwners,0);assert.equal(d.car.isAvailable,false);assert.equal(d.car.mot,'2028-02-01');
      await request(admin,'/cars/'+car._id,'PUT',{isAvailable:true});
    });
    await t.test('search, filters, pagination and actual catalog use stored inventory',async()=>{
      const d=await request({},'/cars?format=paged&brand=Test&carType=rent&maxPrice=50');assert.equal(d.total,1);assert.equal(d.cars[0]._id,car._id);
      assert.equal((await request({},'/cars?q=nonexistent')).length,0);assert.ok((await request({},'/catalog')).brands.includes('Test'));
    });
    await t.test('shortlists persist and can be toggled',async()=>{
      assert.equal((await request(user,'/favorites/'+car._id,'POST')).favorites.length,1);assert.equal((await request(user,'/favorites')).length,1);
      assert.equal((await request(user,'/favorites/'+car._id,'POST')).favorites.length,0);
    });
    await t.test('booking price is calculated server-side; pending dates are reserved',async()=>{
      booking=(await request(user,'/bookings','POST',{carId:car._id,startDate:offset(5),endDate:offset(7),total:1},201)).booking;assert.equal(booking.total,99);assert.equal(booking.days,2);assert.equal(booking.status,'pending');
      const d=await request({},`/cars/${car._id}/availability?startDate=${offset(5)}&endDate=${offset(7)}`);assert.equal(d.available,false);
    });
    await t.test('overlapping bookings, active archive and listing type changes are blocked',async()=>{
      await request(user,'/bookings','POST',{carId:car._id,startDate:offset(6),endDate:offset(8)},409);
      await request(admin,'/cars/'+car._id,'DELETE',undefined,409);
      await request(admin,'/cars/'+car._id,'PUT',{carType:'buy'},409);
    });
    await t.test('simultaneous requests cannot double-book the same dates',async()=>{
      const body={carId:car._id,startDate:offset(10),endDate:offset(12)};
      const rs=await Promise.all([1,2].map(()=>fetch(base+'/api/bookings',{method:'POST',headers:{'Content-Type':'application/json',Cookie:user.cookie,'X-CSRF-Token':user.csrf},body:JSON.stringify(body)})));
      assert.deepEqual(rs.map(r=>r.status).sort(),[201,409]);await Promise.all(rs.map(r=>r.json()));
    });
    await t.test('customers only see and cancel their own bookings',async()=>{
      await request(other,'/auth/signup','POST',{name:'Other User',email:'other@example.test',phone:'07000222222',password:'Other-password-123!'},201);
      assert.equal((await request(other,'/bookings')).length,0);
      await request(other,'/bookings/'+booking._id+'/status','PATCH',{status:'cancelled'},403);
      await request(user,'/bookings/'+booking._id+'/status','PATCH',{status:'confirmed'},403);
    });
    await t.test('admin confirms; customer cancellation releases dates',async()=>{
      await request(admin,'/bookings/'+booking._id+'/status','PATCH',{status:'confirmed'});
      await request(user,'/bookings/'+booking._id+'/status','PATCH',{status:'cancelled'});
      assert.equal((await request({},`/cars/${car._id}/availability?startDate=${offset(5)}&endDate=${offset(7)}`)).available,true);
      await request(admin,'/bookings/'+booking._id+'/status','PATCH',{status:'confirmed'},409);
    });
    await t.test('invalid dates are rejected without storing a booking',async()=>{
      await request(user,'/bookings','POST',{carId:car._id,startDate:'2026-02-30',endDate:'2026-03-03'},400);
      await request(user,'/bookings','POST',{carId:car._id,startDate:offset(8),endDate:offset(8)},400);
    });
    await t.test('enquiries require sign-in and CSRF and use the account email',async()=>{
      await request({},'/enquiries','POST',{name:'Guest',email:'guest@example.test',message:'Anonymous blocked'},401);
      await request({cookie:user.cookie},'/enquiries','POST',{name:'Missing CSRF',message:'Blocked'},403);
      const d=await request(user,'/enquiries','POST',{name:'Interested Customer' ,email:'lead@example.test',message:'Please arrange a viewing',type:'viewing',carId:car._id},201);assert.ok(d.reference);
      const inbox=await request(admin,'/admin/enquiries');assert.equal(inbox.length,1);assert.equal(inbox[0].carTitle,'Test Car');assert.equal(inbox[0].email,'one@example.test');assert.ok(inbox[0].userId);
      const changed=await request(admin,'/admin/enquiries/'+inbox[0]._id,'PATCH',{status:'contacted'});assert.equal(changed.status,'contacted');
    });
    await t.test('dashboard and CSV export reflect real records',async()=>{
      const d=await request(admin,'/admin/dashboard');assert.equal(d.cars,1);assert.equal(d.pending,1);assert.ok(d.activity.length);
      const csv=await request(admin,'/admin/export/bookings');assert.match(csv,/RR-/);assert.match(csv,/Total GBP/);
    });
    await t.test('business settings save and are public without secrets',async()=>{
      const settings=await request({},'/settings');await request(admin,'/admin/settings','PUT',{...settings,hours:'Monday to Friday, by appointment'});
      const fresh=await request({},'/settings');assert.equal(fresh.hours,'Monday to Friday, by appointment');assert.equal(fresh.secret,undefined);
    });
    await t.test('email-only password takeover is blocked; reset messages do not enumerate users',async()=>{
      await request({},'/auth/reset_password','PUT',{email:'other@example.test',newPassword:'Hijack-password!'},400);
      const a=await request({},'/auth/forgot_password','POST',{email:'other@example.test'});const b=await request({},'/auth/forgot_password','POST',{email:'unknown@example.test'});assert.deepEqual(a,b);
    });
    await t.test('reset token is single use and invalidates previous sessions',async()=>{
      const files=await readdir(path.join(dir,'mail'));const contents=await readFile(path.join(dir,'mail',files[0]),'utf8');const token=contents.match(/token=([a-f0-9]+)/)[1];
      await request({},'/auth/reset_password','POST',{token,newPassword:'Changed-password-123!'});
      await request(other,'/auth/me','GET',undefined,401);
      await request({},'/auth/reset_password','POST',{token,newPassword:'Again-password-123!'},400);
      await request(other,'/auth/login','POST',{email:'other@example.test',password:'Changed-password-123!'});
    });
    await t.test('image removal deletes unreferenced media and keeps the remaining cover',async()=>{
      await request(admin,'/cars/'+car._id,'PUT',{images:[photos[1]._id]});await request({},photos[0].url.slice(4),'GET',undefined,404);
      const fresh=await request({},'/cars/'+car._id);assert.equal(fresh.images.length,1);assert.equal(fresh.images[0]._id,photos[1]._id);
    });
    await t.test('customer avatars validate, optimise and persist',async()=>{
      const f=new FormData();f.append('image',new Blob([jpeg],{type:'image/jpeg'}),'avatar.jpg');const d=await request(user,'/auth/avatar','POST',f);assert.match(d.user.image,/^\/api\/media\//);
    });
    await t.test('password changes require the current password',async()=>{
      await request(user,'/auth/change_password','PUT',{oldPassword:'wrong',newPassword:'Brand-new-password!'},400);
      await request(user,'/auth/change_password','PUT',{oldPassword:'A-customer-password!',newPassword:'Brand-new-password!'});
      assert.equal((await request(user,'/auth/me')).user.role,'user');
    });
    await t.test('vehicles, images, bookings and users survive a full server restart',async()=>{
      await new Promise(r=>server.close(r));await db.close();db=await openDatabase(c);await initialise(db,c);server=createApp(db,c).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
      assert.equal((await request({},'/cars/'+car._id)).images.length,1);assert.equal((await request(admin,'/bookings')).length,2);assert.ok(await request({},photos[1].url.slice(4)));assert.equal((await request(user,'/auth/me')).user.name,'Customer One');
    });
    await t.test('logout revokes the server session',async()=>{const old={...user};await request(user,'/auth/logout','POST');await request(old,'/auth/me','GET',undefined,401);});
  }finally{await new Promise(r=>server.close(r));await db.close();await rm(dir,{recursive:true,force:true});}
});
