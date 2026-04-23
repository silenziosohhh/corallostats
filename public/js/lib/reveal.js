function prefersReducedMotion() {
  try {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function initReveal({ selector = "[data-reveal]" } = {}) {
  const nodes = Array.from(document.querySelectorAll(selector));
  if (!nodes.length) return;

  if (prefersReducedMotion()) {
    for (const n of nodes) n.classList.add("is-visible");
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-visible");
        io.unobserve(e.target);
      }
    },
    { root: null, threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
  );

  for (const n of nodes) io.observe(n);
}

