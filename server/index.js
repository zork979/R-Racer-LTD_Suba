import http from "node:http";
import { config } from "./config.js";

// Hostinger's LiteSpeed runner (lsnode.js) loads this entry file with
// require(). Node.js can only require() an ES module when nothing in its
// import graph uses top-level await, so all asynchronous startup work lives
// inside functions instead of at the top level of this file.
//
// Hostinger also stops any app that has not called listen() within 3 seconds.
// Loading the server libraries and connecting to Supabase can take longer than
// that, so this file loads only the lightweight configuration, listens
// straight away, answers "starting" (HTTP 503) for a few seconds, and then
// loads the rest of the application and connects to the database.
function starting(req, res) {
  res.statusCode = 503;
  res.setHeader("Retry-After", "5");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("R Racer is starting. Please refresh in a few seconds.");
}

// Plain-English hints for the most common Supabase configuration mistakes.
function startupHint(e, c) {
  const message = String(e?.message || "");
  const dbHost = (() => { try { return new URL(c.supabaseDatabaseUrl).hostname; } catch { return ""; } })();
  if (c.driver !== "supabase") return "";
  if (/^db\..+\.supabase\.co$/.test(dbHost) && (["ENOTFOUND", "ENETUNREACH", "EHOSTUNREACH", "ETIMEDOUT", "ECONNREFUSED"].includes(e?.code) || /timeout/i.test(message)))
    return "SUPABASE_DATABASE_URL uses the direct address (db.<project>.supabase.co), which needs IPv6. In Supabase click Connect and copy the Session pooler URL (…pooler.supabase.com:5432) instead.";
  if (e?.code === "28P01" || /password authentication failed/i.test(message))
    return "The database password inside SUPABASE_DATABASE_URL is wrong. Reset it in Supabase (Database > Settings) and update the URL; percent-encode special characters such as @ (%40) and # (%23).";
  if (/tenant or user not found/i.test(message))
    return "For the Session pooler the user name must be postgres.<your-project-ref>, exactly as shown in Supabase > Connect > Session pooler.";
  if (["ENOTFOUND", "EAI_AGAIN"].includes(e?.code))
    return "The database host name could not be found. Copy SUPABASE_DATABASE_URL again from Supabase > Connect > Session pooler.";
  if (e?.code === "ECONNREFUSED" || /circuit breaker open/i.test(message))
    return "Supabase refused the connection. This is usually a temporary ban after wrong passwords: in Supabase open Database > Settings, find Banned IPs / Network bans and click Unban IP, then fix the password in SUPABASE_DATABASE_URL.";
  if (/timeout|ETIMEDOUT/i.test(message + " " + (e?.code || "")))
    return "Supabase did not answer. Check the project is not paused (Supabase dashboard > Restore) and that Database > Settings > Network restrictions allows all IP addresses.";
  if (e?.code === "STORAGE_ERROR")
    return "Supabase Storage refused the request. SUPABASE_SECRET_KEY must be the secret key (sb_secret_...) from Project Settings > API Keys, from the same project as SUPABASE_URL.";
  if (/certificate/i.test(message))
    return "TLS certificate check failed. Remove SUPABASE_CA_CERT and SUPABASE_CA_CERT_PATH from the hosting settings; the Supabase certificate is built in.";
  return "";
}

function start() {
  const c = config();
  let handler = starting;
  let db = null;
  let closing = false;
  const server = http.createServer((req, res) => handler(req, res));
  server.on("error", (e) => {
    console.error("Server failed:", e.message);
    process.exit(1);
  });
  server.listen(c.port, c.host);

  function stop(code = 0) {
    if (closing) return;
    closing = true;
    server.close(async () => {
      if (db) await db.close().catch(() => {});
      process.exit(code);
    });
    server.closeIdleConnections?.();
    setTimeout(() => process.exit(code || 1), 10000).unref();
  }
  process.on("SIGINT", () => stop(0));
  process.on("SIGTERM", () => stop(0));

  (async () => {
    const [{ openDatabase }, { initialise }, { createApp }] = await Promise.all([
      import("./database.js"),
      import("./seed.js"),
      import("./app.js"),
    ]);
    db = await openDatabase(c);
    await initialise(db, c);
    handler = createApp(db, c);
    console.log(`R Racer is ready at ${c.appUrl} (${c.driver}).`);
  })().catch((e) => {
    console.error("Startup failed:", e.message);
    const hint = startupHint(e, c);
    if (hint) console.error("How to fix:", hint);
    stop(1);
  });
}

try {
  start();
} catch (e) {
  console.error("Startup failed:", e.message);
  process.exitCode = 1;
}
