import { normalizeStatsMode } from "./playerStatsRender.js";

function normalizeDashboardView(view) {
  const v = String(view || "").toLowerCase().trim();
  if (v === "bedwars") return "bedwars";
  if (v === "duels") return "duels";
  if (v === "kitpvp") return "kitpvp";
  return "clans";
}

function normalizeBasePage(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

function normalizeBasePageSize(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 24;
  const v = Math.floor(n);
  if (v === 12 || v === 24 || v === 48) return v;
  return 24;
}

function safeDecode(segment) {
  try {
    return decodeURIComponent(String(segment || ""));
  } catch {
    return String(segment || "");
  }
}

function safeEncode(segment) {
  return encodeURIComponent(String(segment || ""));
}

function parseViewFromSearch(search) {
  const s = String(search || "");
  if (!s || s === "?") return "clans";
  const params = new URLSearchParams(s);
  const v = params.get("view") || params.get("list") || null;
  return normalizeDashboardView(v);
}

function parsePageFromSearch(search) {
  const s = String(search || "");
  if (!s || s === "?") return 1;
  const params = new URLSearchParams(s);
  const p = params.get("page") || params.get("p") || null;
  return normalizeBasePage(p || 1);
}

function parsePageSizeFromSearch(search) {
  const s = String(search || "");
  if (!s || s === "?") return 24;
  const params = new URLSearchParams(s);
  const ps = params.get("size") || params.get("ps") || params.get("pageSize") || null;
  return normalizeBasePageSize(ps || 24);
}

function parseModeFromSearch(search) {
  const s = String(search || "");
  if (!s || s === "?") return null;

  const params = new URLSearchParams(s);
  const byKey = params.get("m") || params.get("mode") || null;
  if (byKey) return normalizeStatsMode(byKey);

  const raw = s.startsWith("?") ? s.slice(1) : s;
  const first = (raw.split("&")[0] || "").trim();
  if (!first || first.includes("=")) return null;

  const token = first.toLowerCase();
  if (token === "bedwars" || token === "kitpvp" || token === "duels" || token === "player") return token;
  return null;
}

export function parseDashboardLocation(loc = window.location) {
  const pathname = String(loc?.pathname || "");
  const search = String(loc?.search || "");

  const base = "/dashboard";
  if (pathname === base || pathname === `${base}/`) {
    return {
      kind: "base",
      view: parseViewFromSearch(search),
      page: parsePageFromSearch(search),
      pageSize: parsePageSizeFromSearch(search),
    };
  }

  const modeFromSearch = parseModeFromSearch(search);

  // Back-compat: /dashboard/<name> (and legacy player params)
  if (pathname.startsWith(`${base}/`)) {
    const rest = pathname.slice(base.length + 1);
    const name = safeDecode(rest.split("/")[0] || "").trim();
    if (!name) return { kind: "base" };

    const params = new URLSearchParams(search || "");
    const mode = params.get("m") ? normalizeStatsMode(safeDecode(params.get("m")).trim()) : null;
    const playerParam = params.get("player") || params.get("p") || null;

    let barePlayer = null;
    if (search && search !== "?" && !playerParam) {
      const raw = search.startsWith("?") ? search.slice(1) : search;
      const first = raw.split("&")[0] || "";
      if (first && !first.includes("=") && first.toLowerCase() !== "m") barePlayer = safeDecode(first).trim();
    }

    const playerName = safeDecode((playerParam || barePlayer || "")).trim();
    if (playerName) return { kind: "player", playerName, mode: mode || modeFromSearch || "bedwars" };

    if (modeFromSearch) return { kind: "player", playerName: name, mode: modeFromSearch };
    return { kind: "name", name, mode };
  }

  // New canonical: /<name> for clans, /<player>?<mode> for players
  const seg = safeDecode(pathname.replace(/^\/+/, "").split("/")[0] || "").trim();
  if (!seg) return { kind: "base" };
  if (modeFromSearch) return { kind: "player", playerName: seg, mode: modeFromSearch };
  return { kind: "name", name: seg, mode: null };
}

export function buildDashboardUrl(route) {
  if (!route || route.kind === "base") {
    const view = normalizeDashboardView(route?.view);
    const page = normalizeBasePage(route?.page || 1);
    const pageSize = normalizeBasePageSize(route?.pageSize || 24);

    const params = new URLSearchParams();
    if (view !== "clans") params.set("view", view);
    if (page > 1) params.set("page", String(page));
    if (pageSize !== 24) params.set("size", String(pageSize));

    const q = params.toString();
    if (q) return `/dashboard?${q}`;
    return "/dashboard";
  }

  if (route.kind === "clan") return `/${safeEncode(route.clanName)}`;
  if (route.kind === "player") {
    const mode = normalizeStatsMode(route.mode || "bedwars");
    return `/${safeEncode(route.playerName)}?${encodeURIComponent(mode)}`;
  }
  if (route.kind === "name") return `/${safeEncode(route.name)}`;

  return "/dashboard";
}

export function sameDashboardUrl(a, b) {
  return buildDashboardUrl(a) === buildDashboardUrl(b);
}
