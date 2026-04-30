const ROLES = Object.freeze({
  member: "member",
  moderator: "moderator",
  ceo: "ceo",
});

const ROLE_ORDER = Object.freeze({
  [ROLES.member]: 1,
  [ROLES.moderator]: 2,
  [ROLES.ceo]: 3,
});

function normalizeRole(input) {
  const s = String(input || "").trim().toLowerCase();
  if (s === ROLES.ceo) return ROLES.ceo;
  if (s === ROLES.moderator) return ROLES.moderator;
  return ROLES.member;
}

function roleRank(role) {
  const r = normalizeRole(role);
  return ROLE_ORDER[r] || ROLE_ORDER[ROLES.member];
}

function hasAtLeastRole(userRole, minRole) {
  return roleRank(userRole) >= roleRank(minRole);
}

function parseDiscordIdList(input) {
  const raw = String(input || "").trim();
  if (!raw) return new Set();
  const out = new Set();
  for (const part of raw.split(/[,\s]+/g)) {
    const id = String(part || "").trim();
    if (!id) continue;
    if (!/^\d{15,22}$/.test(id)) continue;
    out.add(id);
  }
  return out;
}

function roleLabel(role) {
  const r = normalizeRole(role);
  if (r === ROLES.ceo) return "CEO";
  if (r === ROLES.moderator) return "Moderatore";
  return "Membro";
}

module.exports = {
  ROLES,
  normalizeRole,
  roleRank,
  hasAtLeastRole,
  parseDiscordIdList,
  roleLabel,
};

