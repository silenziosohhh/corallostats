function toFiniteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clanTopNTotalFromMembers(members, { field = "level", n = 15 } = {}) {
  const limit = Math.max(0, Math.floor(Number(n) || 0));
  if (!Array.isArray(members) || limit <= 0) return 0;

  const values = [];
  for (const m of members) {
    if (!m || typeof m !== "object") continue;
    const val = toFiniteNumber(m[field]);
    if (val == null) continue;
    values.push(val);
  }

  if (!values.length) return 0;
  values.sort((a, b) => b - a);

  let total = 0;
  for (let i = 0; i < Math.min(limit, values.length); i++) total += values[i];
  return total;
}

function rewriteClanPayloadTotalExpTop15(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const members = Array.isArray(payload.members) ? payload.members : null;
  if (!members) return payload;

  const upstreamTotal = payload.total_exp ?? null;
  const top15Total = clanTopNTotalFromMembers(members, { field: "level", n: 15 });

  return {
    ...payload,
    total_exp_upstream: upstreamTotal,
    total_exp: top15Total,
    total_exp_calc: "top15_level",
  };
}

function rewriteLeaderboardItemsTotalExpTop15(items, byClanName) {
  if (!Array.isArray(items)) return items;
  if (!byClanName || typeof byClanName !== "object") return items;

  return items.map((it) => {
    if (!it || typeof it !== "object") return it;
    const name = String(it.name || it.clan || it.clan_name || "").trim();
    if (!name) return it;
    const top15 = toFiniteNumber(byClanName[name]);
    if (top15 == null) return it;
    return {
      ...it,
      total_exp_upstream: it.total_exp ?? null,
      total_exp: top15,
      total_exp_calc: "top15_level",
    };
  });
}

module.exports = {
  clanTopNTotalFromMembers,
  rewriteClanPayloadTotalExpTop15,
  rewriteLeaderboardItemsTotalExpTop15,
};

