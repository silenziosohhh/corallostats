const express = require("express");
const ServerListing = require("./models/ServerListing");
const { guildIconUrl } = require("./lib/discordGuildCdn");
const { snowflakeToDate } = require("./lib/discordApi");
const { hydrateListings } = require("./lib/serverListingInviteHydrate");

function escapeRegExp(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTag(tag) {
  return String(tag || "").trim().toLowerCase();
}

function shapePublic(doc) {
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
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function createServersPublicRouter() {
  const router = express.Router();

  router.get("/servers", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      const tag = normalizeTag(req.query.tag || "");
      const limit = Math.max(1, Math.min(60, Number(req.query.limit || 30)));

      const where = { status: "published" };

      if (tag) {
        where.tags = tag;
      }

      if (q) {
        const rx = new RegExp(escapeRegExp(q), "i");
        where.$or = [{ name: rx }, { host: rx }, { description: rx }, { discordGuildName: rx }];
      }

      const docsRaw = await ServerListing.find(where).sort({ createdAt: -1 }).limit(limit).lean();
      const ttlMs = Number(process.env.DISCORD_INVITE_TTL_MS || 30 * 60_000);
      const docs = await hydrateListings(docsRaw, {
        botToken: String(process.env.DISCORD_BOT_TOKEN || "").trim(),
        ttlMs: Number.isFinite(ttlMs) ? ttlMs : 30 * 60_000,
        max: Math.max(1, Math.min(10, Number(process.env.DISCORD_INVITE_HYDRATE_MAX || 4))),
        concurrency: Math.max(1, Math.min(4, Number(process.env.DISCORD_INVITE_HYDRATE_CONCURRENCY || 2))),
      });

      res.json({
        count: docs.length,
        servers: docs.map(shapePublic),
      });
    } catch (err) {
      res.status(500).json({ error: "Servers list error" });
    }
  });

  return router;
}

module.exports = { createServersPublicRouter };
