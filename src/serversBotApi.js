const express = require("express");
const ServerListing = require("./models/ServerListing");
const { parseDiscordInviteCode, botInviteUrl } = require("./lib/discordInvites");
const { normalizeTags } = require("./lib/serverTags");
const { verifyBotInGuild } = require("./lib/serverListingDiscordVerify");
const { guildIconUrl } = require("./lib/discordGuildCdn");
const { snowflakeToDate } = require("./lib/discordApi");
const { notifyServerPublished } = require("./lib/serverPublishWebhook");

function readBearer(req) {
  const h = String(req.get("authorization") || "").trim();
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? String(m[1] || "").trim() : "";
}

function requireBotApiKey() {
  return (req, res, next) => {
    const configured = String(process.env.BOT_PUBLISH_API_KEY || "").trim();
    if (!configured) return res.status(503).json({ error: "Bot API non configurata sul server" });

    const token = readBearer(req) || String(req.get("x-bot-api-key") || "").trim();
    if (!token || token !== configured) return res.status(401).json({ error: "Unauthorized" });
    next();
  };
}

function shape(doc) {
  const created = snowflakeToDate(doc.discordGuildId)?.toISOString?.() || null;
  return {
    id: String(doc._id),
    ownerDiscordId: doc.ownerDiscordId,
    name: doc.name,
    description: doc.description || "",
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    discord: {
      guildId: doc.discordGuildId,
      guildName: doc.discordGuildName || null,
      iconUrl: guildIconUrl({ guildId: doc.discordGuildId, iconHash: doc.discordGuildIcon, size: 96 }),
      inviteCode: doc.discordInviteCode,
    },
    stats: {
      online: Number.isFinite(Number(doc.approxPresenceCount)) ? Number(doc.approxPresenceCount) : null,
      members: Number.isFinite(Number(doc.approxMemberCount)) ? Number(doc.approxMemberCount) : null,
      guildCreatedAt: created,
      inviteFetchedAt: doc.inviteFetchedAt || null,
    },
    likeCount: Number.isFinite(Number(doc.likeCount)) ? Number(doc.likeCount) : 0,
    status: doc.status,
    lastVerifiedAt: doc.lastVerifiedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function createServersBotRouter() {
  const router = express.Router();
  router.use(requireBotApiKey());

  router.post("/servers/publish", async (req, res) => {
    const ownerDiscordId = String(req.body?.ownerDiscordId || "").trim();
    if (!ownerDiscordId || !/^\d{15,22}$/.test(ownerDiscordId)) return res.status(400).json({ error: "ownerDiscordId non valido" });

    const botToken = String(process.env.DISCORD_BOT_TOKEN || "").trim();
    const botClientId = String(process.env.DISCORD_CLIENT_ID || "").trim();
    if (!botToken) return res.status(503).json({ error: "Bot non configurato sul server" });

    const nameRaw = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    const tags = normalizeTags(req.body?.tags || []);
    const inviteCode = parseDiscordInviteCode(req.body?.discordInvite || "");

    if (nameRaw && (nameRaw.length < 2 || nameRaw.length > 64)) return res.status(400).json({ error: "Nome non valido" });
    if (description && description.length > 600) return res.status(400).json({ error: "Descrizione troppo lunga (max 600)" });
    if (!inviteCode) return res.status(400).json({ error: "Invite Discord non valida" });
    if (!tags.length) return res.status(400).json({ error: "Seleziona almeno 1 tag" });

    try {
      const currentCount = await ServerListing.countDocuments({ ownerDiscordId });
      if (currentCount >= 3) return res.status(400).json({ error: "Limite raggiunto (max 3 servers)" });

      const { guildId, guildName, guildIcon, approxPresenceCount, approxMemberCount } = await verifyBotInGuild({
        inviteCode,
        botToken,
        expectedOwnerDiscordId: ownerDiscordId,
      });
      const name = nameRaw || guildName || "Discord Server";

      const existing = await ServerListing.findOne({ discordGuildId: guildId }).lean();
      if (existing) {
        const sameOwner = String(existing.ownerDiscordId || "") === ownerDiscordId;
        return res.status(409).json({
          error: sameOwner ? "Hai già pubblicato questo server." : "Questo server è già stato pubblicato nella directory.",
          serverId: existing ? String(existing._id) : null,
        });
      }

      const now = new Date();
      const doc = await ServerListing.create({
        ownerDiscordId,
        name,
        description,
        tags,
        discordGuildId: guildId,
        discordGuildName: guildName,
        discordGuildIcon: guildIcon,
        discordInviteCode: inviteCode,
        approxPresenceCount,
        approxMemberCount,
        inviteFetchedAt: now,
        status: "published",
        lastVerifiedAt: now,
        likeCount: 0,
      });

      const shaped = shape(doc);
      notifyServerPublished({
        name: shaped.name,
        description: shaped.description,
        tags: shaped.tags,
        discordInviteCode: shaped.discord?.inviteCode || null,
        discordGuildName: shaped.discord?.guildName || null,
        approxPresenceCount: shaped.stats?.online ?? null,
        approxMemberCount: shaped.stats?.members ?? null,
      });
      res.json({ ok: true, server: shaped });
    } catch (err) {
      if (err?.code === 11000) {
        const keys = err?.keyPattern ? Object.keys(err.keyPattern) : [];
        if (keys.includes("ownerDiscordId")) {
          return res.status(409).json({
            error:
              "Limite pubblicazione non valido (indice DB). Riprova tra poco; se persiste, contatta un admin.",
          });
        }
        return res.status(409).json({ error: "Questo server è già stato pubblicato nella directory." });
      }
      if (err?.code === "invite_not_found") return res.status(400).json({ error: "Invite Discord non valida o scaduta" });
      if (err?.code === "rate_limited") return res.status(503).json({ error: "Discord rate limited, riprova tra poco" });
      if (err?.code === "discord_auth") return res.status(503).json({ error: "Discord bot token non valido o senza permessi" });
      if (err?.code === "bot_missing") {
        return res.status(400).json({
          error: "Devi aggiungere il bot nel server prima di pubblicare",
          botInviteUrl: botInviteUrl({ clientId: botClientId }) || null,
          guildId: err.guildId || null,
          guildName: err.guildName || null,
        });
      }
      if (err?.code === "not_owner") {
        return res.status(403).json({
          error: "Puoi pubblicare solo server di cui sei owner su Discord",
          guildId: err.guildId || null,
          guildName: err.guildName || null,
        });
      }
      if (err?.code === "invite_no_guild") return res.status(400).json({ error: "Invite Discord non valida (manca la guild)" });
      res.status(500).json({ error: "Bot publish error" });
    }
  });

  return router;
}

module.exports = { createServersBotRouter };
