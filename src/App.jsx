import ContactActions from "./ContactActions";
import Motion from "./Motion";
import { useEffect, useState, lazy, Suspense } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowUpRight,
  Phone,
  MapPin,
  Menu,
  X,
  Heart,
  ArrowRight,
  LogOut,
  UserRound,
} from "lucide-react";
import { api, setCsrf } from "./api";
import { AppContext, Loading, Button, Notice } from "./ui";
import {
  Home,
  Fleet,
  CarDetail,
  About,
  Contact,
  AuthPage,
  Account,
  NotFound,
} from "./pages";
const Admin = lazy(() => import("./admin"));

const defaults = {
  name: "R Racer Ltd",
  phone: "+44 7400 020754",
  email: "alimoeezrawn@gmail.com",
  address: "Tower Mill, 125 Park Road, Dukinfield, SK16 5NA, United Kingdom",
  hours: "Viewings and collection by appointment",
  whatsapp: "447400020754",
  tagline: "Good cars. Great journeys.",
  maxImages: 30,
  maxImageMB: 10,
};
export function Logo({ variant = "header" }) {
  return (
    <Link
      to="/"
      className={`logo brand-logo brand-logo-${variant}`}
      aria-label="R Racer home"
    >
      <img
        src={`/brand/${variant}-logo.png`}
        alt="R Racer Ltd — unmatched quality, unbeatable prices"
        width={variant === "footer" ? 1779 : 2048}
        height={variant === "footer" ? 884 : 1018}
      />
    </Link>
  );
}
export default function App() {
  const [user, setUser] = useState(null),
    [authLoading, setAuthLoading] = useState(true),
    [settings, setSettings] = useState(defaults),
    [favorites, setFavorites] = useState([]),
    [toast, setToast] = useState("");
  const location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    api("/settings")
      .then(setSettings)
      .catch(() => {});
    api("/auth/me")
      .then((d) => {
        setUser(d.user);
        setCsrf(d.csrfToken);
      })
      .catch(() => {})
      .finally(() => setAuthLoading(false));
  }, []);
  useEffect(() => {
    if (user)
      api("/favorites")
        .then((c) => setFavorites(c.map((x) => x._id)))
        .catch(() => {});
    else setFavorites([]);
  }, [user]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(id);
    }
  }, [toast]);
  function signedIn(data) {
    setCsrf(data.csrfToken);
    setUser(data.user);
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (e) {
      if (e.status !== 401) {
        setToast("Sign out could not complete. Please try again.");
        return;
      }
    }
    setCsrf("");
    setUser(null);
    navigate("/");
  }
  async function toggleFavorite(id) {
    try {
      const data = await api("/favorites/" + id, { method: "POST" });
      setFavorites(data.favorites);
    } catch (e) {
      setToast(e.message);
    }
  }
  const context = {
    user,
    setUser,
    authLoading,
    settings,
    setSettings,
    favorites,
    toggleFavorite,
    notify: setToast,
    signedIn,
    logout,
  };
  const isAdmin = location.pathname.startsWith("/admin");
  return (
    <AppContext.Provider value={context}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {!isAdmin && <Header user={user} logout={logout} settings={settings} />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cars" element={<Fleet />} />
        <Route path="/rent" element={<Fleet intent="rent" />} />
        <Route path="/buy" element={<Fleet intent="buy" />} />
        <Route path="/cars/:id" element={<CarDetail />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        {["login", "sign-up", "forgot-password", "reset-password"].map((p) => (
          <Route key={p} path={"/" + p} element={<AuthPage mode={p} />} />
        ))}
        {["account", "profile", "user/profile", "user/bookings", "saved"].map(
          (p) => (
            <Route
              key={p}
              path={"/" + p}
              element={
                <Protected>
                  <Account />
                </Protected>
              }
            />
          ),
        )}
        <Route
          path="/admin/*"
          element={
            <Protected admin>
              <Suspense fallback={<Loading />}>
                <Admin />
              </Suspense>
            </Protected>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!isAdmin && (
        <>
          <Footer settings={settings} />
          <ContactActions floating />
          <Motion />
        </>
      )}
      <div className="toast-wrap" aria-live="polite">
        {toast && <Notice>{toast}</Notice>}
      </div>
    </AppContext.Provider>
  );
}
import { useApp } from "./ui";
function Protected({ children, admin = false }) {
  const { user, authLoading } = useApp();
  const location = useLocation();
  if (authLoading) return <Loading />;
  if (!user)
    return (
      <Navigate
        to={"/login?next=" + encodeURIComponent(location.pathname)}
        replace
      />
    );
  if (admin && user.role !== "admin") return <Navigate to="/account" replace />;
  return children;
}
function Header({ user, logout, settings }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  return (
    <>
      <div className="topline">
        <div className="container">
          <span>
            <MapPin size={12} />
            Dukinfield, Greater Manchester
          </span>
          <a href={"tel:" + settings.phone.replace(/\s/g, "")}>
            Let’s talk cars <Phone size={12} />
            {settings.phone}
          </a>
        </div>
      </div>
      <header className="site-header">
        <div className="container nav-inner">
          <Logo />
          <nav
            className={open ? "nav-links open" : "nav-links"}
            aria-label="Main navigation"
          >
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/buy">Buy a car</NavLink>
            <NavLink to="/rent">Rent a car</NavLink>
            <NavLink to="/about">Our story</NavLink>
            <NavLink to="/contact">Contact</NavLink>
            {user?.role === "admin" && (
              <NavLink to="/admin/dashboard">Dashboard</NavLink>
            )}
          </nav>
          <div className="nav-actions">
            <Link to="/saved" className="nav-heart" aria-label="Saved cars">
              <Heart size={19} />
            </Link>
            {user ? (
              <>
                <Link className="account-link" to="/account">
                  <UserRound size={17} />
                  <span>{user.name.split(" ")[0]}</span>
                </Link>
                <button
                  className="icon-button"
                  onClick={logout}
                  aria-label="Sign out"
                >
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <Link className="account-link" to="/login">
                Sign in
                <ArrowUpRight size={17} />
              </Link>
            )}
            <button
              className="menu-toggle"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
function Footer({ settings }) {
  return (
    <footer>
      <div className="container footer-main">
        <div>
          <Logo variant="footer" />
          <p>
            {settings.tagline}
            <br />
            Your next chapter starts here.
          </p>
          <a
            className="footer-phone"
            href={"tel:" + settings.phone.replace(/\s/g, "")}
          >
            {settings.phone}
            <ArrowUpRight size={19} />
          </a>
        </div>
        <div>
          <h4>Explore</h4>
          <Link to="/buy">Cars for sale</Link>
          <Link to="/rent">Self-drive rental</Link>
          <Link to="/about">Our story</Link>
          <Link to="/contact">Get in touch</Link>
        </div>
        <div>
          <h4>Your R Racer</h4>
          <Link to="/saved">Your shortlist</Link>
          <Link to="/user/bookings">Your bookings</Link>
          <Link to="/account">Your account</Link>
        </div>
        <div>
          <h4>Come and say hello</h4>
          <p>{settings.address}</p>
          <p>{settings.hours}</p>
          <a href={"mailto:" + settings.email}>{settings.email}</a>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} {settings.name}. All rights reserved.
        </span>
        <span>
          Made for the road ahead.
          <span className="red-dot" />
        </span>
      </div>
    </footer>
  );
}
