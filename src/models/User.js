const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    discordId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: null },
    globalName: { type: String, default: null },
    avatar: { type: String, default: null },
    avatarDecorationUrl: { type: String, default: null },
    email: { type: String, default: null, index: true },
    lastLoginAt: { type: Date, default: null },

    role: { type: String, default: "member", index: true },

    apiKeyHash: { type: String, default: null, index: true },
    apiKeyPrefix: { type: String, default: null },
    apiKeyCreatedAt: { type: Date, default: null },
    apiKeyLastRotatedAt: { type: Date, default: null },

    apiBlockedUntil: { type: Date, default: null, index: true },
    apiBlockedReason: { type: String, default: null },
    apiBlockedBy: { type: String, default: null },
  },
  { timestamps: true }
);

userSchema.path("role").validate(function (v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "member" || s === "moderator" || s === "ceo";
}, "Invalid role");

module.exports = mongoose.model("User", userSchema);
