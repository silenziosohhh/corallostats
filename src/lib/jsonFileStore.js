const fs = require("fs");
const path = require("path");

class JsonFileStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.cache = new Map();
  }

  readWithMeta(filename) {
    const fullPath = path.join(this.baseDir, filename);

    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      return null;
    }

    const cached = this.cache.get(fullPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return { value: cached.value, mtimeMs: cached.mtimeMs, size: stat.size };
    }

    let raw;
    try {
      raw = fs.readFileSync(fullPath, "utf8");
    } catch {
      return null;
    }

    try {
      const value = JSON.parse(raw);
      this.cache.set(fullPath, { mtimeMs: stat.mtimeMs, value });
      return { value, mtimeMs: stat.mtimeMs, size: stat.size };
    } catch {
      return null;
    }
  }

  read(filename) {
    const out = this.readWithMeta(filename);
    return out ? out.value : null;
  }
}

module.exports = { JsonFileStore };
