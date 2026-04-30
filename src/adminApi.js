const express = require("express");
const User = require("./models/User");
const ServerListing = require("./models/ServerListing");
const { requireAppUser } = require("./middleware/requireAppUser");
const { requireRole } = require("./middleware/requireRole");
const { normalizeRole, roleLabel } = require("./rbac/roles");
const { normalizeTags } = require("./lib/serverTags");
const { apiKeyPrefix, generateApiKey, hashApiKey } = require("./lib/apiKeys");
const { guildIconUrl } = require("./lib/discordGuildCdn");
const { snowflakeToDate, cdnAvatarUrl } = require("./lib/discordApi");

function escapeRegExp(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shapeUser(u) {
  return {
    discordId: u.discordId,
    username: u.username || null,
    globalName: u.globalName || null,
    avatarUrl: cdnAvatarUrl({ id: u.discordId, avatar: u.avatar, size: 64 }),
    avatarDecorationUrl: u.avatarDecorationUrl || null,
    email: u.email || null,
    role: normalizeRole(u.role),
    roleLabel: roleLabel(u.role),
    apiKeyPrefix: u.apiKeyPrefix || null,
    apiBlockedUntil: u.apiBlockedUntil || null,
    apiBlockedReason: u.apiBlockedReason || null,
    apiBlockedBy: u.apiBlockedBy || null,
    lastLoginAt: u.lastLoginAt || null,
    createdAt: u.createdAt || null,
    updatedAt: u.updatedAt || null,
  };
}

function shapeServer(doc) {
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
    statusPrev: doc.statusPrev || null,
    lastVerifiedAt: doc.lastVerifiedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function createAdminRouter() {
  const router = express.Router();

  router.get("/me", requireAppUser(), (req, res) => {
    const me = req.appUser;
    res.json({
      discordId: me.discordId,
      role: normalizeRole(me.role),
      roleLabel: roleLabel(me.role),
    });
  });

  router.get("/servers", requireRole("moderator"), async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      const status = String(req.query.status || "").trim();
      const ownerDiscordId = String(req.query.ownerDiscordId || "").trim();
      const limit = Math.max(1, Math.min(100, Number(req.query.limit || 40)));

      const where = {};
      if (status) where.status = status;
      if (ownerDiscordId) where.ownerDiscordId = ownerDiscordId;
      if (q) {
        const rx = new RegExp(escapeRegExp(q), "i");
        where.$or = [{ name: rx }, { description: rx }, { discordGuildName: rx }, { discordGuildId: rx }];
      }

      const docs = await ServerListing.find(where).sort({ updatedAt: -1 }).limit(limit).lean();
      res.json({ count: docs.length, servers: docs.map(shapeServer) });
    } catch {
      res.status(500).json({ error: "Servers admin list error" });
    }
  });

  router.get("/servers/by-guild/:guildId", requireRole("moderator"), async (req, res) => {
    const guildId = String(req.params.guildId || "").trim();
    if (!/^\d{10,25}$/.test(guildId)) return res.status(400).json({ error: "Invalid guild id" });

    try {
      const doc = await ServerListing.findOne({ discordGuildId: guildId }).lean();
      if (!doc) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true, server: shapeServer(doc) });
    } catch {
      res.status(500).json({ error: "Server lookup error" });
    }
  });

  router.get("/servers/:id", requireRole("moderator"), async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid server id" });

    try {
      const doc = await ServerListing.findById(id).lean();
      if (!doc) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true, server: shapeServer(doc) });
    } catch {
      res.status(400).json({ error: "Invalid server id" });
    }
  });

  router.patch("/servers/:id", requireRole("moderator"), async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid server id" });

    const set = {};
    const statusInput = req.body?.status != null ? String(req.body.status || "").trim().toLowerCase() : null;

    if (req.body?.name != null) {
      const name = String(req.body.name || "").trim();
      if (name.length < 2 || name.length > 64) return res.status(400).json({ error: "Nome non valido" });
      set.name = name;
    }

    if (req.body?.description != null) {
      const description = String(req.body.description || "").trim();
      if (description.length > 600) return res.status(400).json({ error: "Descrizione troppo lunga (max 600)" });
      set.description = description;
    }

    if (req.body?.tags != null) {
      const tags = normalizeTags(req.body.tags || []);
      if (!tags.length) return res.status(400).json({ error: "Seleziona almeno 1 tag" });
      set.tags = tags;
    }

    if (statusInput != null) {
      const allowed = new Set(["published", "unverified", "hidden", "restore"]);
      if (!allowed.has(statusInput)) return res.status(400).json({ error: "Status non valido" });
    }

    if (req.body?.discordInviteCode != null) {
      const code = String(req.body.discordInviteCode || "").trim();
      if (!code || code.length > 32 || !/^[a-zA-Z0-9-_]+$/.test(code)) {
        return res.status(400).json({ error: "Invite Discord non valida" });
      }
      set.discordInviteCode = code;
    }

    const hasSet = Object.keys(set).length > 0;
    if (!hasSet && statusInput == null) return res.status(400).json({ error: "Nessun campo da aggiornare" });

    try {
      const doc = await ServerListing.findById(id);
      if (!doc) return res.status(404).json({ error: "Not found" });

      if (statusInput != null) {
        const cur = String(doc.status || "").trim().toLowerCase() || "published";
        if (statusInput === "hidden") {
          if (cur !== "hidden") doc.statusPrev = cur;
          doc.status = "hidden";
        } else if (statusInput === "restore") {
          const restoreTo = String(doc.statusPrev || "").trim().toLowerCase();
          doc.status = restoreTo === "published" || restoreTo === "unverified" ? restoreTo : "published";
          doc.statusPrev = null;
        } else {
          doc.status = statusInput;
          doc.statusPrev = null;
        }
      }

      for (const [k, v] of Object.entries(set)) doc[k] = v;
      await doc.save();
      res.json({ ok: true, server: shapeServer(doc) });
    } catch (err) {
      if (err?.code === 11000) return res.status(409).json({ error: "Vincolo DB violato (duplicato)" });
      res.status(500).json({ error: "Servers admin update error" });
    }
  });

  router.delete("/servers/:id", requireRole("moderator"), async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid server id" });

    try {
      const out = await ServerListing.deleteOne({ _id: id });
      res.json({ ok: true, deleted: Number(out?.deletedCount || 0) });
    } catch {
      res.status(500).json({ error: "Servers admin delete error" });
    }
  });

  router.get("/api-support/users", requireRole("moderator"), async (req, res) => {
    try {
      const discordId = String(req.query.discordId || "").trim();
      const email = String(req.query.email || "").trim().toLowerCase();
      const apiKeyPrefixQuery = String(req.query.apiKeyPrefix || "").trim();

      const where = {};
      if (discordId) where.discordId = discordId;
      if (email) where.email = email;
      if (apiKeyPrefixQuery) where.apiKeyPrefix = apiKeyPrefixQuery;

      if (!Object.keys(where).length) {
        return res.status(400).json({ error: "Specifica almeno un filtro: discordId, email o apiKeyPrefix" });
      }

      const docs = await User.find(where).limit(10).lean();
      res.json({ count: docs.length, users: docs.map(shapeUser) });
    } catch {
      res.status(500).json({ error: "User lookup error" });
    }
  });

  router.post("/api-support/users/:discordId/api-key/rotate", requireRole("moderator"), async (req, res) => {
    const discordId = String(req.params.discordId || "").trim();
    if (!discordId) return res.status(400).json({ error: "discordId non valido" });

    try {
      const user = await User.findOne({ discordId });
      if (!user) return res.status(404).json({ error: "Utente non trovato" });

      const actorRole = normalizeRole(req.appUser?.role);
      const targetRole = normalizeRole(user.role);
      if (actorRole === "moderator" && targetRole !== "member") {
        return res.status(403).json({ error: "I moderatori possono agire solo su utenti member" });
      }

      const apiKey = generateApiKey();
      user.apiKeyHash = hashApiKey(apiKey);
      user.apiKeyPrefix = apiKeyPrefix(apiKey);
      user.apiKeyLastRotatedAt = new Date();
      if (!user.apiKeyCreatedAt) user.apiKeyCreatedAt = user.apiKeyLastRotatedAt;
      await user.save();

      res.json({ ok: true, apiKey, apiKeyPrefix: user.apiKeyPrefix });
    } catch {
      res.status(500).json({ error: "API key rotate error" });
    }
  });

  router.get("/users", requireRole("moderator"), async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      const role = String(req.query.role || "").trim();
      const limit = Math.max(1, Math.min(100, Number(req.query.limit || 40)));

      const where = {};
      if (role) where.role = normalizeRole(role);
      if (q) {
        const rx = new RegExp(escapeRegExp(q), "i");
        where.$or = [
          { discordId: rx },
          { username: rx },
          { globalName: rx },
          { email: rx },
          { apiKeyPrefix: rx },
        ];
      }

      const docs = await User.find(where).sort({ lastLoginAt: -1, updatedAt: -1 }).limit(limit).lean();
      res.json({ count: docs.length, users: docs.map(shapeUser) });
    } catch {
      res.status(500).json({ error: "Users list error" });
    }
  });

  router.patch("/users/:discordId/role", requireRole("ceo"), async (req, res) => {
    const discordId = String(req.params.discordId || "").trim();
    if (!discordId) return res.status(400).json({ error: "discordId non valido" });

    const roleRaw = String(req.body?.role || "").trim().toLowerCase();
    if (roleRaw !== "member" && roleRaw !== "moderator" && roleRaw !== "ceo") {
      return res.status(400).json({ error: "Ruolo non valido" });
    }
    const role = roleRaw;

    try {
      const out = await User.findOneAndUpdate(
        { discordId },
        { $set: { role } },
        { new: true }
      );
      if (!out) return res.status(404).json({ error: "Utente non trovato" });
      res.json({ ok: true, user: shapeUser(out) });
    } catch {
      res.status(500).json({ error: "Role update error" });
    }
  });

  router.patch("/users/:discordId/api-block", requireRole("moderator"), async (req, res) => {
    const discordId = String(req.params.discordId || "").trim();
    if (!discordId) return res.status(400).json({ error: "discordId non valido" });

    const action = String(req.body?.action || "").trim().toLowerCase();
    const minutesRaw = req.body?.minutes;
    const reason = req.body?.reason != null ? String(req.body.reason || "").trim().slice(0, 140) : null;

    if (action !== "block" && action !== "unblock") {
      return res.status(400).json({ error: "Action non valida" });
    }

    let until = null;
    if (action === "block") {
      const minutes = Math.floor(Number(minutesRaw || 0));
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60 * 24 * 30) {
        return res.status(400).json({ error: "Durata non valida" });
      }
      until = new Date(Date.now() + minutes * 60_000);
    }

    try {
      const actorRole = normalizeRole(req.appUser?.role);
      const target = await User.findOne({ discordId }).select({ role: 1 }).lean();
      if (!target) return res.status(404).json({ error: "Utente non trovato" });
      const targetRole = normalizeRole(target.role);
      if (actorRole === "moderator" && targetRole !== "member") {
        return res.status(403).json({ error: "I moderatori possono agire solo su utenti member" });
      }

      const set = {
        apiBlockedUntil: until,
        apiBlockedReason: action === "block" ? reason || "rate_limit" : null,
        apiBlockedBy: action === "block" ? String(req.appUser?.discordId || req.apiUser?.discordId || "unknown") : null,
      };
      const doc = await User.findOneAndUpdate({ discordId }, { $set: set }, { new: true }).lean();
      res.json({ ok: true, user: shapeUser(doc) });
    } catch {
      res.status(500).json({ error: "API block update error" });
    }
  });

  return router;
}

module.exports = { createAdminRouter };
