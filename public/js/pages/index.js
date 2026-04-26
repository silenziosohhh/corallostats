import { api } from "../lib/apiClient.js";
import { qs, setText } from "../lib/dom.js";
import { showToast } from "../lib/toast.js";
import { copyToClipboard } from "../lib/clipboard.js";
import { bindShellShortcuts } from "../shell/shell.js";
import { getAuthState, refreshAuthState } from "../lib/authState.js";
import { initUserChip } from "../shell/userChip.js";
import { initTopNavPrefs } from "../shell/prefs.js";
import { bindI18n, t } from "../lib/i18n.js";
import { animateCount } from "../lib/motion.js";
import { initReveal } from "../lib/reveal.js";
import { clearSkeletonText, setAriaBusy, setSkeletonText, skelBlock } from "../lib/skeleton.js";
import { getCachedAuthState } from "../lib/userCache.js";
import { initAnimatedIcons } from "../lib/animatedIcons.js";
import { initInlineIcons } from "../lib/inlineIcons.js";
import { initDialogLock } from "../lib/dialogLock.js";

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  };
}

function endpointHaystack(ep) {
  const method = String(ep?.method || "GET");
  const path = String(ep?.path || "");
  const summary = String(ep?.summary || "");
  const tags = Array.isArray(ep?.tags) ? ep.tags.join(" ") : "";
  return `${method} ${path} ${summary} ${tags}`.toLowerCase();
}

function buildDocsUrlFor(ep, term) {
  const q = ep?.path ? String(ep.path) : String(term || "");
  return `/docs${q ? `?q=${encodeURIComponent(q)}` : ""}`;
}

