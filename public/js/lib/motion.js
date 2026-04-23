function prefersReducedMotion() {
  try {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function defaultFormatter(n) {
  const v = Math.round(Number(n) || 0);
  return new Intl.NumberFormat("it-IT").format(v);
}

export function animateCount(node, toValue, { durationMs = 720, formatter = defaultFormatter } = {}) {
  if (!node) return;
  const to = Number(toValue);
  if (!Number.isFinite(to)) return;

  if (prefersReducedMotion() || durationMs <= 0) {
    node.textContent = formatter(to);
    return;
  }

  const currentText = String(node.textContent || "").replace(/[^\d.,-]/g, "");
  const fromParsed = Number(String(currentText).replace(/\./g, "").replace(",", ".")); // handle it-IT
  const from = Number.isFinite(fromParsed) ? fromParsed : 0;

  const start = performance.now();
  const delta = to - from;

  node.classList.add("count-anim");

  const tick = (now) => {
    const t = Math.min(1, (now - start) / durationMs);
    const p = easeOutCubic(t);
    const v = from + delta * p;
    node.textContent = formatter(v);
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      node.classList.remove("count-anim");
    }
  };

  requestAnimationFrame(tick);
}

