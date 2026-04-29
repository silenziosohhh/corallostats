const express = require("express");
const { readCache, writeCache } = require("./upstreamCache");
const { getStatsRegistry } = require("./statsRegistry");
const { getDashboardClanOrder } = require("../lib/dashboardClanOrder");
const {
  rewriteClanPayloadTotalExpTop15,
  rewriteLeaderboardItemsTotalExpTop15,
} = require("../lib/clanTop15Exp");

function normalizeClanName(name) {
  const s = String(name || "").trim();
  return s ? s.toLowerCase() : null;
}

function extractClanName(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return null;

  const candidates = [
    item.clanName,
    item.clan_name,
    item.clan,
    item.name,
    item.title,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

function pickLeaderboardArray(payload) {
  if (Array.isArray(payload)) return { key: null, arr: payload };
  if (!payload || typeof payload !== "object") return null;

  const keys = ["leaderboard", "clans", "items", "data", "results"];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return { key, arr: payload[key] };
  }
  return null;
}

function reorderBedwarsClansLeaderboardLikeDashboard(payload) {
  const picked = pickLeaderboardArray(payload);
  if (!picked) return payload;

  const order = getDashboardClanOrder();
  if (!order || order.size === 0) return payload;

  const decorated = picked.arr.map((item, idx) => {
    const name = extractClanName(item);
    const key = normalizeClanName(name);
    const rank = key && order.has(key) ? order.get(key) : Number.POSITIVE_INFINITY;
    return { item, idx, rank };
  });

  decorated.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.idx - b.idx;
  });

  const sorted = decorated.map((x) => x.item);
  if (!picked.key) return sorted;
  return { ...payload, [picked.key]: sorted };
}

function clanXpCalcMode() {
  const raw = String(process.env.CLAN_XP_CALC || "top15").toLowerCase().trim();
  if (raw === "upstream") return "upstream";
  if (raw === "top15") return "top15";
  return "top15";
}

