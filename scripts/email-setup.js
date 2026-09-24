import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {readFile,writeFile,chmod} from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import {root} from '../server/config.js';
import {gmailSettings,updateEnv} from './email-settings.js';
import {createMailTransport,emailError} from '../server/email-config.js';

if(process.argv.includes('--help')||!process.stdin.isTTY) {
  console.log('Optional password-reset SMTP setup (not required for enquiries): run npm run email:setup in an interactive terminal.\nEnable Google 2-Step Verification, create an App Password, and enter it when asked.\nThe password is hidden and saved only in your local .env. No email is sent by this setup command.\nSee docs/GMAIL-SETUP.md.');
  if(!process.argv.includes('--help'))process.exitCode=1;
} else {
  let muted=false,transport;
  const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback();}});
  const rl=createInterface({input:process.stdin,output,terminal:true});
  try {
    const file=path.join(root,'.env');const source=await readFile(file,'utf8');const old=dotenv.parse(source);
    console.log('Configure password-reset SMTP (enquiries do not need this)\nCreate a Google App Password at https://myaccount.google.com/apppasswords\nDo not use your website administrator password.\n');
    const senderDefault=old.SMTP_USER||old.ADMIN_EMAIL||'';
    const sender=(await rl.question(`Sending Gmail address [${senderDefault}]: `)).trim()||senderDefault;
    const recipientDefault=old.ADMIN_NOTIFICATION_EMAIL||old.ADMIN_EMAIL||sender;
    const recipient=(await rl.question(`Admin inbox [${recipientDefault}]: `)).trim()||recipientDefault;
    process.stdout.write('Paste the 16-character Google App Password (hidden): ');muted=true;
    const secret=await rl.question('');muted=false;process.stdout.write('\n');
    const settings=gmailSettings(sender,recipient,secret);
    const candidate={smtpHost:settings.SMTP_HOST,smtpPort:465,smtpSecure:true,smtpUser:settings.SMTP_USER,smtpPass:settings.SMTP_PASS,mailFrom:settings.MAIL_FROM};
    console.log('Checking Gmail connection and authentication…');
    transport=createMailTransport(candidate);await transport.verify();
    await writeFile(file,updateEnv(source,settings),{mode:0o600});await chmod(file,0o600).catch(()=>{});
    console.log('Gmail authentication succeeded. Email settings saved; existing app and database settings were preserved.\nRestart the website to use SMTP for password-reset emails. Enquiries continue to open in the customer email app.\nNo email was sent by this setup command.');
  }catch(error){muted=false;console.error('\nEmail setup was not saved. '+(error.code==='ENOENT'?'Run npm run setup first.':error.message?.startsWith('Use the 16')||error.message?.startsWith('Enter valid')?error.message:emailError(error)));process.exitCode=1;}
  finally{transport?.close();rl.close();}
}