function renderSearchResults({ root, results, term, activeIndex }) {
  root.innerHTML = "";

  if (!term || term.length < 2) {
    root.style.display = "none";
    return;
  }

  if (!results.length) {
    const empty = document.createElement("div");
    empty.className = "search-empty";
    empty.innerHTML = `<b>Nessun risultato</b> • prova un altro termine`;
    root.append(empty);
    root.style.display = "block";
    return;
  }

  for (let i = 0; i < results.length; i++) {
    const ep = results[i];
    const item = document.createElement("div");
    item.className = `search-item${i === activeIndex ? " active" : ""}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", i === activeIndex ? "true" : "false");

    const method = document.createElement("div");
    method.className = "method";
    method.textContent = ep?.method || "GET";

    const txt = document.createElement("div");
    txt.className = "txt";

    const path = document.createElement("div");
    path.className = "path";
    path.textContent = ep?.path || "—";

    const sum = document.createElement("div");
    sum.className = "sum";
    sum.textContent = ep?.summary || "";

    txt.append(path, sum);
    item.append(method, txt);

    item.addEventListener("mousedown", (e) => {
      // prevent blur hiding the menu before click
      e.preventDefault();
    });
    item.addEventListener("click", () => {
      window.location.href = buildDocsUrlFor(ep, term);
    });

    root.append(item);
  }

  root.style.display = "block";
}

function renderSearchSkeleton({ root, count = 6 }) {
  root.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const item = document.createElement("div");
    item.className = "search-item skeleton";
    const left = skelBlock({ widthPct: 22, height: 18, radius: 999, className: "skel-text skel-inline" });
    left.style.setProperty("--skel-w", "52px");

    const txt = document.createElement("div");
    txt.className = "txt";
    txt.append(
      skelBlock({ widthPct: 72, height: 12, radius: 10, className: "skel-text skel-block" }),
      skelBlock({ widthPct: 92, height: 10, radius: 10, className: "skel-text skel-block" })
    );
    item.append(left, txt);
    root.append(item);
  }
  root.style.display = "block";
}

async function init() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("oauth") === "failed") {
      showToast("Login Discord fallito. Riprova.", { variant: "error" });
      params.delete("oauth");
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", next);
    }
  } catch {
    // ignore
  }

  initTopNavPrefs();
  bindI18n();
  initReveal();
  initInlineIcons();
  initAnimatedIcons();
  initDialogLock();
  bindShellShortcuts({
    onSearch: () => qs("#global-search").focus(),
  });

  // Let the banner background dictate hero height (aspect-ratio).
  const hero = document.querySelector(".hero");
  if (hero) {
    const img = new Image();
    img.src = "/images/corallo_stats_banner.png";
    img.decoding = "async";
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w > 0 && h > 0) hero.style.setProperty("--hero-aspect", `${w} / ${h}`);
    };
  }

  const origin = window.location.origin;
  const base = `${origin}/api/v1`;
  const curl = `curl \"${base}/summary\"`;

  qs("#base-url").value = base;
  qs("#curl-url").value = curl;
  const preview = document.querySelector("#base-url-preview");
  if (preview) preview.textContent = base;

  qs("#copy-base").addEventListener("click", async () => {
    try {
      await copyToClipboard(base);
      showToast(t("ui.copied"));
    } catch {
      showToast(t("ui.copyFailed"), { variant: "error" });
    }
  });

  qs("#copy-curl").addEventListener("click", async () => {
    try {
      await copyToClipboard(curl);
      showToast(t("ui.copied"));
    } catch {
      showToast(t("ui.copyFailed"), { variant: "error" });
    }
  });

  const search = qs("#global-search");
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = search.value.trim();
      window.location.href = `/docs${q ? `?q=${encodeURIComponent(q)}` : ""}`;
    }
  });

  const ctaLogin = document.querySelector("#cta-login");
  const resultsRoot = document.querySelector("#search-results");

  // Render user chip immediately from cache (and revalidate in background).
  initUserChip({ accountSelector: "#nav-account", loginSelector: "#nav-login" });

  // Optimistic CTA from cached session, then confirm via /auth/user.
  const cachedAuth = getCachedAuthState();
  if (cachedAuth?.loggedIn && ctaLogin) {
    ctaLogin.textContent = t("landing.ctaGoAccount");
    ctaLogin.href = "/account";
  }

  let auth = await getAuthState();
  if (auth.loggedIn && !auth.user) {
    auth = await refreshAuthState();
  }

  if (!auth.loggedIn) {
    setText(qs("#kpi-updated"), t("ui.loginDiscord"));
    setText(qs("#kpi-clans"), t("ui.private"));
    setText(qs("#kpi-players"), t("ui.private"));
    setText(qs("#limits-text"), t("ui.privateLoginRequired"));
    const inline = document.querySelector("#limits-text-inline");
    if (inline) inline.textContent = t("ui.privateLoginRequired");
    return;
  }

  if (ctaLogin) {
    ctaLogin.textContent = t("landing.ctaGoAccount");
    ctaLogin.href = "/account";
  }

  try {
    setSkeletonText(qs("#kpi-updated"), { widthPct: 48, height: 14, radius: 10 });
    setSkeletonText(qs("#kpi-clans"), { widthPct: 32, height: 18, radius: 10 });
    setSkeletonText(qs("#kpi-players"), { widthPct: 34, height: 18, radius: 10 });
    const limitsText = qs("#limits-text");
    setSkeletonText(limitsText, { widthPct: 74, height: 12, radius: 10 });
    const inline = document.querySelector("#limits-text-inline");
    if (inline) setSkeletonText(inline, { widthPct: 64, height: 12, radius: 10 });

    const summary = await api.getJson("/api/v1/summary");
    clearSkeletonText(qs("#kpi-updated"));
    clearSkeletonText(qs("#kpi-clans"));
    clearSkeletonText(qs("#kpi-players"));
    clearSkeletonText(limitsText);
    if (inline) clearSkeletonText(inline);

    setText(qs("#kpi-updated"), formatDateTime(summary.updatedAt));
    setText(qs("#kpi-clans"), "0");
    animateCount(qs("#kpi-clans"), summary.clansCount ?? 0, { durationMs: 780 });
    const players = summary.coveredPlayersCount ?? "—";
    const without = summary.playersWithoutClanCount ?? "—";
    setText(qs("#kpi-players"), "0");
    animateCount(qs("#kpi-players"), Number(players) || 0, { durationMs: 880 });
    const limits = "240/min per IP (default), CORS: *";
    setText(qs("#limits-text"), limits);
    if (inline) inline.textContent = limits;
  } catch (err) {
    clearSkeletonText(qs("#kpi-updated"));
    clearSkeletonText(qs("#kpi-clans"));
    clearSkeletonText(qs("#kpi-players"));
    try {
      clearSkeletonText(qs("#limits-text"));
    } catch {
      // ignore
    }
    const inline = document.querySelector("#limits-text-inline");
    if (inline) clearSkeletonText(inline);
    showToast(err?.message || "Impossibile caricare /api/v1/summary", { variant: "error" });
  }

  // Autocomplete endpoints
  if (resultsRoot) {
    let endpoints = null;
    let endpointsPromise = null;
    let activeIndex = 0;

    const hide = () => {
      resultsRoot.style.display = "none";
      resultsRoot.innerHTML = "";
      activeIndex = 0;
    };

    const ensureEndpoints = async () => {
      if (endpoints) return endpoints;
      if (!endpointsPromise) {
        endpointsPromise = api
          .getJson("/api/stats/endpoints", { cache: "no-store" })
          .then((payload) => {
            const list = Array.isArray(payload?.endpoints) ? payload.endpoints : [];
            endpoints = list.map((e) => ({
              method: e.method || "GET",
              path: e.path,
              summary: e.summary || "",
              tags: e.tags || [],
            }));
            return endpoints;
          })
          .finally(() => {
            endpointsPromise = null;
          });
      }
      return endpointsPromise;
    };

    const run = debounce(async () => {
      const term = qs("#global-search").value.trim().toLowerCase();
      if (term.length < 2) {
        hide();
        return;
      }

      let list = [];
      try {
        if (!endpoints) {
          setAriaBusy(resultsRoot, true);
          renderSearchSkeleton({ root: resultsRoot, count: 6 });
        }
        const eps = await ensureEndpoints();
        list = eps.filter((ep) => endpointHaystack(ep).includes(term)).slice(0, 8);
      } catch {
        setAriaBusy(resultsRoot, false);
        resultsRoot.innerHTML = `<div class="search-empty"><b>Elenco endpoint non disponibile</b> • riprova più tardi</div>`;
        resultsRoot.style.display = "block";
        return;
      } finally {
        setAriaBusy(resultsRoot, false);
      }

      activeIndex = 0;
      renderSearchResults({ root: resultsRoot, results: list, term, activeIndex });
    }, 120);

    const input = qs("#global-search");
    input.addEventListener("input", run);
    input.addEventListener("focus", run);
    input.addEventListener("blur", () => {
      window.setTimeout(hide, 90);
    });

    document.addEventListener("keydown", (e) => {
      if (resultsRoot.style.display === "none") return;
      const items = Array.from(resultsRoot.querySelectorAll(".search-item"));
      if (!items.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = Math.min(items.length - 1, activeIndex + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = Math.max(0, activeIndex - 1);
      } else if (e.key === "Escape") {
        hide();
        return;
      } else if (e.key === "Enter") {
        const item = items[activeIndex];
        if (item) {
          e.preventDefault();
          item.click();
          return;
        }
      } else {
        return;
      }

      for (let i = 0; i < items.length; i++) items[i].classList.toggle("active", i === activeIndex);
    });
  }
}

init();
