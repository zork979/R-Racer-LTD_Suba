import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  MapPin,
} from "lucide-react";
import { Eyebrow, Button } from "./ui";

const slides = [
  {
    image: "cars2-1.jpg",
    alt: "White Ford Mustang in an outdoor parking area",
    eyebrow: "YOUR ROAD. YOUR NEXT CHAPTER.",
    title: "Life moves.",
    ending: "Find your drive.",
    description:
      "A car for the everyday. A drive for the extraordinary. Your next chapter starts with R Racer.",
    to: "/buy",
    action: "Explore our cars",
    secondary: "/rent",
    secondaryLabel: "Looking to rent?",
    label: "The road ahead",
  },
  {
    image: "hero-1.jpeg",
    alt: "White Toyota Prius beside a tree-lined road",
    eyebrow: "LESS PLANNING. MORE LIVING.",
    title: "Make room",
    ending: "for the journey.",
    description:
      "A few days away or a change of pace. Find a self-drive rental and make the most of the road ahead.",
    to: "/rent",
    action: "Find your rental",
    secondary: "/contact",
    secondaryLabel: "Talk to our team",
    label: "Everyday freedom",
  },
  {
    image: "listing-1-1.jpg",
    alt: "Toyota RAV4 from the original vehicle collection",
    eyebrow: "FIND YOUR NEXT CHAPTER.",
    title: "New roads.",
    ending: "More possibilities.",
    description:
      "From the daily commute to the long way home. Explore our collection and find a car that feels like you.",
    to: "/buy",
    action: "Find your next car",
    secondary: "/about",
    secondaryLabel: "Get to know us",
    label: "Go a little further",
  },
];
export default function HeroCarousel() {
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false),
    [hidden, setHidden] = useState(false),
    [reduced, setReduced] = useState(
      () =>
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
        false,
    ),
    [announcement, setAnnouncement] = useState("");
  const touch = useRef(null);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(media?.matches || false);
    const visibility = () => setHidden(document.hidden);
    media?.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media?.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const running = !paused && !hovered && !focused && !hidden && !reduced;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % slides.length),
      7000,
    );
    return () => clearInterval(timer);
  }, [running, index]);
  function select(next) {
    const n = (next + slides.length) % slides.length;
    setIndex(n);
    setAnnouncement(`Slide ${n + 1} of ${slides.length}: ${slides[n].label}`);
  }
  const slide = slides[index];
  return (
    <section
      className={`hero rr-carousel ${reduced ? "reduced-motion" : ""}`}
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured journeys"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          select(index + 1);
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          select(index - 1);
        }
      }}
      onTouchStart={(e) => {
        touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        if (!touch.current) return;
        const dx = e.changedTouches[0].clientX - touch.current.x,
          dy = e.changedTouches[0].clientY - touch.current.y;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5)
          select(index + (dx < 0 ? 1 : -1));
        touch.current = null;
      }}
    >
      <div className="carousel-photos" aria-hidden="true">
        {slides.map((s, i) => (
          <img
            key={s.image}
            className={`carousel-photo ${i === index ? "is-current" : ""}`}
            src={`/media/${s.image}`}
            alt=""
            width="1536"
            height="1024"
            fetchPriority={i === 0 ? "high" : "low"}
          />
        ))}
      </div>
      <div className="hero-shade" />
      <div className="container carousel-layout">
        <div
          className="carousel-copy"
          key={index}
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${slides.length}`}
        >
          <Eyebrow light>{slide.eyebrow}</Eyebrow>
          <h1>
            {slide.title}
            <br />
            <em>{slide.ending}</em>
          </h1>
          <p>{slide.description}</p>
          <div className="hero-actions">
            <Button to={slide.to}>
              {slide.action}
              <ArrowUpRight size={19} />
            </Button>
            <Link to={slide.secondary}>
              {slide.secondaryLabel}
              <ArrowRight size={17} />
            </Link>
          </div>
        </div>
        <div className="carousel-footer">
          <div className="carousel-place">
            <MapPin size={18} />
            <span>
              Independent. Local. Personal.
              <small>Dukinfield, Greater Manchester</small>
            </span>
          </div>
          <div className="carousel-controls">
            <div
              className="carousel-dots"
              role="group"
              aria-label="Choose a slide"
            >
              {slides.map((s, i) => (
                <button
                  key={s.image}
                  type="button"
                  aria-label={`Show slide ${i + 1}: ${s.label}`}
                  aria-pressed={i === index}
                  onClick={() => select(i)}
                  className={i === index ? "active" : ""}
                >
                  <span />
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => select(index - 1)}
            >
              <ChevronLeft size={19} />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => select(index + 1)}
            >
              <ChevronRight size={19} />
            </button>
            {!reduced && (
              <button
                type="button"
                aria-label={paused ? "Play slideshow" : "Pause slideshow"}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? <Play size={15} /> : <Pause size={15} />}
              </button>
            )}
          </div>
        </div>
      </div>
      <span className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </section>
  );
}
