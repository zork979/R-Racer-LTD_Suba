import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Heart,
  ArrowRight,
  Check,
  X,
  Fuel,
  Gauge,
  Settings2,
  Users,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api, money } from "./api";
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
export function useResource(path, version = 0) {
  const [state, set] = useState({ data: null, loading: true, error: "" });
  useEffect(() => {
    if (!path) {
      set({ data: null, loading: false, error: "" });
      return;
    }
    const controller = new AbortController();
    set((s) => ({ ...s, loading: true, error: "" }));
    api(path, { signal: controller.signal })
      .then((data) => set({ data, loading: false, error: "" }))
      .catch((e) => {
        if (e.name !== "AbortError")
          set({ data: null, loading: false, error: e.message });
      });
    return () => controller.abort();
  }, [path, version]);
  return state;
}
export function Button({
  children,
  to,
  secondary = false,
  className = "",
  ...props
}) {
  const cls = `button ${secondary ? "button-secondary" : ""} ${className}`;
  return to ? (
    <Link className={cls} to={to} {...props}>
      {children}
    </Link>
  ) : (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}
export function Notice({ children, error = false }) {
  return children ? (
    <div
      className={`notice ${error ? "notice-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {error ? <X size={18} /> : <Check size={18} />}
      <span>{children}</span>
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} /> Loading…
    </div>
  );
}
export function Empty({ title = "Nothing here yet", children, to, label }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Gauge size={32} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {to && (
        <Button to={to}>
          {label || "Explore the collection"}
          <ArrowRight size={17} />
        </Button>
      )}
    </div>
  );
}
export function Img({ src, alt, ...rest }) {
  return (
    <img
      src={src || "/placeholder.svg"}
      alt={alt}
      onError={(e) => {
        e.currentTarget.onerror = null;
        e.currentTarget.src = "/placeholder.svg";
      }}
      {...rest}
    />
  );
}
export function Eyebrow({ children, light = false }) {
  return (
    <div className={`eyebrow ${light ? "light" : ""}`}>
      <span />
      {children}
    </div>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  description,
  link,
  linkText = "View all cars",
}) {
  return (
    <div className="section-heading">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {link && (
        <Link className="text-link" to={link}>
          {linkText}
          <ArrowUpRight size={21} />
        </Link>
      )}
    </div>
  );
}
export function Badge({ status }) {
  return <span className={`badge ${status}`}>{status}</span>;
}
export function CarCard({ car }) {
  const { user, favorites, toggleFavorite } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const saved = favorites.includes(car._id);
  return (
    <article className="car-card">
      <div className="card-photo">
        <Link to={"/cars/" + car._id}>
          <Img src={car.images?.[0]?.url} alt={car.title} loading="lazy" />
        </Link>
        <span className="photo-tag">
          {car.isDemo
            ? "Demo vehicle"
            : car.carType === "rent"
              ? "Available to rent"
              : "For sale"}
        </span>
        <button
          className={`favorite ${saved ? "saved" : ""}`}
          aria-label={`${saved ? "Unsave" : "Save"} ${car.title}`}
          aria-pressed={saved}
          onClick={() =>
            user
              ? toggleFavorite(car._id)
              : navigate("/login?next=" + encodeURIComponent(location.pathname))
          }
        >
          <Heart size={18} fill={saved ? "currentColor" : "none"} />
        </button>
        {!car.isAvailable && (
          <span className="unavailable-tag">Currently unavailable</span>
        )}
      </div>
      <div className="card-content">
        <div className="car-meta">
          {car.year}
          <span>•</span>
          {car.bodyType || "Car"}
          <span>•</span>
          {car.condition === "new" ? "Brand new" : "Used"}
        </div>
        <h3>
          <Link to={"/cars/" + car._id}>{car.title}</Link>
        </h3>
        <div className="card-specs">
          <span>
            <Settings2 size={15} />
            {car.transmission}
          </span>
          <span>
            <Fuel size={15} />
            {car.fuelType}
          </span>
          <span>
            <Gauge size={15} />
            {Number(car.mileage).toLocaleString()} mi
          </span>
        </div>
        <div className="card-bottom">
          <div>
            <strong>{money(car.pricePerDay)}</strong>
            <small>{car.carType === "rent" ? " / day" : " asking price"}</small>
          </div>
          <Link
            className="round-link"
            to={"/cars/" + car._id}
            aria-label={`View ${car.title}`}
          >
            <ArrowUpRight size={22} />
          </Link>
        </div>
      </div>
    </article>
  );
}
export function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
export function Dialog({ open, onClose, title, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function Gallery({ car }) {
  const [index, setIndex] = useState(0),
    [open, setOpen] = useState(false);
  const images = car.images || [];
  const move = (direction) =>
    setIndex((i) => (i + direction + images.length) % images.length);
  return (
    <div className="gallery">
      <button
        className="main-photo"
        aria-label="Open image gallery"
        onClick={() => setOpen(true)}
      >
        <Img
          src={images[index]?.url}
          alt={`${car.title} — photo ${index + 1}`}
        />
        <span>
          {index + 1} / {Math.max(images.length, 1)} photos
          <ArrowUpRight size={16} />
        </span>
      </button>
      {images.length > 1 && (
        <div className="thumbnails">
          {images.map((img, i) => (
            <button
              key={img._id}
              className={i === index ? "active" : ""}
              aria-label={`View photo ${i + 1}`}
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
            >
              <Img src={img.url} alt={`${car.title} thumbnail ${i + 1}`} />
            </button>
          ))}
        </div>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${car.title} · ${index + 1}/${Math.max(images.length, 1)}`}
        wide
      >
        <div
          className="lightbox"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") move(-1);
            if (e.key === "ArrowRight") move(1);
          }}
          tabIndex={0}
        >
          <Img
            src={images[index]?.url}
            alt={`${car.title} photo ${index + 1}`}
          />
          {images.length > 1 && (
            <>
              <button
                className="gallery-prev"
                aria-label="Previous photo"
                onClick={() => move(-1)}
              >
                <ChevronLeft />
              </button>
              <button
                className="gallery-next"
                aria-label="Next photo"
                onClick={() => move(1)}
              >
                <ChevronRight />
              </button>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
