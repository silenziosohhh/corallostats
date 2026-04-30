const User = require("../models/User");

function requireAppUser() {
  return async function requireAppUserMiddleware(req, res, next) {
    if (req.isAuthenticated?.() !== true) {
      return res.status(401).json({ error: "Non autenticato" });
    }

    const discordId = String(req.user?.id || "").trim();
    if (!discordId) return res.status(401).json({ error: "Non autenticato" });

    try {
      const user = await User.findOne({ discordId });
      if (!user) return res.status(403).json({ error: "User not provisioned" });
      req.appUser = user;
      next();
    } catch {
      res.status(500).json({ error: "Auth error" });
    }
  };
}

module.exports = { requireAppUser };

