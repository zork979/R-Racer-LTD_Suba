import HeroCarousel from "./HeroCarousel";
import ContactActions from "./ContactActions";
import EmailDraft from "./EmailDraft";
import { reserveEmailWindow, openEmailDraft, closeEmailWindow } from "./email-handoff";
import { useEffect, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Heart,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  KeyRound,
  Settings2,
  Fuel,
  Gauge,
  Users,
  CalendarDays,
  Mail,
  CarFront,
  SlidersHorizontal,
  Eye,
  EyeOff,
  Upload,
  LoaderCircle,
} from "lucide-react";
import { api, money, day, today } from "./api";
import {
  useApp,
  useResource,
  Button,
  Notice,
  Loading,
  Empty,
  Img,
  Eyebrow,
  SectionTitle,
  CarCard,
  Field,
  Gallery,
  Badge,
  Dialog,
} from "./ui";

export function Home() {
  const { data: cars, loading, error } = useResource("/cars?limit=4");
  const [intent, setIntent] = useState("buy"),
    [brand, setBrand] = useState(""),
    [budget, setBudget] = useState("");
  const navigate = useNavigate();
  function search(e) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (brand) p.set("q", brand);
    if (budget) p.set("maxPrice", budget);
    navigate("/" + intent + "?" + p);
  }
  return (
    <main id="main">
      <HeroCarousel />
      <div className="container finder-wrap">
        <form className="finder" onSubmit={search}>
          <div className="finder-intent">
            <span>Make your next move</span>
            <div role="group" aria-label="Search listing type">
              <button
                type="button"
                className={intent === "buy" ? "active" : ""}
                onClick={() => {
                  setIntent("buy");
                  setBudget("");
                }}
              >
                Buy a car
              </button>
              <button
                type="button"
                className={intent === "rent" ? "active" : ""}
                onClick={() => {
                  setIntent("rent");
                  setBudget("");
                }}
              >
                Rent a car
              </button>
            </div>
          </div>
          <Field label="What are you looking for?">
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Any make or model"
            />
          </Field>
          <Field label={intent === "rent" ? "Daily budget" : "Your budget"}>
            <select value={budget} onChange={(e) => setBudget(e.target.value)}>
              <option value="">No maximum</option>
              {(intent === "rent"
                ? [50, 75, 100, 150, 250]
                : [2000, 3000, 4000, 5000, 10000, 15000, 20000, 30000]
              ).map((p) => (
                <option key={p} value={p}>
                  Up to {money(p)}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit">
            <Search size={19} />
            Find my car
          </Button>
        </form>
      </div>
      <div className="container assurance-strip">
        <span>
          <ShieldCheck />A personal approach
        </span>
        <span>
          <KeyRound />
          Buy or rent, your choice
        </span>
        <span>
          <MapPin />
          Local collection
        </span>
        <span>
          <Phone />
          People you can talk to
        </span>
      </div>
      <section className="section container">
        <SectionTitle
          eyebrow="THE COLLECTION"
          title="Good cars. Great possibilities."
          description="From the daily commute to a change of scenery. Find the car that fits."
          link="/cars"
        />
        {cars?.some((c) => c.isDemo) && (
          <div className="demo-note">
            Preview collection · Example vehicles and prices for demonstration
          </div>
        )}
        {loading ? (
          <Loading />
        ) : error ? (
          <Notice error>{error}</Notice>
        ) : cars?.length ? (
          <div className="car-grid home-grid">
            {cars.map((car) => (
              <CarCard key={car._id} car={car} />
            ))}
          </div>
        ) : (
          <Empty
            title="Your next car could be on its way"
            to="/contact"
            label="Talk to our team"
          >
            Tell us what you’re looking for and we’ll be happy to help.
          </Empty>
        )}
      </section>
      <section className="services-section">
        <div className="container">
          <SectionTitle
            eyebrow="MORE THAN A SET OF KEYS"
            title="A better way to get moving."
          />
          <div className="service-grid">
            {[
              [
                CarFront,
                "01",
                "Find your next car",
                "Explore pre-owned cars, compare the details and arrange a viewing with our team.",
                "Explore cars for sale",
                "/buy",
              ],
              [
                KeyRound,
                "02",
                "Make the most of today",
                "A few days away or a car for the week. Request a self-drive rental that works for you.",
                "Discover car rental",
                "/rent",
              ],
              [
                Phone,
                "03",
                "Let’s talk it through",
                "Questions about a car, collection or a longer rental? Speak to someone who can help.",
                "Meet your next move",
                "/contact",
              ],
            ].map(([Icon, n, title, desc, label, to]) => (
              <article className="service-card" key={n}>
                <div className="service-top">
                  <Icon size={31} />
                  <span>{n}</span>
                </div>
                <h3>{title}</h3>
                <p>{desc}</p>
                <Link className="text-link" to={to}>
                  {label}
                  <ArrowUpRight size={19} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section container story-split">
        <div className="story-photo">
          <Img
            src="/media/about-one-img-2.jpg"
            alt="A driver standing beside a car"
            loading="lazy"
          />
          <span>
            YOUR JOURNEY STARTS HERE
            <ArrowUpRight />
          </span>
        </div>
        <div className="story-copy">
          <Eyebrow>A LOCAL NAME. A PERSONAL TOUCH.</Eyebrow>
          <h2>
            Big on the journey.
            <br />
            <em>Better together.</em>
          </h2>
          <p>
            At R Racer, we believe finding a car should feel straightforward. A
            real conversation, clear vehicle details and time to find the right
            fit.
          </p>
          <p>
            From our home in Dukinfield, we help you take the next step —
            whether that’s a car to call your own or the keys to your next trip.
          </p>
          <Button secondary to="/about">
            Get to know R Racer
            <ArrowUpRight size={19} />
          </Button>
        </div>
      </section>
      <section className="container journey">
        <div>
          <Eyebrow light>THREE SIMPLE STEPS</Eyebrow>
          <h2>
            From here,
            <br />
            to wherever.
          </h2>
        </div>
        <div className="journey-steps">
          {[
            [
              "01",
              "Find your fit",
              "Browse the collection and shortlist your favourites.",
            ],
            [
              "02",
              "Make a connection",
              "Request a rental or arrange a viewing with our team.",
            ],
            [
              "03",
              "Take the next turn",
              "Confirm the details, collect your car and get moving.",
            ],
          ].map(([n, t, p]) => (
            <div key={n}>
              <span>{n}</span>
              <div>
                <h3>{t}</h3>
                <p>{p}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="section container faq-section">
        <SectionTitle
          eyebrow="A LITTLE CLARITY"
          title="Good questions. Clear answers."
        />
        <div className="faq-list">
          {[
            [
              "Can I view a car before buying?",
              "Yes. Use the enquiry form on a vehicle page or call our team to arrange a viewing in Dukinfield. Please confirm your appointment before travelling.",
            ],
            [
              "How does a rental request work?",
              "Choose an available rental car and your dates, then sign in to send a request. You can track its status in your account. The team will confirm the final arrangements; submitting a request does not take a payment.",
            ],
            [
              "What do I need to bring?",
              "Please speak with the team about the identification, driving licence, eligibility and deposit requirements for your chosen vehicle before collection.",
            ],
            [
              "Can you arrange delivery or a longer rental?",
              "Contact the team with your location and preferred dates. Delivery and longer rentals depend on availability and must be agreed in advance.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <ChevronDown size={20} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <ContactBand />
    </main>
  );
}
function ContactBand() {
  const { settings } = useApp();
  return (
    <section className="contact-band">
      <div className="container">
        <div>
          <Eyebrow light>THE NEXT MOVE IS YOURS</Eyebrow>
          <h2>Let’s find your kind of car.</h2>
        </div>
        <Button to="/contact">
          Talk to the team
          <ArrowUpRight size={20} />
        </Button>
      </div>
    </section>
  );
}

export function Fleet({ intent }) {
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const q = params.get("q") || "",
    type = intent || params.get("carType") || "";
  const page = Number(params.get("page") || 1);
  const query = new URLSearchParams(params);
  if (type) query.set("carType", type);
  query.set("format", "paged");
  query.set("limit", "9");
  const { data, loading, error } = useResource("/cars?" + query);
  const { data: catalog } = useResource("/catalog");
  useEffect(() => {
    document.title =
      (intent === "rent"
        ? "Rent a car"
        : intent === "buy"
          ? "Buy a car"
          : "Our cars") + " | R Racer Ltd";
  }, [intent]);
  const change = (key, value) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    if (key !== "page") p.delete("page");
    setParams(p, { replace: true });
  };
  return (
    <main id="main">
      <div className="page-intro">
        <div className="container">
          <div className="breadcrumbs">
            <Link to="/">Home</Link>
            <span>/</span>
            {intent === "rent"
              ? "Rent a car"
              : intent === "buy"
                ? "Buy a car"
                : "The collection"}
          </div>
          <Eyebrow>FIND YOUR NEXT CHAPTER</Eyebrow>
          <h1>
            {intent === "rent"
              ? "A great drive. On your terms."
              : intent === "buy"
                ? "Your next car starts here."
                : "Meet your next move."}
          </h1>
          <p>
            {intent === "rent"
              ? "Choose your car. Pick your dates. We’ll take it from there."
              : "Explore the details, save your favourites and find a car that feels like you."}
          </p>
        </div>
      </div>
      <section className="container fleet-layout">
        <button
          className="mobile-filter button button-secondary"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal size={18} />
          Filters
        </button>
        <aside className={`filter-panel ${filtersOpen ? "mobile-open" : ""}`}>
          <div className="filter-title">
            <h3>Find your fit</h3>
            <SlidersHorizontal size={19} />
          </div>
          <Field label="Make or model">
            <div className="input-icon">
              <Search size={17} />
              <input
                aria-label="Make or model"
                value={q}
                onChange={(e) => change("q", e.target.value)}
                placeholder="Search cars"
              />
            </div>
          </Field>
          {!intent && (
            <Field label="I’m looking to">
              <select
                value={type}
                onChange={(e) => change("carType", e.target.value)}
              >
                <option value="">Buy or rent</option>
                <option value="buy">Buy a car</option>
                <option value="rent">Rent a car</option>
              </select>
            </Field>
          )}
          <Field label="Make">
            <select
              value={params.get("brand") || ""}
              onChange={(e) => change("brand", e.target.value)}
            >
              <option value="">All makes</option>
              {catalog?.brands.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field label="Body style">
            <select
              value={params.get("bodyType") || ""}
              onChange={(e) => change("bodyType", e.target.value)}
            >
              <option value="">Any body style</option>
              {[
                "Hatchback",
                "Saloon",
                "SUV",
                "Coupe",
                "Convertible",
                "Estate",
                "Van",
              ].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field
            label={
              type === "rent" ? "Maximum daily price (£)" : "Maximum price (£)"
            }
          >
            <input
              type="number"
              min="0"
              value={params.get("maxPrice") || ""}
              onChange={(e) => change("maxPrice", e.target.value)}
              placeholder="No maximum"
            />
          </Field>
          <Field label="Fuel type">
            <select
              value={params.get("fuelType") || ""}
              onChange={(e) => change("fuelType", e.target.value)}
            >
              <option value="">Any fuel type</option>
              {["petrol", "diesel", "hybrid", "electric"].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Transmission">
            <select
              value={params.get("transmission") || ""}
              onChange={(e) => change("transmission", e.target.value)}
            >
              <option value="">Any transmission</option>
              <option value="automatic">Automatic</option>
              <option value="manual">Manual</option>
            </select>
          </Field>
          <label className="check-label">
            <input
              type="checkbox"
              checked={params.get("available") === "true"}
              onChange={(e) =>
                change("available", e.target.checked ? "true" : "")
              }
            />
            Available cars only
          </label>
          <button className="text-link" onClick={() => setParams({})}>
            Reset filters
          </button>
          <div className="filter-help">
            <Phone size={23} />
            <h4>Need a hand choosing?</h4>
            <p>We’re here to help you find the right fit.</p>
            <Link to="/contact">
              Talk to our team
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </aside>
        <div className="fleet-results">
          <div className="results-toolbar">
            <span>
              <strong>{data?.total ?? 0}</strong> cars to explore
            </span>
            <label>
              Sort by{" "}
              <select
                aria-label="Sort cars"
                value={params.get("sort") || ""}
                onChange={(e) => change("sort", e.target.value)}
              >
                <option value="">Featured first</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="year">Newest year</option>
              </select>
            </label>
          </div>
          {data?.cars?.some((c) => c.isDemo) && (
            <div className="demo-note">
              Demo inventory · Example prices and specifications
            </div>
          )}
          {loading ? (
            <Loading />
          ) : error ? (
            <Notice error>{error}</Notice>
          ) : data?.cars?.length ? (
            <>
              <div className="car-grid">
                {data.cars.map((car) => (
                  <CarCard key={car._id} car={car} />
                ))}
              </div>
              {data.pages > 1 && (
                <div className="pagination">
                  <Button
                    secondary
                    disabled={page <= 1}
                    onClick={() => change("page", String(page - 1))}
                  >
                    <ChevronLeft size={17} />
                    Previous
                  </Button>
                  <span>
                    {page} / {data.pages}
                  </span>
                  <Button
                    secondary
                    disabled={page >= data.pages}
                    onClick={() => change("page", String(page + 1))}
                  >
                    Next
                    <ChevronRight size={17} />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <Empty title="No cars match just yet">
              Try a different make, budget or filter. You can also get in touch
              with our team.
            </Empty>
          )}
        </div>
      </section>
      <ContactBand />
    </main>
  );
}

export function CarDetail() {
  const { id } = useParams();
  const { data: car, loading, error } = useResource("/cars/" + id);
  const { user, favorites, toggleFavorite, settings } = useApp();
  const [params] = useSearchParams();
  const [start, setStart] = useState(params.get("startDate") || ""),
    [end, setEnd] = useState(params.get("endDate") || ""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState(""),
    [success, setSuccess] = useState(null);
  const [enquiry, setEnquiry] = useState(params.get("enquire") === "1");
  useEffect(() => {
    if (car) document.title = car.title + " | R Racer Ltd";
  }, [car]);
  const days =
    start && end
      ? Math.max(0, (Date.parse(end) - Date.parse(start)) / 86400000)
      : 0;
  const { data: availability, error: availabilityError } = useResource(
    car?.carType === "rent" && start && end && days > 0
      ? `/cars/${id}/availability?startDate=${start}&endDate=${end}`
      : null,
  );
  async function reserve(e) {
    e.preventDefault();
    if (busy) return;
    const emailWindow = reserveEmailWindow();
    setBusy(true);
    setFeedback("");
    try {
      const d = await api("/bookings", {
        method: "POST",
        body: { carId: id, startDate: start, endDate: end, message },
      });
      setSuccess(d);
      openEmailDraft(emailWindow, d.emailDraft);
    } catch (e) {
      closeEmailWindow(emailWindow);
      setFeedback(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main id="main" className="container">
        <Loading />
      </main>
    );
  if (error || !car)
    return (
      <main id="main" className="container section">
        <Notice error>{error || "Vehicle not found."}</Notice>
        <Button to="/cars">Back to cars</Button>
      </main>
    );
  return (
    <main id="main" className="detail-page">
      <div className="container">
        <div className="breadcrumbs">
          <Link to="/">Home</Link>
          <span>/</span>
          <Link to={"/" + car.carType}>
            {car.carType === "rent" ? "Rent a car" : "Buy a car"}
          </Link>
          <span>/</span>
          {car.title}
        </div>
        <div className="detail-heading">
          <div>
            <Eyebrow>
              {car.year} · {car.bodyType} ·{" "}
              {car.carType === "rent" ? "SELF-DRIVE" : "PRE-OWNED"}
            </Eyebrow>
            <h1>{car.title}</h1>
            <p>
              {car.transmission} · {car.fuelType} ·{" "}
              {Number(car.mileage).toLocaleString()} miles
            </p>
          </div>
          <Button
            secondary
            to={
              !user
                ? "/login?next=" + encodeURIComponent("/cars/" + id)
                : undefined
            }
            onClick={user ? () => toggleFavorite(id) : undefined}
          >
            <Heart
              size={17}
              fill={favorites.includes(id) ? "currentColor" : "none"}
            />
            {favorites.includes(id) ? "Saved to shortlist" : "Save this car"}
          </Button>
        </div>
        {car.isDemo && (
          <div className="demo-note">
            Demonstration vehicle · Details and pricing are examples, not live
            stock
          </div>
        )}
        <div className="detail-layout">
          <div>
            <Gallery key={car._id} car={car} />
            <div className="spec-grid">
              {[
                [CalendarDays, "Year", car.year],
                [
                  Gauge,
                  "Mileage",
                  Number(car.mileage).toLocaleString() + " mi",
                ],
                [Fuel, "Fuel type", car.fuelType],
                [Settings2, "Transmission", car.transmission],
                [Users, "Seats", car.seats],
                [ShieldCheck, "MOT", car.mot ? day(car.mot) : "Ask our team"],
              ].map(([Icon, l, v]) => (
                <div key={l}>
                  <Icon size={21} />
                  <small>{l}</small>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            <div className="detail-description">
              <h2>A closer look</h2>
              <p className="preserve-lines">
                {car.description ||
                  "Contact our team for more information about this vehicle."}
              </p>
              <p>Previous owners: {car.previousOwners ?? "Please enquire"}</p>
              {car.features?.length > 0 && (
                <>
                  <h3>Features you’ll appreciate</h3>
                  <ul className="features-list">
                    {car.features.map((f, i) => (
                      <li key={i}>
                        <CheckCircle2 size={18} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
          <aside className="booking-card">
            <div className="booking-price">
              <small>
                {car.carType === "rent"
                  ? "YOUR NEXT ADVENTURE"
                  : "MAKE IT YOURS"}
              </small>
              <div>
                <strong>{money(car.pricePerDay)}</strong>
                {car.carType === "rent" && <span> / day</span>}
              </div>
              <span className={`availability ${car.isAvailable ? "" : "off"}`}>
                <i />
                {car.isAvailable
                  ? "Available for " +
                    (car.carType === "rent" ? "rental requests" : "viewing")
                  : "Currently unavailable"}
              </span>
            </div>
            {car.carType === "rent" ? (
              success ? (
                <div className="booking-success">
                  <h3>Your rental request is saved.</h3>
                  <p>
                    Request <strong>{success.booking.reference}</strong> is pending.
                    We’ll confirm the arrangements before collection.
                  </p>
                  <Badge status="pending" />
                  <EmailDraft draft={success.emailDraft} />
                  <Button to="/user/bookings">
                    View my bookings
                    <ArrowRight size={17} />
                  </Button>
                </div>
              ) : (
                <form onSubmit={reserve}>
                  <div className="form-grid">
                    <Field
                      label="Pick-up date"
                      type="date"
                      min={today()}
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      required
                    />
                    <Field
                      label="Return date"
                      type="date"
                      min={start || today()}
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      required
                    />
                  </div>
                  <Field label="Anything we should know? (optional)">
                    <textarea
                      rows="3"
                      maxLength="2000"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell us about your plans"
                    />
                  </Field>
                  {days > 0 && (
                    <div className="price-breakdown">
                      <span>
                        {days} day{days !== 1 ? "s" : ""} ×{" "}
                        {money(car.pricePerDay)}
                      </span>
                      <strong>{money(days * car.pricePerDay)}</strong>
                    </div>
                  )}
                  {availability && !availability.available && (
                    <Notice error>
                      Those dates are unavailable. Please choose another period.
                    </Notice>
                  )}
                  <Notice error>{feedback || availabilityError}</Notice>
                  {user ? (
                    <Button
                      className="full"
                      disabled={
                        busy ||
                        !car.isAvailable ||
                        (availability && !availability.available) ||
                        days < 1 ||
                        days > 90
                      }
                    >
                      {busy ? "Preparing email…" : "Request this car & open Gmail"}
                      <ArrowUpRight size={17} />
                    </Button>
                  ) : (
                    <Button
                      className="full"
                      to={
                        "/login?next=" +
                        encodeURIComponent(
                          `/cars/${id}?startDate=${start}&endDate=${end}`,
                        )
                      }
                    >
                      Sign in to request
                      <ArrowUpRight size={17} />
                    </Button>
                  )}
                  <p className="fine-print">
                    Gmail opens with your car, dates and contact details. Click Send
                    there to email our team. Another email app is available afterwards.
                    {" "}
                    No online payment. Requests are subject to confirmation,
                    eligibility and the rental terms agreed with our team.
                    Rental days run from pick-up date to return date, excluding
                    return day.
                  </p>
                </form>
              )
            ) : (
              <>
                <p>
                  Take a closer look. Send an enquiry and arrange a time to see
                  this car in person.
                </p>
                <Button className="full" onClick={() => setEnquiry(true)}>
                  Arrange a viewing
                  <ArrowUpRight size={18} />
                </Button>
                <p className="fine-print">
                  Your enquiry is not a purchase or deposit. Our team will
                  confirm the vehicle details with you.
                </p>
              </>
            )}
            <div className="booking-contact">
              <span>Prefer a conversation?</span>
              <ContactActions car={car} startDate={start} endDate={end} />
              {car.carType === "rent" && (
                <button
                  className="text-link rental-enquiry-link"
                  onClick={() => setEnquiry(true)}
                >
                  Ask about this rental <ArrowUpRight size={16} />
                </button>
              )}
              <small>
                <MapPin size={14} />
                Collection in Dukinfield
              </small>
            </div>
          </aside>
        </div>
      </div>
      <Dialog
        open={enquiry}
        onClose={() => setEnquiry(false)}
        title={"Enquire about " + car.title}
      >
        <EnquiryForm car={car} />
      </Dialog>
    </main>
  );
}

export function EnquiryForm({ car }) {
  const { user, authLoading } = useApp();
  const [sessionExpired,setSessionExpired]=useState(false);
  const next=car?`/cars/${car._id}?enquire=1`:'/contact';
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const emailWindow = reserveEmailWindow();
    setBusy(true);
    setError("");
    try {
      const r = await api("/enquiries", {
        method: "POST",
        body: {
          ...body,
          carId: car?._id,
          type: car
            ? car.carType === "rent"
              ? "rental"
              : "purchase"
            : "general",
        },
      });
      if (!r.emailDraft) throw new Error("The email draft could not be prepared. Refresh the page and try again.");
      setSuccess(r.emailDraft);
      openEmailDraft(emailWindow, r.emailDraft);
    } catch (e) {
      closeEmailWindow(emailWindow);
      if(e.status===401)setSessionExpired(true);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if(authLoading)return <Loading/>;
  if(!user||sessionExpired)return <div className="enquiry-signin">
    <span className="enquiry-lock"><ShieldCheck size={26}/></span>
    <h3>Sign in to send an enquiry</h3>
    <p>{car?`Sign in or create an account to ask about the ${car.title}.`:'Sign in or create an account to message our team.'} You can return here after signing in.</p>
    <div className="enquiry-signin-actions"><Button to={'/login?next='+encodeURIComponent(next)}>Sign in to enquire<ArrowUpRight size={18}/></Button><Button secondary to={'/sign-up?next='+encodeURIComponent(next)}>Create an account</Button></div>
    <p className="fine-print">Your account email will be included so our team can contact you.</p>
  </div>;
  if (success) return <EmailDraft draft={success} />;
  return (
    <form onSubmit={submit} className="stack-form">
      {car && <div className="enquiry-vehicle-summary">
        <span>{car.carType === "rent" ? "RENTAL ENQUIRY" : "PURCHASE ENQUIRY"}</span>
        <strong>{car.title}</strong>
        <p>{car.year} · {car.transmission} · {car.fuelType}</p>
        <small>{money(car.pricePerDay)}{car.carType === "rent" ? " / day" : " asking price"}</small>
      </div>}
      <div className="form-grid">
        <Field
          label="Your name"
          name="name"
          defaultValue={user?.name}
          autoComplete="name"
          maxLength="100"
          required
        />
        <Field
          label="Email address"
          name="email"
          type="email"
          value={user.email}
          readOnly
          autoComplete="email"
          maxLength="254"
          required
        />
      </div>
      <p className="fine-print account-email-note">Your account email is included in the draft so our team can contact you.</p>
      <Field
        label="Phone number (optional)"
        name="phone"
        type="tel"
        defaultValue={user?.phone}
        autoComplete="tel"
        maxLength="30"
      />
      <Field label="How can we help?">
        <textarea
          name="message"
          rows="5"
          maxLength="3000"
          defaultValue={
            car
              ? `Hello, I am interested in ${car.carType === "rent" ? "renting" : "buying"} the ${car.title}. Please let me know more details.`
              : ""
          }
          placeholder="Tell us what you have in mind"
          required
        />
      </Field>
      <div className="honeypot" aria-hidden="true">
        <input name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <Notice error>{error}</Notice>
      <p className="fine-print">
        We’ll save your enquiry and open Gmail with your message and contact
        details filled in. Click Send in Gmail to email our team. You can also
        choose another email app on the next screen.
      </p>
      <Button disabled={busy}>
        {busy ? "Preparing email…" : "Continue to Gmail"}
        <ArrowUpRight size={18} />
      </Button>
    </form>
  );
}
export function Contact() {
  const { settings } = useApp();
  return (
    <main id="main">
      <div className="page-intro">
        <div className="container">
          <Eyebrow>GOOD CONVERSATIONS START HERE</Eyebrow>
          <h1>Let’s talk about your next drive.</h1>
          <p>
            Have a car in mind? A question to ask? We’re ready when you are.
          </p>
        </div>
      </div>
      <section className="section container contact-layout">
        <div>
          <h2>
            A real team.
            <br />A warm welcome.
          </h2>
          <div className="contact-details">
            <a href={"tel:" + settings.phone.replace(/\s/g, "")}>
              <Phone />
              <div>
                <small>Give us a call</small>
                <strong>{settings.phone}</strong>
              </div>
              <ArrowUpRight />
            </a>
            <a href={"mailto:" + settings.email}>
              <Mail />
              <div>
                <small>Drop us a line</small>
                <strong>{settings.email}</strong>
              </div>
              <ArrowUpRight />
            </a>
            <a
              href={
                "https://www.google.com/maps/search/?api=1&query=" +
                encodeURIComponent(settings.address)
              }
              target="_blank"
              rel="noreferrer"
            >
              <MapPin />
              <div>
                <small>Come and see us</small>
                <strong>{settings.address}</strong>
              </div>
              <ArrowUpRight />
            </a>
            <div>
              <Clock />
              <div>
                <small>Plan your visit</small>
                <strong>{settings.hours}</strong>
              </div>
            </div>
          </div>
          {settings.whatsapp && (
            <a
              className="text-link"
              href={"https://wa.me/" + settings.whatsapp}
              target="_blank"
              rel="noreferrer"
            >
              Chat with us on WhatsApp
              <ArrowUpRight size={18} />
            </a>
          )}
        </div>
        <div className="contact-form">
          <h3>Tell us what you’re looking for.</h3>
          <EnquiryForm />
        </div>
      </section>
    </main>
  );
}
export function About() {
  return (
    <main id="main">
      <div className="page-intro">
        <div className="container">
          <Eyebrow>HELLO. WE’RE R RACER.</Eyebrow>
          <h1>
            For the people.
            <br />
            For the journey.
          </h1>
          <p>
            A local car business with a simple idea: finding your next car
            should feel good.
          </p>
        </div>
      </div>
      <section className="section container story-split">
        <div className="story-photo">
          <Img
            src="/media/about-one-img-2.jpg"
            alt="Silver Ford Mustang beside modern architecture"
          />
        </div>
        <div className="story-copy">
          <Eyebrow>ROOTED IN DUKINFIELD</Eyebrow>
          <h2>
            Your next car.
            <br />
            <em>Our personal attention.</em>
          </h2>
          <p>
            R Racer Ltd offers pre-owned car sales and self-drive rental from
            Dukinfield, Greater Manchester.
          </p>
          <p>
            Whether you’re buying a car for everyday life or looking for a
            rental for your next trip, our team is here to talk through your
            options, arrange a viewing and help you plan collection.
          </p>
          <p>
            We keep the conversation straightforward. Ask about a vehicle, check
            the details and take the next step when you’re ready.
          </p>
          <Button to="/contact">
            Come and say hello
            <ArrowUpRight size={18} />
          </Button>
        </div>
      </section>
      <section className="container values-row">
        {[
          [
            Phone,
            "A conversation, first",
            "Tell us what matters to you. We’ll help you explore the options.",
          ],
          [
            Search,
            "Room to take a closer look",
            "View the details, ask your questions and arrange a visit.",
          ],
          [
            MapPin,
            "A local place to start",
            "Meet our team in Dukinfield and plan your collection with us.",
          ],
        ].map(([Icon, title, p]) => (
          <article key={title}>
            <Icon />
            <h3>{title}</h3>
            <p>{p}</p>
          </article>
        ))}
      </section>
      <ContactBand />
    </main>
  );
}

export function AuthPage({ mode }) {
  const { signedIn } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [show, setShow] = useState(false);
  useEffect(() => {
    setError("");
    setMessage("");
  }, [mode]);
  const signup = mode === "sign-up",
    forgot = mode === "forgot-password",
    reset = mode === "reset-password";
  const title = signup
    ? "Your journey starts here."
    : forgot
      ? "Let’s get you back in."
      : reset
        ? "A fresh start."
        : "Good to see you again.";
  async function submit(e) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (forgot) {
        const d = await api("/auth/forgot_password", {
          method: "POST",
          body: values,
        });
        setMessage(d.message);
      } else if (reset) {
        const d = await api("/auth/reset_password", {
          method: "POST",
          body: { ...values, token: params.get("token") },
        });
        setMessage(d.message);
      } else {
        const d = await api("/auth/" + (signup ? "signup" : "login"), {
          method: "POST",
          body: values,
        });
        signedIn(d);
        const next = params.get("next");
        navigate(
          next?.startsWith("/") && !next.startsWith("//")
            ? next
            : d.user.role === "admin"
              ? "/admin/dashboard"
              : "/account",
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="auth-layout">
      <div className="auth-visual">
        <Img src="/media/listing-1-4.jpg" alt="Chevrolet Camaro from the original collection" />
        <div>
          <Eyebrow light>R RACER LTD</Eyebrow>
          <h2>
            More than a car.
            <br />
            <em>Your next chapter.</em>
          </h2>
          <p>Save your favourites. Plan your journey. Make your next move.</p>
        </div>
      </div>
      <div className="auth-panel">
        <Link className="back-link" to="/">
          <ChevronLeft size={17} />
          Back to the road
        </Link>
        <Eyebrow>{signup ? "WELCOME TO R RACER" : "YOUR R RACER"}</Eyebrow>
        <h1>{title}</h1>
        <p>
          {signup
            ? "Create your account to save cars and request rentals."
            : forgot
              ? "Enter your email and we’ll send you a link to reset your password."
              : reset
                ? "Choose a new password for your account."
                : "Sign in to your account and pick up where you left off."}
        </p>
        <form className="stack-form" onSubmit={submit} key={mode}>
          {signup && (
            <Field
              label="Your name"
              name="name"
              autoComplete="name"
              maxLength="100"
              required
            />
          )}
          {!reset && (
            <Field
              label="Email address"
              type="email"
              name="email"
              autoComplete="email"
              required
            />
          )}
          {signup && (
            <Field
              label="Phone number"
              name="phone"
              type="tel"
              autoComplete="tel"
              maxLength="30"
              required
            />
          )}
          {!forgot && (
            <Field label={reset ? "New password" : "Password"}>
              <div className="password-field">
                <input
                  type={show ? "text" : "password"}
                  name={reset ? "newPassword" : "password"}
                  autoComplete={
                    signup || reset ? "new-password" : "current-password"
                  }
                  minLength={signup || reset ? 10 : undefined}
                  maxLength="72"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </Field>
          )}
          {(signup || reset) && (
            <small className="muted">Use at least 10 characters.</small>
          )}
          {!signup && !forgot && !reset && (
            <Link className="auth-forgot" to="/forgot-password">
              Forgot your password?
            </Link>
          )}
          <Notice error>{error}</Notice>
          <Notice>{message}</Notice>
          {!(reset && message) && (
            <Button className="full" disabled={busy}>
              {busy
                ? "Please wait…"
                : signup
                  ? "Create my account"
                  : forgot
                    ? "Send reset link"
                    : reset
                      ? "Set new password"
                      : "Sign in"}
              <ArrowRight size={18} />
            </Button>
          )}
          {reset && message && <Button to="/login">Go to sign in</Button>}
        </form>
        <div className="auth-switch">
          {signup ? (
            <>
              Already part of the journey? <Link to={"/login"+(params.get("next")?"?next="+encodeURIComponent(params.get("next")):"")}>Sign in</Link>
            </>
          ) : forgot || reset ? (
            <Link to="/login">Back to sign in</Link>
          ) : (
            <>
              New here?{" "}
              <Link
                to={
                  "/sign-up" +
                  (params.get("next")
                    ? "?next=" + encodeURIComponent(params.get("next"))
                    : "")
                }
              >
                Create an account
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export function BookingList({ bookings, onChange, admin = false }) {
  const [selected, setSelected] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function change(id, status) {
    setBusy(true);
    setError("");
    try {
      await api("/bookings/" + id + "/status", {
        method: "PATCH",
        body: { status },
      });
      setSelected(null);
      onChange();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!bookings?.length)
    return (
      <Empty title="The road is waiting" to="/rent" label="Explore rental cars">
        Your rental requests will appear here.
      </Empty>
    );
  return (
    <>
      <Notice error>{error}</Notice>
      <div className="booking-list">
        {bookings.map((b) => (
          <article key={b._id} className="booking-row">
            <Img
              src={b.car?.images?.[0]?.url}
              alt={b.car?.title || "Vehicle"}
            />
            <div className="booking-row-main">
              <span className="booking-ref">{b.reference}</span>
              <h3>{b.car?.title || "Archived vehicle"}</h3>
              <p>
                {day(b.startDate)} → {day(b.endDate)}
                <span> · {b.days} days</span>
              </p>
              {admin && (
                <p>
                  {b.user?.name} ·{" "}
                  <a href={"mailto:" + b.user?.email}>{b.user?.email}</a> ·{" "}
                  {b.user?.phone}
                </p>
              )}
              {b.message && <small>{b.message}</small>}
            </div>
            <div className="booking-row-end">
              <Badge status={b.status} />
              <strong>{money(b.total)}</strong>
              <div className="booking-row-actions">
                {admin && b.status === "pending" && (
                  <button
                    disabled={busy}
                    onClick={() => change(b._id, "confirmed")}
                  >
                    Confirm
                  </button>
                )}
                {admin && b.status === "confirmed" && (
                  <button
                    disabled={busy}
                    onClick={() => change(b._id, "completed")}
                  >
                    Complete
                  </button>
                )}
                {["pending", "confirmed"].includes(b.status) && (
                  <button
                    className="danger-link"
                    disabled={busy}
                    onClick={() => setSelected(b)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      <Dialog
        open={!!selected}
        title="Cancel this booking?"
        onClose={() => setSelected(null)}
      >
        <p>
          This will cancel {selected?.reference} and release the reserved dates.
          Contact the dealership about any separate payment arrangements.
        </p>
        <div className="dialog-actions">
          <Button secondary onClick={() => setSelected(null)}>
            Keep booking
          </Button>
          <Button
            disabled={busy}
            onClick={() => change(selected._id, "cancelled")}
          >
            Cancel booking
          </Button>
        </div>
      </Dialog>
    </>
  );
}
export function Account() {
  const { user, setUser, signedIn } = useApp();
  const location = useLocation();
  const [tab, setTab] = useState(
    location.pathname === "/saved"
      ? "saved"
      : location.pathname.includes("profile")
        ? "profile"
        : "bookings",
  );
  const [version, setVersion] = useState(0);
  useEffect(
    () =>
      setTab(
        location.pathname === "/saved"
          ? "saved"
          : location.pathname.includes("profile")
            ? "profile"
            : "bookings",
      ),
    [location.pathname],
  );
  const {
    data: bookings,
    loading,
    error,
  } = useResource(tab === "bookings" ? "/bookings" : null, version);
  const { data: saved, loading: savedLoading } = useResource(
    tab === "saved" ? "/favorites" : null,
    version,
  );
  const [feedback, setFeedback] = useState(""),
    [formError, setFormError] = useState(""),
    [busy, setBusy] = useState(false);
  async function profile(e) {
    e.preventDefault();
    setBusy(true);
    setFeedback("");
    setFormError("");
    try {
      const d = await api("/auth/profile", {
        method: "PUT",
        body: Object.fromEntries(new FormData(e.currentTarget)),
      });
      setUser(d.user);
      setFeedback("Your profile has been updated.");
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function changePassword(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setFeedback("");
    setFormError("");
    try {
      const d = await api("/auth/change_password", {
        method: "PUT",
        body: Object.fromEntries(new FormData(form)),
      });
      signedIn(d);
      form.reset();
      setFeedback(d.message);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function avatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("image", file);
    setBusy(true);
    try {
      const d = await api("/auth/avatar", { method: "POST", body: fd });
      setUser(d.user);
      setFeedback("Profile photo updated.");
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main">
      <div className="page-intro">
        <div className="container">
          <Eyebrow>YOUR R RACER</Eyebrow>
          <h1>Hello, {user.name.split(" ")[0]}.</h1>
          <p>Your favourites, your bookings, your next chapter.</p>
        </div>
      </div>
      <section className="container section account-section">
        <div className="tabs" role="tablist" aria-label="Your account">
          {[
            ["bookings", "My bookings"],
            ["saved", "Saved cars"],
            ["profile", "My profile"],
          ].map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                setFeedback("");
                setFormError("");
                setVersion((v) => v + 1);
              }}
              className={tab === id ? "active" : ""}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "bookings" &&
          (loading ? (
            <Loading />
          ) : error ? (
            <Notice error>{error}</Notice>
          ) : (
            <BookingList
              bookings={bookings}
              onChange={() => setVersion((v) => v + 1)}
            />
          ))}
        {tab === "saved" &&
          (savedLoading ? (
            <Loading />
          ) : saved?.length ? (
            <div className="car-grid">
              {saved.map((c) => (
                <CarCard key={c._id} car={c} />
              ))}
            </div>
          ) : (
            <Empty title="Keep your favourites close" to="/cars">
              Tap the heart on a car to save it to your shortlist.
            </Empty>
          ))}
        {tab === "profile" && (
          <>
            <Notice>{feedback}</Notice>
            <Notice error>{formError}</Notice>
            <div className="profile-grid">
              <div className="panel">
                <h3>A little about you</h3>
                <div className="avatar-row">
                  {user.image ? (
                    <Img
                      className="avatar"
                      src={user.image}
                      alt="Your profile"
                    />
                  ) : (
                    <span className="avatar initials">{user.name[0]}</span>
                  )}
                  <label className="button button-secondary">
                    Change photo
                    <input
                      className="visually-hidden"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={avatar}
                      disabled={busy}
                    />
                  </label>
                </div>
                <form className="stack-form" onSubmit={profile}>
                  <Field
                    label="Name"
                    name="name"
                    defaultValue={user.name}
                    maxLength="100"
                    required
                  />
                  <Field
                    label="Phone"
                    name="phone"
                    type="tel"
                    defaultValue={user.phone}
                    maxLength="30"
                    required
                  />
                  <Field label="Email" value={user.email} disabled />
                  <Button disabled={busy}>Save profile</Button>
                </form>
              </div>
              <div className="panel">
                <h3>Keep your account secure</h3>
                <form className="stack-form" onSubmit={changePassword}>
                  <Field
                    label="Current password"
                    name="oldPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                  <Field
                    label="New password"
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength="10"
                    maxLength="72"
                    required
                  />
                  <p className="fine-print">
                    Use at least 10 characters. Changing your password signs out
                    your other sessions.
                  </p>
                  <Button disabled={busy}>Update password</Button>
                </form>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
export function NotFound() {
  return (
    <main id="main" className="container section">
      <Empty title="A little off the beaten track." to="/" label="Back to home">
        We couldn’t find that page. Let’s get you back on the road.
      </Empty>
    </main>
  );
}
