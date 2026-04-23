const mongoose = require("mongoose");

const apiUsageEndpointMinuteSchema = new mongoose.Schema(
  {
    discordId: { type: String, required: true, index: true },
    minute: { type: Date, required: true, index: true },
    endpointKey: { type: String, required: true, index: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

apiUsageEndpointMinuteSchema.index({ discordId: 1, minute: 1, endpointKey: 1 }, { unique: true });

module.exports = mongoose.model("ApiUsageEndpointMinute", apiUsageEndpointMinuteSchema);

