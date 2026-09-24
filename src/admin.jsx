import EmailAlerts from "./EmailAlerts";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  CarFront,
  CalendarDays,
  MessageSquare,
  Settings2,
  LogOut,
  ArrowUpRight,
  Plus,
  Search,
  Pencil,
  Archive,
  ImagePlus,
  X,
  ArrowLeft,
  ArrowRight,
  Download,
  Check,
  Mail,
  Phone,
  Clock,
  Activity,
  Eye,
  LoaderCircle,
} from "lucide-react";
import { Logo } from "./App";
import { api, money, day } from "./api";
import {
  useApp,
  useResource,
  Button,
  Notice,
  Loading,
  Empty,
  Img,
  Eyebrow,
  Field,
  Dialog,
  Badge,
} from "./ui";
import { BookingList } from "./pages";

export default function Admin() {
  const { user, logout } = useApp();
  const location = useLocation();
  const path = location.pathname.split("/")[2] || "dashboard";
  const tabs = [
    ["dashboard", LayoutDashboard, "Overview"],
    ["cars", CarFront, "Vehicles"],
    ["bookings", CalendarDays, "Bookings"],
    ["enquiries", MessageSquare, "Enquiries"],
    ["notifications", Mail, "Email enquiries"],
    ["settings", Settings2, "Settings"],
  ];
  const title = tabs.find((t) => t[0] === path)?.[2] || "Settings";
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Logo variant="footer" />
        <div className="admin-nav-label">YOUR DEALERSHIP</div>
        <nav aria-label="Admin navigation">
          {tabs.map(([p, Icon, label]) => (
            <NavLink key={p} to={"/admin/" + p}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/">
            <ArrowUpRight size={18} />
            View website
          </Link>
          <Link to="/account">
            <span className="avatar small">{user.name[0]}</span>
            <span>
              {user.name}
              <small>Administrator</small>
            </span>
          </Link>
          <button onClick={logout}>
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>
      <div className="admin-content">
        <header className="admin-topbar">
          <span>
            Workspace <span>/</span> {title}
          </span>
          <Link to="/">
            View live storefront
            <ArrowUpRight size={16} />
          </Link>
        </header>
        <main id="main" className="admin-main">
          {path === "dashboard" ? (
            <Dashboard />
          ) : path === "cars" ? (
            <Inventory />
          ) : path === "bookings" ? (
            <Bookings />
          ) : path === "enquiries" ? (
            <Enquiries />
          ) : path === "notifications" ? (
            <EmailAlerts />
          ) : (
            <BusinessSettings />
          )}
        </main>
      </div>
    </div>
  );
}
function AdminTitle({ eyebrow, title, description, children }) {
  return (
    <div className="admin-title">
      <div>
        <Eyebrow>{eyebrow || "R RACER WORKSPACE"}</Eyebrow>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
function Dashboard() {
  const [version, setVersion] = useState(0);
  const { data, loading, error } = useResource("/admin/dashboard", version);
  const { user } = useApp();
  return (
    <>
      <AdminTitle
        eyebrow="YOUR DEALERSHIP, AT A GLANCE"
        title={`Welcome back, ${user.name.split(" ")[0]}.`}
        description="A clear view of what’s happening and what comes next."
      >
        <Button to="/admin/cars">
          <Plus size={18} />
          Manage vehicles
        </Button>
      </AdminTitle>
      {loading ? (
        <Loading />
      ) : error ? (
        <Notice error>{error}</Notice>
      ) : (
        <>
          <div className="stat-grid">
            {[
              [
                CarFront,
                "Vehicles in stock",
                data.cars,
                data.available + " available",
                "/admin/cars",
              ],
              [
                CalendarDays,
                "Pending bookings",
                data.pending,
                "Ready for your review",
                "/admin/bookings",
              ],
              [
                MessageSquare,
                "New enquiries",
                data.newEnquiries,
                "Start a conversation",
                "/admin/enquiries",
              ],
              [
                Activity,
                "Confirmed booking value",
                money(data.bookingValue),
                "Confirmed + completed · not payments",
                "/admin/bookings",
              ],
            ].map(([Icon, label, value, hint, to]) => (
              <Link to={to} className="stat-card" key={label}>
                <div>
                  <span>{label}</span>
                  <Icon size={20} />
                </div>
                <strong>{value}</strong>
                <small>
                  {hint}
                  <ArrowUpRight size={15} />
                </small>
              </Link>
            ))}
          </div>
          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-heading">
                <h3>Rental activity</h3>
                <Link to="/admin/bookings">
                  View bookings
                  <ArrowUpRight size={16} />
                </Link>
              </div>
              <div className="activity-bars">
                {Object.entries(data.bookingCounts).map(([status, n]) => (
                  <div key={status}>
                    <span>
                      <Badge status={status} />
                      <strong>{n}</strong>
                    </span>
                    <div className="bar-track">
                      <i
                        className={status}
                        style={{
                          width:
                            (n /
                              Math.max(
                                1,
                                ...Object.values(data.bookingCounts),
                              )) *
                              100 +
                            "%",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="fine-print">
                Booking requests reserve dates until confirmed, cancelled or
                completed. Review pending requests regularly.
              </p>
            </section>
            <section className="panel">
              <h3>Recent changes</h3>
              <div className="audit-list">
                {data.activity.length ? (
                  data.activity.map((a) => (
                    <div key={a._id}>
                      <span className="audit-dot" />
                      <div>
                        <strong>{a.action}</strong>
                        <p>{a.target}</p>
                        <small>
                          {a.actorName} · {day(a.createdAt)}
                        </small>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    Vehicle, booking and settings changes will appear here.
                  </p>
                )}
              </div>
            </section>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <h3>Latest bookings</h3>
              <Link to="/admin/bookings">
                View all
                <ArrowUpRight size={16} />
              </Link>
            </div>
            <BookingList
              bookings={data.recentBookings}
              admin
              onChange={() => setVersion((v) => v + 1)}
            />
          </section>
        </>
      )}
    </>
  );
}

function Inventory() {
  const [version, setVersion] = useState(0),
    [search, setSearch] = useState(""),
    [type, setType] = useState(""),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState(null),
    [archiving, setArchiving] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const {
    data,
    loading,
    error: loadError,
  } = useResource(
    `/cars?format=paged&limit=15&page=${page}&q=${encodeURIComponent(search)}&carType=${type}`,
    version,
  );
  const { notify } = useApp();
  async function archive() {
    setBusy(true);
    setError("");
    try {
      await api("/cars/" + archiving._id, { method: "DELETE" });
      setArchiving(null);
      setVersion((v) => v + 1);
      notify("Vehicle archived. Historical bookings are preserved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(car) {
    setError("");
    try {
      await api("/cars/" + car._id, {
        method: "PUT",
        body: { isAvailable: !car.isAvailable },
      });
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <AdminTitle
        title="Your collection."
        description="Manage vehicles, prices and photographs in one place."
      >
        <Button onClick={() => setEditing({})}>
          <Plus size={18} />
          Add a vehicle
        </Button>
      </AdminTitle>
      <div className="admin-toolbar">
        <div className="input-icon">
          <Search size={18} />
          <input
            aria-label="Search vehicles"
            placeholder="Search by make or model…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          aria-label="Filter listing type"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All listings</option>
          <option value="buy">For sale</option>
          <option value="rent">For rent</option>
        </select>
        <span>{data?.total || 0} vehicles</span>
      </div>
      <Notice error>{error || loadError}</Notice>
      {loading ? (
        <Loading />
      ) : data?.cars?.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Listing</th>
                <th>Price</th>
                <th>Gallery</th>
                <th>Availability</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.cars.map((car) => (
                <tr key={car._id}>
                  <td>
                    <div className="vehicle-cell">
                      <Img src={car.images?.[0]?.url} alt={car.title} />
                      <div>
                        <strong>{car.title}</strong>
                        <small>
                          {car.year} · {car.fuelType}
                          {car.isDemo ? " · Demo" : ""}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge
                      status={car.carType === "rent" ? "rental" : "for sale"}
                    />
                  </td>
                  <td>
                    <strong>{money(car.pricePerDay)}</strong>
                    <small>
                      {car.carType === "rent" ? "per day" : "asking price"}
                    </small>
                  </td>
                  <td>{car.images?.length || 0} photos</td>
                  <td>
                    <button
                      className={`availability-button ${car.isAvailable ? "on" : ""}`}
                      onClick={() => toggle(car)}
                      aria-label={`Toggle availability of ${car.title}`}
                      aria-pressed={car.isAvailable}
                    >
                      <i />
                      {car.isAvailable ? "Available" : "Unavailable"}
                    </button>
                  </td>
                  <td>
                    <div className="table-actions">
                      <Link
                        className="icon-button"
                        to={"/cars/" + car._id}
                        aria-label={`View ${car.title}`}
                      >
                        <Eye size={17} />
                      </Link>
                      <button
                        className="icon-button"
                        onClick={() => setEditing(car)}
                        aria-label={`Edit ${car.title}`}
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        className="icon-button danger-link"
                        onClick={() => setArchiving(car)}
                        aria-label={`Archive ${car.title}`}
                      >
                        <Archive size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="Make room for your first car">
          Use “Add a vehicle” to start building your collection.
        </Empty>
      )}
      {data?.pages > 1 && (
        <div className="pagination">
          <Button
            secondary
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span>
            {page} / {data.pages}
          </span>
          <Button
            secondary
            disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
      {editing && (
        <VehicleEditor
          car={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setVersion((v) => v + 1);
            notify("Vehicle saved. Your storefront is up to date.");
          }}
        />
      )}
      <Dialog
        open={!!archiving}
        title="Archive this vehicle?"
        onClose={() => setArchiving(null)}
      >
        <p>
          {archiving?.title} will be removed from the storefront. Its booking
          history will stay in your records. Vehicles with active bookings must
          be completed or cancelled first.
        </p>
        <Notice error>{error}</Notice>
        <div className="dialog-actions">
          <Button secondary onClick={() => setArchiving(null)}>
            Keep vehicle
          </Button>
          <Button disabled={busy} onClick={archive}>
            Archive vehicle
          </Button>
        </div>
      </Dialog>
    </>
  );
}
const blankCar = {
  title: "",
  brand: "",
  model: "",
  year: new Date().getFullYear(),
  pricePerDay: "",
  carType: "buy",
  fuelType: "petrol",
  transmission: "manual",
  bodyType: "Hatchback",
  seats: 5,
  mileage: 0,
  previousOwners: 0,
  mot: "",
  description: "",
  features: [],
  isAvailable: true,
  featured: false,
};
function VehicleEditor({ car, onClose, onSaved }) {
  const { settings } = useApp();
  const [form, setForm] = useState({
    ...blankCar,
    ...car,
    mot: car.mot?.slice(0, 10) || "",
    features: (car.features || []).join(", "),
  });
  const [libraryOpen, setLibraryOpen] = useState(false);
  const {
    data: library,
    loading: libraryLoading,
    error: libraryError,
  } = useResource(libraryOpen ? "/admin/image-library" : null);
  const [images, setImages] = useState(car.images || []),
    [newImages, setNewImages] = useState([]),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState("");
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const input = (key, extra = {}) => ({
    value: form[key],
    onChange: (e) => update(key, e.target.value),
    ...extra,
  });
  async function upload(files) {
    const selected = Array.from(files || []);
    if (!selected.length || uploading) return;
    setError("");
    if (images.length + selected.length > settings.maxImages) {
      setError(`You can keep up to ${settings.maxImages} images per vehicle.`);
      return;
    }
    if (
      selected.some(
        (f) =>
          !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
          f.size > settings.maxImageMB * 1024 * 1024,
      )
    ) {
      setError(
        `Choose JPEG, PNG or WebP images of up to ${settings.maxImageMB} MB each.`,
      );
      return;
    }
    setUploading(true);
    try {
      for (let i = 0; i < selected.length; i++) {
        setProgress(`Optimising and uploading ${i + 1} of ${selected.length}…`);
        const fd = new FormData();
        fd.append("images", selected[i]);
        const d = await api("/upload/images", { method: "POST", body: fd });
        setImages((imgs) => [...imgs, ...d.images]);
        setNewImages((imgs) => [...imgs, ...d.images]);
      }
    } catch (e) {
      setError(e.message + " Images already uploaded are kept in the gallery.");
    } finally {
      setUploading(false);
      setProgress("");
    }
  }
  async function addBundled(key) {
    if (images.length >= settings.maxImages) {
      setError(`Choose up to ${settings.maxImages} images.`);
      return;
    }
    setUploading(true);
    setError("");
    try {
      const { image } = await api("/admin/image-library", {
        method: "POST",
        body: { key },
      });
      if (!images.some((i) => i._id === image._id)) {
        setImages((list) => [...list, image]);
        setNewImages((list) => [...list, image]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }
  function move(i, offset) {
    setImages((prev) => {
      const a = [...prev];
      [a[i], a[i + offset]] = [a[i + offset], a[i]];
      return a;
    });
  }
  function cover(i) {
    setImages((prev) => [prev[i], ...prev.filter((_, n) => n !== i)]);
  }
  async function cleanup(ids) {
    for (const img of ids)
      try {
        await api("/upload/images/" + img._id, { method: "DELETE" });
      } catch {}
  }
  async function close() {
    if (busy || uploading) return;
    await cleanup(newImages);
    onClose();
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/cars" + (car._id ? "/" + car._id : ""), {
        method: car._id ? "PUT" : "POST",
        body: { ...form, images: images.map((i) => i._id) },
      });
      await cleanup(
        newImages.filter((i) => !images.some((img) => img._id === i._id)),
      );
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={car._id ? "Edit vehicle" : "Add a vehicle"}
      onClose={close}
      wide
    >
      <form className="vehicle-editor" onSubmit={save}>
        <div className="editor-columns">
          <div>
            <h3>The essentials</h3>
            <Field label="Vehicle title">
              <input
                {...input("title", {
                  required: true,
                  maxLength: 120,
                  placeholder: "e.g. Volkswagen Golf 1.5 TSI",
                })}
              />
            </Field>
            <div className="form-grid">
              <Field label="Make">
                <input {...input("brand", { required: true, maxLength: 60 })} />
              </Field>
              <Field label="Model">
                <input {...input("model", { required: true, maxLength: 80 })} />
              </Field>
              <Field label="Year">
                <input
                  {...input("year", {
                    type: "number",
                    required: true,
                    min: 1950,
                    max: new Date().getFullYear() + 1,
                  })}
                />
              </Field>
              <Field label="Listing type">
                <select {...input("carType")}>
                  <option value="buy">For sale</option>
                  <option value="rent">For rent</option>
                </select>
              </Field>
              <Field
                label={
                  form.carType === "rent"
                    ? "Price per day (£)"
                    : "Asking price (£)"
                }
              >
                <input
                  {...input("pricePerDay", {
                    type: "number",
                    required: true,
                    min: 1,
                    step: "0.01",
                    max: 10000000,
                  })}
                />
              </Field>
              <Field label="Mileage (miles)">
                <input
                  {...input("mileage", {
                    type: "number",
                    required: true,
                    min: 0,
                    max: 2000000,
                  })}
                />
              </Field>
              <Field label="Fuel type">
                <select {...input("fuelType")}>
                  {["petrol", "diesel", "hybrid", "electric"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="Transmission">
                <select {...input("transmission")}>
                  <option value="manual">Manual</option>
                  <option value="automatic">Automatic</option>
                </select>
              </Field>
              <Field label="Body style">
                <select {...input("bodyType")}>
                  {[
                    "Hatchback",
                    "Saloon",
                    "SUV",
                    "Coupe",
                    "Convertible",
                    "Estate",
                    "Van",
                  ].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="Seats">
                <input
                  {...input("seats", {
                    type: "number",
                    min: 1,
                    max: 12,
                    required: true,
                  })}
                />
              </Field>
              <Field label="Previous owners">
                <input
                  {...input("previousOwners", {
                    type: "number",
                    min: 0,
                    max: 50,
                    required: true,
                  })}
                />
              </Field>
              <Field label="MOT expiry (optional)">
                <input {...input("mot", { type: "date" })} />
              </Field>
            </div>
          </div>
          <div>
            <div className="panel-heading">
              <h3>Vehicle gallery</h3>
              <span>
                {images.length} / {settings.maxImages}
              </span>
            </div>
            <p className="muted">
              Your first image is the cover. Select multiple photos at once,
              then choose their order.
            </p>
            <label
              className={`upload-zone ${uploading ? "is-uploading" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!busy) upload(e.dataTransfer.files);
              }}
            >
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                disabled={busy || uploading}
                onChange={(e) => {
                  upload(e.target.files);
                  e.target.value = "";
                }}
              />
              {uploading ? (
                <LoaderCircle className="spin" size={29} />
              ) : (
                <ImagePlus size={29} />
              )}
              <strong>{progress || "Drop your photos here"}</strong>
              <span>
                {uploading
                  ? "Please keep this window open"
                  : "or click to select multiple images"}
              </span>
              <small>
                JPG, PNG, WebP · {settings.maxImageMB} MB each · Automatically
                optimised
              </small>
            </label>
            <Button
              type="button"
              secondary
              className="image-library-toggle"
              onClick={() => setLibraryOpen((v) => !v)}
              aria-expanded={libraryOpen}
            >
              <ImagePlus size={17} />
              {libraryOpen
                ? "Hide original photos"
                : "Choose from original photos"}
            </Button>
            {libraryOpen && (
              <div className="image-library">
                <p>
                  The restored original photographs. Select images that match this
                  vehicle; the first gallery image is the cover.
                </p>
                <Notice error>{libraryError}</Notice>
                {libraryLoading && <Loading />}
                <div className="image-library-grid">
                  {library?.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      disabled={
                        uploading ||
                        busy ||
                        images.some((i) => i.url === item.url)
                      }
                      onClick={() => addBundled(item.key)}
                      aria-label={"Add " + item.label}
                    >
                      <img
                        src={item.thumbnail}
                        alt={item.label}
                        loading="lazy"
                      />
                      <span>
                        {images.some((i) => i.url === item.url)
                          ? "Added · "
                          : ""}
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="editor-gallery">
              {images.map((img, i) => (
                <div key={img._id}>
                  <Img src={img.url} alt={`Vehicle photo ${i + 1}`} />
                  {i === 0 && <span className="cover-label">Cover photo</span>}
                  <button
                    className="remove-photo"
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    disabled={uploading}
                    onClick={() => setImages(images.filter((_, n) => n !== i))}
                  >
                    <X size={15} />
                  </button>
                  <div>
                    <button
                      type="button"
                      disabled={i === 0 || uploading}
                      aria-label={`Move photo ${i + 1} earlier`}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={i === 0 || uploading}
                      onClick={() => cover(i)}
                    >
                      {i === 0 ? "Cover" : "Set cover"}
                    </button>
                    <button
                      type="button"
                      disabled={i === images.length - 1 || uploading}
                      aria-label={`Move photo ${i + 1} later`}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="editor-flags">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={form.isAvailable}
                  onChange={(e) => update("isAvailable", e.target.checked)}
                />
                Available for enquiries / rentals
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => update("featured", e.target.checked)}
                />
                Feature near the top of the collection
              </label>
            </div>
          </div>
        </div>
        <Field label="Description">
          <textarea
            {...input("description", {
              rows: 4,
              maxLength: 5000,
              placeholder:
                "Tell customers about this vehicle. Include verified details only.",
            })}
          />
        </Field>
        <Field label="Features (separate with commas)">
          <input
            {...input("features", {
              placeholder: "Bluetooth, Parking sensors, Air conditioning",
              maxLength: 3200,
            })}
          />
        </Field>
        <Notice error>{error}</Notice>
        <div className="editor-footer">
          <span>Changes appear on the website when you save.</span>
          <div>
            <Button
              type="button"
              secondary
              disabled={busy || uploading}
              onClick={close}
            >
              Cancel
            </Button>
            <Button disabled={busy || uploading}>
              {busy ? "Saving…" : "Save vehicle"}
              <Check size={18} />
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
function Bookings() {
  const [version, setVersion] = useState(0),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState("");
  const { data, loading, error } = useResource("/bookings", version);
  const filtered = data?.filter(
    (b) =>
      (!status || b.status === status) &&
      `${b.user?.name} ${b.car?.title} ${b.reference}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <AdminTitle
        title="Keep journeys moving."
        description="Review requests, confirm arrangements and manage rental dates."
      >
        <a
          className="button button-secondary"
          href="/api/admin/export/bookings"
          download
        >
          <Download size={17} />
          Export CSV
        </a>
      </AdminTitle>
      <div className="admin-toolbar">
        <div className="input-icon">
          <Search size={17} />
          <input
            aria-label="Search bookings"
            placeholder="Customer, vehicle or reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter booking status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {["pending", "confirmed", "completed", "cancelled"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <Notice error>{error}</Notice>
      ) : (
        <BookingList
          bookings={filtered}
          admin
          onChange={() => setVersion((v) => v + 1)}
        />
      )}
    </>
  );
}
function Enquiries() {
  const [version, setVersion] = useState(0),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const {
    data,
    loading,
    error: loadError,
  } = useResource("/admin/enquiries", version);
  async function update(id, status) {
    try {
      await api("/admin/enquiries/" + id, {
        method: "PATCH",
        body: { status },
      });
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <AdminTitle
        title="Start a conversation."
        description="Every customer enquiry, together in one inbox."
      />
      <div className="tabs">
        {[
          ["", "All enquiries"],
          ["new", "New"],
          ["contacted", "Contacted"],
          ["closed", "Closed"],
        ].map(([s, l]) => (
          <button
            className={s === status ? "active" : ""}
            key={s}
            onClick={() => setStatus(s)}
          >
            {l}
          </button>
        ))}
      </div>
      <Notice error>{error || loadError}</Notice>
      {loading ? (
        <Loading />
      ) : data?.filter((e) => !status || e.status === status).length ? (
        <div className="enquiry-grid">
          {data
            .filter((e) => !status || e.status === status)
            .map((e) => (
              <article className="panel enquiry-card" key={e._id}>
                <div className="panel-heading">
                  <div>
                    <h3>{e.name}</h3>
                    <small>
                      {day(e.createdAt)} · {e.type}
                    </small>
                  </div>
                  <Badge status={e.status} />
                </div>
                {e.carTitle && (
                  <Link className="enquiry-car" to={"/cars/" + e.carId}>
                    <CarFront size={17} />
                    {e.carTitle}
                    <ArrowUpRight size={15} />
                  </Link>
                )}
                <p className="preserve-lines">{e.message}</p>
                {e.deliveryMethod === "email_client" && <p className="fine-print">Email draft prepared. The customer sends it from their email app; delivery is not verified here.</p>}
                <div className="enquiry-contacts">
                  <a href={"mailto:" + e.email}>
                    <Mail size={16} />
                    {e.email}
                  </a>
                  {e.phone && (
                    <a href={"tel:" + e.phone.replace(/\s/g, "")}>
                      <Phone size={16} />
                      {e.phone}
                    </a>
                  )}
                </div>
                <div className="enquiry-footer">
                  <select
                    aria-label={`Status for enquiry from ${e.name}`}
                    value={e.status}
                    onChange={(x) => update(e._id, x.target.value)}
                  >
                    {["new", "contacted", "closed"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <a
                    className="text-link"
                    href={
                      "mailto:" +
                      e.email +
                      "?subject=" +
                      encodeURIComponent(
                        "Your R Racer enquiry" +
                          (e.carTitle ? " — " + e.carTitle : ""),
                      )
                    }
                  >
                    Reply by email
                    <ArrowUpRight size={16} />
                  </a>
                </div>
              </article>
            ))}
        </div>
      ) : (
        <Empty title="All clear for now">
          New customer enquiries will appear here.
        </Empty>
      )}
    </>
  );
}
function BusinessSettings() {
  const { settings, setSettings } = useApp();
  const [form, setForm] = useState(settings),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  useEffect(() => { if (!dirty) setForm(settings); }, [settings, dirty]);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const d = await api("/admin/settings", { method: "PUT", body: form });
      setSettings({ ...settings, ...d });
      setDirty(false);
      setSuccess(
        "Settings saved. Your contact details are updated across the website.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <AdminTitle
        title="Make it your own."
        description="Keep your dealership details accurate and up to date."
      />
      <form className="panel settings-form stack-form" onSubmit={submit} onChangeCapture={() => setDirty(true)}>
        <h3>Business details</h3>
        <div className="form-grid">
          {[
            ["name", "Business name", 100],
            ["phone", "Telephone", 30],
            ["email", "Email address", 254],
            ["enquiryEmail", "Enquiry recipient email", 254],
            ["whatsapp", "WhatsApp number (digits with country code)", 20],
          ].map(([key, label, max]) => (
            <Field
              key={key}
              label={label}
              type={key === "email" || key === "enquiryEmail" ? "email" : "text"}
              value={form[key] || ""}
              maxLength={max}
              required={key !== "whatsapp"}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          ))}
        </div>
        <Field
          label="Address"
          value={form.address}
          maxLength="250"
          required
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <Field
          label="Opening hours / viewing arrangements"
          value={form.hours}
          maxLength="150"
          required
          onChange={(e) => setForm({ ...form, hours: e.target.value })}
        />
        <Field
          label="Tagline"
          value={form.tagline}
          maxLength="150"
          onChange={(e) => setForm({ ...form, tagline: e.target.value })}
        />
        <Notice error>{error}</Notice>
        <Notice>{success}</Notice>
        <Button disabled={busy}>
          {busy ? "Saving…" : "Save business details"}
          <Check size={17} />
        </Button>
      </form>
      <div className="panel settings-account">
        <h3>Your administrator account</h3>
        <p>Change your name, profile photo or password from your account.</p>
        <Link className="text-link" to="/profile">
          Manage my account
          <ArrowUpRight size={17} />
        </Link>
      </div>
    </>
  );
}
