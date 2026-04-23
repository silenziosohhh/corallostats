const mongoose = require("mongoose");
const ApiKeyRateLimitWindow = require("../models/ApiKeyRateLimitWindow");
const { hit, snapshot, resetAtMs } = require("../lib/userRateLimitStore");

function keyForRequest(req) {
  const id = String(req.apiUser?.discordId || "").trim();
  if (!id) return null;
  const src = req.apiAuthSource === "api_key" ? "api_key" : "session";
  return `${id}:${src}`;
}

function setHeaders(res, { limit, remaining, resetAt }) {
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
}

function windowStartMs(now, windowMs) {
  const ms = Number(windowMs || 0);
  if (!Number.isFinite(ms) || ms <= 0) return now;
  return Math.floor(now / ms) * ms;
}

function createUserRateLimit({ windowMs = 60_000, max = 120 } = {}) {
  return function userRateLimit(req, res, next) {
    const key = keyForRequest(req);
    if (!key) return next();

    const discordId = String(req.apiUser?.discordId || "").trim();
    const source = req.apiAuthSource === "api_key" ? "api_key" : "session";

    // DB-backed limiter for API key traffic so it's cross-device and survives restarts.
    if (source === "api_key" && mongoose.connection.readyState === 1) {
      const now = Date.now();
      const startMs = windowStartMs(now, windowMs);
      const windowStart = new Date(startMs);
      const resetAt = startMs + windowMs;

      ApiKeyRateLimitWindow.findOneAndUpdate(
        { discordId, windowStart },
        { $inc: { count: 1 }, $setOnInsert: { discordId, windowStart } },
        { upsert: true, new: true, lean: true }
      )
        .then((doc) => {
          const count = Number(doc?.count || 0);
          const remaining = max - count;
          setHeaders(res, { limit: max, remaining, resetAt });

          if (count <= max) return next();
          const retryAfterSec = Math.ceil((resetAt - now) / 1000);
          res.setHeader("Retry-After", String(Math.max(retryAfterSec, 1)));
          res.status(429).json({ error: "Rate limit: troppe richieste" });
        })
        .catch(() => {
          // If DB fails, fall back to in-memory limiter.
          const { windowStart, count, now } = hit({ key, windowMs });
          const resetAt = resetAtMs({ windowStart, windowMs });
          const remaining = max - count;

          setHeaders(res, { limit: max, remaining, resetAt });
          if (count <= max) return next();

          const retryAfterSec = Math.ceil((resetAt - now) / 1000);
          res.setHeader("Retry-After", String(Math.max(retryAfterSec, 1)));
          res.status(429).json({ error: "Rate limit: troppe richieste" });
        });

      return;
    }

    // Session traffic stays in-memory (cheap).
    const { windowStart, count, now } = hit({ key, windowMs });
    const resetAt = resetAtMs({ windowStart, windowMs });
    const remaining = max - count;

    setHeaders(res, { limit: max, remaining, resetAt });

    if (count <= max) return next();

    const retryAfterSec = Math.ceil((resetAt - now) / 1000);
    res.setHeader("Retry-After", String(Math.max(retryAfterSec, 1)));
    res.status(429).json({ error: "Rate limit: troppe richieste" });
  };
}

async function getUserRateLimitSnapshot({ discordId, source = "api_key", windowMs = 60_000, max = 120 } = {}) {
  const key = String(discordId || "").trim();
  if (!key) return null;
  const src = source === "session" ? "session" : "api_key";

  if (src === "api_key" && mongoose.connection.readyState === 1) {
    const now = Date.now();
    const startMs = windowStartMs(now, windowMs);
    const resetAt = startMs + windowMs;
    const windowStart = new Date(startMs);

    try {
      const doc = await ApiKeyRateLimitWindow.findOne({ discordId: key, windowStart }).lean();
      const count = Number(doc?.count || 0);
      return {
        source: src,
        windowMs,
        max,
        count,
        remaining: Math.max(0, max - count),
        resetAt,
        now,
      };
    } catch {
      return {
        source: src,
        windowMs,
        max,
        count: 0,
        remaining: max,
        resetAt,
        now,
      };
    }
  }

  const { windowStart, count, now } = snapshot({ key: `${key}:${src}`, windowMs });
  const resetAt = resetAtMs({ windowStart, windowMs });
  return {
    source: src,
    windowMs,
    max,
    count,
    remaining: Math.max(0, max - count),
    resetAt,
    now,
  };
}

module.exports = { createUserRateLimit, getUserRateLimitSnapshot };
