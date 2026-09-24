# Gmail and enquiry emails in release 2.4

**For car enquiries, skip SMTP setup.** The form now opens a Gmail compose window with the admin address and complete message. The customer clicks Send in Gmail. Set the recipient in **Admin → Settings → Enquiry recipient email**. Full instructions: [EMAIL-AND-CONTACT.md](EMAIL-AND-CONTACT.md).

No Google App Password is needed for this enquiry flow. The old admin connection/test-email buttons have been replaced by the email-enquiry information page.

## Optional server email for password recovery

The existing password-reset feature still uses server email. The SMTP helpers remain available if you want automatic password-reset emails:

```bat
npm.cmd run email:setup
npm.cmd run email:check
```

The interactive setup asks for the sending Gmail account and its App Password, verifies authentication, and saves the private server settings. It does not send a test email. Restart after changing server settings. These commands are unrelated to the customer's Gmail compose window.

Use Google's current guidance for [App Passwords](https://support.google.com/accounts/answer/185833) and [SMTP settings](https://developers.google.com/workspace/gmail/imap/imap-smtp). The website admin password is not a Google App Password. If the account does not support App Passwords, use a supported mail provider for password recovery.

The preserved project configuration has no working Gmail App Password. That does not prevent the new enquiry flow. Password recovery may report that server email is unavailable until its own SMTP configuration is completed. Local development with all SMTP settings empty writes password-reset previews under `data/mail/`; production requires configured SMTP. For your existing local administrator, `npm.cmd run admin:reset` remains available.
