import { clearUserCache, getCachedUiProfileEntry, setCachedUiProfile } from "../lib/userCache.js";
import { refreshAuthState } from "../lib/authState.js";

import { preferAnimatedCdnUrl } from "../lib/discordCdn.js";

function getAvatarUrl(user) {
  const id = user?.id;
  const avatar = user?.avatar;
  if (id && avatar) {
    const ext = String(avatar).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=64`;
  }
  return "https://cdn.discordapp.com/embed/avatars/0.png";
}

function renderUserChip({ ui, account, login, logout }) {
  const name = ui?.globalName || ui?.username || "Account";
  const avatarUrl = preferAnimatedCdnUrl(ui?.avatarUrl) || getAvatarUrl({ id: ui?.discordId, avatar: ui?.avatar });
  const decorationUrl = ui?.avatarDecorationUrl ? String(ui.avatarDecorationUrl) : null;

  if (login) login.style.display = "none";
  if (logout) logout.style.display = "";
  if (account) {
    account.style.display = "";
    account.classList.add("user-chip", "avatar-only");
    const deco = decorationUrl ? `<img class="user-decoration" alt="" src="${decorationUrl}">` : "";
    account.setAttribute("aria-label", name);
    account.setAttribute("title", name);
    account.innerHTML = `<span class="user-avatar-wrap"><img class="user-avatar" alt="" src="${avatarUrl}">${deco}</span>`;
    account.href = "/account";
  }
}

function renderLoggedOut({ account, login, logout }) {
  if (account) account.style.display = "none";
  if (logout) logout.style.display = "none";
  if (login) login.style.display = "";
  if (login) {
    const rt = `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
    login.href = `/auth/login?returnTo=${encodeURIComponent(rt)}`;
  }
}

export async function initUserChip({
  accountSelector = "#nav-account",
  loginSelector = "#nav-login",
  logoutSelector = "#nav-logout",
} = {}) {
  const account = document.querySelector(accountSelector);
  const login = document.querySelector(loginSelector);
  const logout = document.querySelector(logoutSelector);

  if (login) login.classList.add("nav-auth-link");
  if (account) account.classList.add("nav-auth-link");

  const cachedEntry = getCachedUiProfileEntry({ maxAgeMs: 30 * 60 * 1000 });
  const cached = cachedEntry?.value || null;
  if (cached) {
    renderUserChip({ ui: cached, account, login, logout });
  }

  if (logout) {
    logout.addEventListener("click", () => {
      clearUserCache();
    });
  }

  // Always re-check session so we don't show a stale avatar after logout/account deletion.
  // This is a light call and uses no-store.
  try {
    const st = await refreshAuthState();
    if (!st?.loggedIn) {
      clearUserCache();
      renderLoggedOut({ account, login, logout });
      return;
    }
  } catch {
    // If the network is flaky, keep cached chip (if any) to avoid flicker.
  }

  const shouldRevalidate = !cached || (cachedEntry?.ageMs != null && cachedEntry.ageMs > 2 * 60 * 1000);
  if (!shouldRevalidate) return;

  let ui = null;
  try {
    const res = await fetch("/auth/ui-profile", { headers: { Accept: "application/json" } });
    if (!res.ok) {
      if (res.status === 401) {
        clearUserCache();
        renderLoggedOut({ account, login, logout });
        return;
      }
      throw new Error("ui-profile failed");
    }
    ui = await res.json();
  } catch {
    if (!cached) renderLoggedOut({ account, login, logout });
    return;
  }

  setCachedUiProfile(ui);
  renderUserChip({ ui, account, login, logout });
}
