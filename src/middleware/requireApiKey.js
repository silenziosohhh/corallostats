const { hashApiKey } = require("../lib/apiKeys");
const User = require("../models/User");

function extractApiKey(req) {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token) return token;
  }

  const x = req.headers["x-api-key"];
  if (typeof x === "string" && x.trim()) return x.trim();

  const q = req.query?.api_key;
  if (typeof q === "string" && q.trim()) return q.trim();

  return null;
}

function requireApiKey() {
  return async function requireApiKeyMiddleware(req, res, next) {
    const apiKey = extractApiKey(req);
    if (!apiKey) return res.status(401).json({ error: "Missing API key" });

    const apiKeyHash = hashApiKey(apiKey);

    try {
      const user = await User.findOne({ apiKeyHash }).lean();
      if (!user) return res.status(403).json({ error: "Invalid API key" });
      req.apiUser = user;
      next();
    } catch (err) {
      res.status(500).json({ error: "Auth error" });
    }
  };
}

function requirePrivateAccess() {
  return async function requirePrivateAccessMiddleware(req, res, next) {
    if (req.isAuthenticated?.() === true) {
      const discordId = String(req.user?.id || "");
      if (!discordId) return res.status(401).json({ error: "Not authenticated" });
      try {
        const user = await User.findOne({ discordId }).lean();
        if (!user) return res.status(403).json({ error: "User not provisioned" });
        req.apiUser = user;
        req.apiAuthSource = "session";
        return next();
      } catch {
        return res.status(500).json({ error: "Auth error" });
      }
    }

    const apiKey = extractApiKey(req);
    if (!apiKey) return res.status(401).json({ error: "Missing API key" });

    const apiKeyHash = hashApiKey(apiKey);
    try {
      const user = await User.findOne({ apiKeyHash }).lean();
      if (!user) return res.status(403).json({ error: "Invalid API key" });
      req.apiUser = user;
      req.apiAuthSource = "api_key";
      next();
    } catch {
      res.status(500).json({ error: "Auth error" });
    }
  };
}

module.exports = { requireApiKey, requirePrivateAccess };
