import { config } from "./config.js";
import { openDatabase } from "./database.js";
import { initialise } from "./seed.js";
import { createApp } from "./app.js";

// Hostinger's LiteSpeed runner (lsnode.js) loads this entry file with
// require(). Node.js can only require() an ES module when nothing in its
// import graph uses top-level await, so all asynchronous startup work lives
// inside start() instead of at the top level of this file.
async function start() {
  const c = config();
  const db = await openDatabase(c);
  await initialise(db, c);
  const app = createApp(db, c);
  const server = app.listen(c.port, c.host, () =>
    console.log(`R Racer is ready at ${c.appUrl} (${c.driver}).`),
  );
  let closing = false;
  function stop() {
    if (closing) return;
    closing = true;
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  }
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

start().catch((e) => {
  console.error("Startup failed:", e.message);
  process.exitCode = 1;
});
