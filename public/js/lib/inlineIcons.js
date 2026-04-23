const ICON_SELECTOR = ".aico[data-icon]";
const READY_ATTR = "data-aico-ready";
const BOUND_ATTR = "data-aico-bound";
const REST_TIME_S = 2;

const svgCache = new Map();

function sanitize(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:-]/g, "");
}

function resolvePath(iconName) {
  const raw = sanitize(iconName);
  const [set, icon] = raw.split(":");
  if (set !== "line-md" || !icon) return null;
  if (!/^[a-z0-9-]+$/.test(icon)) return null;
  const v = document.documentElement?.dataset?.assetsV || "";
  const qs = v ? `?v=${encodeURIComponent(v)}` : "";
  return `/icons/line-md/${icon}.svg${qs}`;
}

function setRest(svg) {
  try {
    if (typeof svg.setCurrentTime === "function") svg.setCurrentTime(REST_TIME_S);
  } catch {
    // ignore
  }
  try {
    svg.pauseAnimations?.();
  } catch {
    // ignore
  }
}

async function loadSvgText(path) {
  if (svgCache.has(path)) return svgCache.get(path);
  const p = (async () => {
    const res = await fetch(path, { cache: "force-cache" });
    if (!res.ok) throw new Error(`Icon fetch failed: ${res.status}`);
    return res.text();
  })();
  svgCache.set(path, p);
  return p;
}

async function renderIcon(el) {
  if (!(el instanceof HTMLElement)) return;
  if (el.getAttribute(READY_ATTR) === "1") return;

  const iconName = el.getAttribute("data-icon") || "";
  const path = resolvePath(iconName);
  if (!path) return;

  try {
    const svgText = await loadSvgText(path);
    el.innerHTML = svgText;
    const svg = el.querySelector("svg");
    if (svg instanceof SVGSVGElement) {
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.setAttribute("focusable", "false");
      svg.setAttribute("aria-hidden", "true");
      setRest(svg);
    }
    el.setAttribute(READY_ATTR, "1");
  } catch {
    // ignore: keep empty
  }
}

function renderAll(root = document) {
  for (const el of root.querySelectorAll(ICON_SELECTOR)) renderIcon(el);
}

export function initInlineIcons() {
  if (document.documentElement.getAttribute(BOUND_ATTR) === "1") return;
  document.documentElement.setAttribute(BOUND_ATTR, "1");

  renderAll(document);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes || []) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.(ICON_SELECTOR)) renderIcon(node);
        renderAll(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
