function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function createRateLimit({ windowMs = 60_000, max = 120 } = {}) {
  const hits = new Map();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const ip = getClientIp(req);

    const entry = hits.get(ip);
    if (!entry || now - entry.windowStart >= windowMs) {
      hits.set(ip, { windowStart: now, count: 1 });
      return next();
    }

    entry.count += 1;
    if (entry.count <= max) return next();

    const retryAfterSec = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    res.setHeader("Retry-After", String(Math.max(retryAfterSec, 1)));
    res.status(429).json({ error: "Rate limit: troppe richieste" });
  };
}

module.exports = { createRateLimit };

