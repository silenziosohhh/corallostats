const User = require("../models/User");
const { hasAtLeastRole, normalizeRole } = require("../rbac/roles");

function requireRolePage(minRole, { redirectTo = "/account" } = {}) {
  const min = normalizeRole(minRole);

  return async function requireRolePageMiddleware(req, res, next) {
    if (req.isAuthenticated?.() !== true) return res.redirect("/");

    const discordId = String(req.user?.id || "").trim();
    if (!discordId) return res.redirect("/");

    try {
      const user = await User.findOne({ discordId }).lean();
      const role = normalizeRole(user?.role);
      if (!user || !hasAtLeastRole(role, min)) return res.redirect(redirectTo);
      next();
    } catch {
      res.redirect(redirectTo);
    }
  };
}

module.exports = { requireRolePage };

