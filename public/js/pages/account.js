import { api } from "../lib/apiClient.js";
import { qs, setText } from "../lib/dom.js";
import { showToast } from "../lib/toast.js";
import { copyToClipboard } from "../lib/clipboard.js";
import { uiConfirm } from "../lib/confirmDialog.js";
import { clearSkeletonText, setSkeletonText } from "../lib/skeleton.js";
import { clearUserCache, getCachedMeProfile, setCachedMeProfile } from "../lib/userCache.js";
import { preferAnimatedCdnUrl } from "../lib/discordCdn.js";
import { el as uiEl, renderServerCard, requestJson } from "../lib/serversUi.js";

const API_KEY_MASK = "••••••••••••••••••••••••";
const API_KEY_AUTOHIDE_MS = 10 * 60 * 1000;

let fullApiKey = null;
let apiKeyHideTimer = null;

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(date);
}

function hexColorFromInt(intValue) {
  if (!Number.isFinite(intValue) || intValue <= 0) return null;
  const hex = intValue.toString(16).padStart(6, "0");
  return `#${hex}`;
}

function iconClassForConnectionType(type) {
  const t = String(type || "").toLowerCase();
  if (t === "github") return "fa-brands fa-github";
  if (t === "twitch") return "fa-brands fa-twitch";
  if (t === "youtube") return "fa-brands fa-youtube";
  if (t === "twitter" || t === "x") return "fa-brands fa-x-twitter";
  if (t === "instagram") return "fa-brands fa-instagram";
  if (t === "tiktok") return "fa-brands fa-tiktok";
  if (t === "steam") return "fa-brands fa-steam";
  if (t === "spotify") return "fa-brands fa-spotify";
  if (t === "reddit") return "fa-brands fa-reddit-alien";
  if (t === "discord") return "fa-brands fa-discord";
  if (t === "domain" || t === "website") return "fa-solid fa-globe";
  return "fa-solid fa-link";
}

function applyProfile(u) {
  const display = u?.globalName || u?.username || "—";
  const handle = u?.username ? `@${u.username}` : "—";
  const role = String(u?.role || "member").toLowerCase().trim();

  setText(qs("#profile-name"), display);
  setText(qs("#profile-handle"), handle);
  setText(qs("#profile-id"), u?.discordId || "—");
  setText(qs("#profile-created"), formatDate(u?.createdAt));
  setText(qs("#profile-last"), formatDateTime(u?.lastLoginAt));
  setText(qs("#profile-role"), role === "ceo" ? "CEO" : role === "moderator" ? "Moderatore" : "Membro");

  const avatar = document.querySelector("#profile-avatar");
  if (avatar) {
    avatar.loading = "eager";
    avatar.decoding = "async";
    avatar.referrerPolicy = "no-referrer";
    try {
      avatar.fetchPriority = "high";
    } catch {
      // ignore
    }
    avatar.src = preferAnimatedCdnUrl(u?.avatarUrl) || "https://cdn.discordapp.com/embed/avatars/0.png";
  }

  const banner = document.querySelector("#discord-banner");
  if (banner) {
    const accent = hexColorFromInt(u?.accentColor);
    if (u?.bannerUrl) {
      const url = preferAnimatedCdnUrl(u.bannerUrl);
      banner.style.backgroundImage = `url("${url}")`;
    } else if (accent) {
      banner.style.backgroundImage = `linear-gradient(135deg, ${accent}, rgba(56,189,248,.22))`;
    }
  }

  const deco = document.querySelector("#profile-decoration");
  if (deco) {
    if (u?.avatarDecorationUrl) {
      deco.loading = "eager";
      deco.decoding = "async";
      deco.referrerPolicy = "no-referrer";
      deco.src = String(u.avatarDecorationUrl).replace(/\.gif(\?|$)/, ".png$1");
      deco.style.display = "block";
    } else {
      deco.style.display = "none";
    }
  }

  const connWrap = document.querySelector("#connections-wrap");
  const conn = document.querySelector("#connections");
  if (connWrap && conn) {
    conn.innerHTML = "";
    if (Array.isArray(u?.connections) && u.connections.length) {
      connWrap.style.display = "";
      for (const c of u.connections.slice(0, 12)) {
        const label = c?.name ? `${c.type}: ${c.name}` : String(c?.type || "connection");
        const pill = document.createElement("span");
        pill.className = "conn-pill";
        pill.dataset.type = String(c?.type || "").toLowerCase();

        const ico = document.createElement("i");
        ico.className = `conn-ico ${iconClassForConnectionType(c?.type)}`;
        ico.setAttribute("aria-hidden", "true");

        const text = document.createElement("span");
        text.textContent = label;

        pill.append(ico, text);
        conn.appendChild(pill);
      }
    } else {
      connWrap.style.display = "none";
    }
  }
}

