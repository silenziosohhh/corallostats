const path = require("path");
const { JsonFileStore } = require("./jsonFileStore");

const DATA_PATH = path.join(__dirname, "..", "..", "data");
const store = new JsonFileStore(DATA_PATH);

function normalizeClanName(name) {
  const s = String(name || "").trim();
  return s ? s.toLowerCase() : null;
}

function xpOf(metaMap, clanName) {
  if (!metaMap) return null;
  const v = metaMap[clanName]?.total_exp ?? metaMap[clanName]?.totalExp ?? null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function computeDashboardClanOrder() {
  const clans = store.readWithMeta("clans.json");
  const meta = store.readWithMeta("clans_meta.json");

  const list = Array.isArray(clans?.value) ? clans.value : [];
  const metaMap = meta?.value && typeof meta.value === "object" ? meta.value : null;

  const sorted = [...list].sort((a, b) => {
    const xa = xpOf(metaMap, a);
    const xb = xpOf(metaMap, b);
    if (xa == null && xb == null) return String(a).localeCompare(String(b));
    if (xa == null) return 1;
    if (xb == null) return -1;
    if (xb !== xa) return xb - xa;
    return String(a).localeCompare(String(b));
  });

  const order = new Map();
  for (let i = 0; i < sorted.length; i++) {
    const key = normalizeClanName(sorted[i]);
    if (!key || order.has(key)) continue;
    order.set(key, i);
  }

  return { order, updatedAtMs: Math.max(Number(clans?.mtimeMs || 0), Number(meta?.mtimeMs || 0)) };
}

let memo = { order: new Map(), updatedAtMs: 0 };

function getDashboardClanOrder() {
  const clans = store.readWithMeta("clans.json");
  const meta = store.readWithMeta("clans_meta.json");
  const updatedAtMs = Math.max(Number(clans?.mtimeMs || 0), Number(meta?.mtimeMs || 0));

  if (memo.order && memo.updatedAtMs === updatedAtMs) return memo.order;
  memo = computeDashboardClanOrder();
  return memo.order;
}

module.exports = { getDashboardClanOrder };
