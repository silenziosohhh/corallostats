import { api } from "../lib/apiClient.js";
import { clear, el, qs, setText } from "../lib/dom.js";
import { showToast } from "../lib/toast.js";
import { copyToClipboard } from "../lib/clipboard.js";
import { enhanceSelect } from "../lib/customSelect.js";
import { animateCount } from "../lib/motion.js";
import { clearSkeletonText, setAriaBusy, setSkeletonText, skelBlock } from "../lib/skeleton.js";

const state = {
  clans: [],
  filtered: [],
  page: 1,
  pageSize: 24,
  clanPreview: {},
};

let clanMetaPollTimer = null;

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  };
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `Durata: ${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `Durata: ${m}m ${r}s`;
}

function setupDialog() {
  const dialog = qs("#clan-dialog");
  const close = () => dialog.close();

  qs("#dialog-close").addEventListener("click", close);
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
}

function setupPlayerDialog() {
  const dialog = qs("#player-dialog");
  if (!dialog) return;

  const close = () => dialog.close();
  qs("#player-close")?.addEventListener("click", close);
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
}

function roleInfo(role) {
  const r = Number.isFinite(Number(role)) ? Number(role) : 0;
  if (r >= 3) return { key: "leader", label: "Leader", icon: "fa-solid fa-crown" };
  if (r === 2) return { key: "coleader", label: "Co-Leader", icon: "fa-solid fa-shield-halved" };
  if (r === 1) return { key: "mod", label: "Moderatore", icon: "fa-solid fa-gavel" };
  return { key: "member", label: "Membro", icon: "fa-solid fa-user" };
}

function formatInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("it-IT").format(n);
}

async function openPlayerDialog(username) {
  const dialog = qs("#player-dialog");
  if (!dialog) return;

  setText(qs("#player-title"), "Player");
  setText(qs("#player-name"), username || "—");
  setText(qs("#player-subtitle"), "Caricamento stats…");
  setText(qs("#player-status"), "Caricamento…");
  clear(qs("#player-stats"));
  clear(qs("#player-badges"));

  const statsRoot = qs("#player-stats");
  setAriaBusy(statsRoot, true);
  for (let i = 0; i < 8; i++) {
    const card = document.createElement("div");
    card.className = "pstat";
    card.append(
      skelBlock({ widthPct: 58, height: 10, radius: 10, className: "skel-text skel-block" }),
      skelBlock({ widthPct: 42, height: 16, radius: 10, className: "skel-text skel-block" })
    );
    statsRoot.append(card);
  }

  const skin = qs("#player-skin");
  if (skin) {
    skin.src = `https://render.crafty.gg/3d/full/${encodeURIComponent(username)}` || `https://minotar.net/avatar/${encodeURIComponent(username)}/160`;
    skin.alt = "";
    skin.loading = "eager";
    skin.referrerPolicy = "no-referrer";
    skin.decoding = "async";
    try {
      skin.fetchPriority = "high";
    } catch {
      // ignore
    }
    skin.onerror = () => {
      skin.onerror = null;
      skin.src = `https://minotar.net/avatar/${encodeURIComponent(username)}/160`;
    };
  }

  const coralLink = qs("#player-open-coral");
  if (coralLink) coralLink.href = `https://coralmc.it/it/stats/player/${encodeURIComponent(username)}`;

  const clanPill = qs("#player-clan-pill");
  if (clanPill) clanPill.style.display = "none";

  dialog.showModal();

  try {
    const data = await api.getJson(`/api/v1/stats/bedwars/${encodeURIComponent(username)}`);

    const clanName = data?.clan_name || null;
    const clanRole = data?.clan_role ?? null;
    const info = roleInfo(clanRole);

    setText(qs("#player-subtitle"), clanName ? `Clan: ${clanName}` : "Nessun clan");
    setText(qs("#player-status"), "");

    if (clanPill) {
      if (clanName) {
        clanPill.textContent = clanName;
        clanPill.style.display = "";
      } else {
        clanPill.style.display = "none";
      }
    }

    const badges = qs("#player-badges");
    if (badges) {
      const roleBadge = document.createElement("span");
      roleBadge.className = `member-badge ${info.key}`;
      roleBadge.innerHTML = `<i class="${info.icon}" aria-hidden="true"></i><span>${info.label}</span>`;
      badges.append(roleBadge);

      const level = document.createElement("span");
      level.className = "pill tag";
      level.textContent = `Lvl ${formatInt(data?.level)}`;
      badges.append(level);
    }

    clear(statsRoot);
    setAriaBusy(statsRoot, false);
    const stats = [
      ["Kills", data?.kills],
      ["Deaths", data?.deaths],
      ["Final kills", data?.final_kills],
      ["Final deaths", data?.final_deaths],
      ["Wins", data?.wins],
      ["Losses", data?.losses],
      ["Played", data?.played],
      ["Beds broken", data?.beds_broken],
      ["Coins", data?.coins],
      ["Winstreak", data?.winstreak],
      ["Best ws", data?.h_winstreak],
      ["Rank lvl", data?.level_rank],
    ];

    for (const [k, v] of stats) {
      const card = document.createElement("div");
      card.className = "pstat";
      const key = document.createElement("div");
      key.className = "k";
      key.textContent = k;
      const val = document.createElement("div");
      val.className = "v";
      val.textContent = formatInt(v);
      card.append(key, val);
      statsRoot.append(card);
    }
  } catch (err) {
    setAriaBusy(statsRoot, false);
    setText(qs("#player-status"), "Errore nel caricamento");
    setText(qs("#player-subtitle"), "—");
    showToast(err?.message || "Errore", { variant: "error" });
  }
}

