const MESSAGES = {
  nav: {
    home: "Home",
    docs: "Docs",
    dashboard: "Dashboard",
    analytics: "Analitiche",
    account: "Account",
    landing: "Landing",
    servers: "Servers",
    quickstart: "Quickstart",
    endpoints: "Endpoints",
    overview: "Overview",
    auth: "Auth",
    examples: "Esempi",
    notes: "Note",
    apiKey: "API Key",
    pagesTitle: "Pagine",
    docsTitle: "Docs",
    resourcesTitle: "Risorse",
  },
  ui: {
    searchEndpoint: "Cerca endpoint…",
    changeTheme: "Cambia tema",
    copied: "Copiato",
    copyFailed: "Copia non riuscita",
    loginDiscord: "Login",
    logout: "Logout",
    private: "Privato",
    privateLoginRequired: "Privato: serve Login",
  },
  landing: {
    ctaStart: "Inizia ora",
    ctaReadDocs: "Leggi Docs",
    ctaOpenDashboard: "Apri Dashboard",
    ctaGoAccount: "Vai ad Account",
    kpiClans: "Clan nel dataset",
    kpiPlayers: "Player coperti",
    kpiUpdated: "Ultimo update",
    quickstartTitle: "Come iniziare (20 secondi)",
    quickstartEndpoints: "Vedi endpoints",
    quickstartManage: "Gestisci key",
    quickCopy: "Quick copy",
    baseUrl: "Base URL",
    rateLimit: "Rate limit",
    curl: "curl",
    copy: "Copia",
  },
};

export function t(key) {
  const parts = String(key || "").split(".");
  let cur = MESSAGES;
  for (const p of parts) cur = cur && typeof cur === "object" ? cur[p] : null;
  if (typeof cur === "string") return cur;
  return key;
}

export function applyI18n(root = document) {
  document.documentElement.lang = "it";
  document.documentElement.dataset.lang = "it";

  for (const node of root.querySelectorAll("[data-i18n]")) {
    const key = node.getAttribute("data-i18n");
    if (!key) continue;
    node.textContent = t(key);
  }

  for (const node of root.querySelectorAll("[data-i18n-html]")) {
    const key = node.getAttribute("data-i18n-html");
    if (!key) continue;
    node.innerHTML = t(key);
  }

  for (const node of root.querySelectorAll("[data-i18n-placeholder]")) {
    const key = node.getAttribute("data-i18n-placeholder");
    if (!key) continue;
    node.setAttribute("placeholder", t(key));
  }

  for (const node of root.querySelectorAll("[data-i18n-aria-label]")) {
    const key = node.getAttribute("data-i18n-aria-label");
    if (!key) continue;
    node.setAttribute("aria-label", t(key));
  }
}

export function bindI18n() {
  applyI18n(document);
}
