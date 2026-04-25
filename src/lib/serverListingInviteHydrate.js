const ServerListing = require("../models/ServerListing");
const { fetchDiscordInvite } = require("./discordInvites");

function isStale(isoOrDate, ttlMs) {
  if (!isoOrDate) return true;
  const t = isoOrDate instanceof Date ? isoOrDate.getTime() : Date.parse(String(isoOrDate));
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > ttlMs;
}

function toIntOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function hydrateOne(listing, { botToken, ttlMs } = {}) {
  const inviteCode = String(listing?.discordInviteCode || "").trim();
  if (!inviteCode) return { value: listing, changed: false };

  const missing =
    listing?.discordGuildIcon == null ||
    listing?.approxPresenceCount == null ||
    listing?.approxMemberCount == null;

  const stale = isStale(listing?.inviteFetchedAt || null, ttlMs);
  if (!missing && !stale) return { value: listing, changed: false };

  try {
    const inv = await fetchDiscordInvite(inviteCode, { token: botToken || null, withCounts: true });
    const now = new Date();
    const patch = {
      discordGuildIcon: inv?.guild?.icon ? String(inv.guild.icon) : listing?.discordGuildIcon ?? null,
      approxPresenceCount: toIntOrNull(inv?.approximate_presence_count),
      approxMemberCount: toIntOrNull(inv?.approximate_member_count),
      inviteFetchedAt: now,
    };

    const changed =
      patch.discordGuildIcon !== (listing?.discordGuildIcon ?? null) ||
      patch.approxPresenceCount !== (listing?.approxPresenceCount ?? null) ||
      patch.approxMemberCount !== (listing?.approxMemberCount ?? null);

    const next = { ...listing, ...patch };
    return { value: next, changed };
  } catch {
    return { value: listing, changed: false };
  }
}

async function hydrateListings(listings, { botToken, ttlMs = 6 * 60 * 60_000, max = 8, concurrency = 3 } = {}) {
  const arr = Array.isArray(listings) ? listings : [];
  if (!arr.length) return arr;

  const out = [...arr];
  const targets = [];
  for (let i = 0; i < out.length; i++) {
    const l = out[i];
    const inviteCode = String(l?.discordInviteCode || "").trim();
    if (!inviteCode) continue;
    const missing = l?.discordGuildIcon == null || l?.approxPresenceCount == null || l?.approxMemberCount == null;
    const stale = isStale(l?.inviteFetchedAt || null, ttlMs);
    if (missing || stale) targets.push(i);
    if (targets.length >= max) break;
  }

  let cursor = 0;
  const workers = [];

  async function worker() {
    while (cursor < targets.length) {
      const idx = targets[cursor++];
      const current = out[idx];
      const res = await hydrateOne(current, { botToken, ttlMs });
      out[idx] = res.value;

      if (res.changed && current?._id) {
        try {
          await ServerListing.updateOne(
            { _id: current._id },
            {
              $set: {
                discordGuildIcon: res.value.discordGuildIcon ?? null,
                approxPresenceCount: res.value.approxPresenceCount ?? null,
                approxMemberCount: res.value.approxMemberCount ?? null,
                inviteFetchedAt: res.value.inviteFetchedAt ? new Date(res.value.inviteFetchedAt) : new Date(),
              },
            }
          );
        } catch {
          // ignore persistence failures
        }
      }
    }
  }

  for (let i = 0; i < Math.max(1, concurrency); i++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

module.exports = { hydrateListings };
