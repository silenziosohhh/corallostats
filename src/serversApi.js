const express = require("express");
const ServerListing = require("./models/ServerListing");
const { ensureAuthenticated } = require("./middleware/ensureAuthenticated");
const { parseDiscordInviteCode, fetchDiscordInvite, botHasGuild, botInviteUrl } = require("./lib/discordInvites");
const { guildIconUrl } = require("./lib/discordGuildCdn");
const { snowflakeToDate } = require("./lib/discordApi");
const { hydrateListings } = require("./lib/serverListingInviteHydrate");

const ALLOWED_TAGS = [
  "bedwars",
  "kitpvp",
  "duels",
  "skywars",
  "survival",
  "factions",
  "prison",
  "creative",
  "pvp",
  "minigames",
  "minecraft",
  "accogliente",
  "tornei",
  "no_toxic",
  "community",
];

function uniq(arr) {
  return [...new Set(arr)];
}

function normalizeTag(tag) {
  return String(tag || "").trim().toLowerCase();
}

function normalizeTags(tags) {
  const input = Array.isArray(tags) ? tags : [];
  const cleaned = input.map(normalizeTag).filter(Boolean);
  const allowed = new Set(ALLOWED_TAGS);
  return uniq(cleaned.filter((t) => allowed.has(t))).slice(0, 10);
}

