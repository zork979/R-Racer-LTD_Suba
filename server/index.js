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
    stop(1);
  });
}

try {
  start();
} catch (e) {
  console.error("Startup failed:", e.message);
  process.exitCode = 1;
}