async function fetchProfile() {
  const u = await api.getJson("/auth/me");
  applyProfile(u);
  setCachedMeProfile(u);
  setText(qs("#profile-status"), "");
}

async function fetchApiKey() {
  const k = await api.getJson("/auth/api-key");
  const prefix = k?.apiKeyPrefix || null;
  const created = Boolean(k?.created);
  const apiKey = k?.apiKey || null;

  qs("#key-prefix").value = prefix || "—";

  if (apiKeyHideTimer) window.clearTimeout(apiKeyHideTimer);
  apiKeyHideTimer = null;
  fullApiKey = null;

  const fullInput = qs("#key-full");
  const copyBtn = qs("#copy-key");
  const toggleBtn = qs("#toggle-key");

  const setToggleIcon = () => {
    const icon = document.querySelector("#toggle-key i");
    if (!icon) return;
    icon.className = fullInput.type === "password" ? "fa-regular fa-eye" : "fa-regular fa-eye-slash";
  };

  const hideNow = () => {
    fullApiKey = null;
    fullInput.type = "password";
    fullInput.value = prefix ? API_KEY_MASK : "";
    copyBtn.disabled = true;
    toggleBtn.disabled = true;
    setToggleIcon();
  };

  if (apiKey) {
    fullApiKey = apiKey;
    fullInput.type = "password";
    fullInput.value = apiKey;
    copyBtn.disabled = false;
    toggleBtn.disabled = false;
    setToggleIcon();
    apiKeyHideTimer = window.setTimeout(hideNow, API_KEY_AUTOHIDE_MS);
  } else if (prefix) {
    fullInput.type = "password";
    fullInput.value = API_KEY_MASK;
    copyBtn.disabled = true;
    toggleBtn.disabled = true;
    setToggleIcon();
  } else {
    fullInput.type = "password";
    fullInput.value = "";
    copyBtn.disabled = true;
    toggleBtn.disabled = true;
    setToggleIcon();
  }

  setText(
    qs("#key-hint"),
    created
      ? "Nuova key disponibile: copiala ora (poi non sarà più visibile). Si nasconde automaticamente dopo 10 minuti."
      : prefix
        ? "Key già creata: per sicurezza la key completa non è visibile qui. Premi Rigenera per generarne una nuova (visibile una sola volta)."
        : "Nessuna key: premi Rigenera per crearla."
  );
}

