# Hostinger deployment with Supabase

Release 3.0.0 — 24 September 2026. Your hosting account and Supabase project have not been configured or deployed by this download.

## 1. Choose Node.js hosting

Use a Hostinger plan that includes **Node.js Web Apps** (currently supported Business/Cloud options) or a VPS. Confirm Node.js support in the plan before buying. This is a React + Express application; a PHP-only/static upload cannot run the backend. Supabase supplies the database and images, while Hostinger runs the application.

Official guides: [Node.js app deployment](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/) and [environment variables](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/).

## 2. Set up and migrate Supabase first

Complete [SUPABASE-SETUP.md](SUPABASE-SETUP.md): create the project, fill `.env.supabase`, then run:

```bat
npm.cmd run supabase:setup
npm.cmd run supabase:migrate -- --dry-run
npm.cmd run supabase:migrate
npm.cmd run supabase:check
npm.cmd run start:supabase
```

Check your existing login, car photos and admin pages locally against Supabase, then stop the local server. Use the same project credentials in Hostinger. **Import before starting the hosted app**, so bootstrap does not populate the destination first.

## 3. Make a clean hosting ZIP

The complete download includes your private SQLite data and `.env` for migration. Do not upload that whole private archive as a deployment.

Run these commands inside the project folder:

```bat
npm.cmd run build
npm.cmd run hostinger:package
```

Upload the generated file:

```text
release/R-Racer-Hostinger-Upload.zip
```

The packager includes the application, built frontend, SQL/scripts and static assets. It excludes private `.env` files, SQLite data, credentials/certificates, backups, test output and `node_modules`. The same clean upload ZIP is included in the complete download for convenience. Rebuild/regenerate it after changing code.

## 4. Upload through hPanel

1. Choose **Websites → Add Website → Node.js Web App → Upload your files**.
2. Upload `R-Racer-Hostinger-Upload.zip` from the `release` folder.
3. Select **Express**, because one Node server serves both React and `/api`.
4. Enter these build settings:

| Setting | Value |
| --- | --- |
| Project root | ZIP root: the folder containing `package.json` |
| Framework | Express |
| Node.js version | 24 |
| Install command, if configurable | `npm ci --include=dev` |
| Build script | `build` / `npm run build` |
| Entry file | `server/index.js` |
| Start command, if requested | `npm start` |
| Server output directory, if requested | `.` or leave blank if optional |

React builds into `dist/`; Express serves it. Do not choose a static React preset or set `dist/` as the server root. Leave `PORT` unset if Hostinger supplies it.

## 5. Add server environment variables

Use `deployment/hostinger.env.example` as the checklist, replacing every placeholder in hPanel:

| Variable | Value / source |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `APP_URL` | Exact website HTTPS origin, initially your staging hostname |
| `DATABASE_DRIVER` | `supabase` |
| `SUPABASE_DATABASE_URL` | Same Supabase **Session pooler** URI used locally |
| `SUPABASE_URL` | Same Supabase project URL |
| `SUPABASE_SECRET_KEY` | Same server secret API key; never prefix with `VITE_` |
| `SUPABASE_STORAGE_BUCKET` | `rracer-images` |
| `SUPABASE_POOL_MAX` | `5` |
| `SUPABASE_DB_SSL` | `true` |
| `SUPABASE_CA_CERT` | Optional CA certificate text if required for verified TLS; `\n` separators supported |
| `JWT_SECRET` | New random secret, at least 32 characters |
| `ADMIN_EMAIL` | Your existing administrator email from the migrated database |
| `ADMIN_PASSWORD` | Leave empty for an already-migrated admin; only needed when creating a new admin in a new database |
| `SEED_DEMO` | `false` |
| `TRUST_PROXY` | `1` for Hostinger's reverse proxy; adjust only if your actual proxy setup differs |
| `MAX_IMAGES_PER_CAR` | `30` (can be set up to 100) |
| `MAX_IMAGE_MB` | `10` (source image upload limit) |

Generate a new session secret locally and paste the output into hPanel:

```bat
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

No MongoDB Atlas connection or Hostinger MySQL database is needed. Keep the Supabase URL, database URI and key from the **same project**. They are used only by the backend. Do not put secrets in React source, public files, logs or Git.

Your migrated business settings retain the enquiry recipient, telephone and WhatsApp number. **Admin → Settings** lets you edit them. The optional `ADMIN_NOTIFICATION_EMAIL` only provides a fallback before an enquiry recipient is saved.

Enquiry forms open Gmail/email-app drafts and do not require SMTP. Password-reset email is a separate feature: configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` if you want automatic reset emails. See [GMAIL-SETUP.md](GMAIL-SETUP.md). Do not enable server email just to use car enquiries.

## 6. Deploy to a staging hostname

Save settings and deploy. Check the runtime log for `R Racer is ready` with `(supabase)`.

1. Open `/api/health`. Expect `status: ok`, `version: 3.0.0`, `database: supabase`.
2. Sign in using your existing admin account.
3. Check every migrated car/gallery photo and business contact setting.
4. Add a test car and upload several images; change their order/cover and save.
5. Restart/redeploy and confirm that cars and uploaded photos remain available from Supabase.
6. Register a test customer. Try an enquiry, Gmail/email-app draft, rental request and customer cancellation. Confirm admin views and overlapping-date protection.
7. Confirm a customer cannot access admin routes or upload vehicle images.
8. Check phone, WhatsApp, desktop/mobile layout and actual email sending from your own browser.
9. If configured, test password recovery through your real SMTP provider.

The automated package tests do not verify your hosted credentials, provider quotas, TLS chain or Hostinger runtime. `supabase:check` and this staging pass are required before sending customers to the site.

## 7. Connect the domain

Keep a backup of the old website. Add the domain in hPanel and apply the DNS records Hostinger shows. Use its provided values rather than copying an IP from another guide. Enable HTTPS.

Set `APP_URL` to the final canonical origin, for example `https://www.rracerltd.com`, then save and redeploy. Redirect the alternative hostname to it. The API checks exact origins, and production session cookies require HTTPS. Recheck sign-in, galleries, enquiries and deep links after the switch.

## 8. Ongoing operation

- Supabase Free has limited database, file storage and transfer quotas and can pause after inactivity. Monitor the dashboard. [Current pricing](https://supabase.com/pricing).
- Back up application data **and photo bytes** with `npm run supabase:backup` while writes are stopped; keep source/static assets separately. See the Supabase guide.
- Run one Node application instance with the existing in-memory rate limiter. A multi-instance deployment needs a shared rate-limit store; database slot uniqueness still protects reservations.
- Pending and confirmed rental requests reserve dates until cancelled/completed. Review pending requests regularly.
- `npm run maintenance` uses the configured database. Run during a quiet period to remove expired sessions and old unattached images.
- Do not re-import the local snapshot on redeployment. The cloud database is the source of truth after migration.
- A VPS alternative is included in `Dockerfile`/`compose.yaml`; use the same Supabase environment settings and an HTTPS reverse proxy.
