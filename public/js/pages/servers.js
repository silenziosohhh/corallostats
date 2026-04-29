import { copyToClipboard } from "../lib/clipboard.js";
import { el, fmtDateTime, normalizeTag, qsa, renderServerCard, requestJson, tagLabel } from "../lib/serversUi.js";
import { mountTagMultiSelect, syncTagMultiSelect } from "../lib/tagMultiSelect.js";
import { renderMarkdownLite } from "../lib/markdownLite.js";

function qs(sel, root = document) {
  return root.querySelector(sel);
}

function safeText(node, txt) {
  if (!node) return;
  const v = txt == null ? "" : String(txt);
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
    node.value = v;
    return;
  }
  node.textContent = v;
}

function flashInline(node, message, { variant = "default", timeoutMs = 2600, restore = true } = {}) {
  if (!node) return;
  const base = restore ? String(node.dataset.baseText ?? node.textContent ?? "") : "";
  node.classList.toggle("is-error", variant === "error");
  node.classList.toggle("is-success", variant === "success");
  node.textContent = String(message || "");

  if (timeoutMs <= 0) return;
  if (node._flashTimer) window.clearTimeout(node._flashTimer);
  node._flashTimer = window.setTimeout(() => {
    node.classList.remove("is-error", "is-success");
    if (restore) node.textContent = base;
  }, timeoutMs);
}

function serverIdFromPath(pathname) {
  const p = String(pathname || "").trim();
  const m = /^\/servers\/([^/]+)$/.exec(p);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function bindCharCount(inputEl, counterEl, { max } = {}) {
  if (!inputEl || !counterEl) return;
  const maxN = Number(max);
  const hasMax = Number.isFinite(maxN) && maxN > 0;
  const render = () => {
    const v = String(inputEl.value || "");
    counterEl.textContent = hasMax ? `${v.length}/${maxN}` : String(v.length);
  };
  inputEl.addEventListener("input", render);
  render();
}

function normalizeInviteCode(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";

  if (/^[a-zA-Z0-9-_]{2,32}$/.test(s)) return s;

  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (host === "discord.gg" || host.endsWith(".discord.gg")) {
      const code = u.pathname.replace(/^\/+/, "").split("/")[0] || "";
      if (/^[a-zA-Z0-9-_]{2,32}$/.test(code)) return code;
      return "";
    }
    if (host === "discord.com" || host.endsWith(".discord.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "invite");
      if (idx >= 0) {
        const code = parts[idx + 1] || "";
        if (/^[a-zA-Z0-9-_]{2,32}$/.test(code)) return code;
      }
      return "";
    }
  } catch {
    return "";
  }

  return "";
}

async function checkLoggedIn({ signal } = {}) {
  try {
    const res = await fetch("/auth/ui-profile", { signal, headers: { Accept: "application/json" } });
    if (!res.ok) return { loggedIn: false, profile: null };
    const json = await res.json();
    return { loggedIn: true, profile: json };
  } catch {
    return { loggedIn: false, profile: null };
  }
}

function cacheKeyForPublicServers({ q, tag, limit }) {
  const sp = new URLSearchParams();
  if (q) sp.set("q", String(q));
  if (tag) sp.set("tag", String(tag));
  sp.set("limit", String(limit || 60));
  return `publicServers:${sp.toString()}`;
}

function readJsonCache(key, { ttlMs }) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const at = Number(obj?.at || 0);
    if (!Number.isFinite(at) || at <= 0) return null;
    if (Number.isFinite(Number(ttlMs)) && ttlMs > 0 && Date.now() - at > ttlMs) return null;
    return obj?.data ?? null;
  } catch {
    return null;
  }
}

function writeJsonCache(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // ignore
  }
}

