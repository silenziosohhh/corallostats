const DEFAULT_OPENAPI_URL = "https://coralmc.it/api/v1/stats/openapi";
const path = require("path");
const fs = require("fs");

const REGISTRY_CACHE_PATH = path.join(__dirname, "..", "..", "data", "stats_registry_cache.json");

let registry = null;

const SUMMARY_IT_BY_KEY = {
  "GET /stats/bedwars/{username}": "Ottieni statistiche Bedwars del player",
  "GET /stats/bedwars/{username}/matches": "Ottieni match Bedwars del player",
  "GET /stats/bedwars/clans/{clanName}": "Ottieni dettagli clan Bedwars",
  "GET /stats/bedwars/clans/leaderboard": "Classifica clan Bedwars",
  "GET /stats/bedwars/leaderboard": "Classifica Bedwars",
  "GET /stats/bedwars/match/{id}": "Dettagli match Bedwars / CoralCUP",
  "GET /stats/bedwars/match/{id}/logs": "Log match Bedwars / CoralCUP",

  "GET /stats/coralcup/editions": "Lista edizioni CoralCUP",
  "GET /stats/coralcup/full-lead": "Classifica completa CoralCUP",
  "GET /stats/coralcup/leaderboard": "Classifica CoralCUP (paginata)",
  "GET /stats/coralcup/team/{team}": "Dettagli team CoralCUP",

  "GET /stats/duels/{username}": "Ottieni statistiche Duels del player",
  "GET /stats/duels/{username}/matches": "Ottieni match Duels del player",
  "GET /stats/duels/leaderboard": "Classifica Duels",
  "GET /stats/duels/match/{matchId}": "Dettagli match Duels",

  "GET /stats/kitpvp/{username}": "Ottieni statistiche KitPvP del player",
  "GET /stats/kitpvp/leaderboard": "Classifica KitPvP",

  "GET /stats/player/{username}": "Ottieni statistiche player (aggregate)",
  "GET /stats/player/{username}/cache-timestamp": "Timestamp cache condivisa player",

  "GET /stats/search/{input}": "Cerca player",
};

function localizeSummary({ method, localPathTemplate, summary }) {
  const key = `${String(method || "").toUpperCase()} ${localPathTemplate}`;
  if (SUMMARY_IT_BY_KEY[key]) return SUMMARY_IT_BY_KEY[key];

  const s = String(summary || "").trim();
  if (!s) return s;

  // Small fallback translations for common OpenAPI summaries.
  if (/^get\s+/i.test(s)) {
    const rest = s.replace(/^get\s+/i, "").trim();
    return `Ottieni ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
  }
  if (/^search\s+/i.test(s)) {
    const rest = s.replace(/^search\s+/i, "").trim();
    return `Cerca ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
  }

  return s;
}

function localizeParamDescription(desc) {
  const s = String(desc || "").trim();
  if (!s) return s;

  const map = new Map([
    ["Minecraft username.", "Username Minecraft."],
    ["Exact clan name.", "Nome esatto del clan."],
    ["Numeric match identifier.", "ID numerico del match."],
    ["Optional CoralCUP edition.", "Edizione CoralCUP opzionale."],
    [
      "Optional CoralCUP edition. When present, the handler resolves the match through the CoralCUP tables.",
      "Edizione CoralCUP opzionale. Se presente, il match viene risolto tramite le tabelle CoralCUP.",
    ],
    ["Sort order for the full leaderboard.", "Ordinamento per la classifica completa."],
    ["Zero-based page index.", "Indice pagina (0-based)."],
    ["Field to sort by.", "Campo su cui ordinare."],
    ["Sort order.", "Direzione ordinamento."],
    ["Optional player username prefix filter.", "Filtro opzionale per prefisso username."],
    ["Optional Duels gamemode.", "Gamemode Duels opzionale."],
    ["Duels match identifier.", "Identificatore match Duels."],
    ["Numeric team identifier.", "ID numerico del team."],
    ["Search term. Must be at least 3 characters long.", "Termine di ricerca (minimo 3 caratteri)."],
  ]);

  if (map.has(s)) return map.get(s);
  return s;
}

