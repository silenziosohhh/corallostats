function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function getConfig() {
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }

  const sessionSecret = process.env.SESSION_SECRET || null;

  const discordEnabled =
    Boolean(process.env.DISCORD_CLIENT_ID) &&
    Boolean(process.env.DISCORD_CLIENT_SECRET) &&
    Boolean(process.env.DISCORD_CALLBACK_URL);

  const discordScopesRaw = process.env.DISCORD_SCOPES || "identify";
  const discordScopes = discordScopesRaw
    .split(/[,\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    port,
    session: {
      secret: sessionSecret,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAgeMs: 7 * 24 * 60 * 60 * 1000,
      },
    },
    discord: discordEnabled
      ? {
          clientID: requireEnv("DISCORD_CLIENT_ID"),
          clientSecret: requireEnv("DISCORD_CLIENT_SECRET"),
          callbackURL: requireEnv("DISCORD_CALLBACK_URL"),
          scopes: discordScopes.length ? discordScopes : ["identify"],
        }
      : null,
  };
}

module.exports = { getConfig };
