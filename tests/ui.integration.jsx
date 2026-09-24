import {testDatabaseConfig} from './helpers/database-config.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {JSDOM} from 'jsdom';
import React from 'react';
import {MemoryRouter} from 'react-router-dom';
import sharp from 'sharp';
import {config} from '../server/config.js';
import {openDatabase} from '../server/database.js';
import {initialise} from '../server/seed.js';
import {createApp} from '../server/app.js';
import App from '../src/App.jsx';
import {setCsrf} from '../src/api.js';

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost:8000'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLDialogElement:dom.window.HTMLDialogElement,MutationObserver:dom.window.MutationObserver,FormData:dom.window.FormData});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
window.scrollTo=()=>{};
const emailWindows=[];
let blockEmailWindow=false, failNextEnquiry=false;
window.open=(url,target)=>{
  assert.equal(url,'about:blank');assert.equal(target,'_blank');
  if(blockEmailWindow)return null;
  const tab={closed:false,opener:window,document:{title:'',body:{textContent:''}},location:{replace(value){tab.url=value;}},close(){this.closed=true;}};
  emailWindows.push(tab);return tab;
};
// JSDOM has no visual dialog renderer; keep native open/closed semantics for interaction tests.
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
const {render,screen,fireEvent,waitFor,cleanup,within}=await import('@testing-library/react');
const nativeFetch=globalThis.fetch;

