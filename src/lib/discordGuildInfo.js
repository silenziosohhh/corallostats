async function fetchDiscordGuild(guildId, { token }) {
  const id = String(guildId || "").trim();
  const t = String(token || "").trim();
  if (!id) {
    const err = new Error("Missing guild id");
    err.code = "missing_guild_id";
    throw err;
  }
  if (!t) {
    const err = new Error("Missing discord token");
    err.code = "missing_token";
    throw err;
  }

  const url = `https://discord.com/api/v10/guilds/${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers: { Authorization: `Bot ${t}` } });
  if (!res.ok) {
    const err = new Error(`Discord guild fetch failed (${res.status})`);
    err.code = res.status === 401 || res.status === 403 ? "discord_auth" : "discord_fetch_failed";
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchDiscordGuildOwnerId(guildId, { token }) {
  const guild = await fetchDiscordGuild(guildId, { token });
  const ownerId = String(guild?.owner_id || "").trim();
  if (!ownerId) {
    const err = new Error("Missing owner_id");
    err.code = "discord_owner_missing";
    throw err;
  }
  return ownerId;
}

module.exports = { fetchDiscordGuild, fetchDiscordGuildOwnerId };

