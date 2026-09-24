# Release 3.0 — Supabase edition

Prepared from your uploaded `R-Racer-Complete-v2.4.1.zip` on 24 September 2026.

## Changes

- Supabase PostgreSQL adapter for every application record type, with separate private tables, JSONB payload preservation, SQL indexes and transactions.
- Supabase Storage for uploaded image bytes; stable gallery URLs and image ordering are retained.
- Additive SQL schema with RLS and revoked browser-role access. Server credentials never enter the frontend.
- Connection pooling, verified TLS and Session pooler configuration for Hostinger.
- A migration command reads a consistent SQLite snapshot including WAL, preserves users/passwords/IDs/data and verifies every uploaded image checksum.
- Import refuses a nonempty destination; a completed identical import is not repeated. Interrupted image transfers can be safely retried. Active sessions are excluded so users sign in again.
- Setup, connectivity-check, verified backup and clean Hostinger ZIP commands.
- A clean hosting archive, complete private source archive and detailed setup/deployment instructions.
- The supplied build contained `hero-2.jpeg`, while the source photo folder did not. That same supplied image is restored to the source folder so rebuilding does not break the original-photo picker or seeded Prius gallery.

## Preserved

Your design, red logos, current source photos, car gallery, header sizing, carousel, customer/admin pages, login requirements, phone/WhatsApp actions and Gmail/email-app enquiry drafts remain. Existing account/password behavior is preserved; this is not a switch to Supabase Auth. SQLite remains available for offline use, with legacy MongoDB retained for compatibility.

Your private local `.env` is preserved. The bundled SQLite snapshot is retained for migration, including any committed WAL content. Development tests write to isolated test databases, not your live account or supplied data.

## Deployment status

No Supabase account credentials were supplied, so no live cloud project was created, populated or deployed. The provided importer performs that step after you supply your own three connection values locally. Hostinger and DNS also remain to be configured following the included guide. Do not upload the private complete archive; upload only `release/R-Racer-Hostinger-Upload.zip`.
