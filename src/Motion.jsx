import { useEffect } from "react";
import { useLocation } from "react-router-dom";
export default function Motion() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (
      !window.IntersectionObserver ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const seen = new WeakSet();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(({ target, isIntersecting }) => {
          if (isIntersecting) {
            target.classList.add("in-view");
            observer.unobserve(target);
          }
        });
      },
      { threshold: 0.08 },
    );
    function discover() {
      document
        .querySelectorAll(
          "main .section-heading, main .car-card, main .story-split, main .service-card, main .journey-step",
        )
        .forEach((el) => {
          if (seen.has(el)) return;
          seen.add(el);
          el.classList.add("reveal");
          observer.observe(el);
        });
    }
    discover();
    const mutations = new MutationObserver(discover);
    mutations.observe(document.getElementById("main") || document.body, {
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      mutations.disconnect();
      document
        .querySelectorAll(".reveal:not(.in-view)")
        .forEach((el) => el.classList.add("in-view"));
    };
  }, [pathname]);
  return null;
}
