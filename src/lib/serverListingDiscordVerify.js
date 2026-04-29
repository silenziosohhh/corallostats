const { fetchDiscordInvite, botHasGuild } = require("./discordInvites");
const { fetchDiscordGuildOwnerId } = require("./discordGuildInfo");

async function verifyBotInGuild({ inviteCode, botToken, expectedOwnerDiscordId = null }) {
  const inv = await fetchDiscordInvite(inviteCode, { token: botToken || null, withCounts: true });
  const guildId = String(inv?.guild?.id || "").trim();
  const guildName = inv?.guild?.name ? String(inv.guild.name) : null;
  const guildIcon = inv?.guild?.icon ? String(inv.guild.icon) : null;
  const approxPresenceCount =
    Number.isFinite(Number(inv?.approximate_presence_count)) ? Number(inv.approximate_presence_count) : null;
  const approxMemberCount =
    Number.isFinite(Number(inv?.approximate_member_count)) ? Number(inv.approximate_member_count) : null;
  if (!guildId) {
    const err = new Error("Invite senza guild");
    err.code = "invite_no_guild";
    throw err;
  }

  const ok = await botHasGuild({ guildId, token: botToken });
  if (!ok) {
    const err = new Error("Bot non presente nella guild");
    err.code = "bot_missing";
    err.guildId = guildId;
    err.guildName = guildName;
    throw err;
  }

  if (expectedOwnerDiscordId) {
    const expected = String(expectedOwnerDiscordId || "").trim();
    const ownerId = await fetchDiscordGuildOwnerId(guildId, { token: botToken });
    if (ownerId !== expected) {
      const err = new Error("Non sei owner della guild");
      err.code = "not_owner";
      err.guildId = guildId;
      err.guildName = guildName;
      err.ownerDiscordId = ownerId;
      throw err;
    }
  }

  return { guildId, guildName, guildIcon, approxPresenceCount, approxMemberCount };
}

module.exports = { verifyBotInGuild };
