import { normalizeStatsMode } from "./playerStatsRender.js";

export function coralStatsPageUrl(username, mode) {
  const safe = String(username || "").trim();
  if (!safe) return "https://coralmc.it/it/stats";

  const m = normalizeStatsMode(mode);
  const u = encodeURIComponent(safe);

  if (m === "kitpvp") return `https://coralmc.it/it/stats/kitpvp/${u}`;
  if (m === "duels") return `https://coralmc.it/it/stats/duels/${u}`;
  if (m === "player") return `https://coralmc.it/it/stats/player/${u}`;
  return `https://coralmc.it/it/stats/player/${u}`;
}

