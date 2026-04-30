const mongoose = require("mongoose");

const serverListingSchema = new mongoose.Schema(
  {
    ownerDiscordId: { type: String, required: true, index: true },

    name: { type: String, required: true },
    description: { type: String, default: "" },
    tags: { type: [String], default: [] },

    discordGuildId: { type: String, required: true, index: true },
    discordGuildName: { type: String, default: null },
    discordGuildIcon: { type: String, default: null },
    discordInviteCode: { type: String, required: true },

    approxPresenceCount: { type: Number, default: null },
    approxMemberCount: { type: Number, default: null },
    inviteFetchedAt: { type: Date, default: null },

    status: { type: String, default: "published", index: true },
    statusPrev: { type: String, default: null },
    lastVerifiedAt: { type: Date, default: null },
    likeCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

serverListingSchema.index({ discordGuildId: 1, status: 1 }, { unique: true });
serverListingSchema.index({ updatedAt: -1 });
serverListingSchema.index({ status: 1, updatedAt: -1 });
serverListingSchema.index({ ownerDiscordId: 1, updatedAt: -1 });

serverListingSchema.path("name").validate(function (v) {
  const s = String(v || "").trim();
  return s.length >= 2 && s.length <= 64;
}, "Invalid name");

serverListingSchema.path("description").validate(function (v) {
  const s = String(v || "");
  return s.length <= 600;
}, "Invalid description");

serverListingSchema.path("tags").validate(function (v) {
  if (!Array.isArray(v)) return false;
  if (v.length > 10) return false;
  for (const t of v) {
    const s = String(t || "").trim();
    if (!s || s.length > 24) return false;
  }
  return true;
}, "Invalid tags");

serverListingSchema.path("discordInviteCode").validate(function (v) {
  const s = String(v || "").trim();
  return Boolean(s) && s.length <= 32 && /^[a-zA-Z0-9-_]+$/.test(s);
}, "Invalid discord invite");

serverListingSchema.path("likeCount").validate(function (v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return false;
  if (n < 0) return false;
  return true;
}, "Invalid likeCount");

serverListingSchema.path("statusPrev").validate(function (v) {
  if (v == null) return true;
  const s = String(v || "").trim().toLowerCase();
  return s === "published" || s === "unverified" || s === "hidden";
}, "Invalid statusPrev");

module.exports = mongoose.model("ServerListing", serverListingSchema);
