# API overview

All endpoints use `/api`. The production React application and API share one origin. JSON errors have the form `{ "message": "Readable explanation" }`.

Login/signup set an HTTP-only `rr_session` cookie and return `{user, csrfToken}`. Authenticated writes require that cookie and the matching `X-CSRF-Token`. `GET /auth/me` restores the CSRF token on reload. Password hashes, reset tokens and session secrets are never returned with a user.

## Customer/public routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness/version |
| GET | `/settings` | Public business information, effective enquiry recipient and upload limits |
| GET | `/catalog` | Available makes for search facets |
| GET | `/cars` | Inventory array; optional `format=paged` returns `{cars,total,page,pages}` |
| GET | `/cars/:id` | Vehicle with ordered populated gallery |
| GET | `/cars/:id/availability` | Requires `startDate` and `endDate`; returns availability and server-calculated total |
| GET | `/media/:id` | Optimised image bytes |
| POST | `/enquiries` | Store contact or vehicle enquiry; sign-in and CSRF required; account email is authoritative |
| POST | `/auth/signup` | Create customer account; ignores role supplied by client |
| POST | `/auth/login` | Authenticate existing account |
| POST | `/auth/logout` | Revoke current session |
| GET | `/auth/me` | Current safe user and CSRF token |
| GET | `/profile` | Safe current-user alias |
| PUT | `/auth/profile` | Update name and phone only |
| POST | `/auth/avatar` | Multipart `image` file |
| PUT | `/auth/change_password` | `oldPassword`, `newPassword` |
| POST or PUT | `/auth/forgot_password` | Request expiring reset link using email |
| POST or PUT | `/auth/reset_password` | Consume token and set new password |
| GET | `/favorites` | Current customer's saved vehicles |
| POST | `/favorites/:id` | Toggle saved vehicle |
| POST | `/bookings` | Create rental request with `carId`, dates, optional message |
| GET | `/bookings` | Own bookings; admins see all bookings |
| PATCH | `/bookings/:id/status` | Customer cancellation of own active request; admin lifecycle changes |

Inventory filters: `q`, `brand`, `carType`, `fuelType`, `transmission`, `bodyType`, `maxPrice`, `available=true`, paired `startDate`/`endDate`, `sort`, `page`, `limit`. Sort values: `price-asc`, `price-desc`, `year`; default featured-first. The maximum page size is 100.

## Admin routes

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/cars` | Create vehicle using validated fields and ordered image IDs |
| PUT | `/cars/:id` | Edit whitelisted vehicle fields; supplied gallery fully replaces the old order |
| DELETE | `/cars/:id` | Archive after checking active bookings |
| POST | `/upload/images` | Multipart `images`; up to 5 files per HTTP request |
| DELETE | `/upload/images/:id` | Delete an unattached image; referenced car images cannot be deleted directly |
| GET | `/admin/dashboard` | Real stock, booking totals, status counts and activity |
| GET | `/admin/enquiries` | Enquiry inbox |
| PATCH | `/admin/enquiries/:id` | Change enquiry status |
| PUT | `/admin/settings` | Save business details, including single-address `enquiryEmail` |
| GET | `/admin/export/bookings` | CSV export with spreadsheet formula-escape protection |

The UI lets an admin choose multiple images and uploads them one at a time. This keeps each HTTP request small while supporting a larger per-car gallery. A successfully uploaded but unsaved image can be removed with the unattached-image endpoint or later maintenance.

## Booking rules

- Rental cars only; unavailable or archived cars cannot be requested.
- Dates are ISO calendar dates; start cannot precede today's UK calendar day.
- Rental duration is 1–90 days. Occupied days include the start and exclude the return date.
- Price comes from the stored car record and is calculated by the server. A client-supplied total is ignored.
- Status transitions: pending → confirmed/cancelled; confirmed → completed/cancelled. Completed and cancelled are terminal states.
- Pending and confirmed records hold unique car/day slots. Slot writes and booking writes are in one transaction.
- Archived car/history records remain in the database. New public searches hide archived cars.

## Storage and scale

For Supabase hosting, records live in private PostgreSQL `rracer` tables and image bytes live in a private Supabase Storage bucket. Express returns images through `/media/:id` under `/api`; browser APIs and gallery URLs remain compatible. Table payloads preserve the previous JSON fields and IDs. PostgreSQL serializable transactions and a unique car/day index protect bookings. SQLite remains available for offline use and legacy MongoDB is retained. Large catalogues still require indexed inventory filtering rather than the current application-side inventory filtering.

## New admin endpoints

| Method | Path (under `/api`) | Purpose |
| --- | --- | --- |
| GET | `/admin/notifications` | Returns `{mode: "email_client", recipient}`; admin only |
| POST | `/admin/notifications/test` | Disabled: HTTP 409, no mail sent; admin plus CSRF |
| POST | `/admin/notifications/verify` | Disabled: HTTP 409; admin plus CSRF |
| POST | `/admin/notifications/:id/retry` | Disabled: HTTP 409, historical queue is not retried; admin plus CSRF |
| GET | `/admin/image-library` | Nine supplied photo choices; admin only |
| POST | `/admin/image-library` | Attach a supplied photo record using `{key}`; admin plus CSRF |

Booking and enquiry creation return a complete email draft; they do not enqueue or send SMTP notifications. Successful enquiries return `{message, reference, emailDraft}`. Bookings return `{booking, emailDraft}`. A draft is `{to, subject, body, reference}` with plain-text content and CRLF line endings. The UI percent-encodes these fields into Gmail and `mailto:` compose URLs. The customer must click Send in their email app. Records use `deliveryMethod: "email_client"` and `emailStatus: "draft_prepared"`; no sent/delivered status is inferred.

The signed-in account email and stored car/pricing are authoritative; client-provided recipients, car titles, prices and customer email overrides are ignored. A honeypot submission is discarded and returns the existing generic response without a draft. Historical notification records remain stored, but the application does not start a notification worker. SMTP credentials are never exposed to the frontend.
