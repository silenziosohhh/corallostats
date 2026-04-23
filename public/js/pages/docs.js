import { api } from "../lib/apiClient.js";
import { el, qs, setText } from "../lib/dom.js";
import { showToast } from "../lib/toast.js";
import { copyToClipboard } from "../lib/clipboard.js";
import { bindShellShortcuts } from "../shell/shell.js";
import { enhanceSelect } from "../lib/customSelect.js";
import { setAriaBusy, skelBlock } from "../lib/skeleton.js";

function createEndpointCard(endpoint) {
  const card = el("article", { className: "endpoint" });
  const tags = Array.isArray(endpoint.tags) ? endpoint.tags : [];
  card.dataset.tags = tags.map((t) => String(t).toLowerCase()).join(",");
  const head = el("div", { className: "endpoint-head" });
  const summaryText = endpoint.summary ? String(endpoint.summary) : "";

  head.append(
    el("span", { className: "pill method", text: endpoint.method || "GET" }),
    el("code", { text: endpoint.path }),
    el("span", { className: "muted", text: summaryText })
  );

  const meta = el("div", { className: "endpoint-meta" });
  const tagWrap = el("div", { className: "endpoint-tags" });
  for (const t of tags.slice(0, 6)) tagWrap.append(el("span", { className: "pill tag", text: t }));
  if (tags.length > 6) tagWrap.append(el("span", { className: "pill tag", text: `+${tags.length - 6}` }));

  const params = Array.isArray(endpoint.params) ? endpoint.params : [];
  const pathParams = params
    .filter((p) => p?.in === "path")
    .map((p) => p?.name)
    .filter(Boolean);
  const queryParams = params
    .filter((p) => p?.in === "query")
    .map((p) => p?.name)
    .filter(Boolean);
  const paramLine = el("div", { className: "endpoint-params muted" });
  const parts = [];
  if (pathParams.length) parts.push(`Path: ${pathParams.join(", ")}`);
  if (queryParams.length) parts.push(`Query: ${queryParams.join(", ")}`);
  paramLine.textContent = parts.length ? parts.join(" • ") : "—";

  meta.append(tagWrap, paramLine);

  const actions = el("div", { className: "endpoint-actions" });
  const btnCopy = el("button", { className: "btn", type: "button", text: "Copia URL" });
  const btnCurl = el("button", { className: "btn", type: "button", text: "Copia curl" });

  const response = el("pre", { className: "endpoint-response muted", text: "—" });

  btnCopy.addEventListener("click", async () => {
    try {
      const url = `${window.location.origin}${endpoint.exampleUrl}`;
      await copyToClipboard(url);
      showToast("URL copiato");
    } catch {
      showToast("Copia non riuscita", { variant: "error" });
    }
  });

  btnCurl.addEventListener("click", async () => {
    try {
      const url = `${window.location.origin}${endpoint.exampleUrl}`;
      const curl = `curl -H "Authorization: Bearer <API_KEY>" "${url}"`;
      await copyToClipboard(curl);
      showToast("curl copiato");
    } catch {
      showToast("Copia non riuscita", { variant: "error" });
    }
  });

  response.textContent = endpoint.exampleUrl ? `Esempio: ${endpoint.exampleUrl}` : "—";
  actions.append(btnCopy, btnCurl);
  card.append(head, meta, actions, response);
  return card;
}

function defaultEndpoints() {
  return [];
}

function normalizeTag(tag) {
  const s = String(tag || "").trim();
  if (!s) return null;
  return s;
}

function buildCategoryOptions(endpoints) {
  const map = new Map();
  for (const ep of endpoints) {
    const tags = Array.isArray(ep.tags) ? ep.tags : [];
    for (const t of tags) {
      const norm = normalizeTag(t);
      if (!norm) continue;
      const key = norm.toLowerCase();
      map.set(key, { label: norm, count: (map.get(key)?.count || 0) + 1 });
    }
  }

  const items = [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, count: v.count }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return items;
}

