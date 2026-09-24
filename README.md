# R Racer Ltd — Supabase edition 3.0

The full website now supports **Supabase PostgreSQL + Supabase Storage** for online use with **Hostinger Node.js hosting**. Your existing red design, photos, logos, multiple-image galleries, sign-in/admin screens, bookings, saved cars and Gmail enquiry drafts are retained.

**Start with [START-HERE.txt](START-HERE.txt), then [Supabase setup](docs/SUPABASE-SETUP.md) and [Hostinger deployment](docs/HOSTINGER.md).**

This is a private complete project: it includes the SQLite data and configuration supplied in your v2.4.1 ZIP for migration. No Supabase credentials are included. Keep the full archive private. A clean deployment ZIP without private local data is included at `release/R-Racer-Hostinger-Upload.zip`.

## Database conversion

| Data | Online storage |
| --- | --- |
| Accounts/password hashes, roles and sessions | Supabase PostgreSQL, `rracer.users` and `rracer.sessions` |
| Cars and ordered galleries | `rracer.cars`, `rracer.images` |
| Rental requests and occupied dates | `rracer.bookings`, `rracer.slots` |
| Enquiries, business settings and audit history | Matching tables in the private `rracer` schema |
| Uploaded image bytes | Private Supabase Storage bucket |
| Image IDs, paths, MIME types and checksums | `rracer.media` |

The existing account system is preserved; it is not replaced by Supabase Auth. Existing passwords and administrator roles remain valid after import. SQL transactions and unique car/day indexes protect rental availability. Private tables have RLS enabled and no access grants for browser roles. The backend retains authorization and CSRF checks.

The website serves image URLs through `/api/media/:id`, fetching the bytes from private Supabase Storage. Uploaded images are no longer stored in a Hostinger release directory or as database blobs. Static logos and carousel artwork remain part of the website deployment.

## Quick start

Install Node.js 24, extract the ZIP, and open Command Prompt in the project folder:

```bat
npm.cmd ci
npm.cmd run setup
copy supabase.env.example .env.supabase
```

Edit `.env.supabase` with your Supabase **Session pooler PostgreSQL URI**, **project URL** and **secret API key**. Then:

```bat
npm.cmd run supabase:setup
npm.cmd run supabase:migrate -- --dry-run
npm.cmd run supabase:migrate
npm.cmd run supabase:check
npm.cmd run start:supabase
```

Open **http://localhost:8000**. Use your existing administrator login. Complete step-by-step instructions, including where to copy the credentials, are in [SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md).

The migration must run before starting the app against the target. It refuses to overwrite a populated destination. Active sessions are not imported; users sign in again. Existing business data, passwords, IDs and gallery order are retained. Re-running the same completed import is a no-op, not an ongoing sync.

For the original offline database, `start-local.cmd` or `npm start` still uses your original `.env` with SQLite. Changing databases does not sync records between local and cloud copies.

## Hostinger

Choose a plan with **Node.js Web Apps**, select **Express**, Node **24**, and server entry **`server/index.js`**. Upload the clean ZIP from `release/`. Set `DATABASE_DRIVER=supabase` and your private Supabase/JWT variables in hPanel. Follow [HOSTINGER.md](docs/HOSTINGER.md) in full before connecting your domain.

After code changes regenerate the clean upload:

```bat
npm.cmd run build
npm.cmd run hostinger:package
```

Supabase Free has quotas and can pause after inactivity; it is not unlimited hosting. See the dated limits and official links in the setup guide.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run supabase:setup` | Install SQL schema and private image bucket |
| `npm run supabase:migrate -- --dry-run` | Inspect the local snapshot without cloud access |
| `npm run supabase:migrate` | Copy local data/photos into an empty Supabase application schema |
| `npm run supabase:check` | Verify database, private bucket and an image download |
| `npm run start:supabase` | Start locally using `.env.supabase` |
| `npm run supabase:backup` | Download a verified private database/image backup |
| `npm run build` | Build the frontend |
| `npm run hostinger:package` | Generate the clean hosting ZIP |
| `npm start` | Start using the configured environment (hPanel sets Supabase) |
| `npm run dev` | Edit the frontend/API locally using `.env` |
| `npm test` / `npm run test:ui` | Existing backend/DOM tests with temporary SQLite data |
| `npm run test:supabase` | PostgreSQL-compatible adapter, migration, Storage and DOM tests |
| `npm run admin:reset` | Reset the configured existing admin in the current environment |

## Preserved features

- Multiple-image upload, cover choice, reordering and deletion, with validated/optimized images.
- Car search/filtering, details/lightbox, saved cars, profile/avatar editing.
- Signup/login, password recovery, server sessions, role protection and admin tools.
- Transactional booking creation, overlap prevention, confirmation/cancellation, CSV export.
- Saved purchase/rental/general enquiries, editable recipient, Gmail/mailto/copy fallback.
- Phone and WhatsApp links, responsive red branding and supplied imagery.

Enquiry emails still require the customer to click **Send** in their email app. Supabase does not change this. Server SMTP is only relevant to the separate password-reset feature. No payment gateway is added.

## Documentation

- [Supabase setup and migration](docs/SUPABASE-SETUP.md)
- [Hostinger deployment](docs/HOSTINGER.md)
- [Local setup](docs/LOCAL-SETUP.md)
- [Email/contact behavior](docs/EMAIL-AND-CONTACT.md)
- [API](docs/API.md)
- [Testing](docs/TESTING.md) and [verification limits](docs/VERIFICATION.md)
- [Release changes](docs/UPDATE-NOTES.md)

Legacy MongoDB support remains for older installations, but it is not needed for this Supabase deployment. This package does not configure your cloud accounts or switch your live domain automatically.
