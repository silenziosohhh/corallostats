function toFiniteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeJsonParseArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  const s = String(raw || "").trim();
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function memberTotalDivisionExp(playerPayload) {
  if (!playerPayload || typeof playerPayload !== "object") return null;
  const current = toFiniteNumber(playerPayload.current_division_exp);
  return current == null ? null : current;
}

function topUsernamesFromClanMembers(members, n) {
  const limit = Math.max(0, Math.floor(Number(n) || 0));
  if (!Array.isArray(members) || limit <= 0) return [];

  const decorated = [];
  for (const m of members) {
    if (!m || typeof m !== "object") continue;
    const username = String(m.username || "").trim();
    if (!username) continue;
    const level = toFiniteNumber(m.level) ?? 0;
    decorated.push({ username, level });
  }

  decorated.sort((a, b) => {
    if (b.level !== a.level) return b.level - a.level;
    return a.username.localeCompare(b.username);
  });

  const out = [];
  const seen = new Set();
  for (const it of decorated) {
    const key = it.username.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it.username);
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchJsonWithUpstreamCache({ url, cache, ttlMs, headers }) {
  const cacheKey = `GET ${url}`;
  const cached = cache.read(cacheKey);
  if (cached && cached.status === 200 && Date.now() - Number(cached.fetchedAt || 0) < ttlMs) return cached.body;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  cache.write(cacheKey, { fetchedAt: Date.now(), status: 200, body });
  return body;
}

async function computeClanTop15Exp({
  upstreamHost = "https://coralmc.it",
  contact = null,
  ttlMs = 10 * 60 * 1000,
  cache,
  clanName,
} = {}) {
  const name = String(clanName || "").trim();
  if (!name) return null;

  const headers = { Accept: "application/json" };
  if (contact) headers["X-Contact"] = contact;

  const clanUrl = new URL(`/api/v1/stats/bedwars/clans/${encodeURIComponent(name)}`, upstreamHost).toString();
  const clan = await fetchJsonWithUpstreamCache({ url: clanUrl, cache, ttlMs, headers });

  const members = Array.isArray(clan?.members) ? clan.members : [];
  const top15Users = topUsernamesFromClanMembers(members, 15);

  const concurrency = Math.max(2, Math.min(8, Number(process.env.CLAN_TOP15_MEMBER_CONCURRENCY || 4)));
  let idx = 0;
  let total = 0;

  async function worker() {
    while (idx < top15Users.length) {
      const i = idx++;
      const username = top15Users[i];
      const playerUrl = new URL(`/api/v1/stats/bedwars/${encodeURIComponent(username)}`, upstreamHost).toString();
      try {
        const payload = await fetchJsonWithUpstreamCache({ url: playerUrl, cache, ttlMs, headers });
        const v = memberTotalDivisionExp(payload);
        if (v != null) total += v;
      } catch {
        // ignore
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return {
    clanName: clan?.name || name,
    total_exp_top15: total,
    total_exp_upstream: clan?.total_exp ?? null,
    total_exp_calc: "top15_members_current_division_exp",
    member_count: Array.isArray(clan?.members) ? clan.members.length : null,
    tag: clan?.tag ?? null,
    color: clan?.color ?? null,
  };
}

module.exports = {
  memberTotalDivisionExp,
  topUsernamesFromClanMembers,
  computeClanTop15Exp,
};
