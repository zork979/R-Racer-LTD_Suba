import { createEnquiryDraft, enquiryRecipient, recipientAddress } from "./enquiry-email.js";
import { bundledImages } from "./bundled-images.js";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import sharp from "sharp";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createMailTransport, emailSetup } from "./email-config.js";
import { root } from "./config.js";
import { newId } from "./database.js";
import { defaultSettings } from "./seed.js";
import {
  fail,
  text,
  email,
  password,
  choice,
  dateRange,
  carFields,
} from "./validation.js";

const now = () => new Date().toISOString();
const hash = (v) => createHash("sha256").update(v).digest("hex");
const same = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const safeUser = (u) => ({
  _id: u._id,
  id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone || "",
  image: u.image || "",
  role: u.role,
});
const duplicate = (e) =>
  e.code === "23505" ||
  e.code === 11000 ||
  String(e.code).startsWith("SQLITE_CONSTRAINT") ||
  e.message?.includes("UNIQUE constraint");
const cookieValue = (req) =>
  req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("rr_session="))
    ?.slice(11);
const transitions = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function createApp(db, c) {
  const app = express();
  async function businessSettings() {
    const settings = { ...defaultSettings, ...await db.get("settings", "business") };
    return { ...settings, enquiryEmail: enquiryRecipient(settings, c) };
  }
  app.disable("x-powered-by");
  if (c.trustProxy) app.set("trust proxy", c.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "img-src": ["'self'", "data:", "blob:", "https:"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "upgrade-insecure-requests": c.production ? [] : null,
        },
      },
      strictTransportSecurity: c.production ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "128kb" }));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin
    ) {
      const allowed = new Set([
        c.appUrl,
        ...(c.production
          ? []
          : [
              "http://localhost:5173",
              "http://127.0.0.1:5173",
              "http://localhost:8000",
              "http://127.0.0.1:8000",
            ]),
      ]);
      if (!allowed.has(req.headers.origin))
        return res
          .status(403)
          .json({ message: "This request origin is not allowed." });
    }
    next();
  });
  const limiter = (limit, windowMs) =>
    rateLimit({
      limit,
      windowMs,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { message: "Too many requests. Please try again shortly." },
    });
  app.use("/api", limiter(600, 60000));
  const authLimit = limiter(30, 15 * 60000),
    contactLimit = limiter(12, 15 * 60000),
    uploadLimit = limiter(100, 15 * 60000);
  async function auth(req, res, next) {
    let payload;
    try {
      payload = jwt.verify(cookieValue(req) || "", c.secret, {
        algorithms: ["HS256"],
        issuer: "rracer",
      });
    } catch {
      return res.status(401).json({ message: "Please sign in to continue." });
    }
    const [session, user] = await Promise.all([
      db.get("sessions", payload.sid),
      db.get("users", payload.sub),
    ]);
    if (
      !session ||
      session.expiresAt < now() ||
      !user ||
      payload.version !== (user.tokenVersion || 0)
    )
      return res
        .status(401)
        .json({ message: "Your session has expired. Please sign in again." });
    if (
      !["GET", "HEAD"].includes(req.method) &&
      !same(req.headers["x-csrf-token"], session.csrf)
    )
      return res
        .status(403)
        .json({ message: "Refresh the page and try again." });
    req.user = user;
    req.session = session;
    next();
  }
  const admin = (req, res, next) =>
    req.user.role === "admin"
      ? next()
      : res.status(403).json({ message: "Administrator access required." });
  async function sessionFor(user, res) {
    const session = await db.create("sessions", {
      userId: user._id,
      csrf: randomBytes(24).toString("hex"),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    const token = jwt.sign(
      { sid: session._id, version: user.tokenVersion || 0 },
      c.secret,
      {
        algorithm: "HS256",
        expiresIn: "7d",
        subject: user._id,
        issuer: "rracer",
      },
    );
    res.cookie("rr_session", token, {
      httpOnly: true,
      secure: c.production,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 86400000,
    });
    return { user: safeUser(user), csrfToken: session.csrf };
  }
  const audit = async (req, action, target) =>
    db.create("audit", {
      actor: req.user._id,
      actorName: req.user.name,
      action,
      target,
      createdAt: now(),
    });
  async function hydrate(car) {
    if (!car) return null;
    const images = (
      await Promise.all(
        (car.images || []).map((i) =>
          typeof i === "object" && i.url ? i : db.get("images", String(i)),
        ),
      )
    ).filter(Boolean);
    return {
      ...car,
      images: images.map((i) => ({ _id: i._id, url: i.url })),
      condition: car.condition ?? "used",
      bodyType: car.bodyType || "Hatchback",
      features: car.features || [],
    };
  }
  async function getCar(id) {
    const car = await db.get("cars", id);
    if (!car || car.deletedAt) fail("Vehicle not found.", 404);
    return car;
  }
  async function validateImages(ids) {
    if (
      !Array.isArray(ids) ||
      ids.length > c.maxImages ||
      ids.some((id) => typeof id !== "string")
    )
      fail(`Choose up to ${c.maxImages} images.`);
    if (new Set(ids).size !== ids.length) fail("Duplicate gallery image.");
    for (const id of ids)
      if (!(await db.get("images", id)))
        fail("An image no longer exists. Please upload it again.");
    return ids;
  }
  async function cleanupImage(id) {
    const image = await db.get("images", id);
    if (!image) return;
    if ((await db.find("cars")).some((car) => (car.images || []).includes(id)))
      return;
    if ((await db.find("users")).some((user) => user.image === image.url))
      return;
    if (image.mediaId) await db.removeMedia(image.mediaId);
    await db.remove("images", id);
  }
  async function bookSlots(booking) {
    for (
      let t = Date.parse(booking.startDate);
      t < Date.parse(booking.endDate);
      t += 86400000
    ) {
      const day = new Date(t).toISOString().slice(0, 10);
      await db.create("slots", {
        _id: `${booking.carId}:${day}`,
        bookingId: booking._id,
        carId: booking.carId,
        day,
      });
    }
  }
  async function clearSlots(bookingId) {
    for (const slot of await db.find("slots", { bookingId }))
      await db.remove("slots", slot._id);
  }
  async function bookingView(b) {
    const u = await db.get("users", b.userId);
    return {
      ...b,
      user: u ? { name: u.name, email: u.email, phone: u.phone } : null,
      car: await hydrate(await db.get("cars", b.carId)),
    };
  }

  app.get("/api/health", (req, res) =>
    res.json({ status: "ok", version: "3.0.0", database: c.driver }),
  );
  app.get("/api/settings", async (req, res) =>
    res.json({
      ...await businessSettings(),
      maxImages: c.maxImages,
      maxImageMB: c.maxImageMB,
    }),
  );
  app.post("/api/auth/signup", authLimit, async (req, res) => {
    const body = req.body;
    const user = {
      name: text(body.name, "Name", 100),
      email: email(body.email),
      phone: text(body.phone, "Phone", 30),
      password: await bcrypt.hash(password(body.password), 12),
      role: "user",
      tokenVersion: 0,
      createdAt: now(),
    };
    try {
      const saved = await db.create("users", user);
      res.status(201).json(await sessionFor(saved, res));
    } catch (e) {
      if (duplicate(e)) fail("An account with that email already exists.", 409);
      throw e;
    }
  });
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const address = email(req.body.email);
    const users = await db.find("users", { email: address });
    const user = users[0];
    const valid = await bcrypt.compare(
      typeof req.body.password === "string" ? req.body.password : "",
      user?.password ||
        "$2b$12$invalidpasswordhashtopreventfastfailXXXXXXXXXXXXXXXXXXXX",
    );
    if (!user || !valid) fail("Email or password is incorrect.", 401);
    res.json(await sessionFor(user, res));
  });
  app.get("/api/auth/me", auth, async (req, res) =>
    res.json({ user: safeUser(req.user), csrfToken: req.session.csrf }),
  );
  app.get("/api/profile", auth, async (req, res) =>
    res.json({ user: safeUser(req.user) }),
  );
  app.post("/api/auth/logout", auth, async (req, res) => {
    await db.remove("sessions", req.session._id);
    res.clearCookie("rr_session", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: c.production,
    });
    res.json({ message: "Signed out." });
  });
  app.put("/api/auth/profile", auth, async (req, res) => {
    const user = await db.update("users", req.user._id, {
      name: text(req.body.name, "Name", 100),
      phone: text(req.body.phone, "Phone", 30),
      updatedAt: now(),
    });
    res.json({ user: safeUser(user) });
  });
  app.put("/api/auth/change_password", auth, authLimit, async (req, res) => {
    if (
      typeof req.body.oldPassword !== "string" ||
      !(await bcrypt.compare(req.body.oldPassword, req.user.password))
    )
      fail("Current password is incorrect.");
    const encrypted = await bcrypt.hash(password(req.body.newPassword), 12);
    const user = await db.transaction(async () => {
      const current = await db.get("users", req.user._id);
      return db.update("users", current._id, {
        password: encrypted,
        tokenVersion: (current.tokenVersion || 0) + 1,
        resetHash: null,
        resetExpires: null,
      });
    });
    res.json({
      ...(await sessionFor(user, res)),
      message: "Password changed. Other sessions have been signed out.",
    });
  });
  app.all("/api/auth/forgot_password", authLimit, async (req, res) => {
    if (!["POST", "PUT"].includes(req.method))
      return res.status(405).json({ message: "Use POST." });
    const address = email(req.body.email);
    const mailMode = emailSetup({ ...c, notificationSender: null }).mode;
    if (mailMode === "not_configured" || (c.production && mailMode !== "smtp"))
      fail(
        "Password recovery is not configured. Please contact the dealership.",
        503,
      );
    const user = (await db.find("users", { email: address }))[0];
    if (user) {
      const token = randomBytes(32).toString("hex");
      await db.update("users", user._id, {
        resetHash: hash(token),
        resetExpires: new Date(Date.now() + 30 * 60000).toISOString(),
      });
      const link = `${c.appUrl}/reset-password?token=${token}`;
      const message = {
        from: c.mailFrom,
        to: user.email,
        subject: "Reset your R Racer password",
        text: `Use this link within 30 minutes to reset your password:\n${link}\n\nIf you did not request this, ignore this email.`,
      };
      if (mailMode === "smtp") {
        const transport = createMailTransport(c);
        try {
          await transport.sendMail(message);
        } catch {
          fail(
            "The email service is unavailable. Please try again later.",
            503,
          );
        } finally { transport.close(); }
      } else {
        const folder = path.join(c.dataDir, "mail");
        await mkdir(folder, { recursive: true });
        await writeFile(
          path.join(folder, `${Date.now()}-${newId()}.txt`),
          `To: ${user.email}\n${message.text}`,
          { mode: 0o600 },
        );
      }
    }
    res.json({
      message:
        "If that email has an account, a password reset link has been sent.",
    });
  });
  app.all("/api/auth/reset_password", authLimit, async (req, res) => {
    if (!["POST", "PUT"].includes(req.method))
      return res.status(405).json({ message: "Use POST." });
    const token = text(req.body.token, "Reset token", 100);
    const encrypted = await bcrypt.hash(password(req.body.newPassword), 12);
    await db.transaction(async () => {
      const user = (await db.find("users", { resetHash: hash(token) }))[0];
      if (!user || !user.resetExpires || user.resetExpires < now())
        fail("This reset link is invalid or expired. Request a new one.");
      await db.update("users", user._id, {
        password: encrypted,
        tokenVersion: (user.tokenVersion || 0) + 1,
        resetHash: null,
        resetExpires: null,
      });
    });
    res.json({ message: "Password reset. Sign in with your new password." });
  });

  app.get("/api/catalog", async (req, res) => {
    const cars = (await db.find("cars")).filter((car) => !car.deletedAt);
    res.json({ brands: [...new Set(cars.map((car) => car.brand))].sort() });
  });
  app.get("/api/cars", async (req, res) => {
    // Older listings have no condition field. Normalise before filtering and
    // pagination, without rewriting stock or requiring a database migration.
    let cars = (await db.find("cars"))
      .filter((car) => !car.deletedAt)
      .map((car) => ({ ...car, condition: car.condition ?? "used" }));
    if (req.query.condition)
      choice(req.query.condition, ["new", "used"], "vehicle condition");
    const q = String(req.query.q || "")
      .trim()
      .toLowerCase()
      .slice(0, 100);
    if (q)
      cars = cars.filter((car) =>
        `${car.title} ${car.brand} ${car.model}`.toLowerCase().includes(q),
      );
    for (const field of [
      "carType",
      "condition",
      "brand",
      "fuelType",
      "transmission",
      "bodyType",
    ])
      if (req.query[field])
        cars = cars.filter((car) => car[field] === req.query[field]);
    if (req.query.maxPrice)
      cars = cars.filter(
        (car) => car.pricePerDay <= Number(req.query.maxPrice),
      );
    if (req.query.available === "true")
      cars = cars.filter((car) => car.isAvailable);
    if (req.query.startDate || req.query.endDate) {
      const range = dateRange(req.query.startDate, req.query.endDate);
      const slots = await db.find("slots", {
        day: { $gte: range.startDate, $lt: range.endDate },
      });
      const reserved = new Set(slots.map((s) => s.carId));
      cars = cars.filter(
        (car) =>
          car.carType === "rent" && car.isAvailable && !reserved.has(car._id),
      );
    }
    cars.sort((a, b) =>
      req.query.sort === "price-asc"
        ? a.pricePerDay - b.pricePerDay
        : req.query.sort === "price-desc"
          ? b.pricePerDay - a.pricePerDay
          : req.query.sort === "year"
            ? b.year - a.year
            : Number(b.featured) - Number(a.featured) ||
              String(b.createdAt).localeCompare(String(a.createdAt)),
    );
    const total = cars.length;
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 100));
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const result = await Promise.all(
      cars.slice((page - 1) * limit, page * limit).map(hydrate),
    );
    res.set("X-Total-Count", String(total));
    res.json(
      req.query.format === "paged"
        ? { cars: result, total, page, pages: Math.ceil(total / limit) }
        : result,
    );
  });
  app.get("/api/cars/:id/availability", async (req, res) => {
    const car = await getCar(req.params.id);
    const range = dateRange(req.query.startDate, req.query.endDate);
    const slots = await db.find("slots", {
      carId: car._id,
      day: { $gte: range.startDate, $lt: range.endDate },
    });
    res.json({
      available: car.carType === "rent" && car.isAvailable && !slots.length,
      ...range,
      total: (Math.round(car.pricePerDay * 100) * range.days) / 100,
    });
  });
  app.get("/api/cars/:id", async (req, res) =>
    res.json(await hydrate(await getCar(req.params.id))),
  );
  app.post("/api/cars", auth, admin, async (req, res) => {
    const fields = carFields(req.body);
    const images = await validateImages(req.body.images || []);
    const car = await db.create("cars", {
      ...fields,
      images,
      createdBy: req.user._id,
      slug:
        fields.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + newId(),
      createdAt: now(),
      updatedAt: now(),
    });
    await audit(req, "Created vehicle", car.title);
    res.status(201).json({ success: true, car: await hydrate(car) });
  });
  app.put("/api/cars/:id", auth, admin, async (req, res) => {
    const existing = await getCar(req.params.id);
    const fields = carFields(req.body, existing);
    const images =
      req.body.images === undefined
        ? existing.images
        : await validateImages(req.body.images);
    const car = await db.transaction(async () => {
      const current = await getCar(existing._id);
      const active = await db.find("bookings", {
        carId: current._id,
        status: { $in: ["pending", "confirmed"] },
      });
      if (active.length && fields.carType !== current.carType)
        fail(
          "Cancel or complete active rentals before changing the listing type.",
          409,
        );
      return db.update("cars", current._id, {
        ...fields,
        images,
        updatedAt: now(),
      });
    });
    for (const id of existing.images || [])
      if (!images.includes(id)) await cleanupImage(id);
    await audit(req, "Updated vehicle", car.title);
    res.json({ success: true, car: await hydrate(car) });
  });
  app.delete("/api/cars/:id", auth, admin, async (req, res) => {
    const car = await db.transaction(async () => {
      const car = await getCar(req.params.id);
      if (
        (
          await db.find("bookings", {
            carId: car._id,
            status: { $in: ["pending", "confirmed"] },
          })
        ).length
      )
        fail(
          "This car has active bookings. Cancel or complete them first.",
          409,
        );
      return db.update("cars", car._id, {
        deletedAt: now(),
        isAvailable: false,
      });
    });
    await audit(req, "Archived vehicle", car.title);
    res.json({ success: true });
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: c.maxImageMB * 1024 * 1024, files: 5, fields: 5 },
    fileFilter: (req, file, cb) => {
      if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype))
        cb(null, true);
      else {
        const error = new Error(
          "Only JPEG, PNG and WebP images are supported.",
        );
        error.status = 400;
        cb(error);
      }
    },
  });
  async function saveImage(file) {
    let bytes;
    try {
      const image = sharp(file.buffer, { limitInputPixels: 40000000 });
      const meta = await image.metadata();
      if (!["jpeg", "png", "webp"].includes(meta.format))
        fail("Unsupported image format.");
      bytes = await image
        .rotate()
        .resize(1920, 1440, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      fail("This file is not a supported JPEG, PNG or WebP image.");
    }
    if (bytes.length > 4 * 1024 * 1024)
      fail("The optimised image is too large. Please choose a smaller image.");
    const mediaId = newId();
    await db.putMedia(mediaId, bytes, "image/webp");
    try {
      return await db.create("images", {
        url: `/api/media/${mediaId}`,
        mediaId,
        createdAt: now(),
      });
    } catch (e) {
      await db.removeMedia(mediaId);
      throw e;
    }
  }
  app.post(
    "/api/upload/images",
    auth,
    admin,
    uploadLimit,
    upload.array("images", 5),
    async (req, res) => {
      if (!req.files?.length) fail("Select JPEG, PNG or WebP images.");
      const images = [];
      try {
        for (const file of req.files) images.push(await saveImage(file));
      } catch (e) {
        for (const img of images) await cleanupImage(img._id);
        throw e;
      }
      res.status(201).json({ success: true, images });
    },
  );
  app.delete("/api/upload/images/:id", auth, admin, async (req, res) => {
    if (
      (await db.find("cars")).some((car) =>
        (car.images || []).includes(req.params.id),
      )
    )
      fail("Remove the image from its car gallery first.", 409);
    await cleanupImage(req.params.id);
    res.json({ success: true });
  });
  app.post(
    "/api/auth/avatar",
    auth,
    uploadLimit,
    upload.single("image"),
    async (req, res) => {
      if (!req.file) fail("Choose a JPEG, PNG or WebP image.");
      const image = await saveImage(req.file);
      const user = await db.update("users", req.user._id, { image: image.url });
      const old = (await db.find("images", { url: req.user.image }))[0];
      if (old) await cleanupImage(old._id);
      res.json({ user: safeUser(user) });
    },
  );
  app.get("/api/media/:id", async (req, res) => {
    if (!/^[a-f\d]{24}$/.test(req.params.id)) fail("Image not found.", 404);
    const media = await db.getMedia(req.params.id);
    if (!media) fail("Image not found.", 404);
    res
      .set({
        "Content-Type": media.mime,
        "Cache-Control": "public, max-age=31536000, immutable",
      })
      .send(media.bytes);
  });

  app.post("/api/bookings", auth, contactLimit, async (req, res) => {
    const range = dateRange(req.body.startDate, req.body.endDate);
    const recipient = (await businessSettings()).enquiryEmail;
    const bookingId = newId();
    let booking;
    try {
      booking = await db.transaction(async () => {
        const car = await getCar(text(req.body.carId, "Vehicle", 40));
        if (car.carType !== "rent" || !car.isAvailable)
          fail("This vehicle is not available for rental.", 409);
        // This write serialises bookings with archive/type changes in MongoDB transactions.
        await db.update("cars", car._id, {
          bookingRevision: (car.bookingRevision || 0) + 1,
        });
        const b = {
          _id: bookingId,
          reference: "RR-" + bookingId.slice(-8).toUpperCase(),
          userId: req.user._id,
          carId: car._id,
          ...range,
          pricePerDay: car.pricePerDay,
          total: (Math.round(car.pricePerDay * 100) * range.days) / 100,
          status: "pending",
          message: text(req.body.message || "", "Message", 2000, false),
          deliveryMethod: "email_client",
          emailStatus: "draft_prepared",
          createdAt: now(),
          updatedAt: now(),
        };
        await bookSlots(b);
        const saved = await db.create("bookings", b);
        const emailDraft = createEnquiryDraft({ kind: "booking", record: saved, customer: req.user, car, recipient, appUrl: c.appUrl });
        return { saved, emailDraft };
      });
    } catch (e) {
      if (duplicate(e))
        fail(
          "This car has already been requested for those dates. Please choose other dates.",
          409,
        );
      throw e;
    }
    res.status(201).json({ booking: await bookingView(booking.saved), emailDraft: booking.emailDraft });
  });
  app.get("/api/bookings", auth, async (req, res) => {
    const bookings = await db.find(
      "bookings",
      req.user.role === "admin" ? {} : { userId: req.user._id },
    );
    res.json(
      await Promise.all(
        bookings
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(bookingView),
      ),
    );
  });
  app.patch("/api/bookings/:id/status", auth, async (req, res) => {
    const booking = await db.transaction(async () => {
      const b = await db.get("bookings", req.params.id);
      if (!b) fail("Booking not found.", 404);
      const status = choice(
        req.body.status,
        ["pending", "confirmed", "completed", "cancelled"],
        "status",
      );
      if (
        req.user.role !== "admin" &&
        (b.userId !== req.user._id || status !== "cancelled")
      )
        fail("You cannot change this booking.", 403);
      if (!transitions[b.status]?.includes(status))
        fail("This booking status cannot be changed that way.", 409);
      if (status === "cancelled" || status === "completed")
        await clearSlots(b._id);
      return db.update("bookings", b._id, { status, updatedAt: now() });
    });
    await audit(req, "Booking " + booking.status, booking.reference);
    res.json({ booking: await bookingView(booking) });
  });
  app.get("/api/favorites", auth, async (req, res) => {
    const ids = req.user.favorites || [];
    const cars = (
      await Promise.all(ids.map((id) => db.get("cars", id)))
    ).filter((car) => car && !car.deletedAt);
    res.json(await Promise.all(cars.map(hydrate)));
  });
  app.post("/api/favorites/:id", auth, async (req, res) => {
    await getCar(req.params.id);
    const favorites = await db.transaction(async () => {
      const user = await db.get("users", req.user._id);
      let ids = user.favorites || [];
      ids = ids.includes(req.params.id)
        ? ids.filter((id) => id !== req.params.id)
        : [...ids, req.params.id];
      if (ids.length > 200)
        fail("Your shortlist is full. Remove a saved car first.");
      await db.update("users", user._id, { favorites: ids });
      return ids;
    });
    res.json({ favorites });
  });
  app.post("/api/enquiries", auth, contactLimit, async (req, res) => {
    if (req.body.website)
      return res.status(201).json({ message: "Enquiry received." });
    const b = req.body;
    const recipient = (await businessSettings()).enquiryEmail;
    let car = null;
    if (b.carId) car = await getCar(text(b.carId, "Vehicle", 40));
    const fields = {
      userId: req.user._id,
      name: text(b.name ?? req.user.name, "Name", 100),
      email: req.user.email,
      phone: text(b.phone || "", "Phone", 30, false),
      type: choice(
        b.type || "general",
        ["general", "viewing", "purchase", "rental"],
        "enquiry type",
      ),
      carId: car?._id || null,
      carTitle: car?.title || "",
      message: text(b.message, "Message", 3000),
      status: "new",
      deliveryMethod: "email_client",
      emailStatus: "draft_prepared",
      createdAt: now(),
    };
    const enquiry = await db.transaction(async () => {
      const saved = await db.create("enquiries", fields);
      const emailDraft = createEnquiryDraft({ kind: "enquiry", record: saved, customer: saved, car, recipient, appUrl: c.appUrl });
      return { saved, emailDraft };
    });
    res.status(201).json({
      message: "Your enquiry is saved. Open the email draft and click Send to email our team.",
      reference: enquiry.emailDraft.reference,
      emailDraft: enquiry.emailDraft,
    });
  });
  app.get("/api/admin/notifications", auth, admin, async (req, res) => {
    res.json({ mode: "email_client", recipient: (await businessSettings()).enquiryEmail });
  });
  // Stale v2.3 clients must not accidentally send old queued alerts.
  for (const route of ["test", "verify", ":id/retry"])
    app.post("/api/admin/notifications/" + route, auth, admin, (req, res) => {
      res.status(409).json({ message: "Enquiries now open in the customer's email app. SMTP enquiry alerts are disabled. Manage the recipient in Admin → Settings." });
    });
  app.get("/api/admin/image-library", auth, admin, (req, res) =>
    res.json(bundledImages),
  );
  app.post("/api/admin/image-library", auth, admin, async (req, res) => {
    const item = bundledImages.find((i) => i.key === req.body.key);
    if (!item) fail("Choose a supplied image.", 400);
    const existing = (await db.find("images", { url: item.url }))[0];
    const image =
      existing ||
      (await db.create("images", {
        url: item.url,
        bundled: true,
        createdAt: now(),
      }));
    res.status(201).json({ image: { _id: image._id, url: image.url } });
  });
  app.get("/api/admin/enquiries", auth, admin, async (req, res) =>
    res.json(
      (await db.find("enquiries")).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    ),
  );
  app.patch("/api/admin/enquiries/:id", auth, admin, async (req, res) => {
    if (!(await db.get("enquiries", req.params.id)))
      fail("Enquiry not found.", 404);
    const enquiry = await db.update("enquiries", req.params.id, {
      status: choice(
        req.body.status,
        ["new", "contacted", "closed"],
        "enquiry status",
      ),
    });
    await audit(req, "Enquiry " + enquiry.status, enquiry._id);
    res.json(enquiry);
  });
  app.put("/api/admin/settings", auth, admin, async (req, res) => {
    const b = req.body;
    const settings = {
      name: text(b.name, "Business name", 100),
      phone: text(b.phone, "Phone", 30),
      email: email(b.email),
      enquiryEmail: recipientAddress(b.enquiryEmail ?? (await businessSettings()).enquiryEmail),
      address: text(b.address, "Address", 250),
      hours: text(b.hours, "Opening hours", 150),
      whatsapp: text(b.whatsapp || "", "WhatsApp", 20, false).replace(
        /\D/g,
        "",
      ),
      tagline: text(b.tagline || "", "Tagline", 150, false),
      currency: "GBP",
    };
    await db.update("settings", "business", settings);
    await audit(req, "Updated business settings", "business");
    res.json(settings);
  });
  app.get("/api/admin/dashboard", auth, admin, async (req, res) => {
    const cars = (await db.find("cars")).filter((c) => !c.deletedAt);
    const bookings = await db.find("bookings");
    const enquiries = await db.find("enquiries");
    res.json({
      cars: cars.length,
      available: cars.filter((c) => c.isAvailable).length,
      pending: bookings.filter((b) => b.status === "pending").length,
      newEnquiries: enquiries.filter((e) => e.status === "new").length,
      bookingValue: bookings
        .filter((b) => ["confirmed", "completed"].includes(b.status))
        .reduce((sum, b) => sum + b.total, 0),
      bookingCounts: Object.fromEntries(
        Object.keys(transitions).map((s) => [
          s,
          bookings.filter((b) => b.status === s).length,
        ]),
      ),
      recentBookings: await Promise.all(
        bookings
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 5)
          .map(bookingView),
      ),
      activity: (await db.find("audit"))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 8),
    });
  });
  app.get("/api/admin/export/bookings", auth, admin, async (req, res) => {
    const bookings = await db.find("bookings");
    const cell = (v) =>
      '"' +
      String(
        /^[=+\-@\t\r]/.test(String(v ?? "")) ? "'" + v : (v ?? ""),
      ).replace(/"/g, '""') +
      '"';
    const rows = [
      [
        "Reference",
        "Customer",
        "Email",
        "Vehicle",
        "Start",
        "End",
        "Days",
        "Total GBP",
        "Status",
      ],
    ];
    for (const b of bookings) {
      const user = await db.get("users", b.userId);
      const car = await db.get("cars", b.carId);
      rows.push([
        b.reference,
        user?.name,
        user?.email,
        car?.title,
        b.startDate,
        b.endDate,
        b.days,
        b.total,
        b.status,
      ]);
    }
    res
      .set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="rracer-bookings.csv"',
      })
      .send("\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n"));
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ message: "API endpoint not found." }),
  );
  app.use(
    "/uploads",
    express.static(path.join(root, "legacy-uploads"), {
      dotfiles: "deny",
      index: false,
    }),
  );
  app.use(
    express.static(path.join(root, "dist"), { index: false, dotfiles: "deny" }),
  );
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.join(root, "dist", "index.html")),
  );
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status =
      err.status ||
      (err instanceof multer.MulterError ? 400 : duplicate(err) ? 409 : 500);
    const message =
      err instanceof multer.MulterError
        ? `Image upload failed. Use up to 5 images per request, ${c.maxImageMB} MB each.`
        : status === 500
          ? "Something went wrong. Please try again."
          : duplicate(err)
            ? "This record already exists."
            : err.message;
    if (status === 500) {
      console.error("Request failed:", err.name, err.code || "internal");
      if (c.onError) c.onError(err);
    }
    res.status(status).json({ message });
  });
  return app;
}
