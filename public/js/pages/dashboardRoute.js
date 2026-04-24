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

export function parseDashboardLocation(loc = window.location) {
  const pathname = String(loc?.pathname || "");
  const search = String(loc?.search || "");

  const base = "/dashboard";
  if (pathname === base || pathname === `${base}/`) return { kind: "base" };
  if (!pathname.startsWith(`${base}/`)) return { kind: "base" };

  const rest = pathname.slice(base.length + 1);
  const name = safeDecode(rest.split("/")[0] || "").trim();
  if (!name) return { kind: "base" };

  const params = new URLSearchParams(search || "");
  const mode = params.get("m") ? safeDecode(params.get("m")).trim() : null;
  const playerParam =
    params.get("player") ||
    params.get("p") ||
    null;

  // Back-compat: /dashboard/<clan>?<playerName>
  let barePlayer = null;
  if (search && search !== "?" && !playerParam) {
    const raw = search.startsWith("?") ? search.slice(1) : search;
    const first = raw.split("&")[0] || "";
    if (first && !first.includes("=") && first.toLowerCase() !== "m") barePlayer = safeDecode(first).trim();
  }

  const playerName = safeDecode((playerParam || barePlayer || "")).trim();
  if (playerName) return { kind: "clan_player", clanName: name, playerName, mode };

  return { kind: "name", name, mode };
}

export function buildDashboardUrl(route) {
  if (!route || route.kind === "base") return "/dashboard";

  const mode = route?.mode ? String(route.mode) : null;
  const m = mode && mode.toLowerCase() !== "bedwars" ? `m=${encodeURIComponent(mode)}` : "";

  if (route.kind === "clan") return `/dashboard/${safeEncode(route.clanName)}`;
  if (route.kind === "player") return `/dashboard/${safeEncode(route.playerName)}${m ? `?${m}` : ""}`;
  if (route.kind === "name") return `/dashboard/${safeEncode(route.name)}${m ? `?${m}` : ""}`;
  if (route.kind === "clan_player") {
    const clan = safeEncode(route.clanName);
    const player = safeEncode(route.playerName);
    const tail = [player, m].filter(Boolean).join("&");
    return `/dashboard/${clan}?${tail}`;
  }

  return "/dashboard";
}

export function sameDashboardUrl(a, b) {
  return buildDashboardUrl(a) === buildDashboardUrl(b);
}
