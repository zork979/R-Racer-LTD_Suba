# Run locally — Windows, macOS or Linux

This guide is the retained **offline SQLite** mode. To run locally against Supabase, follow [SUPABASE-SETUP.md](SUPABASE-SETUP.md) and use `npm run start:supabase`. The two modes do not synchronize automatically.

## Before you start

1. Install **Node.js 24 LTS** from the [official Node.js download page](https://nodejs.org/en/download). Use the Windows installer on Windows.
2. Close and reopen your terminal after installation.
3. Extract `R-Racer-Supabase-Complete-v3.0.zip` to a normal folder, for example `C:\Projects\R-Racer`.
4. Open the extracted folder that contains `package.json`, `server`, `src` and `README.md`.
5. In File Explorer, click the address bar, type `cmd`, and press Enter. This opens Command Prompt in the correct directory.

Node 24 is required because the local database uses Node's embedded SQLite support. You do not need XAMPP, PHP, MySQL, MongoDB, an API key or a hosting account for the local version. The first installation requires internet access to download npm packages.

## First start

Run these commands one at a time:

```bat
node --version
npm.cmd ci
npm.cmd run setup
npm.cmd start
```

The first command should begin with `v24.`. In macOS/Linux, use `npm` in place of `npm.cmd`.

`npm run setup` creates `.env` with a unique session secret and a random admin password. It does not overwrite an existing `.env`.

Open these addresses:

| Address | Purpose |
| --- | --- |
| `http://localhost:8000` | Website |
| `http://localhost:8000/login` | Sign in |
| `http://localhost:8000/admin/dashboard` | Admin workspace after sign-in |
| `http://localhost:8000/api/health` | Basic running-server check |

This update preserves your supplied `.env` and existing accounts. Use your existing admin email and password. A completely fresh setup without `.env` creates **admin@rracer.local** with a unique password. If necessary, `npm run admin:reset` generates a new password for the configured administrator.

Keep the terminal open. Press **Ctrl+C** to stop the server. On subsequent starts, run only `npm.cmd start`.

You can instead double-click **start-local.cmd**. It installs the locked dependencies, preserves existing settings and starts the server. If Windows shows a downloaded-file confirmation, inspect the included script before choosing whether to run it.

## Add a car with multiple images

1. Sign in as admin and choose **Vehicles**.
2. Select **Add a vehicle** and fill in the title, make, model, year, price and other details.
3. Choose **For sale** or **For rent**. The price label changes appropriately.
4. Click the gallery upload area. In the file picker, use **Ctrl+click** or **Shift+click** to select multiple images. You can also drag several files into the upload area.
5. Alternatively use **Choose from original photos** to select one or more original images. Choose images matching the vehicle. Wait for the upload progress to finish. Images upload individually to avoid one oversized batch request.
6. Use **Set cover** or the left/right arrows to arrange photos. Use **×** to remove a photo.
7. Select **Save vehicle**. Reopen the car on the public website and check its thumbnails.

Default limits: 30 images per car, 10 MB per source image. JPEG, PNG and WebP are supported. Increase `MAX_IMAGES_PER_CAR` in `.env` if needed, up to 100; restart the server. A phone may produce HEIC files: convert those to JPEG first.

These limits protect processing capacity. The total number of photos is also limited by available database storage; this is not unlimited storage.

## Try bookings and enquiries

- Create a separate customer account through **Create an account**.
- Open a rental car, choose future pick-up and return dates, and select **Request this car & open Gmail**.
- In a separate/private browser window, sign in as admin and check **Bookings**.
- Confirm, cancel or complete the request. Pending and confirmed requests reserve the dates. Cancelled and completed requests release them.
- A 1-day rental is one calendar day from pick-up date to return date. The return day is excluded, so another booking may start on that date. Maximum request length is 90 days. Booking dates are validated using the UK calendar day.
- On a sale vehicle, select **Arrange a viewing**, complete the form and click **Continue to Gmail**. The request is saved in **Enquiries**, and Gmail opens with a draft. Click Send in Gmail to actually email the admin.
- The contact page follows the same flow. All enquiry forms require sign-in and return visitors to the selected car after authentication.
- **Open email app** and **Copy email details** are available if Gmail is not your preferred app or the popup is blocked. Full instructions: [EMAIL-AND-CONTACT.md](EMAIL-AND-CONTACT.md).
- Configure the inbox in **Admin → Settings → Enquiry recipient email**. No SMTP password or mail API key is needed for these forms. The admin can review saved requests even if a customer never sends their draft.

No payment is collected. Final rental terms, deposits, eligibility and collection arrangements remain a conversation with the dealership.

## Where your local information is kept

- Database, uploaded photos, accounts, bookings and enquiries: `data/rracer.sqlite`.
- Database working files may include `rracer.sqlite-wal` and `rracer.sqlite-shm`; let SQLite manage these while the app is running.
- Private settings and initial admin credentials: `.env`.
- Local password-reset email previews (only when no SMTP provider is configured): `data/mail/`. Use the reset link in the newest text file. These files are not served by the web app.

The local database survives normal stops and restarts. Deleting `data/` loses local records and uploaded photos. Copying just the source to a second PC does not copy the first PC's database.

To create a consistent database backup:

```bat
npm.cmd run backup
```

The command creates a dated folder under `backups/`. It includes the database and images, but not `.env`. Keep the backup private. Restore instructions are written into the backup folder.

## Edit the design or code

Stop the running server first, then:

```bat
npm.cmd run dev
```

Open `http://localhost:5173`. React reloads when you save frontend changes; the API listens on port 8000. Use the 5173 address consistently during development. Change the layout in `src/pages.jsx`, the admin screens in `src/admin.jsx`, and styling in `src/styles.css`.

Before running the normal version again:

```bat
npm.cmd run build
npm.cmd start
```

The build command always produces optimised React assets, even when the local `.env` uses development mode.

## Common problems

| Symptom | Fix |
| --- | --- |
| `node` is not recognised | Install Node.js 24, then reopen the terminal. |
| `npm.ps1 cannot be loaded` | Use Command Prompt or run `npm.cmd` in PowerShell; no execution-policy change is needed. |
| `ENOENT ... package.json` | Open the terminal in the extracted project folder, not its parent folder or inside the ZIP. |
| `JWT_SECRET` error | Run `npm.cmd run setup`; if `.env` already exists, inspect and correct it. |
| `EADDRINUSE` / port 8000 busy | Stop the other server. Alternatively change `PORT` and `APP_URL` together in `.env`; for editing mode also update Vite's proxy target. |
| Admin password does not work after editing `.env` | Bootstrap settings create an account once. They do not change an existing account. Run `npm.cmd run admin:reset` to generate a new password. |
| Images do not upload | Confirm you are admin, use supported files under the configured size, and check the on-screen error. |
| Browser shows the old design after source edits | Run `npm.cmd run build`, restart and hard-refresh. |
| Enquiry saved but admin receives no email | The customer must click Send in Gmail/email app. Check Admin → Settings → Enquiry recipient email. If no compose window appears, use Open Gmail or Copy email details on the draft screen. |
| Password reset reports email is unavailable | Password recovery is separate from enquiries; configure its optional SMTP settings using `GMAIL-SETUP.md`. With all SMTP settings blank in local mode, reset previews are saved in `data/mail/`. |
| `npm ci` cannot reach the registry | Check internet/proxy settings; do not copy the old project's `node_modules` into this project. |

## Test commands

`npm test` and `npm run test:ui` create their own temporary databases. They do not use or clear your local dealership data. `npm run test:mongo` downloads a MongoDB binary on its first run and requires an environment that permits running a local MongoDB replica set.