function shapeMine(doc) {
  const created = snowflakeToDate(doc.discordGuildId)?.toISOString?.() || null;
  return {
    id: String(doc._id),
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
    status: doc.status,
    lastVerifiedAt: doc.lastVerifiedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function verifyBotInGuild({ inviteCode, botToken }) {
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

  return { guildId, guildName, guildIcon, approxPresenceCount, approxMemberCount };
}

function createServersRouter() {
  const router = express.Router();

  router.get("/mine", ensureAuthenticated, async (req, res) => {
    try {
      const discordId = String(req.user?.id || "").trim();
      if (!discordId) return res.status(401).json({ error: "Not authenticated" });

      const docsRaw = await ServerListing.find({ ownerDiscordId: discordId }).sort({ createdAt: -1 }).limit(50).lean();
      const ttlMs = Number(process.env.DISCORD_INVITE_TTL_MS || 30 * 60_000);
      const docs = await hydrateListings(docsRaw, {
        botToken: String(process.env.DISCORD_BOT_TOKEN || "").trim(),
        ttlMs: Number.isFinite(ttlMs) ? ttlMs : 30 * 60_000,
        max: Math.max(1, Math.min(10, Number(process.env.DISCORD_INVITE_HYDRATE_MAX || 4))),
        concurrency: Math.max(1, Math.min(4, Number(process.env.DISCORD_INVITE_HYDRATE_CONCURRENCY || 2))),
      });
      res.json({ count: docs.length, servers: docs.map(shapeMine) });
    } catch {
      res.status(500).json({ error: "Servers mine error" });
    }
  });

  router.post("/publish", ensureAuthenticated, async (req, res) => {
    const discordId = String(req.user?.id || "").trim();
    if (!discordId) return res.status(401).json({ error: "Not authenticated" });

    const botToken = String(process.env.DISCORD_BOT_TOKEN || "").trim();
    const botClientId = String(process.env.DISCORD_CLIENT_ID || "").trim();

    if (!botToken) {
      return res.status(503).json({ error: "Bot non configurato sul server" });
    }

    const nameRaw = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    const tags = normalizeTags(req.body?.tags || []);
    const inviteCode = parseDiscordInviteCode(req.body?.discordInvite || "");

    if (nameRaw && (nameRaw.length < 2 || nameRaw.length > 64)) return res.status(400).json({ error: "Nome non valido" });
    if (description.length > 600) return res.status(400).json({ error: "Descrizione troppo lunga" });
    if (!inviteCode) return res.status(400).json({ error: "Invite Discord non valido" });
    if (!tags.length) return res.status(400).json({ error: "Seleziona almeno un tag" });

    try {
      const currentCount = await ServerListing.countDocuments({ ownerDiscordId: discordId });
      if (currentCount >= 3) return res.status(400).json({ error: "Limite raggiunto (max 3 servers)" });

      const { guildId, guildName, guildIcon, approxPresenceCount, approxMemberCount } = await verifyBotInGuild({
        inviteCode,
        botToken,
      });
      const name = nameRaw || guildName || "Discord Server";

      const existing = await ServerListing.findOne({ discordGuildId: guildId }).lean();
      if (existing) {
        const sameOwner = String(existing.ownerDiscordId || "") === discordId;
        return res.status(409).json({
          error: sameOwner
            ? "Hai già pubblicato questo server. Gestiscilo dalla pagina Account."
            : "Questo server è già stato pubblicato nella directory.",
        });
      }

      const now = new Date();
      const doc = await ServerListing.create({
        ownerDiscordId: discordId,
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
      });

      res.json({ ok: true, server: shapeMine(doc) });
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(409).json({ error: "Questo server è già stato pubblicato nella directory." });
      }
      if (err?.code === "invite_not_found") {
        return res.status(400).json({ error: "Invite Discord non valida o scaduta" });
      }
      if (err?.code === "rate_limited") {
        return res.status(503).json({ error: "Discord rate limited, riprova tra poco" });
      }
      if (err?.code === "discord_auth") {
        return res.status(503).json({ error: "Discord bot token non valido o senza permessi" });
      }
      if (err?.code === "bot_missing") {
        return res.status(400).json({
          error: "Devi aggiungere il bot nel tuo server Discord prima di pubblicare",
          botInviteUrl: botInviteUrl({ clientId: botClientId }) || null,
          guildId: err.guildId || null,
          guildName: err.guildName || null,
        });
      }
      if (err?.code === "invite_no_guild") {
        return res.status(400).json({ error: "Invite Discord non valida (manca la guild)" });
      }
      res.status(500).json({ error: "Publish error" });
    }
  });

  router.post("/:id/verify", ensureAuthenticated, async (req, res) => {
    const discordId = String(req.user?.id || "").trim();
    if (!discordId) return res.status(401).json({ error: "Not authenticated" });

    const botToken = String(process.env.DISCORD_BOT_TOKEN || "").trim();
    const botClientId = String(process.env.DISCORD_CLIENT_ID || "").trim();
    if (!botToken) return res.status(503).json({ error: "Bot non configurato sul server" });

    try {
      const id = String(req.params.id || "").trim();
      const doc = await ServerListing.findOne({ _id: id, ownerDiscordId: discordId });
      if (!doc) return res.status(404).json({ error: "Not found" });

      let invite = null;
      try {
        invite = await fetchDiscordInvite(doc.discordInviteCode, { token: botToken, withCounts: true });
      } catch {
        invite = null;
      }

      const ok = await botHasGuild({ guildId: doc.discordGuildId, token: botToken });
      doc.lastVerifiedAt = new Date();
      doc.status = ok ? "published" : "unverified";
      if (invite?.guild?.icon) doc.discordGuildIcon = String(invite.guild.icon);
      if (Number.isFinite(Number(invite?.approximate_presence_count))) doc.approxPresenceCount = Number(invite.approximate_presence_count);
      if (Number.isFinite(Number(invite?.approximate_member_count))) doc.approxMemberCount = Number(invite.approximate_member_count);
      doc.inviteFetchedAt = new Date();
      await doc.save();

      if (!ok) {
        return res.json({
          ok: true,
          server: shapeMine(doc),
          warning: "Bot non presente nella guild",
          botInviteUrl: botInviteUrl({ clientId: botClientId }) || null,
        });
      }

      res.json({ ok: true, server: shapeMine(doc) });
    } catch {
      res.status(500).json({ error: "Verify error" });
    }
  });

  router.delete("/:id", ensureAuthenticated, async (req, res) => {
    const discordId = String(req.user?.id || "").trim();
    if (!discordId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const id = String(req.params.id || "").trim();
      const out = await ServerListing.deleteOne({ _id: id, ownerDiscordId: discordId });
      res.json({ ok: true, deleted: Number(out?.deletedCount || 0) });
    } catch {
      res.status(500).json({ error: "Delete error" });
    }
  });

  router.get("/tags", (req, res) => {
    res.json({ tags: ALLOWED_TAGS });
  });

  return router;
}

module.exports = { createServersRouter, ALLOWED_TAGS };
