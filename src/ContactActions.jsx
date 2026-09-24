import { Phone, MessageCircle } from "lucide-react";
import { useApp } from "./ui";
export function contactLinks(settings, { car, startDate, endDate } = {}) {
  const phone = (settings.phone || "").replace(/[^+\d]/g, "");
  const whatsapp = (settings.whatsapp || "").replace(/\D/g, "");
  const message = car
    ? `Hello R Racer, I’m interested in ${car.carType === "rent" ? "renting" : "buying"} the ${car.title}.${startDate && endDate ? ` Dates: ${startDate} to ${endDate}.` : ""} Please share more details. ${window.location.origin}/cars/${car._id}`
    : "Hello R Racer, I’d like some help finding my next car. Could we chat or arrange a call?";
  return {
    phone: phone ? "tel:" + phone : null,
    whatsapp: whatsapp
      ? "https://wa.me/" + whatsapp + "?text=" + encodeURIComponent(message)
      : null,
  };
}
export default function ContactActions({
  car,
  startDate,
  endDate,
  floating = false,
}) {
  const { settings } = useApp();
  const links = contactLinks(settings, { car, startDate, endDate });
  if (!links.phone && !links.whatsapp) return null;
  return (
    <div
      className={floating ? "contact-dock" : "contact-actions"}
      role="group"
      aria-label={car ? "Contact us about " + car.title : "Contact R Racer"}
    >
      {links.phone && (
        <a
          className="contact-call"
          href={links.phone}
          aria-label={car ? `Call about ${car.title}` : "Call R Racer"}
        >
          <Phone size={18} />
          <span>
            {floating
              ? "Call us"
              : car?.carType === "rent"
                ? "Call to rent"
                : "Call our team"}
          </span>
        </a>
      )}
      {links.whatsapp && (
        <a
          className="contact-whatsapp"
          href={links.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={
            car ? `WhatsApp about ${car.title}` : "Message R Racer on WhatsApp"
          }
        >
          <MessageCircle size={19} />
          <span>WhatsApp</span>
          <span className="visually-hidden">
            {" "}
            (opens a chat in a new tab; you can arrange a call there)
          </span>
        </a>
      )}
    </div>
  );
}
