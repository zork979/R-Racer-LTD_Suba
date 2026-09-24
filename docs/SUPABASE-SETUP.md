# Supabase setup and data migration

Release 3.0.0 — 24 September 2026. Start here before deploying to Hostinger.

**This project is converted for Supabase, but it is not connected to your Supabase account yet.** Create your project, enter its private credentials on your own computer, and run the commands below. No cloud credentials are included in this download.

## What runs where

| Component | Where it runs / lives |
| --- | --- |
| React website and Express API | Hostinger Node.js Web App |
| Users, password hashes, roles, sessions, cars, galleries, bookings, enquiry history, settings and audit records | Supabase PostgreSQL, private `rracer` schema |
| Uploaded car photos and profile pictures | Supabase Storage, private `rracer-images` bucket |
| Image metadata and gallery order | Supabase PostgreSQL |
| Header/footer logos, carousel artwork, other static design assets | Website files deployed to Hostinger |
| Email enquiries | Customer's Gmail/email app, as in your previous version |

Your existing sign-in system is retained. Accounts move to `rracer.users`, not Supabase Auth's `auth.users`; existing passwords and administrator roles keep working. The API performs authentication, CSRF and admin checks. The browser does not receive the Supabase database password or secret key.

The database uses one table per existing entity. Each table has a text `id` and JSONB `payload`, preserving every existing field and reference. SQL indexes enforce unique user emails and unique car/day reservations. This design keeps the current backend behavior while replacing its database engine. Full schema: `supabase/migrations/001_rracer.sql`.

## 1. Install the project locally

1. Install Node.js **24**.
2. Extract this complete ZIP.
3. Open Command Prompt in `rracer-redesign`, where `package.json` is located.
4. Run:

```bat
npm.cmd ci
npm.cmd run setup
```

The original `.env` and SQLite data are included and preserved. The supplied database has 3 accounts, 1 car, 15 image records, 4 enquiries, business settings and audit history. The migration also supports bookings, slots and prior notification records when present. It reads committed SQLite WAL data, not just the main database file.

Stop your old local server with Ctrl+C before migration. If you have newer data on your PC, copy the entire latest `data` folder and your `.env` into this version before running the migration. Keep a backup first. Do not overwrite newer records with the older snapshot from this download.

## 2. Create a Supabase project

