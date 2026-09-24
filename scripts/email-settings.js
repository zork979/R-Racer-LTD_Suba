import {validAddress} from '../server/email-config.js';

export function gmailSettings(sender,recipient,appPassword) {
  sender=sender.trim().toLowerCase();recipient=recipient.trim().toLowerCase();
  const password=appPassword.replace(/\s/g,'');
  if(!validAddress(sender)||!validAddress(recipient))throw new Error('Enter valid sender and recipient email addresses.');
  if(password.length!==16||!/[a-zA-Z]/.test(password))throw new Error('Use the 16-character Google App Password, not your website or Google account password.');
  return {SMTP_HOST:'smtp.gmail.com',SMTP_PORT:'465',SMTP_SECURE:'true',SMTP_USER:sender,SMTP_PASS:password,MAIL_FROM:`R Racer Ltd <${sender}>`,ADMIN_NOTIFICATION_EMAIL:recipient};
}
export function updateEnv(source,settings) {
  let result=source.replace(/\s*$/,'')+'\n';
  for(const [key,value] of Object.entries(settings)) {
    const line=key+'='+JSON.stringify(value);
    const expression=new RegExp('^'+key+'=.*$','gm');
    result=expression.test(result)?result.replace(expression,()=>line):result+line+'\n';
  }
  return result;
}
