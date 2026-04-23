const mongoose = require("mongoose");

const apiKeyUsageMinuteSchema = new mongoose.Schema(
  {
    discordId: { type: String, required: true, index: true },
    minute: { type: Date, required: true, index: true },
    count: { type: Number, default: 0 },
    groups: { type: Object, default: {} },
  },
  { timestamps: true }
);

apiKeyUsageMinuteSchema.index({ discordId: 1, minute: 1 }, { unique: true });

module.exports = mongoose.model("ApiKeyUsageMinute", apiKeyUsageMinuteSchema);