test('React workflows against the real local API (DOM integration, not visual browser tests)',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'rracer-ui-'));
  const c=config({production:false,driver:'sqlite',dataDir:dir,secret:'ui-integration-secret-at-least-thirty-two-characters',adminEmail:'admin@ui.test',adminPassword:'UI-admin-password-123!',seedDemo:true,smtpHost:null,smtpUser:null,smtpPass:null,notificationEmail:"alerts@example.test",appUrl:'http://localhost:8000',onError:error=>console.error(error.stack),...testDatabaseConfig()});
  const db=await openDatabase(c);await initialise(db,c);const server=createApp(db,c).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
  let cookie='';
  globalThis.fetch=async(input,options={})=>{
    if(/^https?:/.test(String(input)) && new URL(input).origin!==base)return nativeFetch(input,options);
    let body=options.body;
    if(failNextEnquiry && String(input).endsWith('/enquiries')){
      failNextEnquiry=false;
      return new Response(JSON.stringify({message:'Please try your enquiry again.'}),{status:400,headers:{'Content-Type':'application/json'}});
    }
    const requestHeaders={...options.headers,...(cookie?{Cookie:cookie}:{}),Origin:'http://localhost:8000'};
    if(body instanceof dom.window.FormData){
      const boundary='----RRacerIntegrationBoundary';const chunks=[];
      for(const [key,value]of body.entries()){
        if(value instanceof dom.window.File){const bytes=await new Promise((resolve,reject)=>{const reader=new dom.window.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsArrayBuffer(value);});chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"; filename="${value.name}"\r\nContent-Type: ${value.type}\r\n\r\n`),Buffer.from(bytes),Buffer.from('\r\n'));}
        else chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
      }chunks.push(Buffer.from(`--${boundary}--\r\n`));body=Buffer.concat(chunks);requestHeaders['Content-Type']='multipart/form-data; boundary='+boundary;
    }
    const r=await nativeFetch(new URL(input,base),{...options,body,headers:requestHeaders});
    if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;
  };
  function mount(pathname){cleanup();render(<MemoryRouter initialEntries={[pathname]}><App/></MemoryRouter>);}
  async function snapshot(name){
    const copy=document.documentElement.cloneNode(true);
    copy.querySelector('head').innerHTML='<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="../src/styles.css"><title>R Racer design review</title>';
    for(const img of copy.querySelectorAll('img')){const src=img.getAttribute('src');if(src?.startsWith('/media/'))img.setAttribute('src','../public'+src);else if(src?.startsWith('/api/media/')){const response=await nativeFetch(base+src);const filename=name+'-'+src.split('/').pop()+'.webp';await writeFile('test-output/'+filename,Buffer.from(await response.arrayBuffer()));img.setAttribute('src',filename);}else img.setAttribute('src','../public/placeholder.svg');}
    await writeFile('test-output/'+name+'.html','<!doctype html>'+copy.outerHTML);
  }
  async function field(label,value){fireEvent.change(screen.getByLabelText(label,{exact:true}),{target:{value}});}
  try{
    await t.test('home renders real vehicle cards and navigates to filtered inventory',async()=>{
      mount('/');await screen.findByRole('heading',{name:'Toyota Prius'});assert.ok(screen.getByRole('heading',{name:/Life moves/}));await snapshot('home');
      await field('What are you looking for?','Audi');fireEvent.click(screen.getByRole('button',{name:'Find my car'}));
      await screen.findByRole('heading',{name:'Audi A1 Sportback'});await waitFor(()=>assert.equal(document.querySelectorAll('.car-card').length,1));
    });
    await t.test('carousel manual navigation, pause and direct contact links',async()=>{
      mount('/');await screen.findByRole('heading',{name:/Life moves/});
      fireEvent.click(screen.getByRole('button',{name:'Pause slideshow'}));assert.ok(screen.getByRole('button',{name:'Play slideshow'}));
      fireEvent.click(screen.getByRole('button',{name:'Next slide'}));await screen.findByRole('heading',{name:/Make room/});
      fireEvent.click(screen.getByRole('button',{name:'Previous slide'}));await screen.findByRole('heading',{name:/Life moves/});
      assert.ok(screen.getByRole('link',{name:'Call R Racer'}).href.startsWith('tel:'));
      assert.ok(screen.getByRole('link',{name:'Message R Racer on WhatsApp'}).href.startsWith('https://wa.me/'));
      assert.ok(document.querySelector('header img').src.endsWith('/brand/header-logo.png'));
      assert.ok(document.querySelector('footer img').src.endsWith('/brand/footer-logo.png'));
      assert.equal(document.querySelector('.carousel-count'),null);
      assert.ok(document.querySelector('.carousel-photo').src.endsWith('/media/cars2-1.jpg'));
    });
    await t.test('gallery thumbnail changes the displayed image',async()=>{
      const car=(await db.find('cars',{model:'Mustang'}))[0];mount('/cars/'+car._id);await screen.findByRole('heading',{name:'Ford Mustang'});
      const first=document.querySelector('.main-photo img').src;fireEvent.click(screen.getByRole('button',{name:'View photo 2'}));await waitFor(()=>assert.notEqual(document.querySelector('.main-photo img').src,first));
    });
    await t.test('signed-in contact form saves an enquiry and opens an unsent Gmail draft',async()=>{
      mount('/contact');await screen.findByRole('heading',{name:'Sign in to send an enquiry'});assert.equal(screen.queryByRole('button',{name:'Continue to Gmail'}),null);
      fireEvent.click(screen.getByRole('link',{name:'Create an account',exact:true}));await field('Your name','UI Customer');await field('Email address','ui-customer@example.test');await field('Phone number','07000777000');await field('Password','UI-customer-password!');fireEvent.click(screen.getByRole('button',{name:'Create my account'}));
      await screen.findByLabelText('How can we help?',{exact:true});assert.ok(screen.getByLabelText('Email address',{exact:true}).readOnly);
      await field('How can we help?','Please arrange a viewing next week.');fireEvent.click(screen.getByRole('button',{name:'Continue to Gmail'}));
      await screen.findByText(/Enquiry reference:/);assert.equal((await db.find('enquiries')).length,1);
      const tab=emailWindows.at(-1),url=new URL(tab.url);assert.equal(tab.opener,null);assert.equal(url.origin,'https://mail.google.com');assert.ok(url.searchParams.get('body').includes('ui-customer@example.test'));
      assert.ok(screen.getByText(/Opening the draft does not send it/));assert.ok(screen.getByRole('link',{name:'Open email app'}).href.startsWith('mailto:'));
      assert.equal((await db.find('notifications')).length,0);
    });
    await t.test('admin login opens the live dashboard',async()=>{
      mount('/login');await field('Email address',c.adminEmail);await field('Password',c.adminPassword);fireEvent.click(screen.getByRole('button',{name:'Sign in',exact:true}));
      await screen.findByRole('heading',{name:/Welcome back/}, {timeout:5000});await screen.findByText('Vehicles in stock');await snapshot('dashboard');
    });
    await t.test('vehicle editor uploads multiple files, reorders cover and persists a new listing',async()=>{
      mount('/admin/cars');await screen.findByRole('heading',{name:'Your collection.'});fireEvent.click(screen.getByRole('button',{name:'Add a vehicle'}));await screen.findByRole('heading',{name:'Add a vehicle'});
      await field('Vehicle title','UI Gallery Car');await field('Make','UI Make');await field('Model','Roadster');await field('Asking price (£)','15000');
      const bytes=await sharp({create:{width:120,height:100,channels:3,background:'#cd4433'}}).jpeg().toBuffer();
      const input=document.querySelector('.upload-zone input');fireEvent.change(input,{target:{files:[new window.File([bytes],'front.jpg',{type:'image/jpeg'}),new window.File([bytes],'rear.jpg',{type:'image/jpeg'})]}});
      for(let i=0;i<50&&document.querySelectorAll('.editor-gallery img').length!==2;i++)await new Promise(r=>setTimeout(r,100));
      assert.equal(document.querySelectorAll('.editor-gallery img').length,2);
      for(let i=0;i<50&&document.querySelector('.editor-footer .button:not(.button-secondary)').disabled;i++)await new Promise(r=>setTimeout(r,100));
      const second=document.querySelectorAll('.editor-gallery img')[1].src;fireEvent.click(screen.getByText('Set cover',{selector:'button'}));await waitFor(()=>assert.equal(document.querySelectorAll('.editor-gallery img')[0].src,second));
      fireEvent.click(screen.getByText('Save vehicle',{selector:'button'}));await waitFor(()=>assert.equal(document.querySelector('dialog[open]')===null,true),{timeout:5000});
      const saved=(await db.find('cars',{title:'UI Gallery Car'}))[0];assert.equal(saved.images.length,2);const image=await db.get('images',saved.images[0]);assert.ok(second.endsWith(image.url));
    });
    await t.test('editor removes an existing image and saves the remaining gallery',async()=>{
      await screen.findByRole('button',{name:'Edit UI Gallery Car'});fireEvent.click(screen.getByRole('button',{name:'Edit UI Gallery Car'}));await screen.findByRole('heading',{name:'Edit vehicle'});fireEvent.click(screen.getByLabelText('Remove photo 2'));fireEvent.click(screen.getByText('Save vehicle',{selector:'button'}));
      await waitFor(()=>assert.equal(document.querySelector('dialog[open]')===null,true));assert.equal((await db.find('cars',{title:'UI Gallery Car'}))[0].images.length,1);
    });
    await t.test('supplied photo picker persists a multi-image gallery',async()=>{
      mount('/admin/cars');await screen.findByRole('button',{name:'Edit UI Gallery Car'});fireEvent.click(screen.getByRole('button',{name:'Edit UI Gallery Car'}));
      fireEvent.click(screen.getByRole('button',{name:'Choose from original photos'}));await screen.findByRole('button',{name:'Add Ford Mustang · front'});
      fireEvent.click(screen.getByRole('button',{name:'Add Ford Mustang · front'}));await waitFor(()=>assert.equal(document.querySelectorAll('.editor-gallery img').length,2));
      await waitFor(()=>assert.equal(screen.getByRole('button',{name:'Save vehicle'}).disabled,false));fireEvent.click(screen.getByRole('button',{name:'Save vehicle'}));await waitFor(()=>assert.equal(Boolean(document.querySelector('dialog[open]')),false));
      const car=(await db.find('cars',{title:'UI Gallery Car'}))[0];assert.equal(car.images.length,2);assert.equal((await db.get('images',car.images[1])).url,'/media/cars2-1.jpg');
    });
    await t.test('admin email page explains customer sending and links to recipient settings',async()=>{
      mount('/admin/notifications');await screen.findByRole('heading',{name:'Your email enquiries.'});await screen.findByText('Customer email drafts');
      assert.equal(screen.getByRole('link',{name:'Edit enquiry recipient'}).getAttribute('href'),'/admin/settings');assert.equal(screen.queryByRole('button',{name:'Send test email'}),null);
    });
    await t.test('business settings form updates contact details',async()=>{
      mount('/admin/settings');await screen.findByRole('heading',{name:'Make it your own.'});await field('Opening hours / viewing arrangements','Open by appointment only');await field('Enquiry recipient email','new-inbox@example.test');fireEvent.click(screen.getByRole('button',{name:'Save business details'}));await screen.findByText(/Settings saved/);assert.equal((await db.get('settings','business')).hours,'Open by appointment only');
    });
    await t.test('customer signs up and submits a rental request from the vehicle page',async()=>{
      cleanup();cookie='';setCsrf('');mount('/sign-up');await field('Your name','New Driver');await field('Email address','driver@ui.test');await field('Phone number','07000333333');await field('Password','UI-driver-password!');fireEvent.click(screen.getByRole('button',{name:'Create my account'}));await screen.findByRole('heading',{name:'Hello, New.'},{timeout:5000});
      const car=(await db.find('cars',{model:'Prius'}))[0];mount('/cars/'+car._id);await screen.findByRole('button',{name:'Request this car & open Gmail'});
      const offset=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);await field('Pick-up date',offset(14));await field('Return date',offset(17));fireEvent.click(screen.getByRole('button',{name:'Request this car & open Gmail'}));await screen.findByRole('heading',{name:'Your rental request is saved.'},{timeout:5000});assert.equal((await db.find('bookings')).length,1);
      const url=new URL(emailWindows.at(-1).url);assert.equal(url.searchParams.get('to'),'new-inbox@example.test');assert.match(url.searchParams.get('body'),/Pick-up:/);assert.match(url.searchParams.get('body'),/Estimated total:/);
    });
    await t.test('vehicle enquiry submits the selected car and complete customer contact details',async()=>{
      const car=(await db.find('cars')).find(x=>x.carType==='buy');mount('/cars/'+car._id);await screen.findByRole('button',{name:'Arrange a viewing'});fireEvent.click(screen.getByRole('button',{name:'Arrange a viewing'}));
      await screen.findByRole('heading',{name:'Enquire about '+car.title});assert.equal(document.querySelector('.enquiry-vehicle-summary strong').textContent,car.title);
      await field('Your name','Prospective Buyer');assert.equal(screen.getByLabelText('Email address',{exact:true}).value,'driver@ui.test');await field('Phone number (optional)','+447400111222');await field('How can we help?','Please call me to arrange a viewing.');fireEvent.click(screen.getByRole('button',{name:'Continue to Gmail'}));await screen.findByText(/Enquiry reference:/);
      const enquiry=(await db.find('enquiries',{email:'driver@ui.test'}))[0];assert.equal(enquiry.carId,car._id);assert.equal(enquiry.phone,'+447400111222');
      const draft=new URL(emailWindows.at(-1).url).searchParams.get('body');for(const detail of [car.title,car._id,'Prospective Buyer','driver@ui.test','+447400111222','Please call me'])assert.ok(draft.includes(detail),detail);
      assert.equal((await db.find('notifications')).length,0);
    });
    await t.test('blocked popups still offer Gmail, mailto and complete copyable email details',async()=>{
      blockEmailWindow=true;mount('/contact');await screen.findByLabelText('How can we help?',{exact:true});
      await field('How can we help?','Please help with my next car.');fireEvent.click(screen.getByRole('button',{name:'Continue to Gmail'}));
      await screen.findByRole('heading',{name:'Your email draft is ready.'});
      const gmail=new URL(screen.getByRole('link',{name:'Open Gmail'}).href);assert.equal(gmail.searchParams.get('to'),'new-inbox@example.test');assert.ok(gmail.searchParams.get('body').includes('Please help with my next car.'));
      const mailto=new URL(screen.getByRole('link',{name:'Open email app'}).href);assert.equal(mailto.searchParams.get('body'),gmail.searchParams.get('body'));
      fireEvent.click(screen.getByRole('button',{name:'Copy email details'}));await screen.findByText(/Select and copy the email details below/);
      assert.equal(document.querySelector('.email-draft details').open,true);assert.match(screen.getByLabelText('Complete email details').value,/Please help with my next car/);
      let copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text;}}});
      fireEvent.click(screen.getByRole('button',{name:'Copy email details'}));await screen.findByText(/Email details copied/);assert.match(copied,/new-inbox@example.test/);blockEmailWindow=false;
    });
    await t.test('a failed API submission closes the temporary tab and keeps the message for retry',async()=>{
      mount('/contact');await screen.findByLabelText('How can we help?',{exact:true});await field('How can we help?','Keep this unsaved message.');
      const before=(await db.find('enquiries')).length;failNextEnquiry=true;fireEvent.click(screen.getByRole('button',{name:'Continue to Gmail'}));
      await screen.findByText('Please try your enquiry again.');assert.equal(emailWindows.at(-1).closed,true);assert.equal(emailWindows.at(-1).url,undefined);
      assert.equal(screen.getByLabelText('How can we help?',{exact:true}).value,'Keep this unsaved message.');assert.equal((await db.find('enquiries')).length,before);
    });
  }finally{cleanup();globalThis.fetch=nativeFetch;await new Promise(r=>server.close(r));await db.close();await rm(dir,{recursive:true,force:true});dom.window.close();}
});
