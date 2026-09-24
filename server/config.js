import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export function config(overrides = {}) {
  const c = {
    production: process.env.NODE_ENV === "production",
    port: Number(process.env.PORT || 8000),
    host: process.env.HOST || "127.0.0.1",
    appUrl: (process.env.APP_URL || "http://localhost:8000").replace(/\/$/, ""),
    driver: process.env.DATABASE_DRIVER || "sqlite",
    dataDir: path.resolve(root, process.env.DATA_DIR || "data"),
    mongoUri: process.env.MONGO_URI || process.env.MONGODB_URI,
    mongoDb: process.env.MONGO_DB_NAME || "rracer",
    supabaseDatabaseUrl: process.env.SUPABASE_DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseBucket: process.env.SUPABASE_STORAGE_BUCKET || "rracer-images",
    supabasePoolMax: Number(process.env.SUPABASE_POOL_MAX || 5),
    supabaseSsl: process.env.SUPABASE_DB_SSL !== "false",
    supabaseCaFile: process.env.SUPABASE_CA_CERT_PATH,
    supabaseCaCert: process.env.SUPABASE_CA_CERT,
    secret: process.env.JWT_SECRET || process.env.JWT_SECRETKEY,
    adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase(),
    adminPassword: process.env.ADMIN_PASSWORD,
    adminName: process.env.ADMIN_NAME || "R Racer Admin",
    adminPhone: process.env.ADMIN_PHONE || "",
    seedDemo: process.env.SEED_DEMO === "true",
    trustProxy: Number(process.env.TRUST_PROXY || 0),
    maxImages: Math.min(
      100,
      Math.max(1, Number(process.env.MAX_IMAGES_PER_CAR || 30)),
    ),
    maxImageMB: Math.min(
      20,
      Math.max(1, Number(process.env.MAX_IMAGE_MB || 10)),
    ),
    notificationEmail:
      process.env.ADMIN_NOTIFICATION_EMAIL?.trim().toLowerCase(),
    smtpHost: process.env.SMTP_HOST?.trim(),
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpSecure: process.env.SMTP_SECURE === "true",
    smtpUser: process.env.SMTP_USER?.trim(),
    smtpPass: process.env.SMTP_PASS,
    mailFrom: process.env.MAIL_FROM,
    ...overrides,
  };
  if(c.smtpHost?.toLowerCase()==='smtp.gmail.com' && c.smtpPass)
    c.smtpPass=c.smtpPass.replace(/\s/g,'');
  if (!c.secret || c.secret.length < 32)
    throw new Error(
      "JWT_SECRET must contain at least 32 characters. Locally run npm run setup.",
    );
  if (!["sqlite", "mongodb", "supabase"].includes(c.driver))
    throw new Error("DATABASE_DRIVER must be sqlite, mongodb or supabase.");
  if (c.driver === "supabase") {
    if ([c.supabaseDatabaseUrl,c.supabaseUrl,c.supabaseSecretKey].some(v => /REPLACE_|PROJECT_REF|POOLER_HOST|URL_ENCODED_DATABASE_PASSWORD/.test(v || "")))
      throw new Error("Replace the Supabase example values with the connection details from your own project.");
    let dbUrl, serviceUrl;
    try { dbUrl = new URL(c.supabaseDatabaseUrl); serviceUrl = new URL(c.supabaseUrl); } catch {
      throw new Error("Set SUPABASE_DATABASE_URL and SUPABASE_URL. See docs/SUPABASE-SETUP.md.");
    }
    if (!["postgres:", "postgresql:"].includes(dbUrl.protocol) || !dbUrl.username || !dbUrl.password)
      throw new Error("Copy the Supabase Session pooler PostgreSQL URL, including its database password.");
    const local = host => ["localhost", "127.0.0.1", "[::1]"].includes(host);
    if (!c.supabaseSsl && (c.production || !local(dbUrl.hostname)))
      throw new Error("SSL certificate verification is required for a remote Supabase database.");
    if (serviceUrl.protocol !== "https:" && (c.production || !local(serviceUrl.hostname)))
      throw new Error("SUPABASE_URL must use HTTPS, except for a local test server.");
    if (!c.supabaseSecretKey || c.supabaseSecretKey.startsWith("sb_publishable_"))
      throw new Error("Set the server-only SUPABASE_SECRET_KEY, not a publishable/anon key.");
    if (!c.supabaseSecretKey.startsWith("sb_secret_")) {
      let role;
      try { role = JSON.parse(Buffer.from(c.supabaseSecretKey.split('.')[1], 'base64url').toString()).role; } catch {}
      if (role !== "service_role") throw new Error("Use a Supabase secret key or legacy service_role key for Storage.");
    }
    if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(c.supabaseBucket)) throw new Error("Use a bucket name with 3–63 lowercase letters, digits or hyphens.");
    if (!Number.isInteger(c.supabasePoolMax) || c.supabasePoolMax < 1 || c.supabasePoolMax > 10)
      throw new Error("SUPABASE_POOL_MAX must be between 1 and 10.");
  }
  if (c.driver === "mongodb" && !c.mongoUri)
    throw new Error("MONGO_URI is required for MongoDB.");
  if (
    c.production &&
    (!["mongodb", "supabase"].includes(c.driver) || c.seedDemo || !c.appUrl.startsWith("https://"))
  )
    throw new Error(
      "Production requires Supabase (or legacy MongoDB), an HTTPS APP_URL, and SEED_DEMO=false.",
    );
  if (
    c.production &&
    [c.secret, c.adminEmail, c.adminPassword, c.mongoUri, c.supabaseDatabaseUrl, c.supabaseSecretKey].some(
      (v) => typeof v === "string" && /^(REPLACE_|GENERATE_|CHANGE_)/.test(v),
    )
  )
    throw new Error(
      "Replace the example deployment values with your own configuration.",
    );
  return c;
}
