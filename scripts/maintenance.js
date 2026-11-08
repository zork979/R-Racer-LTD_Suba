import {config} from '../server/config.js';
import {openDatabase} from '../server/database.js';
const db=await openDatabase(config());let imagesDeleted=0,sessionsDeleted=0;
try{
  const cars=await db.find('cars');const users=await db.find('users');
  const used=new Set(cars.flatMap(c=>c.images||[]));const avatars=new Set(users.map(u=>u.image));
  const cutoff=new Date(Date.now()-24*3600000).toISOString();
  for(const image of await db.find('images')){
    if(!image.createdAt||image.createdAt>=cutoff||used.has(image._id)||avatars.has(image.url))continue;
    if(image.mediaId)await db.removeMedia(image.mediaId);await db.remove('images',image._id);imagesDeleted++;
  }
  for(const session of await db.find('sessions',{expiresAt:{$lt:new Date().toISOString()}})){await db.remove('sessions',session._id);sessionsDeleted++;}
  console.log(`Maintenance complete: ${imagesDeleted} unused images and ${sessionsDeleted} expired sessions removed.`);
}finally{await db.close();}