async function openClanDialog(clanName) {
  const dialog = qs("#clan-dialog");
  setText(qs("#dialog-title"), clanName);
  setText(qs("#dialog-subtitle"), "Membri del clan");
  setText(qs("#dialog-status"), "Caricamento…");
  setText(qs("#dialog-xp"), "—");
  const list = qs("#members-list");
  clear(list);
  setAriaBusy(list, true);
  for (let i = 0; i < 8; i++) {
    const li = el("li", { className: "member-item" });
    const left = el("div", { className: "member-left" });
    const avatar = skelBlock({ widthPct: 0, height: 32, radius: 10, className: "" });
    avatar.style.setProperty("--skel-w", "32px");
    left.append(avatar, skelBlock({ widthPct: 52, height: 12, radius: 10, className: "skel-text skel-block" }));
    const badge = skelBlock({ widthPct: 22, height: 18, radius: 999, className: "skel-text skel-inline" });
    badge.style.setProperty("--skel-w", "84px");
    li.append(left, badge);
    list.append(li);
  }
  dialog.showModal();

  try {
    const members = await api.getJson(`/api/v1/clan-members/${encodeURIComponent(clanName)}`);
    let safe = Array.isArray(members) ? members : [];

    try {
      const clan = await api.getJson(`/api/v1/stats/bedwars/clans/${encodeURIComponent(clanName)}`);
      if (Number.isFinite(Number(clan?.total_exp))) setText(qs("#dialog-xp"), formatInt(clan.total_exp));
      if (Array.isArray(clan?.members) && clan.members.length) safe = clan.members;
    } catch {
      // ignore: show members from local json if present
    }

    setText(qs("#dialog-status"), safe.length ? `${safe.length} membri` : "Nessun membro trovato");
    clear(list);
    setAriaBusy(list, false);

    const normalize = (item) => {
      if (typeof item === "string") return { username: item, role: 0 };
      const username = item?.username || item?.nick || item?.name || item?.player?.username || null;
      const role = item?.role ?? item?.rank ?? 0;
      return username ? { username, role } : null;
    };

    for (const raw of safe) {
      const m = normalize(raw);
      if (!m) continue;

      const info = roleInfo(m.role);
      const username = String(m.username);
      const skinUrl = `https://minotar.net/avatar/${encodeURIComponent(username)}/32`;

      const li = el("li", { className: "member-item" });
      li.tabIndex = 0;
      li.setAttribute("role", "button");
      li.setAttribute("aria-label", `Apri stats di ${username}`);
      const left = el("div", { className: "member-left" });
      const img = el("img", { className: "mc-avatar" });
      img.loading = "lazy";
      img.alt = "";
      img.src = skinUrl;
      img.referrerPolicy = "no-referrer";

      const name = el("div", { className: "member-name", text: username });
      left.append(img, name);

      const badge = el("span", { className: `member-badge ${info.key}` });
      badge.innerHTML = `<i class="${info.icon}" aria-hidden="true"></i><span>${info.label}</span>`;

      li.append(left, badge);
      const open = () => {
        dialog.close();
        openPlayerDialog(username);
      };
      li.addEventListener("click", open);
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
      list.append(li);
    }
  } catch (err) {
    clear(list);
    setAriaBusy(list, false);
    setText(qs("#dialog-status"), "Errore nel caricamento");
    showToast(err?.message || "Errore", { variant: "error" });
  }
}

