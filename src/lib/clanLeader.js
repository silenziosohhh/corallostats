function toRoleNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickRole3Leader(members) {
  const list = Array.isArray(members) ? members : [];
  let best = null;

  for (const m of list) {
    if (!m || typeof m !== "object") continue;
    const username = String(m.username || "").trim();
    if (!username) continue;

    const role = toRoleNumber(m.role) ?? 0;
    if (role !== 3) continue;
    const level = toRoleNumber(m.level) ?? 0;
    const wins = toRoleNumber(m.wins) ?? 0;
    const played = toRoleNumber(m.played) ?? 0;
    const finalKills = toRoleNumber(m.final_kills ?? m.finalKills) ?? 0;

    const cand = { username, role, level, wins, played, finalKills };
    if (!best) {
      best = cand;
      continue;
    }

    if (cand.level !== best.level) {
      if (cand.level > best.level) best = cand;
      continue;
    }
    if (cand.wins !== best.wins) {
      if (cand.wins > best.wins) best = cand;
      continue;
    }
    if (cand.played !== best.played) {
      if (cand.played > best.played) best = cand;
      continue;
    }
    if (cand.finalKills !== best.finalKills) {
      if (cand.finalKills > best.finalKills) best = cand;
      continue;
    }
  }

  if (!best) return null;
  return { username: best.username, role: best.role };
}

async function fetchJsonWithCache({ url, cache, ttlMs, headers }) {
  const cacheKey = `GET ${url}`;
  const cached = cache?.read?.(cacheKey);
  if (cached && cached.status === 200 && Date.now() - Number(cached.fetchedAt || 0) < ttlMs) return cached.body;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  cache?.write?.(cacheKey, { fetchedAt: Date.now(), status: 200, body });
  return body;
}

async function computeClanLeadersForLeaderboard({
  upstreamHost = "https://coralmc.it",
  contact = null,
  ttlMs = 10 * 60 * 1000,
  cache,
  clans,
} = {}) {
  const out = {};
  const list = Array.isArray(clans) ? clans.map((c) => String(c || "").trim()).filter(Boolean) : [];
  if (!list.length) return out;

  const headers = { Accept: "application/json" };
  if (contact) headers["X-Contact"] = contact;

  const seen = new Set();
  const uniq = [];
  for (const name of list) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(name);
  }

  const inflight = new Map();
  const concurrency = Math.max(2, Math.min(10, Number(process.env.CLAN_LEADER_CONCURRENCY || 5)));
  let idx = 0;

  async function getClan(name) {
    const url = new URL(`/api/v1/stats/bedwars/clans/${encodeURIComponent(name)}`, upstreamHost).toString();
    if (inflight.has(url)) return inflight.get(url);
    const p = fetchJsonWithCache({ url, cache, ttlMs, headers }).finally(() => inflight.delete(url));
    inflight.set(url, p);
    return p;
  }

  async function worker() {
    while (idx < uniq.length) {
      const i = idx++;
      const name = uniq[i];
      try {
        const clan = await getClan(name);
        const leader = pickRole3Leader(clan?.members);
        if (leader) out[name] = leader;
      } catch {
        // ignore
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

module.exports = { computeClanLeadersForLeaderboard };
