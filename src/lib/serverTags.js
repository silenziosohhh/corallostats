const ALLOWED_TAGS = [
  "bedwars",
  "kitpvp",
  "duels",
  "skywars",
  "survival",
  "factions",
  "prison",
  "creative",
  "pvp",
  "minigames",
  "minecraft",
  "accogliente",
  "tornei",
  "no_toxic",
  "community",
];

function uniq(arr) {
  return [...new Set(arr)];
}

function normalizeTag(tag) {
  return String(tag || "").trim().toLowerCase();
}

function normalizeTags(tags) {
  const input = Array.isArray(tags) ? tags : [];
  const cleaned = input.map(normalizeTag).filter(Boolean);
  const allowed = new Set(ALLOWED_TAGS);
  return uniq(cleaned.filter((t) => allowed.has(t))).slice(0, 10);
}

module.exports = { ALLOWED_TAGS, normalizeTags, normalizeTag };

