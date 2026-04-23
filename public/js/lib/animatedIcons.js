const ICON_SELECTOR = ".aico svg";
const UI_SCOPE_SELECTOR = ".sidebar, .navbar, .site-nav";
const REST_TIME_S = 2;
const CLICK_ONLY_SELECTOR = ".theme-toggle, [data-ico-clickonly='1']";

const playOnceTimers = new WeakMap();

function pauseSvg(svg) {
  try {
    svg.pauseAnimations?.();
  } catch {
    // ignore
  }
}

function unpauseSvg(svg) {
  try {
    svg.unpauseAnimations?.();
  } catch {
    // ignore
  }
}

function setTime(svg, t) {
  try {
    if (typeof svg.setCurrentTime === "function") svg.setCurrentTime(t);
    return true;
  } catch {
    // ignore
    return false;
  }
  return false;
}

function setRest(svg) {
  setTime(svg, REST_TIME_S);
  pauseSvg(svg);
}

function restartByCloning(svg) {
  try {
    const clone = svg.cloneNode(true);
    svg.replaceWith(clone);
    return clone;
  } catch {
    return svg;
  }
}

function playSvg(svg) {
  const ok = setTime(svg, 0);
  if (!ok) {
    restartByCloning(svg);
    return;
  }
  unpauseSvg(svg);
}

function cancelPlayOnce(svg) {
  const t = playOnceTimers.get(svg);
  if (t) window.clearTimeout(t);
  playOnceTimers.delete(svg);
}

function scheduleRest(svg, durationMs) {
  cancelPlayOnce(svg);
  const t = window.setTimeout(() => setRest(svg), durationMs);
  playOnceTimers.set(svg, t);
}

function pauseAllIconsIn(root) {
  for (const svg of root.querySelectorAll(ICON_SELECTOR)) setRest(svg);
}

function isEnterOrLeave(el, relatedTarget) {
  if (!relatedTarget || !(relatedTarget instanceof Node)) return true;
  return !el.contains(relatedTarget);
}

function isUiTarget(el) {
  if (!el) return false;
  if (!el.closest(UI_SCOPE_SELECTOR)) return false;
  if (el.matches(CLICK_ONLY_SELECTOR)) return false;
  // Keep icons animated on hover even for the current/active nav item.
  if (el.matches("[aria-disabled='true']") && !el.classList.contains("nav-item")) return false;
  if (el instanceof HTMLButtonElement && el.disabled) return false;
  return true;
}

function startIconsFor(el) {
  for (const svg of el.querySelectorAll(ICON_SELECTOR)) playSvg(svg);
}

function stopIconsFor(el) {
  for (const svg of el.querySelectorAll(ICON_SELECTOR)) setRest(svg);
}

export function initAnimatedIcons() {
  if (document.__animatedIconsBound) return;
  document.__animatedIconsBound = true;

  // Default state: icons paused. They play only on hover.
  pauseAllIconsIn(document);

  document.addEventListener("pointerover", (e) => {
    const el = e.target?.closest?.("a, button");
    if (!isUiTarget(el)) return;
    if (!isEnterOrLeave(el, e.relatedTarget)) return;
    startIconsFor(el);
  });

  document.addEventListener("pointerout", (e) => {
    const el = e.target?.closest?.("a, button");
    if (!isUiTarget(el)) return;
    if (!isEnterOrLeave(el, e.relatedTarget)) return;
    stopIconsFor(el);
  });

  // Touch/click: play on press, stop on release/cancel.
  document.addEventListener("pointerdown", (e) => {
    const el = e.target?.closest?.("a, button");
    if (!isUiTarget(el)) return;
    startIconsFor(el);
  });
  const stopFromEvent = (e) => {
    const el = e.target?.closest?.("a, button");
    if (!isUiTarget(el)) return;
    stopIconsFor(el);
  };
  document.addEventListener("pointerup", stopFromEvent);
  document.addEventListener("pointercancel", stopFromEvent);

  // Keyboard users: play on focus, stop on blur.
  document.addEventListener("focusin", (e) => {
    const el = e.target?.closest?.("a, button");
    if (!isUiTarget(el)) return;
    startIconsFor(el);
  });
  document.addEventListener("focusout", (e) => {
    const el = e.target?.closest?.("a, button");
    if (!isUiTarget(el)) return;
    stopIconsFor(el);
  });
}

export function playIconsOnce(container, { durationMs = 900, retries = 14 } = {}) {
  const root = container instanceof Element ? container : null;
  if (!root) return;

  const svgs = Array.from(root.querySelectorAll(ICON_SELECTOR));
  if (!svgs.length) {
    if (retries <= 0) return;
    window.setTimeout(() => playIconsOnce(root, { durationMs, retries: retries - 1 }), 60);
    return;
  }

  for (const svg of svgs) {
    playSvg(svg);
    scheduleRest(svg, durationMs);
  }
}
