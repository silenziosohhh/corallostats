function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && value.constructor === Object;
}

function titleCaseKey(key) {
  const s = String(key || "").replace(/[_-]+/g, " ").trim();
  if (!s) return "";
  return s.replace(/\b\w/g, (m) => m.toUpperCase());
}

function labelOverride(key) {
  const k = String(key || "").trim().toLowerCase();
  const map = {
    "globalstats.totalplays": "Partite giocate",
  };
  return map[k] || null;
}

function labelForKey(key) {
  const ov = labelOverride(key);
  if (ov) return ov;
  return titleCaseKey(key);
}

function formatDateTimeIt(value) {
  if (value === null || value === undefined || value === "") return "—";

  let date = null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value;
    date = new Date(ms);
  } else if (typeof value === "string") {
    const t = Date.parse(value);
    if (Number.isFinite(t)) date = new Date(t);
  }

  if (!date || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(date);
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

export function pickPlayerAggregateStats(data) {
  if (!isPlainObject(data)) return [];

  const isOnline = Boolean(data?.isOnline);
  const joined = formatDateTimeIt(data?.joinDate);
  const lastSeen = isOnline ? "Adesso" : formatDateTimeIt(data?.lastSeen);

  const rows = [
    ["Username", data?.username ? String(data.username) : "—"],
    ["Data iscrizione", joined],
    ["Ultimo accesso", lastSeen],
    ["Online", isOnline ? "Sì" : "No"],
    ["VIP", Boolean(data?.isVip) ? "Sì" : "No"],
    ["Staff", Boolean(data?.isStaff) ? "Sì" : "No"],
    ["Bannato", Boolean(data?.isBanned) ? "Sì" : "No"],
  ];

  // Append any additional fields (future-proof), without duplicating the ones above.
  const known = new Set(["username", "joindate", "lastseen", "isonline", "isvip", "isstaff", "isbanned"]);
  const extras = [];
  for (const [k, v] of Object.entries(data)) {
    const key = String(k || "").trim();
    if (!key) continue;
    if (key.startsWith("_")) continue;
    if (known.has(key.toLowerCase())) continue;
    if (v === null || v === undefined) continue;

    if (typeof v === "boolean") extras.push([labelForKey(key), v ? "Sì" : "No"]);
    else if (typeof v === "number" && Number.isFinite(v)) extras.push([labelForKey(key), v]);
    else if (typeof v === "string" && v.trim()) extras.push([labelForKey(key), v.trim()]);
  }

  return extras.length ? [...rows, ...extras] : rows;
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
    out.push([labelForKey(k), v]);
  }
  return out;
}
