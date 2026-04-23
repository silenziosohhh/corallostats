const mongoose = require("mongoose");

const apiKeyRateLimitWindowSchema = new mongoose.Schema(
  {
    discordId: { type: String, required: true, index: true },
    windowStart: { type: Date, required: true, index: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

apiKeyRateLimitWindowSchema.index({ discordId: 1, windowStart: 1 }, { unique: true });
// Keep the collection small: rate-limit windows are only useful short-term.
apiKeyRateLimitWindowSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 24 * 60 * 60 });

module.exports = mongoose.model("ApiKeyRateLimitWindow", apiKeyRateLimitWindowSchema);
