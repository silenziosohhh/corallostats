import { showToast } from "../lib/toast.js";
import { el, renderServerCard, requestJson } from "../lib/serversUi.js";
import { copyToClipboard } from "../lib/clipboard.js";
import { uiConfirm } from "../lib/confirmDialog.js";
import { enhanceSelect } from "../lib/customSelect.js";

function qs(sel, root = document) {
  return root.querySelector(sel);
}

function setText(node, value) {
  if (!node) return;
  node.textContent = value == null ? "" : String(value);
}

function fmtDateTime(value) {
  const d = new Date(value || "");
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  };
}

function roleBadge(role) {
  const r = String(role || "member").toLowerCase().trim();
  const label = r === "ceo" ? "CEO" : r === "moderator" ? "Moderatore" : "Membro";
  return el("span", { class: `chip chip-${r}`, text: label });
}

async function loadTags() {
  const out = await requestJson("/api/servers/tags");
  return Array.isArray(out?.tags) ? out.tags : [];
}

function readCheckedTags(root) {
  const boxes = [...root.querySelectorAll('input[type="checkbox"][data-tag]')];
  return boxes.filter((b) => b.checked).map((b) => String(b.dataset.tag || "")).filter(Boolean);
}

function renderTagCheckboxGrid(root, tags, { checked = [] } = {}) {
  root.innerHTML = "";
  const checkedSet = new Set((Array.isArray(checked) ? checked : []).map((t) => String(t)));
  for (const t of tags) {
    const id = `tag_${t}_${Math.random().toString(16).slice(2)}`;
    const box = el("input", { type: "checkbox", id, "data-tag": t });
    if (checkedSet.has(t)) box.checked = true;
    const label = el("label", { for: id, class: "chip admin-tag-chip" }, [
      el("span", { text: t }),
    ]);
    const wrap = el("div", { class: "admin-tag-row" }, [box, label]);
    root.appendChild(wrap);
  }
}

function renderServerActions({ server, metaText, onEdit, onHide, onShow, onDelete }) {
  const wrap = el("div", { class: "invite-footer admin-srv-actions" });

  const meta = el("div", { class: "muted admin-srv-meta" }, [metaText || ""]);
  const actions = el("div", { class: "admin-srv-actions-right" });

  const edit = el("button", { class: "btn", type: "button" }, ["Modifica"]);
  edit.addEventListener("click", () => onEdit(server));

  const toggle = el("button", { class: "btn", type: "button" }, [server.status === "hidden" ? "Mostra" : "Nascondi"]);
  toggle.addEventListener("click", () => (server.status === "hidden" ? onShow(server) : onHide(server)));

  const del = el("button", { class: "btn danger", type: "button" }, ["Elimina"]);
  del.addEventListener("click", () => onDelete(server));

  actions.append(edit, toggle, del);
  wrap.append(meta, actions);
  return wrap;
}

