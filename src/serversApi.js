const express = require("express");
const ServerListing = require("./models/ServerListing");
const ServerLike = require("./models/ServerLike");
const { ensureAuthenticated } = require("./middleware/ensureAuthenticated");
const { parseDiscordInviteCode, fetchDiscordInvite, botHasGuild, botInviteUrl } = require("./lib/discordInvites");
const { guildIconUrl } = require("./lib/discordGuildCdn");
const { snowflakeToDate } = require("./lib/discordApi");
const { hydrateListings } = require("./lib/serverListingInviteHydrate");
const { recomputeServerLikes, toObjectId } = require("./lib/serverLikeAggregates");
const { ALLOWED_TAGS, normalizeTags } = require("./lib/serverTags");
const { verifyBotInGuild } = require("./lib/serverListingDiscordVerify");
const { notifyServerPublished } = require("./lib/serverPublishWebhook");

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
    likeCount: Number.isFinite(Number(doc.likeCount)) ? Number(doc.likeCount) : 0,
    status: doc.status,
    lastVerifiedAt: doc.lastVerifiedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
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

  router.get("/:id/like", ensureAuthenticated, async (req, res) => {
    try {
      const discordId = String(req.user?.id || "").trim();
      if (!discordId) return res.status(401).json({ error: "Not authenticated" });

      const id = String(req.params.id || "").trim();
      const oid = toObjectId(id);
      if (!oid) return res.status(400).json({ error: "Invalid server id" });

      const listing = await ServerListing.findById(oid).lean();
      if (!listing) return res.status(404).json({ error: "Not found" });

      const now = Date.now();
      const ttlMs = 24 * 60 * 60 * 1000;
      const doc = await ServerLike.findOne({ serverListingId: oid, likerDiscordId: discordId }).lean();
      const createdAtMs = doc?.createdAt ? new Date(doc.createdAt).getTime() : 0;
      const expiresAtMs = createdAtMs ? createdAtMs + ttlMs : 0;
      const msLeft = expiresAtMs ? Math.max(0, expiresAtMs - now) : 0;
      const liked = Boolean(doc) && msLeft > 0;

      res.json({
        liked,
        canLike: !liked,
        expiresAt: liked ? new Date(expiresAtMs).toISOString() : null,
        msLeft: liked ? msLeft : 0,
        likeCount: Number(listing.likeCount || 0),
      });
    } catch {
      res.status(500).json({ error: "Like get error" });
    }
  });

  router.post("/:id/like", ensureAuthenticated, async (req, res) => {
    try {
      const discordId = String(req.user?.id || "").trim();
      if (!discordId) return res.status(401).json({ error: "Not authenticated" });

      const id = String(req.params.id || "").trim();
      const oid = toObjectId(id);
      if (!oid) return res.status(400).json({ error: "Invalid server id" });

      const listing = await ServerListing.findById(oid).lean();
      if (!listing) return res.status(404).json({ error: "Not found" });
      if (String(listing.ownerDiscordId || "") === discordId) return res.status(400).json({ error: "Non puoi votare il tuo server" });
      if (String(listing.status || "") !== "published") return res.status(400).json({ error: "Server non disponibile" });

      const now = Date.now();
      const ttlMs = 24 * 60 * 60 * 1000;
      const existing = await ServerLike.findOne({ serverListingId: oid, likerDiscordId: discordId }).lean();
      if (existing?.createdAt) {
        const createdAtMs = new Date(existing.createdAt).getTime();
        const expiresAtMs = createdAtMs + ttlMs;
        const msLeft = Math.max(0, expiresAtMs - now);
        if (msLeft > 0) {
          const out = await recomputeServerLikes(oid);
          return res.json({
            ok: true,
            liked: true,
            canLike: false,
            expiresAt: new Date(expiresAtMs).toISOString(),
            msLeft,
            ...out,
          });
        }
        await ServerLike.deleteOne({ _id: existing._id });
      }

      const likerName = req.user?.global_name || req.user?.displayName || req.user?.username || null;
      await ServerLike.create({
        serverListingId: oid,
        likerDiscordId: discordId,
        likerName: likerName ? String(likerName).slice(0, 64) : null,
      });

      const out = await recomputeServerLikes(oid);
      res.json({
        ok: true,
        liked: true,
        canLike: false,
        expiresAt: new Date(now + ttlMs).toISOString(),
        msLeft: ttlMs,
        ...out,
      });
    } catch (err) {
      if (err?.code === 11000) {
        const oid = toObjectId(String(req.params.id || "").trim());
        const out = oid ? await recomputeServerLikes(oid) : { likeCount: 0 };
        return res.json({ ok: true, liked: true, canLike: false, expiresAt: null, msLeft: 0, ...out });
      }
      res.status(500).json({ error: "Like error" });
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
        expectedOwnerDiscordId: discordId,
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

      const shaped = shapeMine(doc);
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
      if (err?.code === "not_owner") {
        return res.status(403).json({
          error: "Puoi pubblicare solo server di cui sei owner su Discord",
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
