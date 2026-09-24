# Verification — Supabase release 3.0.0

Prepared 24 September 2026. Tested on Linux with Node.js 24.19.0.

| Check | Result |
| --- | --- |
| Existing backend and supporting unit tests | `npm test`: 44 reported tests, including enclosing tests; all passed. |
| Supabase adapter/API workflows | 30 reported tests passed against PostgreSQL WASM through the actual `pg` client. |
| Enquiry drafts and supplied photo library | 9 reported tests passed with the Supabase adapter. |
| SQL security, migration and backup | 8 reported tests passed: RLS/grants, filters, rollback, image compensation, WAL snapshots, safe import/retry and backup CLI. |
| React DOM workflows | 15 reported tests passed, including the enclosing test, against the Supabase-backed local API. |
| Combined Supabase suite | 62 reported tests, zero failures on the completed run. These overlap existing backend workflows; they are not 62 additional unique product features. |
| Migration using the supplied data | All 3 accounts, 1 car, 15 image records, 4 enquiries, business settings and audit history compared with the imported snapshot. Every uploaded image checksum matched. Existing password hashes/IDs were preserved. Sessions are intentionally excluded. |
| Failure handling | An interrupted import rolled back records and safely reused verified private objects on retry. Repeated completed imports did not overwrite later edits. A populated different destination was rejected. |
| Backup CLI | Produced a readable SQLite snapshot with the same records and every photo byte, plus restore instructions. |
| Configuration | Public API keys/placeholders/insecure remote transport rejected. Verified TLS configuration and transaction retry logic covered by unit tests. |
| Production frontend | `npm run build` passed; prebuilt `dist/` included. |
| Clean installation/startup | Clean Hostinger ZIP extracted into a separate folder; `npm ci` passed. Actual `server/index.js` startup in development mode with isolated Supabase-compatible fixtures passed, with health, existing inventory, all 15 photos, SPA routes and restored image asset checked. |
| Input preservation | Original `.env`, SQLite main/WAL/SHM files, and all 57 original source/frontend/static asset files remained byte-for-byte unchanged. The missing source copy of `hero-2.jpeg` was recovered from the supplied built website. |
| Hosting package | Explicit allowlist excludes private environment files, local database, backups, logs and `node_modules`. ZIP integrity and required files checked. |

## What the test environment establishes

The Supabase suite uses the real SQL adapter and `pg` TCP client against **PGlite (PostgreSQL compiled to WebAssembly)**. Supabase Storage uses a local HTTP test double through the real Supabase SDK. The default pool has one connection. It validates the application's SQL/API/migration behavior, not the managed Supabase service or native multi-connection database scheduling.

The PGlite test transport normalises an extra ReadyForQuery response after extended-protocol errors; without that correction the simulator can misattribute the next query result. This correction is confined to `tests/helpers/pglite-protocol.js`. Production uses the unmodified `pg` client and the real PostgreSQL server. SQL results, errors and assertions are not replaced or suppressed. Transaction serialization/deadlock retry logic also has a separate unit test.

A native PostgreSQL mode with a pool of 5 is included for further validation on a local server. Native PostgreSQL could not be started with the user/group permissions available in this workspace. See `TESTING.md`.

## Checks still required with your accounts

No Supabase credentials or Hostinger account were supplied. No live database migration, hosting deployment, DNS update or real email delivery was performed. Configure your credentials, run `supabase:check`, and complete the staging checklist in `HOSTINGER.md` before directing customers to the site. Actual provider authentication, TLS trust chain, quotas, server configuration and native concurrent traffic require that hosted check.

Visual browser inspection and Windows execution were not performed. React workflows were tested through DOM integration, and the documented Windows commands use the same Node/npm scripts tested on Linux.

Enquiries open customer Gmail/email-app drafts. Customers must click Send; the website cannot confirm email delivery. No real email was sent during testing. SMTP testing used an isolated loopback server only. Automatic password-reset emails remain a separate feature requiring your own SMTP settings.

Existing application accounts are stored in `rracer.users`; this release does not replace them with Supabase Auth or add email-ownership verification. No payment gateway is introduced.

## Repeat locally

```sh
npm test
npm run test:supabase
npm run build
npm run hostinger:package
```

Test suites use isolated temporary databases. Never point destructive test helpers at live data. Read `SUPABASE-SETUP.md` before running the one-time migration.