1. Open [supabase.com/dashboard](https://supabase.com/dashboard).
2. Create an organization/project using the Free plan if it fits your needs.
3. Choose a region near the hosting server/customers.
4. Set and save the **database password**. This is different from the website administrator password and API key.
5. Wait until the project is ready.

As checked on 24 September 2026, the Free plan includes **500 MB database space, 1 GB file storage, 5 GB egress and 5 GB cached egress**. Free projects can pause after one week of inactivity. This is not unlimited image hosting or an always-on production guarantee. Monitor usage as real photos and visitors grow. The 15 uploaded photos in this ZIP total about 263 KiB; future uploads will add to your usage. [Supabase pricing](https://supabase.com/pricing).

## 3. Copy three connection values

| Value | Where to get it | Project variable |
| --- | --- | --- |
| PostgreSQL URI | **Connect → Session pooler → URI**, usually port 5432 | `SUPABASE_DATABASE_URL` |
| Project URL | Project Connect/API settings; `https://YOUR_PROJECT.supabase.co` | `SUPABASE_URL` |
| Secret API key | **Settings → API Keys → Secret keys**, starts `sb_secret_` | `SUPABASE_SECRET_KEY` |

Use values from the **same Supabase project**. Do not use a publishable or anon key as the secret key. A legacy `service_role` key is accepted for compatibility, but a new project should use the current secret key.

Use the **Session pooler** connection from Supabase's dashboard. It supports IPv4 hosting networks. The direct `db.PROJECT.supabase.co` connection may require IPv6; do not guess its hostname or region. Copy the whole URI and replace its password placeholder. Percent-encode special characters in the password, for example `@` → `%40`, `#` → `%23`, `/` → `%2F`. [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

## 4. Create your private local Supabase configuration

In Command Prompt:

```bat
copy supabase.env.example .env.supabase
notepad .env.supabase
```

Fill in the three values above. Keep these settings:

```dotenv
DATABASE_DRIVER=supabase
SUPABASE_STORAGE_BUCKET=rracer-images
SUPABASE_POOL_MAX=5
SUPABASE_DB_SSL=true
NODE_ENV=development
HOST=127.0.0.1
APP_URL=http://localhost:8000
SEED_DEMO=false
```

Do not replace your original `.env`. The Supabase commands load `.env.supabase` over the original local configuration, retaining your existing local login/bootstrap settings. Both are private files. Neither goes in the hosting upload.

TLS certificate verification is enabled. If your environment reports a certificate verification error, download the CA certificate from Supabase's database settings and set `SUPABASE_CA_CERT_PATH` to its absolute local file path. For Hostinger you may instead put the certificate text in `SUPABASE_CA_CERT` (literal `\n` line separators are supported). Do not turn SSL off to fix a remote connection. [SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement).

## 5. Create the schema and private image bucket

```bat
npm.cmd run supabase:setup
```

This creates the private `rracer` schema, its tables/indexes and the private `rracer-images` bucket. It is safe to run again. It does **not** seed accounts or cars, so the destination remains empty for your migration.

Alternatively run `supabase/migrations/001_rracer.sql` in Supabase's SQL Editor and create a **private** bucket named `rracer-images` with a 10 MB per-file limit and JPEG/PNG/WebP MIME types. Then continue below.

Keep `rracer` out of the Data API's exposed schemas. The SQL enables RLS on every application table and revokes access from `anon`, `authenticated` and `service_role`. The Node API connects through PostgreSQL using the dashboard's database connection. The secret API key is used only for Storage. Do not add public write policies to the bucket.

## 6. Copy your existing data and images

First preview without contacting Supabase:

```bat
npm.cmd run supabase:migrate -- --dry-run
```

Then import:

```bat
npm.cmd run supabase:migrate
npm.cmd run supabase:check
```

The importer copies all business records and uploaded image bytes, preserves IDs, bcrypt password hashes and gallery order, and verifies image checksums after upload. Referenced legacy/bundled gallery photos are imported too. Active session cookies are intentionally not migrated; everyone signs in again with their existing password.

**Run the migration before starting the website on Supabase.** It refuses to overwrite an already-populated application database. If you started the site first and created accounts/demo data, use a fresh empty project or have a developer review the destination. There is no automatic destructive reset.

A completed import records a fingerprint. Running it again with the exact same snapshot does not duplicate data or overwrite later edits. An interrupted import can be retried; uploaded private objects are verified before reuse. Database rows are committed together. This is a one-time migration, not ongoing synchronization with SQLite.

To import a different SQLite backup:

```bat
npm.cmd run supabase:migrate -- --source "C:\Backups\rracer.sqlite"
```

For a source with legacy filesystem photo URLs, keep those referenced files in this project's `legacy-uploads` / `public/media` folders. Missing image files stop the migration with an error.

## 7. Test the website against Supabase

```bat
npm.cmd run start:supabase
```

Open [http://localhost:8000](http://localhost:8000). `/api/health` should include `"database":"supabase"` and `"version":"3.0.0"`.

Sign in using your existing admin login. Check the saved car and every gallery photo. Create a temporary test car, upload several photos, change the cover and save. Try a customer enquiry and a rental request, then check the admin workspace. Restart the app and confirm the data remains.

These requests now change your **cloud database**. Use a staging project for tests you do not want in the live inventory.

## 8. Deploy

Follow [HOSTINGER.md](HOSTINGER.md). The same Supabase project is used by Hostinger; do not run the migration again during each deployment.

## Backups

Before maintenance, stop website writes and run:

```bat
npm.cmd run supabase:backup
```

This creates a private SQLite-format backup containing application records and all registered uploaded images. Restore to an empty Supabase destination using the same importer. Keep your website source/static assets and environment secrets separately. Download backups made on a host before redeploying; hosting filesystems may be replaced. Free-plan database retention is not a substitute for your own application and image backup.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Missing credentials / placeholder error | Fill in `.env.supabase`; copy the entire Session pooler URI and the server secret key. |
| Password authentication failed | Use the database password in the URI, not the API key or website password; encode special characters. |
| Cannot reach database / IPv6 error | Copy the **Session pooler** URI from Connect. Check Supabase project status and any configured network restrictions. |
| TLS certificate error | Supply the project's CA certificate. Keep remote SSL verification enabled. |
| Storage connection/upload failed | Confirm URL/key are from the same project, the key is secret, bucket is private, and quota is available. |
| Schema not installed | Run `supabase:setup` before migration/start. |
| Destination already contains records | Import into an empty application schema; the importer protects existing data. |
| Site is unavailable after inactivity | Check whether Supabase paused the Free project; resume it in the dashboard. |
| Enquiry exists but no email arrives | Customer must click Send in Gmail/their email app. Supabase does not change that flow. |
| Supabase Auth → Users is empty | Expected: existing application accounts are in **Table Editor → rracer → users**. |

Reference: [API key types](https://supabase.com/docs/guides/getting-started/api-keys), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage](https://supabase.com/docs/guides/storage).
