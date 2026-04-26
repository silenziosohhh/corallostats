function cdnAvatarUrl({ id, avatar, size = 128 } = {}) {
  if (id && avatar) {
    const ext = String(avatar).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=${size}`;
  }
  return "https://cdn.discordapp.com/embed/avatars/0.png";
}

function cdnBannerUrl({ id, banner, size = 600 } = {}) {
  if (!id || !banner) return null;
  const ext = String(banner).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${id}/${banner}.${ext}?size=${size}`;
}

async function fetchDiscordMe(accessToken) {
  if (!accessToken) throw new Error("Missing Discord access token");
  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Discord /users/@me HTTP ${res.status}`);
  return await res.json();
}

async function fetchDiscordConnections(accessToken) {
  if (!accessToken) throw new Error("Missing Discord access token");
  const res = await fetch("https://discord.com/api/v10/users/@me/connections", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Discord /users/@me/connections HTTP ${res.status}`);
  return await res.json();
}

function avatarDecorationUrl(asset) {
  if (!asset) return null;
  return `https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png`;
}

function snowflakeToDate(id) {
  try {
    const snowflake = BigInt(String(id));
    const discordEpoch = 1420070400000n;
    const ms = Number((snowflake >> 22n) + discordEpoch);
    return new Date(ms);
  } catch {
    return null;
  }
}

module.exports = {
  cdnAvatarUrl,
  cdnBannerUrl,
  fetchDiscordMe,
  fetchDiscordConnections,
  avatarDecorationUrl,
  snowflakeToDate,
};