function renderClans(list) {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;
  if (state.page < 1) state.page = 1;

  const start = (state.page - 1) * state.pageSize;
  const end = Math.min(start + state.pageSize, total);
  const pageItems = list.slice(start, end);

  const container = qs("#clan-container");
  clear(container);

  const frag = document.createDocumentFragment();
  for (const clanName of pageItems) {
    const card = el("article", { className: "card clan" });

    const left = el("div");
    const preview = state.clanPreview?.[clanName] || null;
    const count = Number.isFinite(Number(preview?.count)) ? Number(preview.count) : null;
    const members = Array.isArray(preview?.members) ? preview.members.map((s) => String(s)) : [];

    let subtitle = "Apri per vedere i membri";
    if (count != null) {
      const names = members.length ? ` (${members.join(", ")}${count > members.length ? ", …" : ""})` : "";
      const raw = `Membri: ${count}${names}`;
      subtitle = raw.length > 64 ? `${raw.slice(0, 61)}…` : raw;
    }

    left.append(
      el("h3", { text: clanName }),
      el("div", { className: "muted", text: subtitle })
    );

    const right = el("div", { style: "display:flex; gap:10px; align-items:center;" });
    const btn = el("button", { className: "btn primary", type: "button", text: "Dettagli" });
    btn.addEventListener("click", () => openClanDialog(clanName));
    right.append(btn);

    card.append(left, right);
    frag.append(card);
  }
  container.append(frag);

  setText(qs("#visible-count"), `${total}`);

  const prev = qs("#page-prev");
  const next = qs("#page-next");
  prev.disabled = state.page <= 1;
  next.disabled = state.page >= totalPages;
  setText(
    qs("#page-meta"),
    total === 0 ? "Nessun risultato" : `Pagina ${state.page} / ${totalPages} • Mostro ${start + 1}-${end} di ${total}`
  );
}

function applyFilter() {
  const term = qs("#search").value.trim().toLowerCase();
  state.filtered = term ? state.clans.filter((c) => c.toLowerCase().includes(term)) : [...state.clans];
  state.page = 1;
  renderClans(state.filtered);
}

async function loadSummary() {
  setSkeletonText(qs("#updated-at"), { widthPct: 62, height: 14, radius: 10 });
  setSkeletonText(qs("#duration"), { widthPct: 46, height: 12, radius: 10 });
  setSkeletonText(qs("#clans-count"), { widthPct: 38, height: 18, radius: 10 });
  setSkeletonText(qs("#covered-count"), { widthPct: 42, height: 18, radius: 10 });
  setSkeletonText(qs("#without-clan-count"), { widthPct: 44, height: 18, radius: 10 });

  try {
    const summary = await api.getJson("/api/v1/summary");
    setText(qs("#updated-at"), formatDateTime(summary.updatedAt));
    setText(qs("#duration"), formatDurationMs(summary.durationMs));
    setText(qs("#clans-count"), "0");
    setText(qs("#covered-count"), "0");
    setText(qs("#without-clan-count"), "0");
    animateCount(qs("#clans-count"), summary.clansCount ?? 0, { durationMs: 780 });
    animateCount(qs("#covered-count"), summary.coveredPlayersCount ?? 0, { durationMs: 860 });
    animateCount(qs("#without-clan-count"), summary.playersWithoutClanCount ?? 0, { durationMs: 940 });

    const meta =
      summary.updatedAt != null && summary.clansCount != null
        ? `Dataset: ${summary.clansCount} clan`
        : "Dataset non pronto (metadata mancante?)";
    setText(qs("#clans-meta"), meta);
  } finally {
    clearSkeletonText(qs("#updated-at"));
    clearSkeletonText(qs("#duration"));
    clearSkeletonText(qs("#clans-count"));
    clearSkeletonText(qs("#covered-count"));
    clearSkeletonText(qs("#without-clan-count"));
  }
}

