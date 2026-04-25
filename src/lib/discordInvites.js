function parseDiscordInviteCode(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;

  if (/^[a-zA-Z0-9-_]{2,32}$/.test(s)) return s;

  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (host === "discord.gg" || host.endsWith(".discord.gg")) {
      const code = u.pathname.replace(/^\/+/, "").split("/")[0] || "";
      if (/^[a-zA-Z0-9-_]{2,32}$/.test(code)) return code;
      return null;
    }
    if (host === "discord.com" || host.endsWith(".discord.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "invite");
      if (idx >= 0) {
        const code = parts[idx + 1] || "";
        if (/^[a-zA-Z0-9-_]{2,32}$/.test(code)) return code;
      }
      return null;
    }
  } catch {
    return null;
  }

  return null;
}

async function fetchDiscordInvite(code, { token, withCounts = true } = {}) {
  const c = String(code || "").trim();
  if (!c) throw new Error("Missing invite code");

  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bot ${token}`;

  const res = await fetch(
    `https://discord.com/api/v10/invites/${encodeURIComponent(c)}?with_counts=${withCounts ? "true" : "false"}&with_expiration=true`,
    {
      headers,
    }
  );
  if (!res.ok) {
    const err = new Error(`Discord invite HTTP ${res.status}`);
    err.status = res.status;
    if (res.status === 404) err.code = "invite_not_found";
    if (res.status === 401 || res.status === 403) err.code = "discord_auth";
    if (res.status === 429) err.code = "rate_limited";
    throw err;
  }
  return res.json();
}

async function botHasGuild({ guildId, token }) {
  const id = String(guildId || "").trim();
  if (!id) throw new Error("Missing guild id");
  if (!token) throw new Error("Missing bot token");

  const res = await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bot ${token}`, Accept: "application/json" },
  });

  if (res.status === 404 || res.status === 403) return false;
  if (!res.ok) {
    const err = new Error(`Discord guild check HTTP ${res.status}`);
    err.status = res.status;
    if (res.status === 401) err.code = "discord_auth";
    if (res.status === 429) err.code = "rate_limited";
    throw err;
  }
  return true;
}

function botInviteUrl({ clientId, permissions = "0" } = {}) {
  const id = String(clientId || "").trim();
  if (!id) return null;
  const p = String(permissions || "0");
  const scope = encodeURIComponent("bot applications.commands");
  return `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(id)}&permissions=${encodeURIComponent(p)}&scope=${scope}`;
}

module.exports = {
  parseDiscordInviteCode,
  fetchDiscordInvite,
  botHasGuild,
  botInviteUrl,
};
