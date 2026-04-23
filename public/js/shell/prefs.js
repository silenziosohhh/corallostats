import { playIconsOnce } from "../lib/animatedIcons.js";

const STORAGE_THEME = "corallo_theme";

function prefersLight() {
  try {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  } catch {
    return false;
  }
}

export function getTheme() {
  const saved = (localStorage.getItem(STORAGE_THEME) || "").toLowerCase();
  if (saved === "light" || saved === "dark") return saved;
  return prefersLight() ? "light" : "dark";
}

export function setTheme(theme, { persist = true, animate = true } = {}) {
  const next = theme === "light" ? "light" : "dark";
  const html = document.documentElement;
  html.dataset.theme = next;
  if (persist) localStorage.setItem(STORAGE_THEME, next);

  if (animate) {
    html.classList.add("theme-anim");
    window.setTimeout(() => html.classList.remove("theme-anim"), 260);
  }
}

function iconHtmlForTheme(nextTheme) {
  // Icon indicates the *next* theme when clicking
  if (nextTheme === "light") {
    return `<span class="aico ui-icon theme-ico" data-icon="line-md:moon-to-sunny-outline-transition" aria-hidden="true"></span>`;
  }
  return `<span class="aico ui-icon theme-ico" data-icon="line-md:sunny-outline-to-moon-transition" aria-hidden="true"></span>`;
}

function insertPrefsNode(root, node) {
  const directSearch = Array.from(root.children || []).find((c) => c && c.classList && c.classList.contains("search"));
  if (directSearch && directSearch.nextSibling) {
    root.insertBefore(node, directSearch.nextSibling);
    return;
  }
  root.prepend(node);
}

export function initThemeToggle({ container } = {}) {
  const root =
    container ||
    document.querySelector(".navbar .nav-right") ||
    document.querySelector(".site-nav .nav-right");
  if (!root) return;

  let btn = root.querySelector("#theme-toggle");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "theme-toggle";
    btn.className = "icon-btn theme-toggle";
    btn.setAttribute("aria-label", "Cambia tema");
    btn.setAttribute("data-i18n-aria-label", "ui.changeTheme");
    insertPrefsNode(root, btn);
  }

  const apply = () => {
    const theme = getTheme();
    const next = theme === "dark" ? "light" : "dark";
    btn.innerHTML = iconHtmlForTheme(next);
    btn.dataset.nextTheme = next;
    btn.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
  };

  if (!btn.dataset.bound) {
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      const next = btn.dataset.nextTheme === "light" ? "light" : "dark";
      setTheme(next, { persist: true, animate: true });
      btn.classList.remove("pulse");
      btn.offsetWidth;
      btn.classList.add("pulse");
      apply();
      // Theme icon should animate only on click (not hover).
      playIconsOnce(btn, { durationMs: 900 });
    });
  }

  setTheme(getTheme(), { persist: false, animate: false });
  apply();
}

export function initTopNavPrefs() {
  initThemeToggle();
}
