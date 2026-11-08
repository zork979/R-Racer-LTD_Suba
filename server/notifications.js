import { createHash, randomUUID } from "node:crypto";
import { createMailTransport, emailSetup, emailError, validAddress } from "./email-config.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const iso = () => new Date().toISOString();
const cleanHeader = (value) =>
  String(value || "")
    .replace(/[\r\n]/g, " ")
    .slice(0, 200);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

/** Durable, transactional admin alerts. SMTP failure never discards a customer's request. */
export function createNotifications(db, c) {
  let transport;
  const setup = emailSetup(c), mode = setup.mode, ready = mode === "smtp";
  let timer,
    draining = false, scheduled, active = false;
  async function recipient() {
    const settings = await db.get("settings", "business");
    const value = c.notificationEmail || c.adminEmail || settings?.email || "";
    return validAddress(value) ? value : "";
  }
  async function issues() {
    const list = [...setup.issues], to = await recipient();
    if (!to || (ready && /\.local$/i.test(to)))
      list.push("Set ADMIN_NOTIFICATION_EMAIL to the real inbox that should receive enquiries.");
    return list;
  }
  async function verify() {
    const problems = await issues();
    if (problems.length) return { ok: false, message: "Email setup is incomplete.", issues: problems };
    try {
      if (!c.notificationSender) {
        transport ||= createMailTransport(c);
        await transport.verify();
      }
      return { ok: true, message: "SMTP connection and authentication succeeded. Use Send test email to check your inbox." };
    } catch (error) { return { ok: false, message: emailError(error), issues: [] }; }
  }
  async function sendTest() {
    const problems=await issues();
    if(mode!=='smtp'||problems.length)return {ok:false,message:'Email is not connected yet. Complete Gmail setup, then restart the website.',issues:problems};
    const id='test:'+randomUUID();
    await db.create('notifications',{_id:id,kind:'test',sourceId:null,reference:'SETUP TEST',to:await recipient(),replyTo:await recipient(),subject:'[R Racer] Email delivery test',text:'Your R Racer website can send email through the configured mail server.\n\nNew signed-in customer enquiries will include the vehicle details, customer name, account email, phone number and message.\n\nOpen your admin workspace: '+c.appUrl+'/admin/notifications',status:'pending',attempts:0,createdAt:iso(),nextAttemptAt:iso()});
    const result=await deliver(id,{force:true});
    return {ok:result.status==='sent',status:result.status,message:result.status==='sent'?'Test email accepted by the mail server. Check the admin Gmail inbox and Spam folder.':result.lastError||'Test email could not be sent.'};
  }
  async function enqueue(kind, record, customer, car) {
    const reference =
      kind === "booking"
        ? record.reference
        : record._id.slice(-8).toUpperCase();
    const type =
      kind === "booking"
        ? "Rental booking request"
        : record.type === "rental"
          ? "Rental enquiry"
          : record.type === "purchase" || record.type === "viewing"
            ? "Purchase / viewing enquiry"
            : "General enquiry";
    const vehicleFields = car ? [
      ["Vehicle", car.title], ["Vehicle ID", car._id],
      ["Make", car.brand || "Not specified"], ["Model", car.model || "Not specified"],
      ["Year", car.year || "Not specified"],
      ["Listing", car.carType === "rent" ? "For rent" : "For sale"],
      [car.carType === "rent" ? "Daily rate" : "Asking price",
        car.pricePerDay != null ? `GBP ${Number(car.pricePerDay).toFixed(2)}` : "Not specified"],
      ["Transmission", car.transmission || "Not specified"],
      ["Fuel", car.fuelType || "Not specified"],
      ["Mileage", car.mileage != null ? `${Number(car.mileage).toLocaleString("en-GB")} miles` : "Not specified"],
      ["Vehicle page", `${c.appUrl}/cars/${car._id}`],
    ] : [["Vehicle", "Not specified — general enquiry"]];
    const customerFields = [["Customer", customer.name], ["Email", customer.email], ["Phone", customer.phone || "Not provided"]];
    const bookingFields = kind === "booking" ? [
      ["Pick-up", record.startDate], ["Return", record.endDate], ["Days", record.days],
      ["Daily price", `GBP ${Number(record.pricePerDay).toFixed(2)}`],
      ["Estimated total", `GBP ${Number(record.total).toFixed(2)}`],
      ["Status", "Pending — a request, not a confirmed booking or payment."],
    ] : [];
    const adminUrl = `${c.appUrl}/admin/${kind === "booking" ? "bookings" : "enquiries"}`;
    const text = [
      `New ${type.toLowerCase()} — ${reference}`,
      "",
      ...customerFields.map(([label, value]) => `${label}: ${value}`), "",
      ...vehicleFields.map(([label, value]) => `${label}: ${value}`), "",
      ...bookingFields.map(([label, value]) => `${label}: ${value}`),
      "",
      `Message:\n${record.message || "No additional message."}`,
      "",
      `Admin: ${adminUrl}`,
      `Received: ${record.createdAt}`,
    ]
      .filter((v) => v !== null)
      .join("\n");
    const table = (fields) => `<table role="presentation" style="width:100%;border-collapse:collapse">${fields.map(([key, value]) => `<tr><th align="left" style="padding:9px 12px;border-bottom:1px solid #eee;color:#666;font-size:13px;width:32%;vertical-align:top">${escapeHtml(key)}</th><td style="padding:9px 12px;border-bottom:1px solid #eee;font-size:14px;overflow-wrap:anywhere">${escapeHtml(value)}</td></tr>`).join("")}</table>`;
    const html = `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#f6f5f3;font-family:Arial,sans-serif;color:#252822"><main style="max-width:640px;margin:auto;background:white;border-top:5px solid #d63826;padding:28px;border-radius:10px"><p style="color:#b92b1a;font-weight:bold;letter-spacing:2px">R RACER LTD</p><h1 style="font-size:25px">${escapeHtml(type)}</h1><p>Reference: <strong>${escapeHtml(reference)}</strong></p><h2 style="font-size:18px">Customer contact details</h2>${table(customerFields)}<h2 style="font-size:18px">Vehicle details</h2>${table(vehicleFields)}${bookingFields.length ? `<h2 style="font-size:18px">Rental request</h2>${table(bookingFields)}` : ""}<h2 style="font-size:18px">Message</h2><p style="white-space:pre-wrap;line-height:1.7">${escapeHtml(record.message || "No additional message.")}</p><p><a href="mailto:${escapeHtml(customer.email)}" style="color:#b92b1a;font-weight:bold">Reply to customer</a>${customer.phone ? ` · <a href="tel:${escapeHtml(customer.phone.replace(/[^+\d]/g, ""))}" style="color:#b92b1a">Call customer</a>` : ""}</p><p><a href="${escapeHtml(adminUrl)}" style="color:#b92b1a">Open in admin</a></p><p style="font-size:12px;color:#777">Received: ${escapeHtml(record.createdAt)}</p></main></body></html>`;
    return db.create("notifications", {
      _id: `${kind}:${record._id}`,
      kind,
      sourceId: record._id,
      reference,
      to: await recipient(),
      replyTo: customer.email,
      subject: cleanHeader(
        `[R Racer] ${type} · ${reference}${car ? " · " + car.title : ""}`,
      ),
      text,
      html,
      status: "pending",
      attempts: 0,
      createdAt: iso(),
      nextAttemptAt: iso(),
    });
  }
  async function deliver(id, { force = false } = {}) {
    const entry = await db.transaction(async () => {
      const n = await db.get("notifications", id);
      if (!n || n.status === "sent") return null;
      if (
        n.status === "sending" &&
        Date.parse(n.claimedAt) > Date.now() - 120000
      )
        return null;
      if (!force && n.status === "preview") return null;
      if (
        !force &&
        (n.attempts >= 5 || Date.parse(n.nextAttemptAt) > Date.now())
      )
        return null;
      if (!force && n.status === "needs_configuration" && !ready) return null;
      return db.update("notifications", id, {
        status: "sending",
        claimedAt: iso(),
        attempts: n.attempts + 1,
      });
    });
    if (!entry) return db.get("notifications", id);
    try {
      const to = await recipient();
      if (!to || mode === "not_configured" || (ready && /\.local$/i.test(to)))
        return await db.update("notifications", id, {
          status: "needs_configuration",
          lastError: (await issues()).join(" ") || "Set a valid ADMIN_NOTIFICATION_EMAIL.",
          nextAttemptAt: iso(),
        });
      const mail = {
        from: c.mailFrom,
        to,
        replyTo: entry.replyTo,
        subject: entry.subject,
        text: entry.text,
        html: entry.html,
        messageId: `<rracer-${createHash("sha256").update(entry._id).digest("hex").slice(0,32)}@${new URL(c.appUrl).hostname}>`,
      };
      if (mode === "local_preview") {
        const folder = path.join(c.dataDir, "mail", "notifications");
        await mkdir(folder, { recursive: true });
        await writeFile(
          path.join(folder, `${entry.kind}-${entry.sourceId}.txt`),
          `LOCAL PREVIEW — no email was sent.\nTo: ${to}\nReply-To: ${entry.replyTo}\nSubject: ${entry.subject}\n\n${entry.text}`,
          { mode: 0o600 },
        );
        if (entry.html) await writeFile(path.join(folder, `${entry.kind}-${entry.sourceId}.html`), entry.html, { mode: 0o600 });
        return await db.update("notifications", id, {
          status: "preview",
          to,
          lastError: null,
          previewAt: iso(),
        });
      }
      if (c.notificationSender) await c.notificationSender(mail);
      else {
        transport ||= createMailTransport(c);
        const result = await transport.sendMail(mail);
        if (!result.accepted?.length) throw new Error("No recipient accepted");
      }
      return await db.update("notifications", id, {
        status: "sent",
        to,
        sentAt: iso(),
        lastError: null,
      });
    } catch (error) {
      return db.update("notifications", id, {
        status: "failed",
        lastError: emailError(error),
        nextAttemptAt: new Date(
          Date.now() + Math.min(60, 2 ** entry.attempts) * 60000,
        ).toISOString(),
      });
    }
  }
  async function drain() {
    if (draining) return;
    draining = true;
    try {
      const entries = (await db.find("notifications"))
        .filter(
          (n) =>
            !["sent", "preview"].includes(n.status) &&
            n.attempts < 5 &&
            (!n.nextAttemptAt || Date.parse(n.nextAttemptAt) <= Date.now()) &&
            (n.status !== "needs_configuration" || ready) &&
            (n.status !== "sending" ||
              Date.parse(n.claimedAt) <= Date.now() - 120000),
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, 25);
      for (const n of entries) await deliver(n._id);
    } catch {
      console.error(
        "Admin email queue could not be processed; saved requests remain in the database.",
      );
    } finally {
      draining = false;
    }
  }
  function start() {
    active = true;
    timer = setInterval(() => void drain(), 30000);
    timer.unref();
    void drain();
  }
  async function stop() {
    active = false;
    clearTimeout(scheduled);
    clearInterval(timer);
    while (draining) await new Promise((r) => setTimeout(r, 25));
    transport?.close();
  }
  async function summary() {
    return {
      mode,
      recipient: await recipient(),
      issues: await issues(),
      alerts: (await db.find("notifications"))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 200)
        .map(({ text, html, ...entry }) => entry),
    };
  }
  function schedule() {
    if (!active || scheduled) return;
    scheduled = setTimeout(() => { scheduled = null; void drain(); }, 0);
    scheduled.unref();
  }
  return { enqueue, deliver, drain, start, stop, summary, verify, schedule, sendTest };
}