async function fetchJson(url, { contact } = {}) {
  const headers = { Accept: "application/json" };
  if (contact) headers["X-Contact"] = contact;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Upstream OpenAPI HTTP ${res.status}`);
  return await res.json();
}

function toLocalPath(upstreamPath) {
  // /api/v1/stats/... -> /stats/...
  return upstreamPath.replace(/^\/api\/v\d+/, "");
}

function sampleValueForParam(name) {
  const n = String(name).toLowerCase();
  if (n.includes("user")) return "Fed";
  if (n.includes("input")) return "Fed";
  if (n.includes("clan")) return "ExampleClan";
  return "Example";
}

function buildExampleUrl(localTemplate) {
  // Convert /stats/player/{username} into /api/v1/stats/player/Fed (example)
  return (
    "/api/v1" +
    localTemplate.replace(/\{([^}]+)\}/g, (_, key) => encodeURIComponent(sampleValueForParam(key)))
  );
}

function flattenParameters({ pathItemParams, opParams }) {
  const out = [];
  const raw = [
    ...(Array.isArray(pathItemParams) ? pathItemParams : []),
    ...(Array.isArray(opParams) ? opParams : []),
  ];

  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    if (p.$ref) continue;
    const name = p.name ? String(p.name) : null;
    const where = p.in ? String(p.in) : null;
    if (!name || !where) continue;
    const required = Boolean(p.required);
    const type = p?.schema?.type ? String(p.schema.type) : null;
    const description = p.description ? localizeParamDescription(String(p.description)) : null;
    out.push({ name, in: where, required, type, description });
  }

  const seen = new Set();
  return out.filter((p) => {
    const key = `${p.in}:${p.name}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseSpec(spec) {
  const paths = spec?.paths && typeof spec.paths === "object" ? spec.paths : {};
  const endpoints = [];

  for (const [upstreamPath, methods] of Object.entries(paths)) {
    if (!upstreamPath.startsWith("/api/")) continue;
    const localTemplate = toLocalPath(upstreamPath);
    const pathItemParams = methods?.parameters;

    for (const [method, op] of Object.entries(methods || {})) {
      const m = String(method).toUpperCase();
      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(m)) continue;

      endpoints.push({
        method: m,
        upstreamPathTemplate: upstreamPath,
        localPathTemplate: localTemplate,
        summary: localizeSummary({
          method: m,
          localPathTemplate: localTemplate,
          summary: op?.summary || op?.description || "",
        }),
        tags: Array.isArray(op?.tags) ? op.tags : [],
        params: flattenParameters({ pathItemParams, opParams: op?.parameters }),
        exampleUrl: buildExampleUrl(localTemplate),
      });
    }
  }

  endpoints.sort((a, b) => (a.localPathTemplate + a.method).localeCompare(b.localPathTemplate + b.method));

  return {
    source: "coralmc_stats_openapi",
    fetchedAt: new Date().toISOString(),
    openapiUrl: spec?.servers?.[0]?.url ? spec.servers[0].url : DEFAULT_OPENAPI_URL,
    endpoints,
  };
}

function localizeRegistry(reg) {
  if (!reg || typeof reg !== "object") return reg;
  if (!Array.isArray(reg.endpoints)) return reg;
  for (const ep of reg.endpoints) {
    if (!ep || typeof ep !== "object") continue;
    ep.summary = localizeSummary({
      method: ep.method,
      localPathTemplate: ep.localPathTemplate,
      summary: ep.summary,
    });
    if (Array.isArray(ep.params)) {
      for (const p of ep.params) {
        if (!p || typeof p !== "object") continue;
        if (p.description) p.description = localizeParamDescription(p.description);
      }
    }
  }
  return reg;
}

async function loadStatsRegistry({ openapiUrl = DEFAULT_OPENAPI_URL, contact } = {}) {
  const spec = await fetchJson(openapiUrl, { contact });
  registry = localizeRegistry(parseSpec(spec));

  try {
    fs.writeFileSync(REGISTRY_CACHE_PATH, JSON.stringify(registry, null, 2), "utf8");
  } catch {
    // best-effort cache
  }

  return registry;
}

function loadCachedStatsRegistry() {
  try {
    const raw = fs.readFileSync(REGISTRY_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.endpoints)) return null;
    registry = localizeRegistry(parsed);
    return registry;
  } catch {
    return null;
  }
}

function getStatsRegistry() {
  return registry;
}

module.exports = {
  DEFAULT_OPENAPI_URL,
  loadStatsRegistry,
  loadCachedStatsRegistry,
  getStatsRegistry,
  toLocalPath,
};
