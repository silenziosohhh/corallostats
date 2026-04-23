const BOT_ID = "1496178595889025135";
const FALLBACK_LOCAL_AVATAR = "/images/corallo_stats_icon.png";

let cached = null;

function defaultAvatarIndex(discordId) {
  try {
    return Number((BigInt(String(discordId)) >> 22n) % 6n);
  } catch {
    return 0;
  }
}

function fallbackProfile() {
  return {
    id: BOT_ID,
    name: "Corallo Stats",
    avatarUrl: FALLBACK_LOCAL_AVATAR,
    source: "fallback",
  };
}

function avatarUrlFor(user) {
  const id = String(user?.id || BOT_ID);
  const avatar = user?.avatar ? String(user.avatar) : "";
  if (!avatar) return null;
  const ext = avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=128`;
}

async function fetchBotUser({ token }) {
  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) throw new Error(`Discord bot profile: HTTP ${res.status}`);
  return res.json();
}

async function computeProfile() {
  const token = String(process.env.DISCORD_BOT_TOKEN || "").trim();
  if (!token) return fallbackProfile();

  const user = await fetchBotUser({ token });
  const name = user?.global_name || user?.username || "Corallo Stats";
  const avatarUrl = avatarUrlFor(user) || fallbackProfile().avatarUrl;
  return { id: String(user?.id || BOT_ID), name, avatarUrl, source: "discord" };
}

async function getBotProfile({ ttlMs = 10 * 60 * 1000 } = {}) {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const value = await computeProfile();
    const effectiveTtl = value?.source === "fallback" ? Math.min(ttlMs, 60_000) : ttlMs;
    cached = { value, expiresAt: now + effectiveTtl };
    return value;
  } catch {
    const value = fallbackProfile();
    cached = { value, expiresAt: now + Math.min(ttlMs, 60_000) };
    return value;
  }
}

module.exports = { getBotProfile };
