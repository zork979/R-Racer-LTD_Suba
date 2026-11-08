export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const fail = (message, status = 400) => {
  throw new HttpError(status, message);
};
export function text(value, label, max = 200, required = true) {
  if (
    typeof value !== "string" ||
    (required && !value.trim()) ||
    value.length > max
  )
    fail(`${label} is required and must be no more than ${max} characters.`);
  return value.trim();
}
export function email(value) {
  const v = text(value, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    fail("Enter a valid email address.");
  return v;
}
export function password(value) {
  if (
    typeof value !== "string" ||
    value.length < 10 ||
    Buffer.byteLength(value) > 72
  )
    fail(
      "Use a password of at least 10 characters and no more than 72 UTF-8 bytes.",
    );
  return value;
}
export function number(value, label, min, max, integer = false) {
  if (value === "" || value == null || typeof value === "boolean")
    fail(`${label} is required.`);
  const n = Number(value);
  if (
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer && !Number.isInteger(n))
  )
    fail(
      `${label} must be ${integer ? "a whole number " : ""}between ${min} and ${max}.`,
    );
  return n;
}
export function choice(value, values, label) {
  if (!values.includes(value)) fail(`Choose a valid ${label}.`);
  return value;
}
export function bool(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  fail("Invalid true/false value.");
}
export function date(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    fail(`Enter a valid ${label}.`);
  return value;
}
export function dateRange(start, end) {
  start = date(start, "pick-up date");
  end = date(end, "return date");
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/London",
  });
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (start < today || days < 1 || days > 90)
    fail("Choose a future rental period of 1 to 90 days.");
  return { startDate: start, endDate: end, days };
}
export function carFields(body, existing = {}) {
  const b = { ...existing, ...body };
  const features = Array.isArray(b.features)
    ? b.features
    : typeof b.features === "string"
      ? b.features.split(",")
      : [];
  if (features.length > 40) fail("Use no more than 40 features.");
  return {
    title: text(b.title, "Title", 120),
    brand: text(b.brand, "Brand", 60),
    model: text(b.model, "Model", 80),
    year: number(b.year, "Year", 1950, new Date().getFullYear() + 1, true),
    pricePerDay:
      Math.round(number(b.pricePerDay, "Price", 1, 10000000) * 100) / 100,
    carType: choice(b.carType, ["rent", "buy"], "listing type"),
    condition: choice(b.condition ?? "used", ["new", "used"], "vehicle condition"),
    fuelType: choice(
      b.fuelType || "petrol",
      ["petrol", "diesel", "electric", "hybrid"],
      "fuel type",
    ),
    transmission: choice(
      b.transmission || "manual",
      ["manual", "automatic"],
      "transmission",
    ),
    seats: number(b.seats ?? 5, "Seats", 1, 12, true),
    mileage: number(b.mileage ?? 0, "Mileage", 0, 2000000, true),
    previousOwners: number(
      b.previousOwners ?? 0,
      "Previous owners",
      0,
      50,
      true,
    ),
    mot: b.mot ? date(String(b.mot).slice(0, 10), "MOT date") : null,
    bodyType: choice(
      b.bodyType || "Hatchback",
      ["Hatchback", "Saloon", "SUV", "Coupe", "Convertible", "Estate", "Van"],
      "body type",
    ),
    description: text(b.description || "", "Description", 5000, false),
    features: features
      .map((f) => text(f, "Feature", 80, false))
      .filter(Boolean),
    isAvailable: bool(b.isAvailable ?? true),
    featured: bool(b.featured ?? false),
  };
}
