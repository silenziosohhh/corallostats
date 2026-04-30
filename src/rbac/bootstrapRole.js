const { ROLES, normalizeRole, roleRank, parseDiscordIdList } = require("./roles");

function bootstrapDesiredRoleForDiscordId(discordId, env = process.env) {
  const id = String(discordId || "").trim();
  if (!id) return null;

  const ceoIds = parseDiscordIdList(env.CEO_DISCORD_IDS || env.CORALLO_CEO_DISCORD_IDS || "");
  if (ceoIds.has(id)) return ROLES.ceo;

  const modIds = parseDiscordIdList(env.MODERATOR_DISCORD_IDS || env.CORALLO_MODERATOR_DISCORD_IDS || "");
  if (modIds.has(id)) return ROLES.moderator;

  return null;
}

function shouldElevateRole(currentRole, desiredRole) {
  if (!desiredRole) return false;
  const cur = normalizeRole(currentRole);
  const desired = normalizeRole(desiredRole);
  return roleRank(desired) > roleRank(cur);
}

module.exports = { bootstrapDesiredRoleForDiscordId, shouldElevateRole };

