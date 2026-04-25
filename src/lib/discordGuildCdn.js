function guildIconUrl({ guildId, iconHash, size = 96 } = {}) {
  const id = String(guildId || "").trim();
  const hash = String(iconHash || "").trim();
  if (!id || !hash) return null;
  const ext = hash.startsWith("a_") ? "gif" : "png";
  const s = Number(size);
  const safeSize = Number.isFinite(s) && s >= 16 && s <= 256 ? Math.round(s) : 96;
  return `https://cdn.discordapp.com/icons/${id}/${hash}.${ext}?size=${safeSize}`;
}

module.exports = { guildIconUrl };

