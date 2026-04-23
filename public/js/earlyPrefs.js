(function earlyPrefs() {
  try {
    const t = String(localStorage.getItem("corallo_theme") || "").toLowerCase();
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
    document.documentElement.lang = "it";
    document.documentElement.dataset.lang = "it";
  } catch {
  }
})();