async function computeTop15MapForLeaderboard({ upstreamHost, contact, ttlMs, clans }) {
  const out = {};
  if (clanXpCalcMode() !== "top15") return out;

  const list = Array.isArray(clans) ? clans.filter(Boolean) : [];
  if (!list.length) return out;

  const headers = { Accept: "application/json" };
  if (contact) headers["X-Contact"] = contact;

  const concurrency = Math.max(2, Math.min(8, Number(process.env.CLAN_TOP15_CONCURRENCY || 5)));
  let idx = 0;

  async function worker() {
    while (idx < list.length) {
      const i = idx++;
      const name = list[i];
      const url = new URL(`/api/v1/stats/bedwars/clans/${encodeURIComponent(name)}`, upstreamHost).toString();
      const cacheKey = `GET ${url}`;

      const cached = readCache(cacheKey);
      if (cached && cached.status === 200 && isFresh(cached, ttlMs)) {
        const rewritten = rewriteClanPayloadTotalExpTop15(cached.body);
        if (rewritten && typeof rewritten === "object") out[name] = rewritten.total_exp;
        continue;
      }

      try {
        const res = await fetch(url, { headers });
        const status = res.status;
        const body = await res.json().catch(() => null);
        if (status >= 200 && status < 300) writeCache(cacheKey, { fetchedAt: Date.now(), status: 200, body });
        if (status >= 200 && status < 300) {
          const rewritten = rewriteClanPayloadTotalExpTop15(body);
          if (rewritten && typeof rewritten === "object") out[name] = rewritten.total_exp;
        }
      } catch {
        // ignore
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

function buildUpstreamUrl({ host, upstreamTemplate, params, query }) {
  let p = upstreamTemplate;
  for (const [k, v] of Object.entries(params || {})) {
    p = p.replaceAll(`{${k}}`, encodeURIComponent(String(v)));
  }

  const url = new URL(p, host);
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, String(item));
      continue;
    }
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function toExpressPath(localTemplate) {
  // /stats/player/{username} -> /stats/player/:username
  return localTemplate.replace(/\{([^}]+)\}/g, ":$1");
}

function isFresh(entry, ttlMs) {
  if (!entry || !entry.fetchedAt) return false;
  const age = Date.now() - Number(entry.fetchedAt);
  return Number.isFinite(age) && age >= 0 && age < ttlMs;
}

function createStatsRouter({
  upstreamHost = "https://coralmc.it",
  contact,
  ttlMs = 5 * 60 * 1000,
} = {}) {
  const router = express.Router();
  const registry = getStatsRegistry();

  if (!registry) {
    router.use("/stats", (req, res) => res.status(503).json({ error: "Stats registry not loaded" }));
    return router;
  }

  const inflight = new Map();

  for (const ep of registry.endpoints) {
    const expressPath = toExpressPath(ep.localPathTemplate);
    const method = ep.method.toLowerCase();
    if (typeof router[method] !== "function") continue;

    router[method](expressPath, async (req, res) => {
      const matchDashboardOrder =
        ep.method === "GET" && ep.localPathTemplate === "/stats/bedwars/clans/leaderboard";
      const rewriteClanTotalTop15 =
        ep.method === "GET" && ep.localPathTemplate === "/stats/bedwars/clans/{clanName}";

      const upstreamUrl = buildUpstreamUrl({
        host: upstreamHost,
        upstreamTemplate: ep.upstreamPathTemplate,
        params: req.params,
        query: req.query,
      });

      const cacheKey = `${ep.method} ${upstreamUrl}`;
      const cached = readCache(cacheKey);
      if (isFresh(cached, ttlMs) && cached.status === 200) {
        res.setHeader("X-Cache", "HIT");
        let body = cached.body;
        if (rewriteClanTotalTop15 && clanXpCalcMode() === "top15") body = rewriteClanPayloadTotalExpTop15(body);
        if (matchDashboardOrder) {
          body = reorderBedwarsClansLeaderboardLikeDashboard(body);
          if (clanXpCalcMode() === "top15") {
            const picked = pickLeaderboardArray(body);
            const names = picked?.arr ? picked.arr.map((x) => extractClanName(x)).filter(Boolean) : [];
            const top15Map = await computeTop15MapForLeaderboard({ upstreamHost, contact, ttlMs, clans: names });
            if (picked) {
              const rewrittenArr = rewriteLeaderboardItemsTotalExpTop15(picked.arr, top15Map);
              body = picked.key ? { ...body, [picked.key]: rewrittenArr } : rewrittenArr;
            }
          }
        }
        return res.status(200).json(body);
      }

      if (inflight.has(cacheKey)) {
        try {
          const out = await inflight.get(cacheKey);
          res.setHeader("X-Cache", out?.fromCache ? "HIT" : "MISS");
          let body = out.body;
          if (rewriteClanTotalTop15 && out.status === 200 && clanXpCalcMode() === "top15") body = rewriteClanPayloadTotalExpTop15(body);
          if (matchDashboardOrder && out.status === 200) {
            body = reorderBedwarsClansLeaderboardLikeDashboard(body);
            if (clanXpCalcMode() === "top15") {
              const picked = pickLeaderboardArray(body);
              const names = picked?.arr ? picked.arr.map((x) => extractClanName(x)).filter(Boolean) : [];
              const top15Map = await computeTop15MapForLeaderboard({ upstreamHost, contact, ttlMs, clans: names });
              if (picked) {
                const rewrittenArr = rewriteLeaderboardItemsTotalExpTop15(picked.arr, top15Map);
                body = picked.key ? { ...body, [picked.key]: rewrittenArr } : rewrittenArr;
              }
            }
          }
          return res.status(out.status).json(body);
        } catch {
          return res.status(502).json({ error: "Upstream error" });
        }
      }

      const task = (async () => {
        const headers = { Accept: "application/json" };
        if (contact) headers["X-Contact"] = contact;

        let response = null;
        try {
          response = await fetch(upstreamUrl, { headers });
        } catch (err) {
          if (cached && cached.status === 200) {
            return { status: 200, body: cached.body, fromCache: true, stale: true, upstreamStatus: 0 };
          }
          throw err;
        }

        const status = response.status;
        let body = null;
        try {
          body = await response.json();
        } catch {
          body = { error: "Upstream returned non-JSON response" };
        }

        const entry = {
          fetchedAt: Date.now(),
          status,
          body,
        };

        const ok = status >= 200 && status < 300;
        if (ok) writeCache(cacheKey, entry);

        if (!ok && status >= 500 && cached && cached.status === 200) {
          return { status: 200, body: cached.body, fromCache: true, stale: true, upstreamStatus: status };
        }

        return { status: ok ? 200 : status, body, fromCache: false, stale: false, upstreamStatus: status };
      })();

      inflight.set(cacheKey, task);
      try {
        const out = await task;
        if (out?.fromCache && out?.stale) {
          res.setHeader("X-Cache", "STALE");
          res.setHeader("X-Upstream-Status", String(out.upstreamStatus || 0));
        } else {
          res.setHeader("X-Cache", "MISS");
        }
        let body = out.body;
        if (rewriteClanTotalTop15 && out.status === 200 && clanXpCalcMode() === "top15") body = rewriteClanPayloadTotalExpTop15(body);
        if (matchDashboardOrder && out.status === 200) {
          body = reorderBedwarsClansLeaderboardLikeDashboard(body);
          if (clanXpCalcMode() === "top15") {
            const picked = pickLeaderboardArray(body);
            const names = picked?.arr ? picked.arr.map((x) => extractClanName(x)).filter(Boolean) : [];
            const top15Map = await computeTop15MapForLeaderboard({ upstreamHost, contact, ttlMs, clans: names });
            if (picked) {
              const rewrittenArr = rewriteLeaderboardItemsTotalExpTop15(picked.arr, top15Map);
              body = picked.key ? { ...body, [picked.key]: rewrittenArr } : rewrittenArr;
            }
          }
        }
        res.status(out.status).json(body);
      } catch (err) {
        res.status(502).json({ error: err?.message || "Upstream error" });
      } finally {
        inflight.delete(cacheKey);
      }
    });
  }

  return router;
}

module.exports = { createStatsRouter };
