const ServerListing = require("../models/ServerListing");
const ServerLike = require("../models/ServerLike");

async function syncLikesLeaderboard({ windowMs = 24 * 60 * 60 * 1000 } = {}) {
  const since = new Date(Date.now() - Math.max(1, Number(windowMs) || 0));

  const rows = await ServerLike.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: "$serverListingId", likeCount: { $sum: 1 } } },
  ]);

  const map = new Map(rows.map((r) => [String(r._id), Number(r.likeCount || 0)]));
  const ids = await ServerListing.find({ status: "published" }).select({ _id: 1 }).lean();

  const ops = [];
  for (const d of ids) {
    const id = String(d._id);
    const likeCount = map.get(id) || 0;
    ops.push({
      updateOne: {
        filter: { _id: d._id },
        update: { $set: { likeCount } },
      },
    });
  }

  if (ops.length) await ServerListing.bulkWrite(ops, { ordered: false });
  return { ok: true, servers: ops.length };
}

module.exports = { syncLikesLeaderboard };

