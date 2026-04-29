async function syncMongoIndexes() {
  const ServerListing = require("../models/ServerListing");
  const ServerLike = require("../models/ServerLike");

  const results = {};
  try {
    results.serverListings = await ServerListing.syncIndexes();
  } catch (err) {
    results.serverListingsError = err?.message || String(err);
  }

  try {
    results.serverLikes = await ServerLike.syncIndexes();
  } catch (err) {
    results.serverLikesError = err?.message || String(err);
  }

  return results;
}

module.exports = { syncMongoIndexes };

