const mongoose = require("mongoose");
const ServerLike = require("../models/ServerLike");
const ServerListing = require("../models/ServerListing");

function toObjectId(id) {
  if (id instanceof mongoose.Types.ObjectId) return id;
  const s = String(id || "").trim();
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

async function recomputeServerLikes(serverListingId) {
  const oid = toObjectId(serverListingId);
  if (!oid) return { likeCount: 0 };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await ServerLike.countDocuments({ serverListingId: oid, createdAt: { $gte: since } });
  const likeCount = Number.isFinite(Number(count)) ? Number(count) : 0;

  await ServerListing.updateOne({ _id: oid }, { $set: { likeCount } });
  return { likeCount };
}

module.exports = { recomputeServerLikes, toObjectId };
