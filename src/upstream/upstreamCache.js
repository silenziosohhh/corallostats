const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CACHE_DIR = path.join(__dirname, "..", "..", "data", "upstream_cache");

function safeMkdir() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function safeUnlink(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

function sha1(input) {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function cachePath(key) {
  return path.join(CACHE_DIR, `${sha1(key)}.json`);
}

function readCache(key) {
  safeMkdir();
  const file = cachePath(key);
  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  safeMkdir();
  const file = cachePath(key);
  try {
    fs.writeFileSync(file, JSON.stringify(value), "utf8");
  } catch {
    // ignore
  }
}

function cleanupUpstreamCache({
  maxAgeMs = Number(process.env.UPSTREAM_CACHE_MAX_AGE_MS || 7 * 24 * 60 * 60 * 1000),
  maxBytes = Number(process.env.UPSTREAM_CACHE_MAX_BYTES || 200 * 1024 * 1024),
  maxFiles = Number(process.env.UPSTREAM_CACHE_MAX_FILES || 5000),
} = {}) {
  safeMkdir();

  let names = [];
  try {
    names = fs.readdirSync(CACHE_DIR);
  } catch {
    return { deletedFiles: 0, deletedBytes: 0, beforeFiles: 0, beforeBytes: 0, afterFiles: 0, afterBytes: 0 };
  }

  const now = Date.now();
  const files = [];

  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const filePath = path.join(CACHE_DIR, name);
    try {
      const st = fs.statSync(filePath);
      files.push({ filePath, size: Number(st.size || 0), mtimeMs: Number(st.mtimeMs || 0) });
    } catch {
      // ignore
    }
  }

  const beforeFiles = files.length;
  const beforeBytes = files.reduce((sum, f) => sum + f.size, 0);

  let deletedFiles = 0;
  let deletedBytes = 0;

  if (Number.isFinite(maxAgeMs) && maxAgeMs > 0) {
    for (const f of files) {
      if (!Number.isFinite(f.mtimeMs) || f.mtimeMs <= 0) continue;
      if (now - f.mtimeMs <= maxAgeMs) continue;
      if (safeUnlink(f.filePath)) {
        deletedFiles += 1;
        deletedBytes += f.size;
        f.deleted = true;
      }
    }
  }

  const remaining = files.filter((f) => !f.deleted);
  remaining.sort((a, b) => (a.mtimeMs || 0) - (b.mtimeMs || 0));

  let afterBytes = remaining.reduce((sum, f) => sum + f.size, 0);
  let afterFiles = remaining.length;

  const mustEnforceFiles = Number.isFinite(maxFiles) && maxFiles > 0;
  const mustEnforceBytes = Number.isFinite(maxBytes) && maxBytes > 0;

  for (const f of remaining) {
    const tooManyFiles = mustEnforceFiles && afterFiles > maxFiles;
    const tooManyBytes = mustEnforceBytes && afterBytes > maxBytes;
    if (!tooManyFiles && !tooManyBytes) break;

    if (safeUnlink(f.filePath)) {
      deletedFiles += 1;
      deletedBytes += f.size;
      afterFiles -= 1;
      afterBytes -= f.size;
    }
  }

  return { deletedFiles, deletedBytes, beforeFiles, beforeBytes, afterFiles, afterBytes };
}

module.exports = { readCache, writeCache, cleanupUpstreamCache };