function groupByPrimaryTag(endpoints) {
  const groups = new Map();
  for (const ep of endpoints) {
    const tags = Array.isArray(ep.tags) ? ep.tags : [];
    const primary = tags.length ? String(tags[0]) : "Other";
    const key = primary.toLowerCase();
    if (!groups.has(key)) groups.set(key, { key, label: primary, items: [] });
    groups.get(key).items.push(ep);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function categoryIconClass(label) {
  const key = String(label || "").toLowerCase();
  if (key.includes("bed")) return "fa-solid fa-bed";
  if (key.includes("kit")) return "fa-solid fa-crosshairs";
  if (key.includes("duel")) return "fa-solid fa-hand-fist";
  if (key.includes("cup")) return "fa-solid fa-trophy";
  if (key.includes("player") || key.includes("clan")) return "fa-solid fa-users";
  if (key.includes("search")) return "fa-solid fa-magnifying-glass";
  return "fa-solid fa-layer-group";
}

export async function mount() {
  const unbind = bindShellShortcuts({
    onSearch: () => qs("#doc-search").focus(),
  });

  const origin = window.location.origin;
  const groupsRoot = qs("#endpoint-groups");
  const search = qs("#doc-search");
  const category = qs("#category");
  const categoryList =
    document.querySelector("#sidebar-category-list") || document.querySelector("#category-list");

  const renderSkeleton = () => {
    groupsRoot.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const card = document.createElement("article");
      card.className = "endpoint";
      const head = document.createElement("div");
      head.className = "endpoint-head";
      head.append(
        skelBlock({ widthPct: 18, height: 18, radius: 999, className: "skel-text skel-inline" }),
        skelBlock({ widthPct: 42, height: 14, radius: 10, className: "skel-text skel-inline" }),
        skelBlock({ widthPct: 28, height: 12, radius: 10, className: "skel-text skel-inline" })
      );

      const meta = document.createElement("div");
      meta.className = "endpoint-meta";
      const tags = document.createElement("div");
      tags.className = "endpoint-tags";
      tags.append(
        skelBlock({ widthPct: 22, height: 18, radius: 999, className: "skel-text skel-inline" }),
        skelBlock({ widthPct: 18, height: 18, radius: 999, className: "skel-text skel-inline" }),
        skelBlock({ widthPct: 16, height: 18, radius: 999, className: "skel-text skel-inline" })
      );
      const params = document.createElement("div");
      params.className = "endpoint-params muted";
      params.append(skelBlock({ widthPct: 60, height: 12, radius: 10, className: "skel-text skel-block" }));
      meta.append(tags, params);

      const actions = document.createElement("div");
      actions.className = "endpoint-actions";
      actions.append(
        skelBlock({ widthPct: 26, height: 34, radius: 14, className: "skel-text skel-inline" }),
        skelBlock({ widthPct: 22, height: 34, radius: 14, className: "skel-text skel-inline" })
      );

      const response = document.createElement("pre");
      response.className = "endpoint-response muted";
      response.append(skelBlock({ widthPct: 78, height: 12, radius: 10, className: "skel-text skel-block" }));

      card.append(head, meta, actions, response);
      groupsRoot.append(card);
    }
  };

  let endpoints = [];
  setAriaBusy(groupsRoot, true);
  renderSkeleton();
  try {
    const payload = await api.getJson("/api/stats/endpoints");
    endpoints = Array.isArray(payload?.endpoints) ? payload.endpoints : [];
    if (payload?.fetchedAt) {
      setText(qs("#endpoints-meta"), `Sync: ${new Date(payload.fetchedAt).toLocaleString("it-IT")}`);
    } else {
      setText(qs("#endpoints-meta"), "—");
    }
  } catch {
    endpoints = defaultEndpoints();
    setText(qs("#endpoints-meta"), "Sync: non disponibile");
  } finally {
    setAriaBusy(groupsRoot, false);
  }

  if (!endpoints.length) {
    endpoints = [
      {
        method: "GET",
        path: "/stats/search/{input}",
        summary: "Cerca player",
        exampleUrl: "/api/v1/stats/search/Fed",
      },
    ];
  }

  // Populate categories from tags
  const cats = buildCategoryOptions(endpoints);
  for (const c of cats) {
    const opt = document.createElement("option");
    opt.value = c.key;
    opt.textContent = `${c.label} (${c.count})`;
    category.appendChild(opt);
  }
  enhanceSelect(category);

  const initial = new URLSearchParams(window.location.search).get("q");
  if (initial) search.value = initial;

  const applyFilters = () => {
    const term = search.value.trim().toLowerCase();
    const cat = category.value;

    // Filter endpoints first
    const filtered = endpoints.filter((ep) => {
      const hay = `${ep.method || ""} ${ep.path || ""} ${ep.summary || ""}`.toLowerCase();
      const tags = (Array.isArray(ep.tags) ? ep.tags : []).map((t) => String(t).toLowerCase());
      const matchTerm = !term || hay.includes(term);
      const matchCat = cat === "all" || tags.includes(cat);
      return matchTerm && matchCat;
    });

    groupsRoot.innerHTML = "";
    const groups = groupByPrimaryTag(filtered);
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.innerHTML = `<div class="empty-title">Nessun endpoint trovato</div><div class="muted">Prova a cambiare categoria o ricerca.</div>`;
      groupsRoot.append(empty);
    }
    for (const g of groups) {
      const details = document.createElement("details");
      details.className = "ep-group";
      details.open = true;

      const summary = document.createElement("summary");
      const title = document.createElement("div");
      title.className = "ep-group-title";
      title.innerHTML = `<i class="${categoryIconClass(g.label)}" aria-hidden="true"></i><span>${g.label}</span>`;

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "10px";
      right.innerHTML = `<span class=\"ep-group-count\">${g.items.length}</span><i class=\"fa-solid fa-chevron-down ep-group-chevron\" aria-hidden=\"true\"></i>`;

      summary.append(title, right);

      const body = document.createElement("div");
      body.className = "ep-group-body";
      for (const ep of g.items) body.append(createEndpointCard(ep));

      details.append(summary, body);
      groupsRoot.append(details);
    }

    setText(qs("#endpoint-count"), `${filtered.length}/${endpoints.length} endpoint`);

    if (categoryList) {
      const active = cat;
      for (const btn of categoryList.querySelectorAll("button[data-cat]")) {
        btn.classList.toggle("active", btn.getAttribute("data-cat") === active);
      }
    }
  };

  search.addEventListener("input", applyFilters);
  category.addEventListener("change", applyFilters);

  if (categoryList) {
    categoryList.innerHTML = "";

    const mk = (label, value, count) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nav-cat";
      btn.setAttribute("data-cat", value);
      btn.innerHTML = `<i class="${categoryIconClass(label)}" aria-hidden="true"></i><span class="nav-cat-label">${label}</span><span class="nav-cat-count">${count ?? ""}</span>`;
      btn.addEventListener("click", () => {
        category.value = value;
        category.dispatchEvent(new Event("change", { bubbles: true }));

        const endpointsSection = document.querySelector("#endpoints");
        endpointsSection?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      });
      return btn;
    };

    categoryList.append(mk("Tutte", "all", endpoints.length));
    for (const c of cats) categoryList.append(mk(c.label, c.key, c.count));
  }

  applyFilters();

  return () => {
    try {
      unbind?.();
    } catch {
      // ignore
    }
  };
}
