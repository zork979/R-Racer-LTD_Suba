import { refreshBundledImages } from "./bundled-images.js";
import bcrypt from "bcryptjs";
export const defaultSettings = {
  _id: "business",
  name: "R Racer Ltd",
  phone: "+44 7400 020754",
  email: "alimoeezrawn@gmail.com",
  address: "Tower Mill, 125 Park Road, Dukinfield, SK16 5NA, United Kingdom",
  hours: "Viewings and collection by appointment",
  whatsapp: "447400020754",
  tagline: "Good cars. Great journeys.",
  currency: "GBP",
};
export async function initialise(db, c) {
  await refreshBundledImages(db);
  if (!(await db.get("settings", "business")))
    await db.create("settings", defaultSettings);
  if (
    c.adminEmail &&
    !(await db.find("users", { email: c.adminEmail })).length
  ) {
    if (
      !c.adminPassword ||
      c.adminPassword.length < 12 ||
      Buffer.byteLength(c.adminPassword) > 72
    )
      throw new Error(
        "Set ADMIN_PASSWORD to a unique password with at least 12 characters and no more than 72 UTF-8 bytes.",
      );
    await db.create("users", {
      name: c.adminName,
      email: c.adminEmail,
      phone: c.adminPhone,
      password: await bcrypt.hash(c.adminPassword, 12),
      role: "admin",
      tokenVersion: 0,
      createdAt: new Date().toISOString(),
    });
  }
  if (
    !c.seedDemo ||
    (await db.find("cars")).length ||
    (await db.get("settings", "demo-seeded"))
  )
    return;
  const rows = [
    [
      "Toyota Prius",
      "Toyota",
      "Prius",
      2023,
      55,
      "rent",
      "hybrid",
      "automatic",
      "Hatchback",
      17800,
      ["hero-1.jpeg", "hero-2.jpeg"],
      true,
    ],
    [
      "Ford Mustang",
      "Ford",
      "Mustang",
      2021,
      145,
      "rent",
      "petrol",
      "automatic",
      "Coupe",
      22500,
      ["cars2-1.jpg", "cars2-2.jpg", "cars2-3.jpg"],
      true,
    ],
    [
      "Audi A1 Sportback",
      "Audi",
      "A1",
      2020,
      12950,
      "buy",
      "petrol",
      "manual",
      "Hatchback",
      36800,
      ["listing-1-6.jpg"],
      true,
    ],
    [
      "Toyota RAV4",
      "Toyota",
      "RAV4",
      2019,
      14950,
      "buy",
      "petrol",
      "automatic",
      "SUV",
      42200,
      ["listing-1-1.jpg"],
      true,
    ],
    [
      "Kia Soul",
      "Kia",
      "Soul",
      2020,
      48,
      "rent",
      "petrol",
      "manual",
      "Hatchback",
      31500,
      ["listing-1-2.jpg"],
      false,
    ],
    [
      "Chevrolet Camaro",
      "Chevrolet",
      "Camaro",
      2018,
      24950,
      "buy",
      "petrol",
      "automatic",
      "Coupe",
      26900,
      ["listing-1-4.jpg"],
      false,
    ],
  ];
  for (const [
    title,
    brand,
    model,
    year,
    pricePerDay,
    carType,
    fuelType,
    transmission,
    bodyType,
    mileage,
    files,
    featured,
  ] of rows) {
    const images = [];
    for (const file of files)
      images.push(
        (await db.create("images", { url: "/media/" + file, demo: true }))._id,
      );
    await db.create("cars", {
      title,
      brand,
      model,
      year,
      pricePerDay,
      carType,
      fuelType,
      transmission,
      bodyType,
      mileage,
      featured,
      images,
      seats: 5,
      previousOwners: 1,
      mot: null,
      isAvailable: true,
      isDemo: true,
      features: ["Bluetooth", "Air conditioning", "Parking sensors"],
      description:
        "Demonstration listing using images supplied with the original project. Vehicle details, pricing and specification are examples only. Replace this listing with verified stock before launch.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  await db.create("settings", { _id: "demo-seeded", done: true });
}
