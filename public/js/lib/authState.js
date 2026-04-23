import { getCachedAuthState, setCachedAuthState } from "./userCache.js";

export async function refreshAuthState() {
  try {
    const res = await fetch("/auth/user", { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) {
      setCachedAuthState({ loggedIn: false });
      return { loggedIn: false, user: null };
    }
    const user = await res.json().catch(() => null);
    setCachedAuthState({ loggedIn: true });
    return { loggedIn: true, user };
  } catch {
    return { loggedIn: false, user: null };
  }
}

export async function getAuthState({ cacheMaxAgeMs = 2 * 60 * 1000 } = {}) {
  const cached = getCachedAuthState({ maxAgeMs: cacheMaxAgeMs });
  if (cached) return cached;
  return refreshAuthState();
}
