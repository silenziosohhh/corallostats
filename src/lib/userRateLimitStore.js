const store = new Map();

function ensureWindow({ key, now, windowMs }) {
  const entry = store.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    const next = { windowStart: now, count: 0 };
    store.set(key, next);
    return next;
  }
  return entry;
}

function hit({ key, windowMs }) {
  const now = Date.now();
  const entry = ensureWindow({ key, now, windowMs });
  entry.count += 1;
  return { windowStart: entry.windowStart, count: entry.count, now };
}

function snapshot({ key, windowMs }) {
  const now = Date.now();
  const entry = ensureWindow({ key, now, windowMs });
  return { windowStart: entry.windowStart, count: entry.count, now };
}

function resetAtMs({ windowStart, windowMs }) {
  return windowStart + windowMs;
}

module.exports = { hit, snapshot, resetAtMs };

