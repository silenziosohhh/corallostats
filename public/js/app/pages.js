export async function mountPage(pageId) {
  const id = String(pageId || "").trim();

  if (id === "dashboard") {
    const mod = await import("../pages/dashboard.js");
    return mod.mount?.();
  }
  if (id === "docs_endpoints") {
    const mod = await import("../pages/docs.js");
    return mod.mount?.();
  }
  if (id === "account") {
    const mod = await import("../pages/account.js");
    return mod.mount?.();
  }
  if (id === "analytics") {
    const mod = await import("../pages/analytics.js");
    return mod.mount?.();
  }
  if (id === "servers") {
    const mod = await import("../pages/servers.js");
    return mod.mount?.();
  }

  // Static docs pages: shell/user chip already mounted.
  return null;
}
