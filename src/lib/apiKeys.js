const crypto = require("crypto");

function generateApiKey() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashApiKey(apiKey) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function apiKeyPrefix(apiKey, len = 8) {
  return String(apiKey).slice(0, len);
}

module.exports = { generateApiKey, hashApiKey, apiKeyPrefix };

