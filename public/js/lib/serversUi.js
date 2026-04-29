import { el as baseEl } from "./dom.js";
import { renderMarkdownLite } from "./markdownLite.js";

export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export async function requestJson(url, init = {}) {
  const headers = { Accept: "application/json", ...(init.headers || {}) };
  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    try {
      err.body = await res.json();
    } catch {
      err.body = null;
    }
    throw err;
  }

  return res.json();
}

export function normalizeTag(tag) {
  return String(tag || "").trim().toLowerCase();
}

const TAG_LABELS = {
  bedwars: "BedWars",
  kitpvp: "KitPVP",
  duels: "Duels",
  skywars: "SkyWars",
  survival: "Survival",
  factions: "Factions",
  prison: "Prison",
  creative: "Creative",
  pvp: "PvP",
  minigames: "Minigames",

  minecraft: "Minecraft",
  accogliente: "Accogliente",
  tornei: "Tornei",
  no_toxic: "No Toxic",
  community: "Community",
  ita: "Italiano",
};

const TAG_ICONS = {
  bedwars: "fa-solid fa-bed",
  kitpvp: "fa-solid fa-bolt",
  duels: "fa-solid fa-people-arrows",
  skywars: "fa-solid fa-cloud",
  survival: "fa-solid fa-tree",
  factions: "fa-solid fa-flag",
  prison: "fa-solid fa-lock",
  creative: "fa-solid fa-palette",
  pvp: "fa-solid fa-crosshairs",
  minigames: "fa-solid fa-dice",

  accogliente: "fa-solid fa-handshake",
  tornei: "fa-solid fa-trophy",
  minecraft: "fa-solid fa-cubes",
  no_toxic: "fa-solid fa-thumbs-up",
};

export function tagLabel(tag) {
  const t = normalizeTag(tag);
  if (!t) return "";
  if (TAG_LABELS[t]) return TAG_LABELS[t];
  return t
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((p) => p.slice(0, 1).toUpperCase() + p.slice(1))
    .join("");
}

export function fmtDateTime(value) {
  const d = new Date(value || "");
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function el(tag, attrs = {}, children = []) {
  const node = baseEl(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k === "class" || k === "className") node.className = String(v);
    else if (k === "text") node.textContent = String(v);
    else node.setAttribute(k, String(v));
  }
  for (const c of children) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return node;
}

function renderLikeSummary(server) {
  const count = Number(server?.likeCount || 0);
  const safeCount = Number.isFinite(count) ? count : 0;
  return el("span", { class: "invite-likes", title: `${safeCount} like` }, [
    el("i", { class: "fa-solid fa-heart", "aria-hidden": "true" }),
    el("span", { "data-role": "like-count", text: String(safeCount) }),
  ]);
}

export function renderServerCard(server, { compact = false, showDiscord = true, actions = null } = {}) {
  const inviteCode = server?.discord?.inviteCode || null;
  const iconUrl = server?.discord?.iconUrl || null;
  const guildName = server?.discord?.guildName || null;
  const online = server?.stats?.online ?? null;
  const members = server?.stats?.members ?? null;
  const guildCreatedAt = server?.stats?.guildCreatedAt ?? null;

  const tagsWrap = el("div", {});
  tagsWrap.className = "invite-chips";

  const tagList = Array.isArray(server?.tags) ? server.tags : [];
  const chips = tagList.slice(0, 2);
  for (const t of chips) {
    const norm = normalizeTag(t);
    const label = tagLabel(norm) || String(t);
    const icoCls = TAG_ICONS[norm] || "fa-solid fa-hashtag";
    const ico = el("i", { class: `chip-ico ${icoCls}`, "aria-hidden": "true" });
    const chip = el("span", { class: "chip" }, [ico, el("span", { text: label })]);
    tagsWrap.appendChild(chip);
  }
  if (tagList.length > chips.length) {
    const remaining = tagList.slice(chips.length).map((t) => tagLabel(normalizeTag(t)) || String(t));
    const tooltip = remaining.join(", ");
    const more = el("span", {
      class: "chip chip-more",
      text: `+${tagList.length - chips.length} more`,
      "data-tooltip": tooltip,
      role: "note",
      tabindex: "0",
    });
    tagsWrap.appendChild(more);
  }

  const iconNode = iconUrl
    ? el("img", { class: "invite-icon", src: iconUrl, alt: "" })
    : el("div", { class: "invite-icon invite-icon-fallback" }, [(guildName || server?.name || "D").slice(0, 1).toUpperCase()]);

  const nameNode = el("div", { class: "invite-name", text: server?.name || guildName || "Discord Server" });
  const isVerified = server?.status ? String(server.status) === "published" : true;
  const verified = isVerified
    ? el("span", { class: "invite-verified", title: "Verificato" }, [
        el("i", { class: "fa-solid fa-circle-check", "aria-hidden": "true" }),
      ])
    : el("span", { class: "invite-verified", title: "Non verificato" }, [
        el("i", { class: "fa-regular fa-circle", "aria-hidden": "true" }),
      ]);

  const titleRow = el("div", { class: "invite-title-row" }, [nameNode, verified]);

  const sub = el("div", { class: "invite-sub" });
  if (Number.isFinite(Number(online))) {
    sub.appendChild(el("span", { class: "invite-dot", title: "Online" }));
    sub.appendChild(el("span", { text: `${Number(online).toLocaleString("it-IT")} Online` }));
  }
  if (Number.isFinite(Number(members))) {
    sub.appendChild(el("span", { text: `• ${Number(members).toLocaleString("it-IT")} Members` }));
  }
  if (guildCreatedAt) {
    const d = new Date(guildCreatedAt);
    if (!Number.isNaN(d.getTime())) {
      const est = new Intl.DateTimeFormat("it-IT", { month: "short", year: "numeric" }).format(d);
      sub.appendChild(el("span", { text: `• Est. ${est}` }));
    }
  }
  sub.appendChild(el("span", { text: "•" }));
  sub.appendChild(renderLikeSummary(server));

  const head = el("div", { class: "invite-head" }, [
    iconNode,
    el("div", { class: "invite-title" }, [titleRow, sub]),
  ]);

  const rawDesc = String(server?.description || "");
  const maxDesc = 300;
  const previewDesc = rawDesc.length > maxDesc ? rawDesc.slice(0, maxDesc) : rawDesc;
  const desc = el("div", { class: `invite-desc${rawDesc.length > maxDesc ? " is-truncated" : ""}` });
  desc.innerHTML = renderMarkdownLite(previewDesc);

  const cta = inviteCode
    ? el("a", { class: "btn success invite-cta", href: `https://discord.gg/${inviteCode}`, target: "_blank", rel: "noreferrer" }, [
        "Entra",
      ])
    : null;

  const card = el("article", { class: `card server-card invite-card${compact ? "" : ""}` }, [head, tagsWrap]);
  if (server?.description) card.appendChild(desc);
  if (cta && showDiscord) {
    const footer = el("div", { class: "invite-footer" }, [cta]);
    card.appendChild(footer);
  }
  if (actions) card.appendChild(actions);
  return card;
}
