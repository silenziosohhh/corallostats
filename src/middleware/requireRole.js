const { requireAppUser } = require("./requireAppUser");
const { hasAtLeastRole, normalizeRole, roleLabel } = require("../rbac/roles");

function requireRole(minRole) {
  const ensure = requireAppUser();
  const min = normalizeRole(minRole);

  return async function requireRoleMiddleware(req, res, next) {
    return ensure(req, res, () => {
      const role = normalizeRole(req.appUser?.role);
      if (!hasAtLeastRole(role, min)) {
        return res.status(403).json({ error: `Permesso richiesto: ${roleLabel(min)}` });
      }
      next();
    });
  };
}

module.exports = { requireRole };