function sameStringArray(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function loadClans({ silent = false } = {}) {
  const container = qs("#clan-container");
  setAriaBusy(container, !silent);

  if (!silent) {
    container.innerHTML = "";
    const skelCount = Math.max(12, Math.min(36, state.pageSize || 24));
    const frag = document.createDocumentFragment();
    for (let i = 0; i < skelCount; i++) {
      const card = el("article", { className: "card clan" });
      const left = el("div");
      left.append(
        skelBlock({ widthPct: 48, height: 14, radius: 10, className: "skel-text skel-block" }),
        skelBlock({ widthPct: 78, height: 12, radius: 10, className: "skel-text skel-block" })
      );
      const right = el("div", { style: "display:flex; gap:10px; align-items:center;" });
      right.append(skelBlock({ widthPct: 26, height: 34, radius: 14, className: "skel-text skel-inline" }));
      card.append(left, right);
      frag.append(card);
    }
    container.append(frag);
  }

  try {
    let payload = null;
    try {
      payload = await api.getJson("/api/v1/clans-ranked", { cache: "no-store" });
    } catch {
      payload = await api.getJson("/api/v1/clans");
    }

    const list = Array.isArray(payload) ? payload : payload?.clans;
    const nextClans = Array.isArray(list) ? list : [];
    const changed = !sameStringArray(state.clans, nextClans);
    state.clans = nextClans;
    state.clanPreview = !Array.isArray(payload) && payload?.preview ? payload.preview : {};
    if (!silent || changed) applyFilter();
    if (silent && !changed) renderClans(state.filtered);

    const meta = payload && !Array.isArray(payload) ? payload.meta : null;
    if (meta?.building && meta?.covered < meta?.total) {
      if (!silent) showToast(`Ordinamento XP in preparazione… (${meta.covered}/${meta.total})`);
      if (!clanMetaPollTimer) {
        clanMetaPollTimer = window.setTimeout(async () => {
          clanMetaPollTimer = null;
          try {
            await loadClans({ silent: true });
          } catch {
            // ignore
          }
        }, 6000);
      }
    } else if (meta?.ready && clanMetaPollTimer) {
      window.clearTimeout(clanMetaPollTimer);
      clanMetaPollTimer = null;
    }
  } finally {
    setAriaBusy(container, false);
  }
}

async function runTester() {
  const endpoint = qs("#tester-endpoint").value;
  const output = qs("#tester-output");
  output.textContent = "Caricamento…";
  try {
    const json = await api.getJson(endpoint);
    output.textContent = JSON.stringify(json, null, 2);
  } catch (err) {
    output.textContent = err?.message || "Errore";
    showToast(err?.message || "Errore", { variant: "error" });
  }
}

export function mount() {
  if (clanMetaPollTimer) {
    window.clearTimeout(clanMetaPollTimer);
    clanMetaPollTimer = null;
  }

  setupDialog();
  setupPlayerDialog();

  enhanceSelect(qs("#page-size"));
  enhanceSelect(qs("#tester-endpoint"), { buttonText: (label) => label.replace(/^GET\\s+/i, "") });

  qs("#search").addEventListener("input", debounce(applyFilter, 90));

  const pageSizeSelect = qs("#page-size");
  state.pageSize = Number(pageSizeSelect.value) || 24;

  qs("#page-prev").addEventListener("click", () => {
    state.page -= 1;
    renderClans(state.filtered);
  });
  qs("#page-next").addEventListener("click", () => {
    state.page += 1;
    renderClans(state.filtered);
  });
  pageSizeSelect.addEventListener("change", () => {
    const v = Number(pageSizeSelect.value);
    state.pageSize = Number.isFinite(v) ? Math.max(6, Math.min(96, v)) : 24;
    state.page = 1;
    renderClans(state.filtered);
  });

  qs("#refresh").addEventListener("click", async () => {
    try {
      await Promise.all([loadSummary(), loadClans({ silent: false })]);
      showToast("Aggiornato");
    } catch (err) {
      showToast(err?.message || "Errore", { variant: "error" });
    }
  });

  qs("#tester-run").addEventListener("click", runTester);
  qs("#tester-copy").addEventListener("click", async () => {
    try {
      const endpoint = qs("#tester-endpoint").value;
      await copyToClipboard(`${window.location.origin}${endpoint}`);
      showToast("URL copiato");
    } catch {
      showToast("Copia non riuscita", { variant: "error" });
    }
  });

  return Promise.all([loadSummary(), loadClans({ silent: false })]).then(() => null);
}
