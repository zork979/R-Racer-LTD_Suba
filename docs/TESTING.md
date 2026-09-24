# Tests

```bat
npm.cmd test
npm.cmd run test:ui
npm.cmd run test:supabase
npm.cmd run build
```

`npm test` runs the existing SQLite backend suite and supporting email tests. `test:ui` runs React DOM interactions against an isolated API.

`test:supabase` runs the actual Supabase/PostgreSQL adapter through the `pg` wire protocol against PGlite (PostgreSQL compiled to WebAssembly), plus a local HTTP implementation of the Supabase Storage endpoints. It checks SQL/RLS, account access, galleries, overlapping bookings, enquiry drafts, migration/rollback/retry and UI workflows. The test helper normalises PGlite’s duplicate ReadyForQuery error responses to PostgreSQL wire behavior; production code is not patched. PGlite uses one underlying connection; the default test pool is 1. This does not establish native multi-connection PostgreSQL behavior, managed Supabase service behavior, certificate verification or production delivery.

To repeat the same suite against **native local PostgreSQL**, create a local test server with an administrator that can create databases and roles, then set this environment variable in Command Prompt:

```bat
set TEST_POSTGRES_ADMIN_URL=postgresql://postgres:YOUR_LOCAL_PASSWORD@127.0.0.1:5432/postgres
npm.cmd run test:supabase
```

The runner creates and removes randomly named `rracer_test_...` databases on that local server and uses a pool of 5. It refuses a non-local hostname and never uses `SUPABASE_DATABASE_URL` as a test target. Storage remains a local HTTP test double. The integration test reads your bundled SQLite source read-only to verify migration, but writes only to the temporary test database.

For actual hosted connectivity, fill `.env.supabase` and run `npm run supabase:check`. Follow the staging checklist in `HOSTINGER.md`. Never run destructive test utilities against the live database.
