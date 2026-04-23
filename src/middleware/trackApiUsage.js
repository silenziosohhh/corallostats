const mongoose = require("mongoose");
const ApiKeyUsageMinute = require("../models/ApiKeyUsageMinute");
const ApiKeyUsageEndpointMinute = require("../models/ApiKeyUsageEndpointMinute");
const { notifyAnalyticsChanged } = require("../lib/analyticsUpdates");

function minuteStart(dateMs = Date.now()) {
  const m = Math.floor(dateMs / 60_000) * 60_000;
  return new Date(m);
}

function groupKeyFromRequest(req) {
  const p = String(req.path || "").toLowerCase();
  if (p.startsWith("/stats/")) {
    const rest = p.slice("/stats/".length);
    const seg = rest.split("/")[0] || "";
    if (seg.includes("bed")) return "bedwars";
    if (seg.includes("kit")) return "kitpvp";
    if (seg.includes("duel")) return "duels";
    if (seg.includes("cup")) return "coralcup";
    return "stats";
  }
  if (p.startsWith("/clans-ranked")) return "clans";
  if (p.startsWith("/clans")) return "clans";
  if (p.startsWith("/clan-members")) return "clans";
  if (p.startsWith("/results")) return "results";
  if (p.startsWith("/summary")) return "summary";
  return "other";
}

function normalizeEndpointPath(path) {
  const p = String(path || "").split("?")[0];
  const parts = p.split("/").filter(Boolean);

  if (!parts.length) return "/";

  // Public router endpoints
  if (parts[0] === "summary") return "/summary";
  if (parts[0] === "clans-ranked") return "/clans-ranked";
  if (parts[0] === "clans") return "/clans";
  if (parts[0] === "results") return "/results";
  if (parts[0] === "clan-members") return "/clan-members/{name}";

  // Stats router endpoints
  if (parts[0] === "stats") {
    const game = parts[1] || "{game}";
    const rest = parts.slice(2);

    if (rest[0] === "clans") {
      if (rest[1] === "leaderboard") return `/stats/${game}/clans/leaderboard`;
      if (rest[1]) return `/stats/${game}/clans/{clanName}`;
      return `/stats/${game}/clans`;
    }

    if (rest[0] === "leaderboard") return `/stats/${game}/leaderboard`;
    if (rest[0] === "match") return `/stats/${game}/match/{id}${rest[2] === "logs" ? "/logs" : ""}`;

    if (rest[0]) {
      // player-based endpoints
      const username = "{username}";
      if (rest[1] === "matches") return `/stats/${game}/${username}/matches`;
      return `/stats/${game}/${username}`;
    }

    return `/stats/${game}`;
  }

  return `/${parts[0]}`;
}

function trackApiUsage() {
  return async function trackApiUsageMiddleware(req, res, next) {
    const user = req.apiUser;
    const discordId = String(user?.discordId || "").trim();
    if (!discordId) return next();

    // Track only API-key traffic (exclude webapp session usage).
    if (req.apiAuthSource !== "api_key") return next();

    if (mongoose.connection.readyState !== 1) return next();

    let notified = false;
    const notifyOnce = () => {
      if (notified) return;
      notified = true;
      notifyAnalyticsChanged({ discordId });
    };
    res.once("finish", notifyOnce);
    res.once("close", notifyOnce);

    const minute = minuteStart();
    const group = groupKeyFromRequest(req);
    const endpointKey = `${String(req.method || "GET").toUpperCase()} ${normalizeEndpointPath(req.path)}`;

    const inc = { count: 1 };
    inc[`groups.${group}`] = 1;

    try {
      await ApiKeyUsageMinute.updateOne(
        { discordId, minute },
        { $inc: inc, $setOnInsert: { discordId, minute } },
        { upsert: true }
      );
      await ApiKeyUsageEndpointMinute.updateOne(
        { discordId, minute, endpointKey },
        { $inc: { count: 1 }, $setOnInsert: { discordId, minute, endpointKey } },
        { upsert: true }
      );
    } catch {
      // ignore: analytics should never break the API
    }
    next();
  };
}

module.exports = { trackApiUsage, groupKeyFromRequest, normalizeEndpointPath };
