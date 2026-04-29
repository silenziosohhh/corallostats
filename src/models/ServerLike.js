const mongoose = require("mongoose");

const serverLikeSchema = new mongoose.Schema(
  {
    serverListingId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: "ServerListing" },
    likerDiscordId: { type: String, required: true, index: true },
    likerName: { type: String, default: null },
  },
  { timestamps: true }
);

serverLikeSchema.index({ serverListingId: 1, likerDiscordId: 1 }, { unique: true });
serverLikeSchema.index({ serverListingId: 1, createdAt: -1 });
serverLikeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

serverLikeSchema.path("likerDiscordId").validate(function (v) {
  const s = String(v || "").trim();
  return Boolean(s) && /^\d{15,22}$/.test(s);
}, "Invalid liker discord id");

serverLikeSchema.path("likerName").validate(function (v) {
  if (v == null) return true;
  const s = String(v || "").trim();
  return s.length <= 64;
}, "Invalid liker name");

module.exports = mongoose.model("ServerLike", serverLikeSchema);
