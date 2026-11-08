import { fail } from "./validation.js";

// A single mailbox, never a comma-separated list or user-controlled URL/header.
export function recipientAddress(value) {
  const address = String(value || "").trim().toLowerCase();
  if (address.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(address))
    fail("Set a valid enquiry recipient email in Admin → Settings.", 400);
  return address;
}

export function enquiryRecipient(settings, config) {
  return recipientAddress(settings.enquiryEmail || config.notificationEmail || config.adminEmail || settings.email);
}

const line = value => String(value ?? "").replace(/[\r\n\u0000]/g, " ").toWellFormed();
const pounds = value => `GBP ${Number(value).toFixed(2)}`;

/** Prepare a draft only. Opening it never implies that the customer sent it. */
export function createEnquiryDraft({ kind, record, customer, car, recipient, appUrl }) {
  const reference = kind === "booking" ? record.reference : record._id.slice(-8).toUpperCase();
  const type = kind === "booking" ? "Rental booking request"
    : record.type === "rental" ? "Rental enquiry"
    : ["purchase", "viewing"].includes(record.type) ? "Purchase / viewing enquiry" : "General enquiry";
  const fields = entries => entries.map(([label, value]) => `${label}: ${line(value)}`);
  const body = [
    "Hello R Racer Ltd Team,", "", `I would like to discuss this ${type.toLowerCase()}.`, "",
    ...fields([["Reference", reference], ["Prepared at", record.createdAt]]), "",
    "CUSTOMER DETAILS",
    ...fields([["Name", customer.name], ["Account email", customer.email], ["Phone", customer.phone || "Not provided"]]), "",
    "VEHICLE DETAILS",
    ...(car ? fields([
      ["Vehicle", car.title], ["Vehicle ID", car._id], ["Make", car.brand || "Not specified"],
      ["Model", car.model || "Not specified"], ["Year", car.year],
      ["Listing", car.carType === "rent" ? "For rent" : "For sale"],
      [car.carType === "rent" ? "Daily rate" : "Asking price", pounds(car.pricePerDay)],
      ["Transmission", car.transmission], ["Fuel", car.fuelType],
      ["Mileage", `${Number(car.mileage).toLocaleString("en-GB")} miles`],
      ["Vehicle page", `${appUrl}/cars/${encodeURIComponent(car._id)}`],
    ]) : ["General enquiry — no vehicle selected."]), "",
    ...(kind === "booking" ? ["RENTAL REQUEST", ...fields([
      ["Pick-up", record.startDate], ["Return", record.endDate], ["Days", record.days],
      ["Daily rate", pounds(record.pricePerDay)], ["Estimated total", pounds(record.total)],
      ["Status", "Pending — this is a request, not a confirmed booking or payment."],
    ]), ""] : []),
    "MESSAGE", String(record.message || "No additional message.").replace(/\r\n?|\n/g, "\n").replace(/\u0000/g, "").toWellFormed(), "",
    "Please contact me using the details above. Thank you.",
  ].join("\n").replace(/\r\n?|\n/g, "\r\n");
  return {
    to: recipientAddress(recipient),
    subject: line(`[R Racer] ${type}${car ? " — " + car.title : ""} | ${reference}`),
    body,
    reference,
  };
}
