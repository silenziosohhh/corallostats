const { EventEmitter } = require("events");

const analyticsUpdates = new EventEmitter();
analyticsUpdates.setMaxListeners(0);

const pending = new Map();

function notifyAnalyticsChanged({ discordId }) {
  const id = String(discordId || "").trim();
  if (!id) return;

  if (pending.has(id)) return;
  const t = setTimeout(() => {
    pending.delete(id);
    analyticsUpdates.emit("changed", { discordId: id, at: Date.now() });
  }, 250);
  pending.set(id, t);
}

module.exports = { analyticsUpdates, notifyAnalyticsChanged };

