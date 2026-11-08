import nodemailer from "nodemailer";

export const validAddress = (value) => typeof value === "string" &&
  /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);

export function emailSetup(c) {
  if (c.notificationSender) return { mode: "smtp", issues: [] };
  const issues = [];
  if (!c.smtpHost) issues.push("Set SMTP_HOST to your mailbox provider's SMTP server.");
  const fromAddress = c.mailFrom?.match(/<([^<>]+)>$/)?.[1] || c.mailFrom;
  if (!validAddress(fromAddress) || /[\r\n]/.test(c.mailFrom || ""))
    issues.push("Set MAIL_FROM to an email address your mailbox provider allows you to send from.");
  if (!Number.isInteger(c.smtpPort) || c.smtpPort < 1 || c.smtpPort > 65535)
    issues.push("SMTP_PORT must be a number between 1 and 65535.");
  if (c.smtpPort === 465 && !c.smtpSecure)
    issues.push("Port 465 needs SMTP_SECURE=true. Use SMTP_SECURE=false with port 587.");
  if (c.smtpPort === 587 && c.smtpSecure)
    issues.push("Port 587 needs SMTP_SECURE=false so STARTTLS can negotiate encryption.");
  if (Boolean(c.smtpUser) !== Boolean(c.smtpPass))
    issues.push("Set both SMTP_USER and SMTP_PASS to your mailbox credentials.");
  if(c.smtpHost?.toLowerCase()==='smtp.gmail.com') {
    if(!validAddress(c.smtpUser))issues.push('Gmail needs SMTP_USER set to the sending Gmail address.');
    if(!c.smtpPass || c.smtpPass.replace(/\s/g,'').length!==16)
      issues.push('Gmail needs a 16-character App Password in SMTP_PASS. Run npm run email:setup. Your website password will not work here.');
  }
  const empty = !c.smtpHost && !c.smtpUser && !c.smtpPass;
  return { mode: empty && !c.production ? "local_preview" : issues.length ? "not_configured" : "smtp", issues };
}

export function createMailTransport(c) {
  return nodemailer.createTransport({
    host: c.smtpHost, port: c.smtpPort, secure: c.smtpSecure,
    requireTLS: (c.production || Boolean(c.smtpUser)) && !c.smtpSecure,
    auth: c.smtpUser ? { user: c.smtpUser, pass: c.smtpPass } : undefined,
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000, dnsTimeout: 8000,
    disableFileAccess: true, disableUrlAccess: true,
  });
}

export function emailError(error) {
  if (error?.code === "EAUTH") return "Mailbox authentication failed. Check SMTP_USER and SMTP_PASS; your provider may require an app password.";
  if (["ECONNECTION", "ECONNREFUSED", "EDNS", "ETIMEDOUT", "ESOCKET"].includes(error?.code))
    return "Cannot connect securely to the mail server. Check SMTP_HOST, port, TLS setting and network access.";
  if (error?.code === "EENVELOPE") return "The mail server rejected the sender or recipient. Check MAIL_FROM and ADMIN_NOTIFICATION_EMAIL.";
  return "Email could not be sent. Check mailbox credentials, sender permissions and provider logs, then retry.";
}
