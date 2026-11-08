#!/usr/bin/env node
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { root } from "../server/config.js";

const flagFile = path.join(root, ".maintenance");
const action = (process.argv[2] || "status").toLowerCase();

switch (action) {
  case "on":
  case "enable":
  case "start": {
    const info = {
      enabledAt: new Date().toISOString(),
      reason: "Database migration cutover",
    };
    writeFileSync(flagFile, JSON.stringify(info, null, 2), "utf8");
    console.log("========================================================");
    console.log("  R Racer Maintenance Mode: ENABLED");
    console.log("========================================================");
    console.log("1. Writes to the website are now safely stopped.");
    console.log("2. Storefront visitors will see a scheduled maintenance notice.");
    console.log("3. API requests (except /api/health) receive HTTP 503.");
    console.log("");
    console.log("Next cutover steps:");
    console.log("  a. Take fresh backup:   npm run supabase:backup");
    console.log("  b. Export to MariaDB:   npm run mariadb:export");
    console.log("  c. Import into MariaDB via phpMyAdmin (u911703995_rracer)");
    console.log("  d. Verify MariaDB data: npm run mariadb:verify");
    console.log("  e. Switch driver:       DATABASE_DRIVER=mariadb in Hostinger");
    console.log("  f. Disable maintenance: npm run maintenance:off");
    console.log("========================================================");
    break;
  }

  case "off":
  case "disable":
  case "stop": {
    if (existsSync(flagFile)) {
      unlinkSync(flagFile);
    }
    console.log("========================================================");
    console.log("  R Racer Maintenance Mode: DISABLED");
    console.log("========================================================");
    console.log("Website normal operations have been resumed.");
    break;
  }

  case "status":
  default: {
    const isFileSet = existsSync(flagFile);
    const isEnvSet =
      process.env.MAINTENANCE_MODE === "true" ||
      process.env.MAINTENANCE_MODE === "1";
    const active = isFileSet || isEnvSet;

    console.log("========================================================");
    console.log(`  Maintenance Mode Status: ${active ? "ACTIVE (ON)" : "INACTIVE (OFF)"}`);
    console.log("========================================================");
    console.log(`Flag file (.maintenance): ${isFileSet ? "Present" : "None"}`);
    console.log(`Environment variable:     ${isEnvSet ? "MAINTENANCE_MODE=true" : "Not set"}`);
    console.log("");
    console.log("Commands:");
    console.log("  npm run maintenance:on     — Turn on maintenance mode");
    console.log("  npm run maintenance:off    — Turn off maintenance mode");
    console.log("  npm run maintenance:status — Show current status");
    console.log("========================================================");
    break;
  }
}