async function rotateKey() {
  const res = await fetch("/auth/api-key/rotate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
  if (payload?.apiKeyPrefix) qs("#key-prefix").value = payload.apiKeyPrefix;
  if (payload?.apiKey) {
    if (apiKeyHideTimer) window.clearTimeout(apiKeyHideTimer);
    apiKeyHideTimer = null;

    fullApiKey = payload.apiKey;
    const input = qs("#key-full");
    input.type = "password";
    input.value = payload.apiKey;
    qs("#copy-key").disabled = false;
    qs("#toggle-key").disabled = false;

    const icon = document.querySelector("#toggle-key i");
    if (icon) icon.className = "fa-regular fa-eye";

    apiKeyHideTimer = window.setTimeout(() => {
      fullApiKey = null;
      input.type = "password";
      input.value = qs("#key-prefix").value && qs("#key-prefix").value !== "—" ? API_KEY_MASK : "";
      qs("#copy-key").disabled = true;
      qs("#toggle-key").disabled = true;
      if (icon) icon.className = "fa-regular fa-eye";
    }, API_KEY_AUTOHIDE_MS);
  }
  setText(
    qs("#key-hint"),
    "Nuova key disponibile: copiala ora (poi non sarà più visibile). Si nasconde automaticamente dopo 10 minuti."
  );
}

function setLoading(on) {
  const card = document.querySelector(".discord-card");
  if (card) card.classList.toggle("is-loading", Boolean(on));

  const banner = document.querySelector("#discord-banner");
  const avatarWrap = document.querySelector(".discord-avatar-wrap");
  if (banner) banner.classList.toggle("skel", Boolean(on));
  if (avatarWrap) avatarWrap.classList.toggle("skel", Boolean(on));

  const setT = (sel, opts) => setSkeletonText(document.querySelector(sel), opts);
  const clearT = (sel) => clearSkeletonText(document.querySelector(sel));

  if (on) {
    setT("#profile-name", { widthPct: 62, height: 16, radius: 10 });
    setT("#profile-handle", { widthPct: 44, height: 12, radius: 10 });
    setT("#profile-id", { widthPct: 58, height: 12, radius: 10 });
    setT("#profile-created", { widthPct: 38, height: 12, radius: 10 });
    setT("#profile-last", { widthPct: 52, height: 12, radius: 10 });
    setT("#key-hint", { widthPct: 72, height: 12, radius: 10 });

    const prefix = document.querySelector("#key-prefix");
    const full = document.querySelector("#key-full");
    const copyKey = document.querySelector("#copy-key");
    const toggleKey = document.querySelector("#toggle-key");
    if (prefix) {
      prefix.value = "";
      prefix.classList.add("skel-input");
    }
    if (full) {
      full.value = "";
      full.classList.add("skel-input");
    }
    if (copyKey) copyKey.disabled = true;
    if (toggleKey) toggleKey.disabled = true;
    return;
  }

  clearT("#profile-name");
  clearT("#profile-handle");
  clearT("#profile-id");
  clearT("#profile-created");
  clearT("#profile-last");
  clearT("#key-hint");

  const prefix = document.querySelector("#key-prefix");
  const full = document.querySelector("#key-full");
  if (prefix) prefix.classList.remove("skel-input");
  if (full) full.classList.remove("skel-input");
}

async function loadMyServers() {
  const meta = document.querySelector("#account-servers-meta");
  const list = document.querySelector("#account-servers-list");
  if (meta) setText(meta, "Caricamento…");
  if (list) list.innerHTML = "";

  try {
    const out = await requestJson("/api/servers/mine");
    const servers = Array.isArray(out?.servers) ? out.servers : [];
    if (meta) setText(meta, `${servers.length} servers`);

    if (list) {
      for (const s of servers) {
        const del = uiEl("button", { className: "btn danger block", text: "Rimuovi" });
        del.type = "button";
        del.style.marginTop = "12px";
        del.addEventListener("click", async () => {
          const ok = await uiConfirm({
            title: "Rimuovere server?",
            message: "Vuoi rimuovere questo server dalla directory?",
            details: [
              "Il server non comparirà più nella directory pubblica.",
              "Per riaggiungerlo dovrai ripubblicarlo.",
            ],
            confirmText: "Rimuovi",
            cancelText: "Annulla",
            variant: "danger",
          });
          if (!ok) return;

          del.disabled = true;
          try {
            const resp = await requestJson(`/api/servers/${encodeURIComponent(s.id)}`, { method: "DELETE" });
            if (Number(resp?.deleted || 0) > 0) showToast("Server rimosso");
            else showToast("Nessuna modifica", { variant: "error" });
            await loadMyServers();
          } catch (err) {
            showToast(err?.body?.error || err?.message || "Errore", { variant: "error" });
            del.disabled = false;
          }
        });

        list.appendChild(renderServerCard(s, { compact: true, actions: del }));
      }
      if (!servers.length) {
        list.appendChild(
          uiEl("div", {
            className: "muted grid-span-12",
            text: "Ancora nessun server Discord pubblicato. Usa “Apri directory” per aggiungerne uno.",
          })
        );
      }
    }
  } catch (err) {
    if (meta) setText(meta, err?.message || "Errore");
    if (list) list.appendChild(uiEl("div", { class: "muted", text: "Impossibile caricare i tuoi servers." }));
  }
}

export async function mount() {
  setLoading(true);

  const cached = getCachedMeProfile();
  if (cached) {
    try {
      applyProfile(cached);
      const prefix = cached?.apiKeyPrefix || null;
      if (prefix) qs("#key-prefix").value = prefix;
      const full = qs("#key-full");
      full.type = "password";
      full.value = prefix ? API_KEY_MASK : "";
      qs("#copy-key").disabled = true;
      qs("#toggle-key").disabled = true;
      setText(qs("#profile-status"), "Aggiorno…");
      setLoading(false);
    } catch {
      // ignore cached render errors
    }
  }

  qs("#toggle-key").addEventListener("click", () => {
    const input = qs("#key-full");
    if (!fullApiKey) {
      showToast("API key completa non disponibile. Premi Rigenera per vederla una sola volta.", { variant: "error" });
      return;
    }
    input.type = input.type === "password" ? "text" : "password";
    const icon = document.querySelector("#toggle-key i");
    if (icon) {
      icon.className = input.type === "password" ? "fa-regular fa-eye" : "fa-regular fa-eye-slash";
    }
  });


  qs("#copy-prefix").addEventListener("click", async () => {
    try {
      await copyToClipboard(qs("#key-prefix").value);
      showToast("Prefix copiato");
    } catch (err) {
      showToast(err?.message || "Errore", { variant: "error" });
    }
  });

  qs("#copy-key").addEventListener("click", async () => {
    if (!fullApiKey) {
      showToast("API key completa non disponibile. Premi Rigenera per generarla e copiarla.", { variant: "error" });
      return;
    }
    try {
      await copyToClipboard(fullApiKey);
      showToast("API key copiata");
    } catch (err) {
      showToast(err?.message || "Errore", { variant: "error" });
    }
  });

  qs("#rotate").addEventListener("click", async () => {
    qs("#rotate").disabled = true;
    try {
      await rotateKey();
      showToast("Key rigenerata");
    } catch (err) {
      showToast(err?.message || "Errore", { variant: "error" });
    } finally {
      qs("#rotate").disabled = false;
    }
  });

  qs("#delete-account").addEventListener("click", async () => {
    const ok = await uiConfirm({
      title: "Eliminare account?",
      message: "Vuoi eliminare definitivamente l'account?",
      details: [
        "Perderai l'accesso al profilo e alle impostazioni.",
        "La tua API key verrà invalidata e non sarà più utilizzabile.",
        "I tuoi server pubblicati verranno rimossi dalla directory.",
      ],
      confirmText: "Elimina",
      cancelText: "Annulla",
      variant: "danger",
    });
    if (!ok) return;

    qs("#delete-account").disabled = true;
    try {
      const res = await fetch("/auth/delete-account", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
      clearUserCache();
      window.location.href = "/";
    } catch (err) {
      showToast(err?.message || "Errore", { variant: "error" });
      qs("#delete-account").disabled = false;
    }
  });

  try {
    await fetchProfile();
    await fetchApiKey();
    await loadMyServers();
    setLoading(false);
  } catch (err) {
    setLoading(false);
    setText(qs("#profile-status"), "Non autenticato");
    showToast("Fai login con Discord per generare la tua API key.", { variant: "error" });
  }
}
