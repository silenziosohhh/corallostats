import { initBotPromo } from "./botPromo.js";

export function initShell({ active } = {}) {
  const sidebar = document.querySelector("#sidebar");
  const openBtn = document.querySelector("#sidebar-open");
  const closeBtn = document.querySelector("#sidebar-close");

  const open = () => {
    if (!sidebar) return;
    sidebar.classList.add("open");
    document.body.classList.add("sidebar-open");
  };
  const close = () => {
    if (!sidebar) return;
    sidebar.classList.remove("open");
    document.body.classList.remove("sidebar-open");
  };

  if (openBtn && !openBtn.dataset.bound) {
    openBtn.dataset.bound = "1";
    openBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      open();
    });
  }
  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = "1";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
    });
  }

  // Close sidebar when clicking a page link inside it (mobile UX).
  sidebar?.addEventListener("click", (e) => {
    const a = e.target?.closest?.("a[href]");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (!href.startsWith("/")) return;
    close();
  });

  if (!document.__shellEscBound) {
    document.__shellEscBound = true;
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const sb = document.querySelector("#sidebar");
      if (!sb) return;
      sb.classList.remove("open");
      document.body.classList.remove("sidebar-open");
    });

    // Click outside the sidebar closes it (when open).
    document.addEventListener("click", (e) => {
      if (!document.body.classList.contains("sidebar-open")) return;
      if (e.target?.closest?.("#sidebar-open")) return;
      if (e.target?.closest?.("#sidebar-close")) return;
      const sb = document.querySelector("#sidebar");
      if (!sb) return;
      if (e.target && sb.contains(e.target)) return;
      sb.classList.remove("open");
      document.body.classList.remove("sidebar-open");
    });
  }

  const scoreMatch = (targetPath, currentPath) => {
    if (!targetPath) return 0;
    if (targetPath === "/") return currentPath === "/" ? 1 : 0;
    if (currentPath === targetPath) return 1000 + targetPath.length;
    const prefix = targetPath.endsWith("/") ? targetPath : `${targetPath}/`;
    return currentPath.startsWith(prefix) ? targetPath.length : 0;
  };

  const applyActiveInContainer = (container, linkSelector) => {
    const links = Array.from(container.querySelectorAll(linkSelector));
    if (!links.length) return;

    for (const a of links) {
      a.classList.remove("active");
      a.removeAttribute("aria-current");
      a.removeAttribute("aria-disabled");
      a.removeAttribute("tabindex");
    }

    const currentPath = window.location.pathname;

    const bestScoreForLink = (path, { docsSectionBoost } = {}) => {
      let score = scoreMatch(path, currentPath);

      // Only for "Pages" style links that point to /docs/overview: treat docs as a section.
      if (docsSectionBoost && (path === "/docs" || path.startsWith("/docs/"))) {
        score = Math.max(score, scoreMatch("/docs", currentPath));
      }

      return score;
    };

    const markBestActive = (groupLinks, { docsSectionBoost } = {}) => {
      const resolved = [];
      let bestPath = null;
      let bestScore = 0;

      for (const a of groupLinks) {
        const href = a.getAttribute("href") || "";
        if (!href.startsWith("/")) continue;
        let path = null;
        try {
          path = new URL(href, window.location.origin).pathname;
        } catch {
          continue;
        }
        const score = bestScoreForLink(path, { docsSectionBoost });
        resolved.push({ a, path, score });
        if (score > bestScore) {
          bestScore = score;
          bestPath = path;
        }
      }

      if (bestPath && bestScore > 0) {
        for (const item of resolved) {
          if (item.path === bestPath) {
            item.a.classList.add("active");
            item.a.setAttribute("aria-current", "page");
            item.a.setAttribute("aria-disabled", "true");
            item.a.setAttribute("tabindex", "-1");
          }
        }
      }
    };

    // If this nav includes both "Pages" and "Docs" sections, highlight one per section.
    const sep = linkSelector === ".nav-item" ? container.querySelector(".nav-sep") : null;
    if (sep) {
      const before = [];
      const after = [];
      for (const a of links) {
        const pos = a.compareDocumentPosition(sep);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) before.push(a);
        else if (pos & Node.DOCUMENT_POSITION_PRECEDING) after.push(a);
      }
      // Pages (before separator) should keep "Docs" highlighted for any /docs/*.
      markBestActive(before, { docsSectionBoost: true });
      // Docs section (after separator) should match the exact sub-page (overview/auth/endpoints/…).
      markBestActive(after, { docsSectionBoost: false });
      return;
    }

    markBestActive(links, { docsSectionBoost: false });
  };

  // Sidebar (app shell) navs
  for (const nav of document.querySelectorAll("nav")) {
    if (nav.querySelector(".nav-item")) applyActiveInContainer(nav, ".nav-item");
    if (nav.classList.contains("nav-links") || nav.querySelector(".nav-links")) {
      const root = nav.classList.contains("nav-links") ? nav : nav.querySelector(".nav-links");
      if (root) applyActiveInContainer(root, "a");
    }
  }

  // Legacy "active" flag support (kept for compatibility)
  if (active) {
    const items = document.querySelectorAll(".nav-item");
    for (const item of items) {
      const href = item.getAttribute("href") || "";
      const isActive =
        (active === "docs" && (href.includes("docs") || href.includes("endpoints"))) ||
        (active === "dashboard" && href.includes("dashboard"));
      if (isActive) item.classList.add("active");
    }
  }

  initBotPromo();
}

export function bindShellShortcuts({ onSearch } = {}) {
  const handler = (e) => {
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      onSearch?.();
      return;
    }
  };

  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}
