const mongoose = require("mongoose");
const ApiKeyUsageMinute = require("../models/ApiKeyUsageMinute");
const ApiKeyUsageEndpointMinute = require("../models/ApiKeyUsageEndpointMinute");
const { getUserRateLimitSnapshot } = require("../middleware/userRateLimit");

function sumGroups(groupObj, target) {
  if (!groupObj || typeof groupObj !== "object") return;
  for (const [k, v] of Object.entries(groupObj)) {
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    target[k] = (target[k] || 0) + n;
  }
}

function bucketMsFor(range) {
  if (range === "24h") return 15 * 60_000;
  if (range === "7d") return 2 * 60 * 60_000;
  return 15 * 60_000;
}

function buildSeries({ docs, sinceMs, untilMs, bucketMs }) {
  const start = Math.floor(sinceMs / bucketMs) * bucketMs;
  const end = Math.ceil(untilMs / bucketMs) * bucketMs;
  const points = [];
  const map = new Map();

  for (const d of docs) {
    const t = new Date(d.minute).getTime();
    if (!Number.isFinite(t)) continue;
    if (t < sinceMs || t > untilMs) continue;
    const b = Math.floor(t / bucketMs) * bucketMs;
    map.set(b, (map.get(b) || 0) + Number(d.count || 0));
  }

  for (let t = start; t <= end; t += bucketMs) {
    points.push({ t, count: map.get(t) || 0 });
  }

  return points;
}

function emptyPayload({ discordId, nowMs, windowMs, max }) {
  return {
    now: nowMs,
    rateLimit: null,
    last24h: { bucketMs: bucketMsFor("24h"), total: 0, points: [], groups: [], endpoints: [] },
    last7d: { bucketMs: bucketMsFor("7d"), total: 0, points: [] },
  };
}

async function buildAnalytics({ discordId, nowMs = Date.now(), windowMs = 60_000, max = 240 } = {}) {
  const id = String(discordId || "").trim();
  if (!id) return null;

  const since24h = nowMs - 24 * 60 * 60_000;
  const since7d = nowMs - 7 * 24 * 60 * 60_000;

  const rateLimit = await getUserRateLimitSnapshot({ discordId: id, source: "api_key", windowMs, max });

  if (mongoose.connection.readyState !== 1) {
    const out = emptyPayload({ discordId: id, nowMs, windowMs, max });
    out.rateLimit = rateLimit;
    return out;
  }

  const docs = await ApiKeyUsageMinute.find({
    discordId: id,
    minute: { $gte: new Date(since7d) },
  })
    .lean()
    .sort({ minute: 1 })
    .exec();

  const byGroup24h = {};
  let total24h = 0;
  let total7d = 0;

  for (const d of docs) {
    const t = new Date(d.minute).getTime();
    const c = Number(d.count || 0);
    if (Number.isFinite(c)) total7d += c;
    if (t >= since24h) {
      if (Number.isFinite(c)) total24h += c;
      sumGroups(d.groups, byGroup24h);
    }
  }

  const series24h = buildSeries({
    docs,
    sinceMs: since24h,
    untilMs: nowMs,
    bucketMs: bucketMsFor("24h"),
  });

  const series7d = buildSeries({
    docs,
    sinceMs: since7d,
    untilMs: nowMs,
    bucketMs: bucketMsFor("7d"),
  });

  const groupsSorted = Object.entries(byGroup24h)
    .map(([k, v]) => ({ key: k, count: Number(v) || 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  let endpoints = [];
  try {
    endpoints = await ApiKeyUsageEndpointMinute.aggregate([
      { $match: { discordId: id, minute: { $gte: new Date(since24h) } } },
      { $group: { _id: "$endpointKey", count: { $sum: "$count" } } },
      { $sort: { count: -1 } },
      { $limit: 18 },
    ]).exec();
  } catch {
    endpoints = [];
  }

  const endpointsSorted = Array.isArray(endpoints)
    ? endpoints
        .map((e) => ({ key: String(e?._id || ""), count: Number(e?.count || 0) }))
        .filter((e) => e.key && e.count > 0)
    : [];

  return {
    now: nowMs,
    rateLimit,
    last24h: {
      bucketMs: bucketMsFor("24h"),
      total: total24h,
      points: series24h,
      groups: groupsSorted,
      endpoints: endpointsSorted,
    },
    last7d: {
      bucketMs: bucketMsFor("7d"),
      total: total7d,
      points: series7d,
    },
  };
}

module.exports = { buildAnalytics };
