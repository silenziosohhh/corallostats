import { normalizeStatsMode } from "./playerStatsRender.js";

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
  if (pathname === "/" || pathname === base || pathname === `${base}/`) return { kind: "base" };

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
  if (!route || route.kind === "base") return "/dashboard";

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
