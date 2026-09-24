# Customer email enquiries — release 2.4

The enquiry flow now follows the Gmail compose approach found in the original project's `PriceCard.jsx`. **The customer sends the email from their own account. The website prepares a draft; it does not send an automatic enquiry notification.**

## Set the administrator's receiving address

1. Sign in as administrator.
2. Open **Admin → Settings**.
3. Set **Enquiry recipient email** to the inbox you want to receive car enquiries.
4. Click **Save business details**. The next enquiry uses this address immediately; no restart is needed.

**Admin → Email enquiries** shows the active recipient. This can be different from the public business email. Before this field has been saved, the application preserves your previous recipient by falling back to `ADMIN_NOTIFICATION_EMAIL`, then `ADMIN_EMAIL`, then the public business email. The recipient appears in the customer's email draft and is public contact information.

## What customers do

1. Sign in or create an account, as in release 2.3.
2. On a sale car, select **Arrange a viewing** and complete the enquiry form. A rental question or the contact-page form works the same way.
3. Click **Continue to Gmail**. The website saves the request and opens a Gmail compose tab.
4. Check the recipient, subject and message, then click **Send in Gmail**.

For a dated rental request, select the dates and click **Request this car & open Gmail**. The request is saved as pending and Gmail opens with its details. Pending requests reserve the selected dates; the dealership still needs to confirm the booking.

A draft includes the customer name, signed-in account email, optional phone and message. A selected car adds its title, ID, make/model/year, asking price or daily rate, fuel, transmission, mileage and vehicle-page link. Rental bookings also include dates, number of days and the server-calculated estimated total. Every draft includes its reference.

The selected Gmail account sends the email. If it differs from the website account, the website account email is still included in the message; the admin can contact that address. The website does not verify ownership of account email addresses.

## Gmail, another email app, or copy and paste

The confirmation screen stays available with three choices:

- **Open Gmail** opens the same prefilled draft again without creating another request.
- **Open email app** uses `mailto:` to open the device's configured email handler with the same recipient, subject and body.
- **Copy email details** copies the complete draft. **View complete email details** also exposes selectable text if clipboard permission is unavailable.

If the browser blocks the new tab, click **Open Gmail** on this screen. If Gmail asks you to sign in, sign in and check the draft. If your device has no email handler, use Gmail. Some email apps impose URL-length limits; if a draft is empty or shortened, copy the complete details into a new email. The website keeps the full text and does not truncate it.

Opening Gmail, opening an email app or copying text does **not** send a message. The customer must click Send. If the customer closes the draft without sending, the administrator will still see the saved request in **Admin → Enquiries / Bookings**, but no email will arrive. The website cannot verify whether the customer sent a draft or whether it reached the inbox.

## No SMTP setup for enquiries

No SMTP credentials, Gmail App Password, email API key or server mail account is needed for purchase enquiries, rental enquiries, dated rental requests or general contact messages. This works when the website runs locally, provided the customer can access their email service.

The old automatic enquiry queue is disabled. Historical queue records remain in the database, but the server no longer starts a delivery worker. Old test/verify/retry endpoints return a clear disabled response rather than sending an email. Changing SMTP settings does not change the new enquiry flow.

Password-reset emails are a separate existing feature and still use server SMTP when configured. The optional `email:setup` and `email:check` commands apply to that feature; they are not needed for enquiries. See [GMAIL-SETUP.md](GMAIL-SETUP.md).

## Phone and WhatsApp

Set **Telephone** and **WhatsApp number** in **Admin → Settings**. Use the international country code and digits for WhatsApp (for example, `447400020754`). Leaving WhatsApp blank hides its buttons.

The existing call links open the device's telephone handler. WhatsApp links open a chat with the selected car and entered rental dates. Customers can send a message or arrange a call there. These links are unchanged in this update.

## Files for future changes

| File | Purpose |
| --- | --- |
| `server/enquiry-email.js` | Recipient selection and complete draft content |
| `server/app.js` | Save enquiries/bookings, return drafts, save recipient settings |
| `src/email-handoff.js` | Gmail and mailto URLs, new-tab handling |
| `src/EmailDraft.jsx` | Draft actions, copy and manual fallback |
| `src/pages.jsx` | Customer enquiry and rental forms |
| `src/admin.jsx` | Editable recipient and saved enquiries |
| `src/EmailAlerts.jsx` | Admin email-enquiry information page |

Run `npm run build` after changing frontend code, then restart and refresh the browser. The included build is already updated.
