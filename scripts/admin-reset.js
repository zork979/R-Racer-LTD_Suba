import {randomBytes} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {config} from '../server/config.js';
import {openDatabase} from '../server/database.js';
const c=config();const db=await openDatabase(c);
try{
  if(!c.adminEmail)throw new Error('Set ADMIN_EMAIL in .env.');
  const user=(await db.find('users',{email:c.adminEmail}))[0];
  if(!user||user.role!=='admin')throw new Error('No existing admin matches ADMIN_EMAIL. This command will not promote a customer.');
  const password=randomBytes(18).toString('base64url')+'!7';
  await db.update('users',user._id,{password:await bcrypt.hash(password,12),tokenVersion:(user.tokenVersion||0)+1,resetHash:null,resetExpires:null});
  console.log(`Administrator password reset for ${c.adminEmail}.\nNew password: ${password}\nStore this password securely. All previous sessions are invalidated.\nThe bootstrap ADMIN_PASSWORD in .env does not override an existing account.`);
}finally{await db.close();}
