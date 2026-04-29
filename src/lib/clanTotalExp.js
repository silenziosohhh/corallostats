function memberXpValue(member) {
  if (!member || typeof member !== "object") return null;
  const raw = member.total_exp ?? member.totalExp ?? member.exp ?? member.xp ?? member.level ?? null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function clanTotalExpTopNFromMembers(members, n) {
  const limit = Math.max(0, Math.floor(Number(n) || 0));
  if (!Array.isArray(members) || limit <= 0) return 0;

  const values = [];
  for (const m of members) {
    const v = memberXpValue(m);
    if (v == null) continue;
    values.push(v);
  }

  if (!values.length) return 0;
  values.sort((a, b) => b - a);

  let total = 0;
  for (let i = 0; i < Math.min(limit, values.length); i++) total += values[i];
  return total;
}

function withClanTotalExpTop15(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const members = Array.isArray(payload.members) ? payload.members : null;
  if (!members) return payload;

  const top15Total = clanTotalExpTopNFromMembers(members, 15);
  const allTotal = clanTotalExpTopNFromMembers(members, Number.MAX_SAFE_INTEGER);

  return {
    ...payload,
    total_exp: top15Total,
    total_exp_all_members: allTotal,
  };
}

module.exports = {
  memberXpValue,
  clanTotalExpTopNFromMembers,
  withClanTotalExpTop15,
};

