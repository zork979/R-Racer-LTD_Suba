import test from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {gmailSettings,updateEnv} from '../scripts/email-settings.js';

test('Gmail setup normalises an App Password and preserves unrelated private settings',()=>{
  const source='# Existing deployment\nJWT_SECRET="keep-this-session-secret"\nADMIN_PASSWORD="keep-this-login-password"\nMONGO_URI="mongodb://example.test/keep"\nSMTP_USER="old@example.test"\nSMTP_PASS="old"\n';
  const settings=gmailSettings(' Sender@Gmail.com ',' Admin@Gmail.com ','abcd efgh ijkl mnop');
  const result=updateEnv(source,settings), parsed=dotenv.parse(result), original=dotenv.parse(source);
  for(const key of ['JWT_SECRET','ADMIN_PASSWORD','MONGO_URI'])assert.equal(parsed[key],original[key]);
  assert.equal(parsed.SMTP_PASS,'abcdefghijklmnop');assert.equal(parsed.SMTP_USER,'sender@gmail.com');
  assert.equal(parsed.ADMIN_NOTIFICATION_EMAIL,'admin@gmail.com');assert.equal(parsed.SMTP_HOST,'smtp.gmail.com');
  assert.equal(parsed.SMTP_PORT,'465');assert.equal(parsed.SMTP_SECURE,'true');
  assert.equal(parsed.MAIL_FROM,'R Racer Ltd <sender@gmail.com>');
  assert.equal((result.match(/^SMTP_PASS=/gm)||[]).length,1);
  assert.equal(updateEnv(result,settings),result,'Repeating setup should not duplicate configuration');
  assert.ok(result.startsWith('# Existing deployment'));
});

test('Gmail setup refuses incomplete credentials and header injection',()=>{
  for(const password of ['', 'website-admin-password', 'abcd efgh'])assert.throws(()=>gmailSettings('sender@gmail.com','admin@gmail.com',password),/App Password/);
  assert.throws(()=>gmailSettings('invalid','admin@gmail.com','abcdefghijklmnop'),/valid/);
  assert.throws(()=>gmailSettings('sender@gmail.com','admin@gmail.com\nBcc:other@example.test','abcdefghijklmnop'),/valid/);
});
