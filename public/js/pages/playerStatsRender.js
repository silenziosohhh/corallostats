function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && value.constructor === Object;
}

function titleCaseKey(key) {
  const s = String(key || "").replace(/[_-]+/g, " ").trim();
  if (!s) return "";
  return s.replace(/\b\w/g, (m) => m.toUpperCase());
}

export function normalizeStatsMode(mode) {
  const m = String(mode || "").toLowerCase().trim();
  if (m === "kitpvp") return "kitpvp";
  if (m === "duels") return "duels";
  if (m === "player") return "player";
  return "bedwars";
}

export function modeLabel(mode) {
  const m = normalizeStatsMode(mode);
  if (m === "kitpvp") return "KitPvP";
  if (m === "duels") return "Duels";
  if (m === "player") return "Player (aggregate)";
  return "BedWars";
}

export function statsEndpointFor(mode) {
  const m = normalizeStatsMode(mode);
  if (m === "player") return "player";
  return m;
}

export function pickGenericStats(data, { limit = 20 } = {}) {
  if (!isPlainObject(data)) return [];

  const numeric = [];
  const other = [];

  for (const [k, v] of Object.entries(data)) {
    const key = String(k || "").trim();
    if (!key) continue;
    if (key.startsWith("_")) continue;

    if (typeof v === "number" && Number.isFinite(v)) {
      numeric.push([key, v]);
      continue;
    }

    if (typeof v === "string" && v.trim()) {
      other.push([key, v.trim()]);
      continue;
    }

    if (typeof v === "boolean") {
      other.push([key, v ? "Sì" : "No"]);
      continue;
    }

    if (isPlainObject(v)) {
      // One-level flatten for small nested objects (common: { wins: 1, losses: 2 }).
      const entries = Object.entries(v).filter(([, vv]) => typeof vv === "number" && Number.isFinite(vv));
      if (entries.length && entries.length <= 8) {
        for (const [kk, vv] of entries) numeric.push([`${key}.${kk}`, vv]);
      }
    }
  }

  numeric.sort((a, b) => b[1] - a[1]);
  const merged = [...numeric, ...other];
  const out = [];
  for (const [k, v] of merged) {
    if (out.length >= limit) break;
    out.push([titleCaseKey(k), v]);
  }
  return out;
}

