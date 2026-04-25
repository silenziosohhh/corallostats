const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    discordId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: null },
    globalName: { type: String, default: null },
    avatar: { type: String, default: null },
    email: { type: String, default: null, index: true },
    lastLoginAt: { type: Date, default: null },

    apiKeyHash: { type: String, default: null, index: true },
    apiKeyPrefix: { type: String, default: null },
    apiKeyCreatedAt: { type: Date, default: null },
    apiKeyLastRotatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
