import { initShell } from "../shell/shell.js";
import { initUserChip } from "../shell/userChip.js";
import { initTopNavPrefs } from "../shell/prefs.js";
import { bindI18n } from "../lib/i18n.js";
import { mountPage } from "./pages.js";
import { initCodeblocks } from "./codeblocks.js";
import { initAnimatedIcons } from "../lib/animatedIcons.js";
import { initInlineIcons } from "../lib/inlineIcons.js";
import { initDialogLock } from "../lib/dialogLock.js";

let currentUnmount = null;
let navInFlight = null;

function collapseSidebarUI() {
  try {
    document.body?.classList?.remove("sidebar-open");
    document.querySelector("#sidebar")?.classList?.remove("open");
  } catch {
    // ignore
  }
}

function isSameOrigin(url) {
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin;
  } catch {
    return false;
  }
}

function isAppPath(pathname) {
  if (pathname === "/dashboard") return true;
  if (pathname.startsWith("/dashboard/")) return true;
  if (pathname === "/analytics") return true;
  if (pathname === "/account") return true;
  if (pathname === "/docs") return true;
  if (pathname.startsWith("/docs/")) return true;
  return false;
}

function syncStylesheetsFrom(doc) {
  const head = document.head;
  if (!head || !doc) return;

  const desired = [];
  for (const link of doc.querySelectorAll('link[rel="stylesheet"][href]')) {
    const href = link.getAttribute("href");
    if (!href) continue;
    desired.push({ href, attrs: [...link.attributes].map((a) => [a.name, a.value]) });
  }

  const existing = new Set();
  for (const link of head.querySelectorAll('link[rel="stylesheet"][href]')) {
    const href = link.getAttribute("href");
    if (href) existing.add(href);
  }

  for (const d of desired) {
    if (existing.has(d.href)) continue;
    const link = document.createElement("link");
    for (const [name, value] of d.attrs) link.setAttribute(name, value);
    head.appendChild(link);
    existing.add(d.href);
  }
}

async function bootCurrentPage() {
  initShell();
  initTopNavPrefs();
  bindI18n();
  initInlineIcons();
  initAnimatedIcons();
  initDialogLock();
  initUserChip();
  initCodeblocks(document);

  if (typeof currentUnmount === "function") {
    try {
      currentUnmount();
    } catch {
      // ignore
    }
    currentUnmount = null;
  }

  const pageId = document.body?.dataset?.page || null;
  const out = await mountPage(pageId);
  currentUnmount = typeof out === "function" ? out : null;
  initCodeblocks(document);
}

async function fetchAndSwap(url, { push = true } = {}) {
  if (navInFlight) navInFlight.abort();
  const controller = new AbortController();
  navInFlight = controller;

  // When navigating on mobile with the sidebar open, remove overlay immediately.
  collapseSidebarUI();

  document.documentElement.classList.add("nav-loading");

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html",
        "X-Requested-With": "spa",
      },
    });

    // If server redirected us (e.g. not authenticated), bail out to full navigation.
    if (res.redirected && !isAppPath(new URL(res.url).pathname)) {
      window.location.href = res.url;
      return;
    }

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    const nextShell = doc.querySelector(".shell");
    const nextMain = doc.querySelector(".main");
    if (!nextShell || !nextMain) {
      window.location.href = url;
      return;
    }

    const curShell = document.querySelector(".shell");
    if (!curShell) {
      window.location.href = url;
      return;
    }

    document.title = doc.title || document.title;
    syncStylesheetsFrom(doc);

    // Replace the full shell so sidebar/main stay consistent with target page.
    curShell.replaceWith(nextShell);

    // Sync page id for module mounting.
    const nextPageId = doc.body?.dataset?.page || null;
    if (document.body) document.body.dataset.page = nextPageId || "";

    if (push) {
      const u = new URL(url, window.location.origin);
      window.history.pushState({}, "", u.pathname + u.search + u.hash);
    }

    await bootCurrentPage();
  } finally {
    document.documentElement.classList.remove("nav-loading");
    navInFlight = null;
  }
}

function shouldHandleLink(anchor) {
  if (!anchor) return false;
  const href = anchor.getAttribute("href");
  if (!href) return false;
  if (href.startsWith("#")) return false;
  if (anchor.hasAttribute("download")) return false;
  if ((anchor.getAttribute("target") || "").toLowerCase() === "_blank") return false;
  if (!isSameOrigin(href)) return false;

  const u = new URL(href, window.location.origin);
  return isAppPath(u.pathname);
}

function onLinkClick(e) {
  if (e.defaultPrevented) return;
  if (e.button !== 0) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

  const a = e.target?.closest?.("a[href]");
  if (!shouldHandleLink(a)) return;
  const href = a.getAttribute("href");
  if (!href) return;

  const u = new URL(href, window.location.origin);
  if (u.pathname === window.location.pathname && u.search === window.location.search) {
    e.preventDefault();
    return;
  }

  e.preventDefault();
  collapseSidebarUI();

  const curPage = document.body?.dataset?.page || "";
  const isDashboard = curPage === "dashboard";
  if (isDashboard && (u.pathname === "/dashboard" || u.pathname.startsWith("/dashboard/"))) {
    window.history.pushState({}, "", u.pathname + u.search + u.hash);
    try {
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {
      // ignore
    }
    return;
  }

  fetchAndSwap(u.toString(), { push: true }).catch(() => {
    window.location.href = u.toString();
  });
}

window.addEventListener("popstate", () => {
  const u = new URL(window.location.href);
  if (!isAppPath(u.pathname)) return;

  const curPage = document.body?.dataset?.page || "";
  const isDashboard = curPage === "dashboard";
  if (isDashboard && (u.pathname === "/dashboard" || u.pathname.startsWith("/dashboard/"))) return;

  fetchAndSwap(u.toString(), { push: false }).catch(() => {
    window.location.href = u.toString();
  });
});

document.addEventListener("click", onLinkClick);

bootCurrentPage().catch(() => {
  // If mount fails, keep page usable.
});
