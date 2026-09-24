# Supabase migration

For this release, follow [SUPABASE-SETUP.md](SUPABASE-SETUP.md). It includes a SQLite-to-Supabase importer for the database and photos supplied in your latest ZIP.

The following is retained reference for older MongoDB installations, not the new Hostinger setup. An unrelated live MongoDB database is not automatically imported by the SQLite importer.

> **This update:** the September adjusted project includes an existing local SQLite database and `.env`, both preserved. The historical original-archive notes below describe the earlier rebuild. See UPDATE-NOTES.md for applying this update without overwriting newer data.

# Preserve the existing dealership data

## What was supplied

`R-Racer-ltd.zip` contained the React frontend and its photography. `Share.zip` contained the Express/Mongoose backend and existing uploaded images. Neither archive contained an export of the live database.

This release preserves the Node/React approach and supports the original MongoDB `users`, `cars` and `images` collections. It also adds an embedded SQLite option for an easy local preview. The two database modes are independent; changing `DATABASE_DRIVER` does not copy data between them.

## Test a copy before switching production

1. Keep the original ZIP files and make a current backup/export of the live MongoDB database and live upload storage.
2. Restore the database into a separate staging database/cluster. Do not use a live database as a test database.
3. In a private `.env`, set `DATABASE_DRIVER=mongodb`, the cloned database connection string, its exact `MONGO_DB_NAME`, and `SEED_DEMO=false`. Local testing can use `NODE_ENV=development` with an HTTP local `APP_URL`; production uses HTTPS.
4. Preserve the existing `users`, `cars`, `images` collection names and document `_id` values. The adapter reads the original ObjectId IDs and original `Car.images` references.
5. Set `ADMIN_EMAIL` to an existing admin email if retaining that identity. Existing accounts are not overwritten by startup.
6. Start the application and verify inventory, users, galleries and admin access using the staged database.

The app uses multi-document transactions for booking changes. Use Atlas or a MongoDB replica set. A standalone local MongoDB is insufficient for those operations.

## Existing images

- Supplied backend uploads were copied to `legacy-uploads/`. The server maps `/uploads/...` to this folder, preserving the old URL paths.
- New photos are stored inside MongoDB's `media` collection (or inside local SQLite), with reference records in `images`.
- Existing image URLs pointing at `/uploads/` work only if their corresponding files are present in `legacy-uploads/`.
- If the current live database refers to files created after the supplied ZIP, copy those files from the old host while preserving their relative paths, or re-upload them through the new vehicle editor.
- If legacy image records contain absolute URLs to the old backend, they still depend on that host. Replace those images through the editor before retiring the old host. The application does not silently rewrite external image URLs.
- A stale image record without its actual image bytes cannot be recovered from a database reference alone.

## Existing accounts and passwords

Original bcrypt password hashes are supported. Passwords are never exported as plaintext. The insecure email-only password-reset route has been replaced with a single-use token workflow.

The original code could hash a new administrator password twice. If an affected admin cannot sign in, configure the intended existing admin's email and run:

```sh
npm run admin:reset
```

This generates a new random password, prints it locally and invalidates the account's existing sessions. The command changes only an existing administrator matching `ADMIN_EMAIL`; it does not promote a customer. Run it deliberately against the intended database. Changing `ADMIN_PASSWORD` in the environment alone does not update an existing account.

The original schema may retain a unique phone-number index. If creating a new administrator in that database, set a unique `ADMIN_PHONE`. Do not remove existing uniqueness constraints without checking the data.

## New records and safe workflow changes

| Item | Behaviour |
| --- | --- |
| `users`, `cars`, `images` | Existing collections remain supported; new optional fields are added as needed. |
| `bookings` | New persistent rental requests; the supplied backend had no booking implementation. |
| `slots` | Unique car/day reservations prevent overlapping pending/confirmed bookings. |
| `enquiries` | Public contact and vehicle-viewing messages, with admin status tracking. |
| `sessions` | Server-side session records; customers sign in again after migrating from localStorage tokens. |
| `settings` | Business contact details and local seed marker. |
| `audit` | Admin changes and booking status changes. |
| `media` | Optimised uploaded image binary data. |
| Car removal | Admin deletion now archives the vehicle and retains historical bookings. Active bookings prevent archive. |
| Gallery update | `images` is the complete desired ordered list, not an append-only list. First image is the cover. |

Keep the new frontend and backend together. The old frontend's localStorage bearer-token and append-only upload behaviour is not a drop-in client for this API.

## Deploy real stock, not the local demonstration

The local setup seeds example cars only when its database is empty and has not previously been seeded. `SEED_DEMO=false` stops future seeding but does not erase existing examples. Production startup requires this flag to be false.

Use a fresh production database or the staged copy of the real client database. If you deliberately move a database containing local examples, archive the examples and add verified listings before launch. Demo prices, features and stock availability are explicitly illustrative.

## Cutover and rollback

After staging checks pass, make a fresh backup, arrange a short change window, migrate any records/uploads added since the staging copy, and switch the domain to the new deployment. Avoid letting two versions accept conflicting bookings during a cutover.

For rollback, keep the previous site build and a matching database backup. Restoring old source alone does not reverse database edits. Hostinger archive redeployment does not itself back up or roll back MongoDB.
