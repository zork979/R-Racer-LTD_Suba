import { config } from "../server/config.js";
import { openDatabase } from "../server/database.js";
import { createNotifications } from "../server/notifications.js";

let db, notifications;
try {
  const c = config();
  db = await openDatabase(c);
  notifications = createNotifications(db, c);
  const result = await notifications.verify();
  console.log(result.message);
  for (const issue of result.issues || []) console.log("- " + issue);
  if (!result.ok) {
    console.log("For Gmail, run npm run email:setup and follow docs/GMAIL-SETUP.md. Then restart the website.");
    process.exitCode = 1;
  }
  console.log("This check does not send an email.");
} catch (error) {
  console.error("Email check could not run. Complete local setup first and check your database configuration.");
  process.exitCode = 1;
} finally {
  await notifications?.stop();
  await db?.close();
}
