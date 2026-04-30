const express = require("express");
const { readCache, writeCache } = require("./upstreamCache");
const { getStatsRegistry } = require("./statsRegistry");
const { getDashboardClanOrder } = require("../lib/dashboardClanOrder");
const { computeClanTop15Exp } = require("../lib/clanTop15Exp");
const { computeClanLeadersForLeaderboard } = require("../lib/clanLeader");

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

  const concurrency = Math.max(2, Math.min(8, Number(process.env.CLAN_TOP15_CONCURRENCY || 4)));
  let idx = 0;

  async function worker() {
    while (idx < list.length) {
      const i = idx++;
      const name = list[i];
      try {
        const computed = await computeClanTop15Exp({
          upstreamHost,
          contact,
          ttlMs,
          cache: { read: readCache, write: writeCache },
          clanName: name,
        });
        if (computed && typeof computed.total_exp_top15 === "number") out[name] = computed.total_exp_top15;
      } catch {
        // ignore
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

async function computeLeaderMapForLeaderboard({ upstreamHost, contact, ttlMs, clans }) {
  try {
    return await computeClanLeadersForLeaderboard({
      upstreamHost,
      contact,
      ttlMs,
      cache: { read: readCache, write: writeCache },
      clans,
    });
  } catch {
    return {};
  }
}

function applyLeaderMapToLeaderboard(payload, leaderMap) {
  const picked = pickLeaderboardArray(payload);
  if (!picked) return payload;

  const lower = new Map();
  for (const [k, v] of Object.entries(leaderMap || {})) {
    if (!k) continue;
    lower.set(String(k).toLowerCase(), v);
  }

  const rewrittenArr = picked.arr.map((it) => {
    if (!it || typeof it !== "object") return it;
    if (it.leader) return it;
    const name = extractClanName(it);
    const leader = name ? leaderMap?.[name] || lower.get(String(name).toLowerCase()) || null : null;
    if (!leader) return it;
    return { ...it, leader };
  });

  return picked.key ? { ...payload, [picked.key]: rewrittenArr } : rewrittenArr;
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

  const endpoints = Array.isArray(registry.endpoints) ? [...registry.endpoints] : [];
  endpoints.sort((a, b) => {
    const ap = String(a?.localPathTemplate || "");
    const bp = String(b?.localPathTemplate || "");
    const aParams = (ap.match(/\{[^}]+\}/g) || []).length;
    const bParams = (bp.match(/\{[^}]+\}/g) || []).length;
    if (aParams !== bParams) return aParams - bParams; // static first
    if (bp.length !== ap.length) return bp.length - ap.length; // longer first
    return ap.localeCompare(bp);
  });

  for (const ep of endpoints) {
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
        if (rewriteClanTotalTop15 && clanXpCalcMode() === "top15") {
          try {
            const computed = await computeClanTop15Exp({
              upstreamHost,
              contact,
              ttlMs,
              cache: { read: readCache, write: writeCache },
              clanName: req.params.clanName,
            });
            if (computed) {
              body = {
                ...body,
                total_exp_upstream: body?.total_exp ?? null,
                total_exp: computed.total_exp_top15,
                total_exp_calc: computed.total_exp_calc,
              };
            }
          } catch {
            // ignore
          }
        }
        if (matchDashboardOrder) {
          body = reorderBedwarsClansLeaderboardLikeDashboard(body);
          if (clanXpCalcMode() === "top15") {
            const picked = pickLeaderboardArray(body);
            const names = picked?.arr ? picked.arr.map((x) => extractClanName(x)).filter(Boolean) : [];
            const top15Map = await computeTop15MapForLeaderboard({ upstreamHost, contact, ttlMs, clans: names });
            if (picked) {
              const rewrittenArr = picked.arr.map((it) => {
                if (!it || typeof it !== "object") return it;
                const name = extractClanName(it);
                const v = name && top15Map[name] != null ? Number(top15Map[name]) : null;
                if (!Number.isFinite(v)) return it;
                return { ...it, total_exp_upstream: it.total_exp ?? null, total_exp: v, total_exp_calc: "top15_members_current_division_exp" };
              });
              body = picked.key ? { ...body, [picked.key]: rewrittenArr } : rewrittenArr;
            }
          }

          const picked = pickLeaderboardArray(body);
          const names = picked?.arr ? picked.arr.map((x) => extractClanName(x)).filter(Boolean) : [];
          const leaderMap = await computeLeaderMapForLeaderboard({ upstreamHost, contact, ttlMs, clans: names });
          body = applyLeaderMapToLeaderboard(body, leaderMap);
        }
        return res.status(200).json(body);
      }

      if (inflight.has(cacheKey)) {
        try {
          const out = await inflight.get(cacheKey);
          res.setHeader("X-Cache", out?.fromCache ? "HIT" : "MISS");
          let body = out.body;
          if (rewriteClanTotalTop15 && out.status === 200 && clanXpCalcMode() === "top15") {
            try {
              const computed = await computeClanTop15Exp({
                upstreamHost,
                contact,
                ttlMs,
                cache: { read: readCache, write: writeCache },
                clanName: req.params.clanName,
              });
              if (computed) {
                body = {
                  ...body,
                  total_exp_upstream: body?.total_exp ?? null,
                  total_exp: computed.total_exp_top15,
                  total_exp_calc: computed.total_exp_calc,
                };
              }
            } catch {
              // ignore
            }
          }
          if (matchDashboardOrder && out.status === 200) {
            body = reorderBedwarsClansLeaderboardLikeDashboard(body);
            if (clanXpCalcMode() === "top15") {
              const picked = pickLeaderboardArray(body);
              const names = picked?.arr ? picked.arr.map((x) => extractClanName(x)).filter(Boolean) : [];
              const top15Map = await computeTop15MapForLeaderboard({ upstreamHost, contact, ttlMs, clans: names });
              if (picked) {
                const rewrittenArr = picked.arr.map((it) => {
                  if (!it || typeof it !== "object") return it;
                  const name = extractClanName(it);
                  const v = name && top15Map[name] != null ? Number(top15Map[name]) : null;
                  if (!Number.isFinite(v)) return it;
                return { ...it, total_exp_upstream: it.total_exp ?? null, total_exp: v, total_exp_calc: "top15_members_current_division_exp" };
              });
                body = picked.key ? { ...body, [picked.key]: rewrittenArr } : rewrittenArr;
              }
            }

            const picked = pickLeaderboardArray(body);
            const names = picked?.arr ? picked.arr.map((x) => extractClanName(x)).filter(Boolean) : [];
            const leaderMap = await computeLeaderMapForLeaderboard({ upstreamHost, contact, ttlMs, clans: names });
            body = applyLeaderMapToLeaderboard(body, leaderMap);
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
        if (rewriteClanTotalTop15 && out.status === 200 && clanXpCalcMode() === "top15") {
          try {
            const computed = await computeClanTop15Exp({
              upstreamHost,
              contact,
              ttlMs,
              cache: { read: readCache, write: writeCache },
              clanName: req.params.clanName,
            });
            if (computed) {
              body = {
                ...body,
                total_exp_upstream: body?.total_exp ?? null,
                total_exp: computed.total_exp_top15,
                total_exp_calc: computed.total_exp_calc,
              };
            }
          } catch {
            // ignore
          }
        }
        if (matchDashboardOrder && out.status === 200) {
          body = reorderBedwarsClansLeaderboardLikeDashboard(body);
          if (clanXpCalcMode() === "top15") {
            const picked = pickLeaderboardArray(body);
            const names = picked?.arr ? picked.arr.map((x) => extractClanName(x)).filter(Boolean) : [];
            const top15Map = await computeTop15MapForLeaderboard({ upstreamHost, contact, ttlMs, clans: names });
            if (picked) {
              const rewrittenArr = picked.arr.map((it) => {
                if (!it || typeof it !== "object") return it;
                const name = extractClanName(it);
                const v = name && top15Map[name] != null ? Number(top15Map[name]) : null;
                if (!Number.isFinite(v)) return it;
                return { ...it, total_exp_upstream: it.total_exp ?? null, total_exp: v, total_exp_calc: "top15_members_current_division_exp" };
              });
              body = picked.key ? { ...body, [picked.key]: rewrittenArr } : rewrittenArr;
            }
          }

          const picked = pickLeaderboardArray(body);
          const names = picked?.arr ? picked.arr.map((x) => extractClanName(x)).filter(Boolean) : [];
          const leaderMap = await computeLeaderMapForLeaderboard({ upstreamHost, contact, ttlMs, clans: names });
          body = applyLeaderMapToLeaderboard(body, leaderMap);
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