export function mount() {
  const healthEl = qs("#srv-health");
  const scraperEl = qs("#srv-scraper");
  const scraperMetaEl = qs("#srv-scraper-meta");

  const qEl = qs("#srv-q");
  const tagEl = qs("#srv-tag");
  const refreshEl = qs("#srv-refresh");
  const listMetaEl = qs("#srv-list-meta");
  const listEl = qs("#srv-list");

  const publishHintEl = qs("#srv-publish-hint");
  const publishStatusEl = qs("#srv-publish-status");
  const publishBtn = qs("#srv-publish");
  const openPublishBtn = qs("#srv-open-publish");

  const nameEl = qs("#srv-name");
  const descEl = qs("#srv-desc");
  const inviteEl = qs("#srv-invite");
  const tagsWrapEl = qs("#srv-tags");
  const tagsDdEl = qs("#srv-tags-dd");
  const tagsBtnEl = qs("#srv-tags-btn");
  const tagsLabelEl = qs("#srv-tags-label");
  const tagsChipsEl = qs("#srv-tags-chips");
  const inviteCountEl = qs("#srv-invite-count");
  const descCountEl = qs("#srv-desc-count");

  safeText(healthEl, "Caricamento…");
  safeText(scraperEl, "Caricamento…");
  safeText(scraperMetaEl, "");
  safeText(listMetaEl, "Caricamento…");
  if (listEl) listEl.innerHTML = "";

  const abort = new AbortController();
  let logged = { loggedIn: false, profile: null };
  let allTags = [];
  let publicReq = 0;

  const botDialog = qs("#srv-bot-dialog");
  const botGuildEl = qs("#srv-bot-guild");
  const botInviteUrlEl = qs("#srv-bot-invite-url");
  const botInviteUrlOpen = qs("#srv-bot-open");
  const botInviteUrlCopy = qs("#srv-bot-copy");
  const botDialogClose = qs("#srv-bot-close");

  const detailsDialog = qs("#srv-details-dialog");
  const detailsClose = qs("#srv-details-close");
  const detailsTitle = qs("#srv-details-title");
  const detailsSub = qs("#srv-details-sub");
  const detailsHead = qs("#srv-details-head");
  const detailsDesc = qs("#srv-details-desc");
  const detailsLikeSlot = qs("#srv-details-like-slot");
  const detailsTags = qs("#srv-details-tags");
  const detailsOnline = qs("#srv-details-online");
  const detailsMembers = qs("#srv-details-members");
  const detailsGuild = qs("#srv-details-guild");
  const detailsUpdated = qs("#srv-details-updated");
  const detailsOpen = qs("#srv-details-open");
  const detailsCopy = qs("#srv-details-copy");
  const detailsLikeMeta = qs("#srv-details-like-meta");

  let lastPublicServers = [];
  let detailsInviteUrl = null;
  let detailsPushed = false;
  let pendingDetailsId = serverIdFromPath(window.location.pathname);
  let openDetailsServerId = null;
  let openDetailsLiked = false;
  let openDetailsLikeUntilMs = 0;
  let openDetailsLikeLoading = false;
  let likeCountdownTimer = null;
  let detailsLikeBtn = null;
  let detailsTitleRow = null;

  function openBotDialog({ botInviteUrl, guildName, guildId } = {}) {
    if (!botDialog) return;
    safeText(botGuildEl, guildName ? `${guildName}${guildId ? ` (${guildId})` : ""}` : guildId || "—");
    safeText(botInviteUrlEl, botInviteUrl || "—");
    if (botInviteUrlOpen) botInviteUrlOpen.href = botInviteUrl || "#";
    try {
      botDialog.showModal();
    } catch {
      // ignore
    }
  }

  if (botDialogClose) botDialogClose.addEventListener("click", () => botDialog?.close?.());
  if (detailsClose) detailsClose.addEventListener("click", () => detailsDialog?.close?.());
  if (botInviteUrlCopy) {
    botInviteUrlCopy.addEventListener("click", async () => {
      try {
        const raw =
          botInviteUrlEl instanceof HTMLInputElement || botInviteUrlEl instanceof HTMLTextAreaElement
            ? botInviteUrlEl.value
            : botInviteUrlEl?.textContent || "";
        await copyToClipboard(String(raw || "").trim());
        flashInline(botInviteUrlEl, "Link bot copiato", { variant: "success", timeoutMs: 1800, restore: false });
      } catch (err) {
        flashInline(botInviteUrlEl, err?.message || "Errore", { variant: "error", timeoutMs: 2600, restore: false });
      }
    });
  }

  function renderTagsChips(rootEl, tags) {
    if (!rootEl) return;
    rootEl.innerHTML = "";
    const list = Array.isArray(tags) ? tags : [];
    for (const t of list) {
      const norm = normalizeTag(t);
      const label = tagLabel(norm) || String(t);
      rootEl.appendChild(el("span", { class: "chip", text: label }));
    }
    if (!list.length) rootEl.appendChild(el("span", { class: "muted", text: "—" }));
  }

  function setDetailsLikeMeta(server) {
    if (!detailsLikeMeta) return;
    const n = Number(server?.likeCount || 0);
    const c = Number.isFinite(n) ? n : 0;
    const txt = `${c} like (ultime 24h)`;
    detailsLikeMeta.dataset.baseText = txt;
    safeText(detailsLikeMeta, txt);
  }

  function setLikeBtnState() {
    if (!detailsLikeBtn) return;
    const can = Boolean(logged?.loggedIn);
    const msLeft = Math.max(0, openDetailsLikeUntilMs - Date.now());
    const inCooldown = openDetailsLiked === true && msLeft > 0;
    detailsLikeBtn.disabled = !can || !openDetailsServerId || inCooldown || openDetailsLikeLoading === true;
    detailsLikeBtn.classList.toggle("is-liked", openDetailsLiked === true);
    detailsLikeBtn.setAttribute("aria-pressed", openDetailsLiked ? "true" : "false");

    const labelEl = detailsLikeBtn.querySelector?.('[data-role="like-label"]') || null;
    const cdEl = detailsLikeBtn.querySelector?.('[data-role="like-countdown"]') || null;
    if (labelEl) labelEl.textContent = "Vota";
    if (cdEl) cdEl.textContent = openDetailsLikeLoading ? "…" : inCooldown ? formatCountdown(msLeft) : "";
  }

  function stopLikeCountdown() {
    if (likeCountdownTimer) window.clearInterval(likeCountdownTimer);
    likeCountdownTimer = null;
  }

  function formatCountdown(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function startLikeCountdown() {
    stopLikeCountdown();
    if (!openDetailsLikeUntilMs) return;
    const cdEl = detailsLikeBtn?.querySelector?.('[data-role="like-countdown"]') || null;
    if (!cdEl) return;
    likeCountdownTimer = window.setInterval(() => {
      const msLeft = Math.max(0, openDetailsLikeUntilMs - Date.now());
      if (msLeft <= 0) {
        stopLikeCountdown();
        openDetailsLiked = false;
        openDetailsLikeUntilMs = 0;
        cdEl.textContent = "";
        setLikeBtnState();
        return;
      }
      cdEl.textContent = formatCountdown(msLeft);
    }, 1000);
  }

  function syncLikePlacement() {
    if (!detailsLikeBtn) return;
    if (!detailsTitleRow && !detailsLikeSlot) return;
    const isMobile = window.matchMedia ? window.matchMedia("(max-width: 620px)").matches : window.innerWidth <= 620;
    const target = isMobile ? detailsLikeSlot : detailsTitleRow;
    if (!target) return;
    if (detailsLikeBtn.parentElement !== target) target.appendChild(detailsLikeBtn);
  }

  async function loadMyLike(serverId) {
    openDetailsLiked = false;
    openDetailsLikeUntilMs = 0;
    openDetailsLikeLoading = true;
    stopLikeCountdown();
    setLikeBtnState();
    if (!serverId || !logged?.loggedIn) {
      openDetailsLikeLoading = false;
      setLikeBtnState();
      return;
    }
    try {
      const out = await requestJson(`/api/servers/${encodeURIComponent(serverId)}/like`, { signal: abort.signal });
      openDetailsLiked = Boolean(out?.liked);
      const msLeft = Number(out?.msLeft || 0);
      if (openDetailsLiked && Number.isFinite(msLeft) && msLeft > 0) {
        openDetailsLikeUntilMs = Date.now() + msLeft;
        const cdEl = detailsLikeBtn?.querySelector?.('[data-role="like-countdown"]') || null;
        if (cdEl) cdEl.textContent = formatCountdown(msLeft);
        startLikeCountdown();
      }
    } catch {
      openDetailsLiked = false;
      openDetailsLikeUntilMs = 0;
    } finally {
      openDetailsLikeLoading = false;
      setLikeBtnState();
    }
  }

  function openDetailsDialog(server) {
    if (!detailsDialog || !server) return;

    openDetailsServerId = String(server?.id || "").trim() || null;

    try {
      detailsLikeBtn?.remove?.();
    } catch {
      // ignore
    }
    detailsLikeBtn = null;
    if (detailsLikeSlot) detailsLikeSlot.innerHTML = "";

    const name = server?.name || server?.discord?.guildName || "Discord Server";
    safeText(detailsTitle, name);

    const online = server?.stats?.online ?? null;
    const members = server?.stats?.members ?? null;
    const guildCreatedAt = server?.stats?.guildCreatedAt ?? null;

    if (detailsHead) {
      detailsHead.innerHTML = "";
      detailsTitleRow = null;

      const iconUrl = server?.discord?.iconUrl || null;
      const iconNode = iconUrl
        ? el("img", { class: "invite-icon", src: iconUrl, alt: "" })
        : el("div", { class: "invite-icon invite-icon-fallback" }, [(name || "D").slice(0, 1).toUpperCase()]);

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

      const titleRow = el("div", { class: "invite-title-row invite-title-row--details" }, [
        el("div", { class: "invite-name", text: name }),
      ]);
      detailsTitleRow = titleRow;
      detailsLikeBtn = el(
        "button",
        { class: "btn like-btn", type: "button", "aria-label": "Vota", "aria-pressed": "false" },
        [
          el("i", { class: "fa-solid fa-heart", "aria-hidden": "true" }),
          el("span", { "data-role": "like-label", text: "Vota" }),
          el("span", { "data-role": "like-countdown", class: "like-countdown", text: "" }),
        ]
      );
      detailsLikeBtn.addEventListener("click", async () => {
        if (!openDetailsServerId) return;
        if (!logged?.loggedIn) {
          flashInline(detailsLikeMeta, "Login richiesto per votare.", { variant: "error", timeoutMs: 2600 });
          return;
        }

        detailsLikeBtn.disabled = true;
        try {
          openDetailsLikeLoading = true;
          setLikeBtnState();
          const out = await requestJson(`/api/servers/${encodeURIComponent(openDetailsServerId)}/like`, {
            signal: abort.signal,
            method: "POST",
            headers: { Accept: "application/json" },
          });
          openDetailsLiked = Boolean(out?.liked);
          const msLeft = Number(out?.msLeft || 0);
          openDetailsLikeUntilMs = openDetailsLiked && Number.isFinite(msLeft) && msLeft > 0 ? Date.now() + msLeft : 0;
          if (openDetailsLikeUntilMs) startLikeCountdown();
          setLikeBtnState();
          if (Number.isFinite(Number(out?.likeCount))) {
            await refreshLikesEverywhere(openDetailsServerId, Number(out.likeCount));
          } else {
            await loadPublicServers();
          }
        } catch (err) {
          flashInline(detailsLikeMeta, err?.body?.error || err?.message || "Errore", { variant: "error", timeoutMs: 3200 });
        } finally {
          openDetailsLikeLoading = false;
          detailsLikeBtn.disabled = false;
          setLikeBtnState();
        }
      });
      titleRow.appendChild(detailsLikeBtn);

      detailsHead.append(iconNode, el("div", { class: "invite-title" }, [titleRow, sub]));
    }

    const guildName = server?.discord?.guildName || null;
    safeText(detailsSub, guildName && guildName !== name ? guildName : `Guild ID: ${server?.discord?.guildId || "—"}`);

    if (detailsDesc) {
      const raw = String(server?.description || "");
      detailsDesc.innerHTML = raw ? renderMarkdownLite(raw) : "—";
    }
    renderTagsChips(detailsTags, server?.tags || []);

    safeText(detailsOnline, Number.isFinite(Number(online)) ? Number(online).toLocaleString("it-IT") : "—");
    safeText(detailsMembers, Number.isFinite(Number(members)) ? Number(members).toLocaleString("it-IT") : "—");
    safeText(detailsGuild, server?.discord?.guildId ? String(server.discord.guildId) : "—");
    safeText(detailsUpdated, server?.updatedAt ? fmtDateTime(server.updatedAt) : "—");
    setDetailsLikeMeta(server);
    loadMyLike(openDetailsServerId);

    const inviteCode = server?.discord?.inviteCode || null;
    detailsInviteUrl = inviteCode ? `https://discord.gg/${inviteCode}` : null;
    if (detailsOpen) {
      detailsOpen.href = detailsInviteUrl || "#";
      detailsOpen.classList.toggle("disabled", !detailsInviteUrl);
      detailsOpen.setAttribute("aria-disabled", detailsInviteUrl ? "false" : "true");
    }
    if (detailsCopy) detailsCopy.disabled = !detailsInviteUrl;

    try {
      detailsDialog.showModal();
    } catch {
      // ignore
    }
    syncLikePlacement();
    setLikeBtnState();
  }

  function closeDetailsDialog() {
    try {
      detailsDialog?.close?.();
    } catch {
      // ignore
    }
    openDetailsServerId = null;
    openDetailsLiked = false;
    openDetailsLikeUntilMs = 0;
    stopLikeCountdown();
    try {
      detailsLikeBtn?.remove?.();
    } catch {
      // ignore
    }
    detailsLikeBtn = null;
    if (detailsLikeSlot) detailsLikeSlot.innerHTML = "";
    detailsTitleRow = null;
  }

  function syncDetailsRoute(pathname) {
    const id = serverIdFromPath(pathname);
    if (!id) {
      pendingDetailsId = null;
      detailsPushed = false;
      if (detailsDialog?.open) closeDetailsDialog();
      return;
    }

    const server = lastPublicServers.find((x) => String(x?.id || "") === id) || null;
    if (server) {
      pendingDetailsId = null;
      detailsPushed = false;
      openDetailsDialog(server);
      return;
    }

    pendingDetailsId = id;
  }

  function pushDetailsUrl(id) {
    const sid = String(id || "").trim();
    if (!sid) return;
    const next = `/servers/${encodeURIComponent(sid)}`;
    if (window.location.pathname === next) return;
    try {
      window.history.pushState({ modal: "server_details", id: sid }, "", next);
      detailsPushed = true;
    } catch {
      // ignore
    }
  }

  function pushServersUrl() {
    if (window.location.pathname === "/servers") return;
    try {
      window.history.pushState({}, "", "/servers");
    } catch {
      // ignore
    }
  }

  let onDetailsClose = null;
  if (detailsDialog) {
    onDetailsClose = () => {
      // If user opened via click (pushed url), closing should go back to /servers.
      if (detailsPushed) {
        detailsPushed = false;
        try {
          window.history.back();
          return;
        } catch {
          // ignore
        }
      }
      // If user landed directly on /servers/:id, closing should keep them on /servers.
      if (serverIdFromPath(window.location.pathname)) pushServersUrl();
    };
    detailsDialog.addEventListener("close", onDetailsClose);
  }

  const mqLike = window.matchMedia ? window.matchMedia("(max-width: 620px)") : null;
  const onMqLikeChange = () => syncLikePlacement();
  if (mqLike?.addEventListener) mqLike.addEventListener("change", onMqLikeChange);
  else if (mqLike?.addListener) mqLike.addListener(onMqLikeChange);

  const onServersRoute = (e) => syncDetailsRoute(e?.detail?.pathname || window.location.pathname);
  window.addEventListener("servers:route", onServersRoute);

  if (detailsCopy) {
    detailsCopy.addEventListener("click", async () => {
      if (!detailsInviteUrl) return;
      try {
        await copyToClipboard(detailsInviteUrl);
        flashInline(detailsLikeMeta, "Invite copiato", { variant: "success", timeoutMs: 1800 });
      } catch (err) {
        flashInline(detailsLikeMeta, err?.message || "Errore", { variant: "error", timeoutMs: 2600 });
      }
    });
  }

  async function refreshLikesEverywhere(serverId, likeCount) {
    const sid = String(serverId || "").trim();
    if (!sid) return;
    const idx = lastPublicServers.findIndex((x) => String(x?.id || "") === sid);
    if (idx >= 0 && Number.isFinite(Number(likeCount))) {
      lastPublicServers[idx] = { ...lastPublicServers[idx], likeCount: Number(likeCount) };
      setDetailsLikeMeta(lastPublicServers[idx]);
    }

    const card = listEl?.querySelector?.(`article.server-card[data-server-id="${CSS.escape(sid)}"]`) || null;
    const countEl = card?.querySelector?.('[data-role="like-count"]') || null;
    if (countEl) countEl.textContent = String(Number.isFinite(Number(likeCount)) ? Number(likeCount) : 0);
  }

  const publishDialog = qs("#srv-publish-dialog");
  const publishDialogClose = qs("#srv-publish-close");
  if (publishDialogClose) publishDialogClose.addEventListener("click", () => publishDialog?.close?.());

  // Mobile UX: keep "Descrizione" right under the invite input.
  // Desktop stays unchanged (description below the grid).
  let publishDescPlaceholder = null;
  const publishGridEl = publishDialog?.querySelector?.(".publish-grid") || null;
  const publishFormEl = publishDialog?.querySelector?.(".publish-form") || null;
  const inviteFieldEl = inviteEl?.closest?.(".field") || null;
  const descFieldEl = descEl?.closest?.(".field") || null;
  const tagFieldEl = publishGridEl?.querySelector?.(".tag-field") || null;

  if (publishFormEl && descFieldEl && !publishDescPlaceholder) {
    const ph = document.createElement("div");
    ph.style.display = "none";
    ph.dataset.role = "srv-desc-placeholder";
    descFieldEl.parentNode?.insertBefore(ph, descFieldEl);
    publishDescPlaceholder = ph;
  }

  const publishMq = window.matchMedia ? window.matchMedia("(max-width: 620px)") : null;
  const coarseMq = window.matchMedia ? window.matchMedia("(pointer: coarse)") : null;
  const syncPublishLayout = () => {
    if (!publishGridEl || !descFieldEl || !publishDescPlaceholder) return;

    const isMobile = Boolean(coarseMq?.matches) || (publishMq ? publishMq.matches : window.innerWidth <= 620);
    if (isMobile) {
      if (descFieldEl.parentElement !== publishGridEl) publishGridEl.appendChild(descFieldEl);
      if (inviteFieldEl && inviteFieldEl.parentElement === publishGridEl) {
        inviteFieldEl.after(descFieldEl);
      } else if (tagFieldEl && tagFieldEl.parentElement === publishGridEl) {
        tagFieldEl.before(descFieldEl);
      }
      return;
    }

    if (descFieldEl.parentElement !== publishFormEl) {
      publishDescPlaceholder.after(descFieldEl);
    }
  };

  syncPublishLayout();
  const onPublishMqChange = () => syncPublishLayout();
  if (publishMq?.addEventListener) publishMq.addEventListener("change", onPublishMqChange);
  else if (publishMq?.addListener) publishMq.addListener(onPublishMqChange);
  if (coarseMq?.addEventListener) coarseMq.addEventListener("change", onPublishMqChange);
  else if (coarseMq?.addListener) coarseMq.addListener(onPublishMqChange);

  const unmountTags = mountTagMultiSelect({
    wrap: tagsDdEl,
    btn: tagsBtnEl,
    menu: tagsWrapEl,
    labelEl: tagsLabelEl,
    chipsEl: tagsChipsEl,
    max: 10,
    placeholder: "Seleziona tag",
    getLabel: (v) => tagLabel(v),
    onMaxExceeded: (maxN) =>
      flashInline(publishStatusEl, `Max ${maxN} tag`, { variant: "error", timeoutMs: 2200, restore: false }),
  });
  bindCharCount(inviteEl, inviteCountEl, { max: 32 });
  bindCharCount(descEl, descCountEl, { max: 600 });

  (async () => {
    const start = performance.now();
    try {
      const res = await fetch("/health", { signal: abort.signal, headers: { Accept: "application/json" } });
      const ms = Math.round(performance.now() - start);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      safeText(healthEl, json?.ok ? `OK (${ms} ms)` : `Errore (${ms} ms)`);
    } catch (err) {
      if (abort.signal.aborted) return;
      safeText(healthEl, `Errore (${err?.message || "network"})`);
    }
  })();

  (async () => {
    try {
      const st = await requestJson("/api/scraper-status", { signal: abort.signal });
      if (st?.disabled) {
        safeText(scraperEl, "Disabilitato");
        safeText(scraperMetaEl, "");
        return;
      }
      const running = st?.running ? "In esecuzione" : "Idle";
      safeText(scraperEl, running);
      const metaParts = [];
      if (st?.lastRun) metaParts.push(`Ultimo run: ${fmtDateTime(st.lastRun)}`);
      if (st?.lastError) metaParts.push(`Ultimo errore: ${st.lastError}`);
      safeText(scraperMetaEl, metaParts.join(" • "));
    } catch (err) {
      if (abort.signal.aborted) return;
      safeText(scraperEl, `Errore (${err?.message || "network"})`);
      safeText(scraperMetaEl, "");
    }
  })();

  async function loadTags() {
    try {
      const out = await requestJson("/api/servers/tags", { signal: abort.signal });
      const tags = Array.isArray(out?.tags) ? out.tags : [];
      allTags = tags.map(normalizeTag).filter(Boolean);
    } catch {
      allTags = ["bedwars", "kitpvp", "duels", "skywars", "survival", "pvp"];
    }

    if (tagEl) {
      const selected = String(tagEl.value || "");
      tagEl.innerHTML = "";
      tagEl.appendChild(el("option", { value: "", text: "Tutti i tag" }));
      for (const t of allTags) {
        tagEl.appendChild(el("option", { value: t, text: tagLabel(t) }));
      }
      if (selected) tagEl.value = selected;
    }

    if (tagsWrapEl) {
      const prev = new Set(
        qsa('#srv-tags input[type="checkbox"]:checked')
          .map((x) => normalizeTag(x.value))
          .filter(Boolean)
      );

      tagsWrapEl.innerHTML = "";
      for (const t of allTags) {
        const id = `tag_${t}`;
        const row = el("label", { class: "tag-dd-item", for: id });
        const input = el("input", { class: "tag-dd-check", type: "checkbox", value: t, id });
        if (prev.has(t)) input.checked = true;
        const text = el("span", { class: "tag-dd-text", text: tagLabel(t) });
        row.append(input, text);
        tagsWrapEl.appendChild(row);
      }

      syncTagMultiSelect({
        menu: tagsWrapEl,
        labelEl: tagsLabelEl,
        chipsEl: tagsChipsEl,
        placeholder: "Seleziona tag",
        getLabel: (v) => tagLabel(v),
        max: 10,
        onMaxExceeded: (maxN) =>
          flashInline(publishStatusEl, `Max ${maxN} tag`, { variant: "error", timeoutMs: 2200, restore: false }),
      });
    }
  }

  async function loadPublicServers() {
    const reqId = ++publicReq;
    const q = String(qEl?.value || "").trim();
    const tag = String(tagEl?.value || "").trim();
    const cacheKey = cacheKeyForPublicServers({ q, tag, limit: 60 });

    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (tag) sp.set("tag", tag);
    sp.set("limit", "60");

    safeText(listMetaEl, "Caricamento…");
    if (listEl) listEl.innerHTML = "";

    const cached = readJsonCache(cacheKey, { ttlMs: 45_000 });
    if (cached && reqId === publicReq) {
      try {
        const serversCached = Array.isArray(cached?.servers) ? cached.servers : [];
        if (serversCached.length && listEl) {
          lastPublicServers = serversCached;
          safeText(listMetaEl, `${serversCached.length} servers (cache)`);
          for (const s of serversCached) {
            const card = renderServerCard(s);
            card.dataset.serverId = String(s?.id || "");
            card.classList.add("server-card-clickable");
            listEl.appendChild(card);
          }
        }
      } catch {
        // ignore cache rendering errors
      }
    }

    try {
      const out = await requestJson(`/api/public/servers?${sp.toString()}`, { signal: abort.signal });
      if (reqId !== publicReq) return;
      const servers = Array.isArray(out?.servers) ? out.servers : [];
      lastPublicServers = servers;
      writeJsonCache(cacheKey, { servers });
      safeText(listMetaEl, `${servers.length} servers`);
      if (!listEl) return;
      listEl.innerHTML = "";
      for (const s of servers) {
        const card = renderServerCard(s);
        card.dataset.serverId = String(s?.id || "");
        card.classList.add("server-card-clickable");
        listEl.appendChild(card);
      }
      if (pendingDetailsId) syncDetailsRoute(`/servers/${encodeURIComponent(pendingDetailsId)}`);
      if (!servers.length) {
        listEl.appendChild(el("div", { class: "muted grid-span-12", text: "Nessun server trovato con questi filtri." }));
      }
    } catch (err) {
      if (reqId !== publicReq) return;
      safeText(listMetaEl, `Errore caricamento (${err?.message || "network"})`);
      if (listEl) listEl.appendChild(el("div", { class: "muted grid-span-12", text: "Riprova tra poco." }));
    }
  }

  function selectedTags() {
    const checked = qsa('#srv-tags input[type="checkbox"]:checked');
    return checked.map((x) => normalizeTag(x.value)).filter(Boolean);
  }

  async function publish() {
    safeText(publishStatusEl, "Pubblicazione…");
    if (publishBtn) publishBtn.disabled = true;

    const inviteCode = normalizeInviteCode(inviteEl?.value || "");
    if (inviteEl && inviteCode && inviteEl.value !== inviteCode) inviteEl.value = inviteCode;

    const body = {
      name: String(nameEl?.value || "").trim(),
      description: String(descEl?.value || "").trim(),
      tags: selectedTags(),
      discordInvite: inviteCode || String(inviteEl?.value || "").trim(),
    };

    try {
      const out = await requestJson("/api/servers/publish", {
        signal: abort.signal,
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });

      safeText(publishStatusEl, "Pubblicato!");
      if (nameEl) nameEl.value = "";
      if (descEl) descEl.value = "";
      if (inviteEl) inviteEl.value = "";
      for (const c of qsa('#srv-tags input[type="checkbox"]')) c.checked = false;

      await loadPublicServers();
      return out;
    } catch (err) {
      const msg = err?.body?.error || "Errore publish";
      safeText(publishStatusEl, msg);

      const inviteUrl = err?.body?.botInviteUrl || null;
      if (inviteUrl && publishStatusEl) {
        publishStatusEl.appendChild(document.createTextNode(" • "));
        publishStatusEl.appendChild(el("a", { href: inviteUrl, target: "_blank", rel: "noreferrer" }, ["Aggiungi bot"]));
        openBotDialog({
          botInviteUrl: inviteUrl,
          guildId: err?.body?.guildId || null,
          guildName: err?.body?.guildName || null,
        });
      }
    } finally {
      if (publishBtn) publishBtn.disabled = false;
    }
  }

  async function refreshLoginUI() {
    logged = await checkLoggedIn({ signal: abort.signal });
    const canPublish = logged.loggedIn;

    if (openPublishBtn) openPublishBtn.disabled = !canPublish;
    if (publishHintEl) {
      safeText(
        publishHintEl,
        canPublish
          ? "Premi “Pubblica” per aprire il form. Se il bot non è nella guild, comparirà la guida per aggiungerlo."
          : "Login richiesto per pubblicare. Fai Login e torna qui."
      );
    }
  }

  let loginRefreshInFlight = null;
  function refreshLoginUIThrottled() {
    if (abort.signal.aborted) return;
    if (loginRefreshInFlight) return;
    loginRefreshInFlight = refreshLoginUI()
      .catch(() => {
        if (openPublishBtn) openPublishBtn.disabled = true;
      })
      .finally(() => {
        loginRefreshInFlight = null;
      });
  }

  if (refreshEl) refreshEl.addEventListener("click", () => loadPublicServers());
  if (qEl) qEl.addEventListener("input", () => loadPublicServers());
  if (tagEl) tagEl.addEventListener("change", () => loadPublicServers());
  if (publishBtn) publishBtn.addEventListener("click", () => publish());
  const onCardClick = (e) => {
    const target = e.target;
    if (target?.closest?.("a,button,input,select,textarea,label")) return;
    const card = target?.closest?.("article.server-card[data-server-id]");
    if (!card) return;
    const id = String(card.dataset.serverId || "");
    if (!id) return;
    const server = lastPublicServers.find((x) => String(x?.id || "") === id) || null;
    if (!server) return;
    pushDetailsUrl(id);
    openDetailsDialog(server);
  };
  if (listEl) listEl.addEventListener("click", onCardClick);
  if (inviteEl) {
    const clean = () => {
      const code = normalizeInviteCode(inviteEl.value);
      if (code && inviteEl.value !== code) inviteEl.value = code;
    };
    inviteEl.addEventListener("blur", clean);
    inviteEl.addEventListener("paste", () => queueMicrotask(clean));
  }
  if (openPublishBtn) {
    openPublishBtn.addEventListener("click", () => {
      if (!logged.loggedIn) {
        flashInline(publishHintEl, "Fai login con Discord per pubblicare.", { variant: "error", timeoutMs: 2800, restore: false });
        return;
      }
      try {
        syncPublishLayout();
        publishDialog?.showModal?.();
        window.requestAnimationFrame(() => syncPublishLayout());
      } catch {
        // ignore
      }
    });
  }

  loadTags()
    .then(() => loadPublicServers())
    .catch(() => loadPublicServers());

  const onFocus = () => refreshLoginUIThrottled();
  const onVisibility = () => {
    if (!document.hidden) refreshLoginUIThrottled();
  };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);

  refreshLoginUIThrottled();

  return () => {
    abort.abort();
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
    unmountTags?.();
    if (listEl) listEl.removeEventListener("click", onCardClick);
    window.removeEventListener("servers:route", onServersRoute);
    if (onDetailsClose && detailsDialog) detailsDialog.removeEventListener("close", onDetailsClose);
    if (mqLike?.removeEventListener) mqLike.removeEventListener("change", onMqLikeChange);
    else if (mqLike?.removeListener) mqLike.removeListener(onMqLikeChange);
    if (publishMq?.removeEventListener) publishMq.removeEventListener("change", onPublishMqChange);
    else if (publishMq?.removeListener) publishMq.removeListener(onPublishMqChange);
    if (coarseMq?.removeEventListener) coarseMq.removeEventListener("change", onPublishMqChange);
    else if (coarseMq?.removeListener) coarseMq.removeListener(onPublishMqChange);
  };
}
