# Hostinger MariaDB Migration & Cutover Guide

This guide covers migrating R Racer from Supabase to Hostinger's internal MariaDB 11.8.9 database (`u911703995_rracer`), storing all business data and uploaded image bytes directly on Hostinger with zero external dependencies.

---

## 1. Architecture Overview

### Database & Image Storage
- **Engine**: MariaDB 11.8.9 (`InnoDB`, `utf8mb4_unicode_520_ci`).
- **Target Database**: `u911703995_rracer`.
- **Database Driver**: `mariadb` (or `mysql`) implemented via `mysql2/promise` in `server/mysql-database.js`.
- **Image Storage**: All media binary bytes are stored in the `media` table (`bytes LONGBLOB`, `mime VARCHAR(64)`, `size_bytes BIGINT`, `sha256 VARCHAR(64)`). The Express backend serves them directly at `/api/media/:id`.
- **Concurrency & Booking Integrity**:
  - `slots` table enforces unique reservations per car/day via `PRIMARY KEY (id)` and `UNIQUE KEY uk_slots_car_day (car_id, slot_day)`.
  - Conflicting simultaneous booking attempts trigger MariaDB error `ER_DUP_ENTRY` (code 1062, SQLSTATE `23000`), caught by `duplicate(e)` and converted into HTTP 409 Conflict.
  - Transactions use `REPEATABLE READ` isolation with automatic deadlock retry.
- **Account Protection**:
  - `users` table enforces case-insensitive email uniqueness via stored generated column `email` and `UNIQUE KEY uk_users_email`.
  - Existing `bcrypt` password hashes are preserved bit-for-bit.

---

## 2. Generated Artifacts & Local File Paths

The local export and verification processes generated these files:

| Artifact | Local Path | Purpose |
| --- | --- | --- |
| **SQL Import File** | `D:\R-Racer-LTD_Suba-main\R-Racer-LTD_Suba-main\release\u911703995_rracer.sql.gz` | Gzipped MariaDB dump containing all 230 business records and 166 image binaries (58.09 MB; phpMyAdmin limit: 256 MiB). |
| **Export Manifest** | `D:\R-Racer-LTD_Suba-main\R-Racer-LTD_Suba-main\release\u911703995_rracer_manifest.json` | SHA-256 hashes of every image and SQL dump file. |
| **Hostinger Upload ZIP** | `D:\R-Racer-LTD_Suba-main\R-Racer-LTD_Suba-main\release\R-Racer-Hostinger-Upload.zip` | Clean source code bundle for Hostinger Node 24 (excludes `.env`, backups, dumps, `node_modules`). |
| **Schema DDL** | `D:\R-Racer-LTD_Suba-main\R-Racer-LTD_Suba-main\mariadb\schema.sql` | Pure MariaDB DDL for all 12 tables and indexes. |
| **Environment Template** | `D:\R-Racer-LTD_Suba-main\R-Racer-LTD_Suba-main\deployment\hostinger-mariadb.env.example` | Template for Hostinger hPanel environment variables. |

---

## 3. Data Integrity & Verification Summary

Rechecked against source backup:
`D:\R-Racer-LTD_Suba-main\R-Racer-LTD_Suba-main\backups\supabase-2026-11-04T17-31-46-087Z\rracer.sqlite`

- **Total records in backup**: 243
- **Excluded old login sessions**: 13 (invalidated as required; users re-authenticate with existing bcrypt passwords)
- **Migrated business records**: 230
  - `audit`: 38
  - `bookings`: 1
  - `cars`: 15
  - `enquiries`: 4
  - `images`: 166
  - `settings`: 1
  - `users`: 5
- **Migrated images**: 166 images, 56,150,724 bytes (~53.55 MB).
- **Verification checks passed**:
  - 230 / 230 records matched with deep payload equality.
  - 166 / 166 image binaries matched exact SHA-256 hashes.
  - All foreign key relationships verified (car gallery images, media IDs, booking references).

---

## 4. phpMyAdmin Import Instructions

1. Log in to **Hostinger hPanel**.
2. Navigate to **Databases → Management**.
3. Locate `u911703995_rracer` and click **Enter phpMyAdmin**.
4. Confirm target database is **EMPTY** (if old test tables exist, drop them first).
5. Click the **Import** tab at the top.
6. Under **File to import**, click **Choose File** and select:
   ```text
   release/u911703995_rracer.sql.gz
   ```
7. Verify Character set is set to **utf-8**.
8. Click **Import** (or **Go**).
9. phpMyAdmin will decompress and execute all statements within a single transaction.

---

## 5. Post-Import Verification

Run verification against the imported database:
```bat
npm.cmd run mariadb:verify -- --live
```
Or verify the local export file offline:
```bat
npm.cmd run mariadb:verify
```

---

## 6. Final Migration & Cutover Procedure

When ready for the final cutover from Supabase to MariaDB:

1. **Enable Maintenance Mode**:
   Stop incoming writes on the live website:
   ```bat
   npm.cmd run maintenance:on
   ```
   Visitors see a scheduled maintenance notice; API requests return HTTP 503.

2. **Take Fresh Final Backup**:
   ```bat
   npm.cmd run supabase:backup
   ```

3. **Export Fresh Dump**:
   ```bat
   npm.cmd run mariadb:export -- --source backups/<fresh-backup-dir>/rracer.sqlite
   ```

4. **Import into Hostinger MariaDB**:
   Upload the fresh `release/u911703995_rracer.sql.gz` in phpMyAdmin.

5. **Deploy Updated Code**:
   Upload `release/R-Racer-Hostinger-Upload.zip` to Hostinger Node.js Web App.

6. **Update Environment Variables in Hostinger hPanel**:
   - `DATABASE_DRIVER` = `mariadb`
   - `MYSQL_HOST` = `localhost` (or `127.0.0.1`)
   - `MYSQL_PORT` = `3306`
   - `MYSQL_DATABASE` = `u911703995_rracer`
   - `MYSQL_USER` = your Hostinger database user
   - `MYSQL_PASSWORD` = your Hostinger database password
   - `MAINTENANCE_MODE` = `false`

7. **Restart the Web App & Disable Maintenance Mode**:
   ```bat
   npm.cmd run maintenance:off
   ```

8. **Smoke Test**:
   - Visit `/api/health`: should return `{"status":"ok","database":"mariadb"}`.
   - Test admin login with existing credentials.
   - Verify car galleries and image loading at `/api/media/:id`.
   - Test a customer rental request and overlapping dates protection.