async function patchServer(id, body) {
  return requestJson(`/api/admin/servers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function renderUserRow(u, { showRoleEditor, onSetRole, onRotateKey, onApiBlock, onManage }) {
  const head = el("div", { class: "admin-user-head" });
  const left = el("div", {});

  const avatarUrl = String(u?.avatarUrl || "").trim() || "https://cdn.discordapp.com/embed/avatars/0.png";
  const decorationUrl = u?.avatarDecorationUrl ? String(u.avatarDecorationUrl).trim() : "";
  const avatarWrap = el("span", { class: "user-avatar-wrap" }, [
    el("img", { class: "user-avatar", alt: "", src: avatarUrl, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" }),
  ]);
  if (decorationUrl) {
    avatarWrap.appendChild(
      el("img", { class: "user-decoration", alt: "", src: decorationUrl, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" })
    );
  }

  left.append(
    el("div", { class: "admin-user-title" }, [
      avatarWrap,
      el("b", { text: u?.globalName || u?.username || "Utente" }),
      roleBadge(u?.role),
    ]),
    el("div", { class: "muted", text: `${u.discordId} • ${u.email || "no email"} • last: ${fmtDateTime(u.lastLoginAt)}` })
  );

  const actions = el("div", { class: "admin-user-actions" });

  const copyId = el("button", { class: "btn", type: "button" }, ["Copia ID"]);
  copyId.addEventListener("click", async () => {
    try {
      await copyToClipboard(u.discordId);
      showToast("Copiato");
    } catch {
      showToast("Errore copia", { variant: "error" });
    }
  });
  actions.appendChild(copyId);

  if (onRotateKey) {
    const rotate = el("button", { class: "btn primary", type: "button" }, ["Rigenera API key"]);
    rotate.addEventListener("click", async () => {
      rotate.disabled = true;
      try {
        const out = await onRotateKey(u);
        const key = out?.apiKey || null;
        const prefix = out?.apiKeyPrefix || null;
        if (key) {
          try {
            await copyToClipboard(key);
            showToast(`Key rigenerata (copiata). Prefix: ${prefix || "—"}`);
          } catch {
            showToast(`Key rigenerata. Prefix: ${prefix || "—"}`, { variant: "success" });
          }
        } else {
          showToast("Key rigenerata");
        }
      } catch (err) {
        showToast(err?.body?.error || err?.message || "Errore", { variant: "error" });
      } finally {
        rotate.disabled = false;
      }
    });
    actions.appendChild(rotate);
  }

  const blockedUntil = u?.apiBlockedUntil ? new Date(u.apiBlockedUntil) : null;
  const blockedActive = blockedUntil && Number.isFinite(blockedUntil.getTime()) && blockedUntil.getTime() > Date.now();

  if (typeof onApiBlock === "function") {
    const sel = el("select", { class: "input", "data-ui": "select" }, []);
    const opts = [
      { v: "15", t: "Blocca 15m" },
      { v: "60", t: "Blocca 1h" },
      { v: "360", t: "Blocca 6h" },
      { v: "1440", t: "Blocca 24h" },
      { v: "10080", t: "Blocca 7g" },
      { v: "unblock", t: "Sblocca" },
    ];
    for (const o of opts) sel.appendChild(el("option", { value: o.v, text: o.t }));

    const btn = el("button", { class: "btn", type: "button" }, [blockedActive ? "Aggiorna blocco" : "Applica"]);
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const v = String(sel.value || "");
        if (v === "unblock") {
          await onApiBlock(u, { action: "unblock", minutes: 0 });
          showToast("API sbloccata");
        } else {
          await onApiBlock(u, { action: "block", minutes: Number(v) });
          showToast("API bloccata");
        }
      } catch (err) {
        showToast(err?.body?.error || err?.message || "Errore", { variant: "error" });
      } finally {
        btn.disabled = false;
      }
    });

    actions.append(sel, btn);
    try {
      enhanceSelect(sel);
    } catch {
      // ignore
    }
  }

  if (typeof onSetRole === "function" && showRoleEditor) {
    const select = el("select", { class: "input", "data-ui": "select" }, []);
    for (const r of ["member", "moderator", "ceo"]) {
      const opt = el("option", { value: r, text: r });
      if (String(u?.role || "member") === r) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener("change", async () => {
      const nextRole = String(select.value || "").trim();
      select.disabled = true;
      try {
        await onSetRole(u, nextRole);
        showToast("Ruolo aggiornato");
      } catch (err) {
        showToast(err?.body?.error || err?.message || "Errore", { variant: "error" });
      } finally {
        select.disabled = false;
      }
    });
    actions.append(select);
    try {
      enhanceSelect(select);
    } catch {
      // ignore
    }
  }

  head.append(left, actions);

  const wrap = el("div", { class: "card pad admin-user-row" }, [head]);
  if (blockedActive) {
    const label = fmtDateTime(blockedUntil.toISOString());
    wrap.appendChild(el("div", { class: "muted", text: `API bloccata fino a: ${label}` }));
  }

  if (typeof onManage === "function") {
    const manage = el("button", { class: "btn admin-user-manage", type: "button" }, ["Gestisci"]);
    manage.addEventListener("click", () => onManage(u));
    wrap.appendChild(manage);
  }
  return wrap;
}

export async function mount() {
  const abort = new AbortController();

  const roleEl = qs("#admin-role");
  const serverMeta = qs("#admin-server-meta");
  const serverResult = qs("#admin-server-result");
  const serverLookup = qs("#admin-server-lookup");
  const serverFindBtn2 = qs("#admin-server-find-2");

  const apiQuery = qs("#admin-api-q");

  const usersMeta = qs("#admin-users-meta");
  const usersList = qs("#admin-users-list");
  const usersQ = qs("#admin-users-q");
  const usersRole = qs("#admin-users-role");
  const usersMode = qs("#admin-users-mode");
  const usersModeApi = qs("#admin-users-mode-api");
  const usersModeUsers = qs("#admin-users-mode-users");
  const usersRefresh = qs("#admin-users-refresh");

  const editDialog = qs("#admin-server-edit");
  const editTagsRoot = qs("#admin-edit-tags");
  const editMeta = qs("#admin-edit-meta");
  const editName = qs("#admin-edit-name");
  const editDesc = qs("#admin-edit-desc");
  const editInvite = qs("#admin-edit-invite");
  const editStatus = qs("#admin-edit-status");
  const editSave = qs("#admin-edit-save");

  const userManageDialog = qs("#admin-user-manage");
  const userManageTitle = qs("#admin-user-manage-title");
  const userManageSub = qs("#admin-user-manage-sub");
  const userManageBody = qs("#admin-user-manage-body");
  const userManageActions = qs("#admin-user-manage-actions");

  let allowedTags = [];
  let tagsPromise = null;
  let currentEdit = null;
  let currentServer = null;
  let findCtrl = null;
  let usersCtrl = null;
  let myRole = "member";

  function closeEdit() {
    currentEdit = null;
    try {
      editDialog?.close?.();
    } catch {
      // ignore
    }
  }

  for (const btn of [...editDialog.querySelectorAll("[data-action=close]")]) {
    btn.addEventListener("click", () => closeEdit());
  }

  function closeUserManage() {
    try {
      userManageDialog?.close?.();
    } catch {
      // ignore
    }
  }

  for (const btn of [...(userManageDialog?.querySelectorAll?.("[data-action=close]") || [])]) {
    btn.addEventListener("click", () => closeUserManage());
  }

  function openUserManage({ user, canRotate, canBlock, canSetRole }) {
    if (!userManageDialog || !userManageActions || !userManageBody) return;

    const name = user?.globalName || user?.username || "Utente";
    if (userManageTitle) userManageTitle.textContent = name;
    if (userManageSub) userManageSub.textContent = `${user?.discordId || "—"} • ${user?.email || "no email"}`;

    userManageBody.innerHTML = "";
    userManageActions.innerHTML = "";

    const avatarUrl = String(user?.avatarUrl || "").trim() || "https://cdn.discordapp.com/embed/avatars/0.png";
    const decorationUrl = user?.avatarDecorationUrl ? String(user.avatarDecorationUrl).trim() : "";
    const avatarWrap = el("span", { class: "user-avatar-wrap" }, [
      el("img", { class: "user-avatar", alt: "", src: avatarUrl, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" }),
    ]);
    if (decorationUrl) {
      avatarWrap.appendChild(
        el("img", { class: "user-decoration", alt: "", src: decorationUrl, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" })
      );
    }

    const info = el("div", { class: "profile-card", style: "margin-top:0;" }, [
      avatarWrap,
      el("div", {}, [
        el("div", { style: "display:flex; gap:8px; align-items:center; flex-wrap:wrap;" }, [
          el("b", { text: name }),
          roleBadge(user?.role),
        ]),
        el("div", { class: "muted", text: `last: ${fmtDateTime(user?.lastLoginAt)} • created: ${fmtDateTime(user?.createdAt)}` }),
      ]),
    ]);
    userManageBody.appendChild(info);

    const blockedUntil = user?.apiBlockedUntil ? new Date(user.apiBlockedUntil) : null;
    const blockedActive = blockedUntil && Number.isFinite(blockedUntil.getTime()) && blockedUntil.getTime() > Date.now();
    if (blockedActive) {
      userManageBody.appendChild(
        el("div", { class: "muted", text: `API bloccata fino a: ${fmtDateTime(blockedUntil.toISOString())}` })
      );
    }

    const copyId = el("button", { class: "btn", type: "button" }, ["Copia ID"]);
    copyId.addEventListener("click", async () => {
      try {
        await copyToClipboard(user.discordId);
        showToast("Copiato");
      } catch {
        showToast("Errore copia", { variant: "error" });
      }
    });
    userManageActions.appendChild(copyId);

    if (canRotate) {
      const rotate = el("button", { class: "btn primary", type: "button" }, ["Rigenera API key"]);
      rotate.addEventListener("click", async () => {
        rotate.disabled = true;
        try {
          const out = await requestJson(`/api/admin/api-support/users/${encodeURIComponent(user.discordId)}/api-key/rotate`, {
            method: "POST",
          });
          const key = out?.apiKey || null;
          const prefix = out?.apiKeyPrefix || null;
          if (key) {
            try {
              await copyToClipboard(key);
              showToast(`Key rigenerata (copiata). Prefix: ${prefix || "—"}`);
            } catch {
              showToast(`Key rigenerata. Prefix: ${prefix || "—"}`);
            }
          } else {
            showToast("Key rigenerata");
          }
        } catch (err) {
          showToast(err?.body?.error || err?.message || "Errore", { variant: "error" });
        } finally {
          rotate.disabled = false;
        }
      });
      userManageActions.appendChild(rotate);
    }

    if (canBlock) {
      const sel = el("select", { class: "input", "data-ui": "select" }, []);
      const opts = [
        { v: "15", t: "Blocca 15m" },
        { v: "60", t: "Blocca 1h" },
        { v: "360", t: "Blocca 6h" },
        { v: "1440", t: "Blocca 24h" },
        { v: "10080", t: "Blocca 7g" },
        { v: "unblock", t: "Sblocca" },
      ];
      for (const o of opts) sel.appendChild(el("option", { value: o.v, text: o.t }));

      const btn = el("button", { class: "btn", type: "button" }, ["Applica"]);
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          const v = String(sel.value || "");
          const body = v === "unblock" ? { action: "unblock", minutes: 0 } : { action: "block", minutes: Number(v) };
          await requestJson(`/api/admin/users/${encodeURIComponent(user.discordId)}/api-block`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          showToast(v === "unblock" ? "API sbloccata" : "API bloccata");
          closeUserManage();
          loadUsersForMode();
        } catch (err) {
          showToast(err?.body?.error || err?.message || "Errore", { variant: "error" });
        } finally {
          btn.disabled = false;
        }
      });

      userManageActions.appendChild(sel);
      userManageActions.appendChild(btn);
      try {
        enhanceSelect(sel);
      } catch {
        // ignore
      }
    }

    if (canSetRole) {
      const select = el("select", { class: "input", "data-ui": "select" }, []);
      for (const r of ["member", "moderator", "ceo"]) {
        const opt = el("option", { value: r, text: r });
        if (String(user?.role || "member") === r) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener("change", async () => {
        const nextRole = String(select.value || "").trim();
        select.disabled = true;
        try {
          await requestJson(`/api/admin/users/${encodeURIComponent(user.discordId)}/role`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: nextRole }),
          });
          showToast("Ruolo aggiornato");
          closeUserManage();
          loadUsersForMode();
        } catch (err) {
          showToast(err?.body?.error || err?.message || "Errore", { variant: "error" });
        } finally {
          select.disabled = false;
        }
      });
      userManageActions.appendChild(select);
      try {
        enhanceSelect(select);
      } catch {
        // ignore
      }
    }

    try {
      userManageDialog.showModal();
    } catch {
      // ignore
    }
  }

  async function ensureTags() {
    if (allowedTags.length) return allowedTags;
    if (!tagsPromise) tagsPromise = loadTags().catch(() => []).finally(() => (tagsPromise = null));
    allowedTags = await tagsPromise;
    return allowedTags;
  }

  async function ensureRole() {
    const me = await requestJson("/api/admin/me", { signal: abort.signal });
    myRole = String(me?.role || "member").toLowerCase().trim() || "member";
    setText(roleEl, `Ruolo: ${me?.roleLabel || myRole}`);

    if (usersMode) usersMode.disabled = false;
    syncUsersModeUI();

    return myRole;
  }

  function syncUsersModeUI() {
    const mode = String(usersMode?.value || "api");
    const canManageUsers = myRole === "ceo" || myRole === "moderator";

    if (mode === "users" && canManageUsers) {
      if (usersModeApi) usersModeApi.style.display = "none";
      if (usersModeUsers) usersModeUsers.style.display = "";
      return;
    }

    if (usersMode) usersMode.value = "api";
    if (usersModeApi) usersModeApi.style.display = "";
    if (usersModeUsers) usersModeUsers.style.display = "none";
  }

  function isObjectId(id) {
    return /^[a-f0-9]{24}$/i.test(String(id || "").trim());
  }

  function isSnowflake(id) {
    return /^\d{10,25}$/.test(String(id || "").trim());
  }

  function extractServerLookup(input) {
    const raw = String(input || "").trim();
    if (!raw) return null;

    // Direct id (Mongo ObjectId)
    if (isObjectId(raw)) return { kind: "listingId", id: raw };

    // Discord guild id
    if (isSnowflake(raw)) return { kind: "guildId", id: raw };

    // "id: <...>" or copied snippets
    const embeddedObjId = raw.match(/[a-f0-9]{24}/i)?.[0] || null;
    if (embeddedObjId && isObjectId(embeddedObjId)) return { kind: "listingId", id: embeddedObjId };

    const embeddedSnowflake = raw.match(/\b\d{10,25}\b/)?.[0] || null;
    if (embeddedSnowflake && isSnowflake(embeddedSnowflake)) return { kind: "guildId", id: embeddedSnowflake };

    // Link: https://site/servers/<id> or /servers/<id> or /admin/servers/<id>
    let u = null;
    try {
      u = new URL(raw, window.location.origin);
    } catch {
      u = null;
    }

    if (u) {
      const qp = u.searchParams?.get?.("id") || u.searchParams?.get?.("serverId") || null;
      if (qp && isObjectId(qp)) return { kind: "listingId", id: qp };
      if (qp && isSnowflake(qp)) return { kind: "guildId", id: qp };

      const parts = String(u.pathname || "")
        .split("/")
        .filter(Boolean);
      if (parts[0] === "servers" && isObjectId(parts[1])) return { kind: "listingId", id: parts[1] };
      if (parts[0] === "admin" && parts[1] === "servers" && isObjectId(parts[2])) return { kind: "listingId", id: parts[2] };
    }

    return null;
  }

  async function openServerEditor(srv) {
    currentEdit = srv;
    setText(editMeta, `Server: ${srv?.name || "—"} • owner: ${srv?.ownerDiscordId || "—"} • id: ${srv?.id || "—"}`);
    if (editName) editName.value = srv?.name || "";
    if (editDesc) editDesc.value = srv?.description || "";
    if (editInvite) editInvite.value = srv?.discord?.inviteCode || "";
    if (editStatus) editStatus.value = String(srv?.status || "published");
    const tags = await ensureTags();
    renderTagCheckboxGrid(editTagsRoot, tags, { checked: srv?.tags || [] });
    try {
      editDialog?.showModal?.();
    } catch {
      // ignore
    }
  }

  function renderCurrentServer() {
    if (!serverResult) return;
    serverResult.innerHTML = "";

    if (!currentServer) {
      serverResult.appendChild(el("div", { class: "muted", text: "Nessun server selezionato." }));
      return;
    }

    const srv = currentServer;
    const statusInfo =
      srv?.status === "hidden" && srv?.statusPrev ? `hidden (was ${srv.statusPrev})` : String(srv?.status || "—");
    const metaText = `owner: ${srv?.ownerDiscordId || "—"} • updated: ${fmtDateTime(srv?.updatedAt)} • status: ${statusInfo}`;

    const onHide = async (server) => {
      const ok = await uiConfirm({
        title: "Nascondere server?",
        message: "Il server non comparirà nella directory pubblica finché non lo mostri di nuovo.",
        confirmText: "Nascondi",
        cancelText: "Annulla",
        variant: "danger",
      });
      if (!ok) return;

      const out = await patchServer(server.id, { status: "hidden" });
      currentServer = out?.server || currentServer;
      renderCurrentServer();
      showToast("Server nascosto");
    };

    const onShow = async (server) => {
      const out = await patchServer(server.id, { status: "published" });
      currentServer = out?.server || currentServer;
      renderCurrentServer();
      showToast("Server pubblicato");
    };

    const onDelete = async (server) => {
      const ok = await uiConfirm({
        title: "Eliminare server?",
        message: "Vuoi eliminare questo server dalla directory?",
        details: ["Azione irreversibile.", "Dovrà essere ripubblicato per riapparire nella directory."],
        confirmText: "Elimina",
        cancelText: "Annulla",
        variant: "danger",
      });
      if (!ok) return;

      await requestJson(`/api/admin/servers/${encodeURIComponent(server.id)}`, { method: "DELETE" });
      currentServer = null;
      setText(serverMeta, "Server eliminato.");
      renderCurrentServer();
      showToast("Server eliminato");
    };

    const actions = renderServerActions({
      server: srv,
      metaText,
      onEdit: (s) => openServerEditor(s).catch(() => showToast("Impossibile aprire editor", { variant: "error" })),
      onHide,
      onShow,
      onDelete,
    });

    serverResult.appendChild(renderServerCard(srv, { compact: true, showDiscord: false, actions }));
  }

  async function findServerByLookup(lookup) {
    if (!serverMeta || !serverResult) return;

    setText(serverMeta, "Caricamento…");
    serverResult.innerHTML = "";

    if (findCtrl) findCtrl.abort();
    findCtrl = new AbortController();
    const signal = findCtrl.signal;

    try {
      const url =
        lookup.kind === "guildId"
          ? `/api/admin/servers/by-guild/${encodeURIComponent(lookup.id)}`
          : `/api/admin/servers/${encodeURIComponent(lookup.id)}`;

      const out = await requestJson(url, { signal });
      currentServer = out?.server || null;
      setText(
        serverMeta,
        currentServer
          ? `Trovato: ${currentServer?.name || "—"} • id: ${currentServer?.id || "—"} • guild: ${currentServer?.discord?.guildId || "—"}`
          : "—"
      );
      renderCurrentServer();
    } catch (err) {
      if (err?.name === "AbortError") return;
      currentServer = null;
      setText(serverMeta, err?.body?.error || err?.message || "Errore");
      renderCurrentServer();
    }
  }

  async function findServerFromInput() {
    const raw = String(serverLookup?.value || "").trim();
    const lookup = extractServerLookup(raw);
    if (!lookup) {
      currentServer = null;
      setText(serverMeta, "Incolla un link valido (/servers/<id>) oppure un ID server (24 char) o guild id (numerico).");
      renderCurrentServer();
      return;
    }
    await findServerByLookup(lookup);
  }

  editSave?.addEventListener("click", async () => {
    if (!currentEdit?.id) return;
    editSave.disabled = true;
    try {
      const body = {
        name: String(editName?.value || "").trim(),
        description: String(editDesc?.value || "").trim(),
        discordInviteCode: String(editInvite?.value || "").trim(),
        status: String(editStatus?.value || "").trim(),
        tags: readCheckedTags(editTagsRoot),
      };
      const out = await patchServer(currentEdit.id, body);
      closeEdit();
      if (out?.server) {
        currentServer = out.server;
        setText(serverMeta, `Aggiornato: ${currentServer?.name || "—"} • id: ${currentServer?.id || "—"}`);
        renderCurrentServer();
      }
      showToast("Server aggiornato");
    } catch (err) {
      showToast(err?.body?.error || err?.message || "Errore", { variant: "error" });
    } finally {
      editSave.disabled = false;
    }
  });

  async function loadApiSupportUsers() {
    if (!usersList) return;
    usersList.innerHTML = "";

    const raw = String(apiQuery?.value || "").trim();
    const isEmail = raw.includes("@");
    const isDiscordId = /^\d{10,25}$/.test(raw);

    const did = isDiscordId ? raw : "";
    const email = isEmail ? raw : "";
    const prefix = !did && !email && raw ? raw : "";
    if (!did && !email && !prefix) {
      setText(usersMeta, "—");
      usersList.appendChild(el("div", { class: "muted", text: "Inserisci Discord ID, email o API key prefix." }));
      return;
    }

    setText(usersMeta, "Caricamento…");

    if (usersCtrl) usersCtrl.abort();
    usersCtrl = new AbortController();
    const signal = usersCtrl.signal;

    try {
      const sp = new URLSearchParams();
      if (did) sp.set("discordId", did);
      else if (email) sp.set("email", email);
      else sp.set("apiKeyPrefix", prefix);

      const out = await requestJson(`/api/admin/api-support/users?${sp.toString()}`, { signal });
      const list = Array.isArray(out?.users) ? out.users : [];
      setText(usersMeta, `${list.length} utenti`);

      for (const u of list) {
        const canAct = myRole === "ceo" || String(u?.role || "member") === "member";
        usersList.appendChild(
          renderUserRow(u, {
            showRoleEditor: false,
            onRotateKey: canAct
              ? async (user) => {
                  return requestJson(`/api/admin/api-support/users/${encodeURIComponent(user.discordId)}/api-key/rotate`, {
                    method: "POST",
                  });
                }
              : null,
            onApiBlock: canAct
              ? async (user, { action, minutes }) => {
                  const resp = await requestJson(`/api/admin/users/${encodeURIComponent(user.discordId)}/api-block`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action, minutes }),
                  });
                  await loadApiSupportUsers();
                  return resp;
                }
              : null,
            onManage: (user) => {
              openUserManage({
                user,
                canRotate: !!canAct,
                canBlock: !!canAct,
                canSetRole: false,
              });
            },
          })
        );
      }
      if (!list.length) usersList.appendChild(el("div", { class: "muted", text: "Nessun utente trovato." }));
    } catch (err) {
      if (err?.name === "AbortError") return;
      setText(usersMeta, err?.body?.error || err?.message || "Errore");
      usersList.appendChild(el("div", { class: "muted", text: "Impossibile cercare utenti." }));
    }
  }

  async function loadManagedUsers() {
    if (!usersList) return;
    usersList.innerHTML = "";
    setText(usersMeta, "Caricamento…");

    if (usersCtrl) usersCtrl.abort();
    usersCtrl = new AbortController();
    const signal = usersCtrl.signal;

    try {
      const sp = new URLSearchParams();
      const q = String(usersQ?.value || "").trim();
      const role = String(usersRole?.value || "").trim();
      if (q) sp.set("q", q);
      if (role) sp.set("role", role);
      sp.set("limit", "40");

      const out = await requestJson(`/api/admin/users?${sp.toString()}`, { signal });
      const list = Array.isArray(out?.users) ? out.users : [];
      setText(usersMeta, `${list.length} utenti`);

      for (const u of list) {
        const canAct = myRole === "ceo" || String(u?.role || "member") === "member";
        usersList.appendChild(
          renderUserRow(u, {
            showRoleEditor: myRole === "ceo",
            onSetRole: async (user, roleValue) => {
              const resp = await requestJson(`/api/admin/users/${encodeURIComponent(user.discordId)}/role`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: roleValue }),
              });
              await loadManagedUsers();
              return resp;
            },
            onRotateKey: canAct
              ? async (user) => {
                  return requestJson(`/api/admin/api-support/users/${encodeURIComponent(user.discordId)}/api-key/rotate`, {
                    method: "POST",
                  });
                }
              : null,
            onApiBlock: canAct
              ? async (user, { action, minutes }) => {
                  const resp = await requestJson(`/api/admin/users/${encodeURIComponent(user.discordId)}/api-block`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action, minutes }),
                  });
                  await loadManagedUsers();
                  return resp;
                }
              : null,
            onManage: (user) => {
              openUserManage({
                user,
                canRotate: !!canAct,
                canBlock: !!canAct,
                canSetRole: myRole === "ceo",
              });
            },
          })
        );
      }
      if (!list.length) usersList.appendChild(el("div", { class: "muted", text: "Nessun utente." }));
    } catch (err) {
      if (err?.name === "AbortError") return;
      setText(usersMeta, err?.body?.error || err?.message || "Errore");
      usersList.appendChild(el("div", { class: "muted", text: "Impossibile caricare utenti." }));
    }
  }

  async function loadUsersForMode() {
    const mode = String(usersMode?.value || "api");
    if (mode === "users") {
      await loadManagedUsers();
      return;
    }
    await loadApiSupportUsers();
  }

  serverFindBtn2?.addEventListener("click", () => findServerFromInput());
  serverLookup?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    findServerFromInput();
  });

  usersMode?.addEventListener("change", () => {
    syncUsersModeUI();
    loadUsersForMode();
  });

  usersRefresh?.addEventListener("click", () => loadUsersForMode());

  const debouncedUsers = debounce(() => loadUsersForMode(), 220);
  usersQ?.addEventListener("input", () => debouncedUsers());
  usersRole?.addEventListener("change", () => loadUsersForMode());
  apiQuery?.addEventListener("input", () => debouncedUsers());

  try {
    await ensureRole();
    ensureTags().catch(() => {});
    setText(serverMeta, "—");
    renderCurrentServer();
    setText(usersMeta, "—");
    await loadUsersForMode();
  } catch (err) {
    showToast(err?.body?.error || err?.message || "Accesso negato", { variant: "error" });
    setText(roleEl, "Accesso negato");
  }

  return () => {
    abort.abort();
  };
}
