import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { root, config } from "../server/config.js";
import { readBackupData, verifyDumpFile } from "../scripts/mariadb-verify.js";
import { createApp } from "../server/app.js";

test("MariaDB migration and verification suite", async (t) => {
  const backupPath = path.join(
    root,
    "backups",
    "supabase-2026-11-04T17-31-46-087Z",
    "rracer.sqlite"
  );
  const dumpPath = path.join(root, "release", "u911703995_rracer.sql.gz");

  await t.test("source backup exists and observed counts match exactly", async () => {
    assert.ok(existsSync(backupPath), `Backup must exist at ${backupPath}`);

    const backup = await readBackupData(backupPath);
    assert.equal(backup.records.length, 243, "Total backup records must be exactly 243");

    const sessions = backup.records.filter((r) => r.collection === "sessions");
    assert.equal(sessions.length, 13, "Sessions count must be exactly 13");

    const businessRecords = backup.records.filter((r) => r.collection !== "sessions");
    assert.equal(businessRecords.length, 230, "Business records must be 230");

    assert.equal(backup.media.length, 166, "Uploaded images must be exactly 166");

    const totalMediaBytes = backup.media.reduce((sum, m) => sum + m.bytes.length, 0);
    assert.equal(
      totalMediaBytes,
      56150724,
      "Total image bytes must be exactly 56150724 bytes (~53.55 MB)"
    );

    // Recheck collection breakdown
    const counts = {};
    for (const r of businessRecords) {
      counts[r.collection] = (counts[r.collection] || 0) + 1;
    }
    assert.deepEqual(counts, {
      audit: 38,
      bookings: 1,
      cars: 15,
      enquiries: 4,
      images: 166,
      settings: 1,
      users: 5,
    });
  });

  await t.test("exported SQL dump passes full verification checks", async () => {
    assert.ok(existsSync(dumpPath), `Exported dump must exist at ${dumpPath}`);
    const result = await verifyDumpFile(dumpPath, backupPath);
    assert.equal(result.status, "PASSED");
    assert.equal(result.verifiedRecords, 230);
    assert.equal(result.verifiedMedia, 166);
    assert.equal(result.totalVerifiedBytes, 56150724);
  });

  await t.test("maintenance mode stops writes and serves 503 notices", async () => {
    const flagFile = path.join(root, ".maintenance");
    if (existsSync(flagFile)) unlinkSync(flagFile);

    // Mock minimal database for maintenance test
    const dummyDb = {
      driver: "mariadb",
      find: async () => [],
      get: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      remove: async () => {},
      transaction: async (fn) => fn(),
      close: async () => {},
    };

    const c = config({
      production: false,
      driver: "sqlite",
      secret: "test-secret-with-more-than-thirty-two-characters",
      maintenanceMode: false,
    });

    const app = createApp(dummyDb, c);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
      // 1. Initially maintenance is off: /api/health returns ok
      const resOk = await fetch(`${base}/api/health`);
      assert.equal(resOk.status, 200);
      const dataOk = await resOk.json();
      assert.equal(dataOk.status, "ok");

      // 2. Enable maintenance mode via flag file
      writeFileSync(flagFile, JSON.stringify({ reason: "test" }), "utf8");

      // Health check returns maintenance notice with status 200
      const resHealthMaint = await fetch(`${base}/api/health`);
      assert.equal(resHealthMaint.status, 200);
      const dataHealthMaint = await resHealthMaint.json();
      assert.equal(dataHealthMaint.status, "maintenance");
      assert.equal(dataHealthMaint.maintenance, true);

      // API requests return 503
      const resApi = await fetch(`${base}/api/cars`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test" }),
      });
      assert.equal(resApi.status, 503);
      const dataApi = await resApi.json();
      assert.equal(dataApi.maintenance, true);

      // Web storefront HTML request returns 503 maintenance page
      const resHtml = await fetch(`${base}/cars`, {
        headers: { Accept: "text/html" },
      });
      assert.equal(resHtml.status, 503);
      const htmlText = await resHtml.text();
      assert.ok(htmlText.includes("Scheduled Maintenance"));
      assert.ok(htmlText.includes("R Racer Ltd"));

      // 3. Disable maintenance mode
      unlinkSync(flagFile);

      // Normal operations resumed
      const resAfter = await fetch(`${base}/api/health`);
      assert.equal(resAfter.status, 200);
      const dataAfter = await resAfter.json();
      assert.equal(dataAfter.status, "ok");
    } finally {
      if (existsSync(flagFile)) unlinkSync(flagFile);
      await new Promise((r) => server.close(r));
    }
  });
});
