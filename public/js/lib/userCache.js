const KEY_UI_PROFILE = "cs.ui_profile.v1";
const KEY_AUTH_STATE = "cs.auth_state.v1";
const KEY_ME_PROFILE = "cs.me_profile.v1";

function now() {
  return Date.now();
}

function safeParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function read(key) {
  try {
    const obj = safeParse(window.localStorage.getItem(key));
    if (!obj || typeof obj !== "object") return null;
    if (!("t" in obj) || !("v" in obj)) return null;
    return obj;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ t: now(), v: value }));
  } catch {
    // ignore storage errors
  }
}

function remove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function getFresh(key, maxAgeMs) {
  const entry = read(key);
  if (!entry) return null;
  const age = now() - Number(entry.t || 0);
  if (!Number.isFinite(age) || age < 0) return null;
  if (Number.isFinite(maxAgeMs) && age > maxAgeMs) return null;
  return entry.v ?? null;
}

function getFreshEntry(key, maxAgeMs) {
  const entry = read(key);
  if (!entry) return null;
  const ageMs = now() - Number(entry.t || 0);
  if (!Number.isFinite(ageMs) || ageMs < 0) return null;
  if (Number.isFinite(maxAgeMs) && ageMs > maxAgeMs) return null;
  return { value: entry.v ?? null, ageMs };
}

export function clearUserCache() {
  remove(KEY_UI_PROFILE);
  remove(KEY_AUTH_STATE);
  remove(KEY_ME_PROFILE);
}

export function getCachedUiProfile({ maxAgeMs = 30 * 60 * 1000 } = {}) {
  return getFresh(KEY_UI_PROFILE, maxAgeMs);
}

export function getCachedUiProfileEntry({ maxAgeMs = 30 * 60 * 1000 } = {}) {
  return getFreshEntry(KEY_UI_PROFILE, maxAgeMs);
}

export function setCachedUiProfile(value) {
  if (!value) return;
  const safe = {
    discordId: value?.discordId ?? null,
    username: value?.username ?? null,
    globalName: value?.globalName ?? null,
    avatarUrl: value?.avatarUrl ?? null,
    avatarDecorationUrl: value?.avatarDecorationUrl ?? null,
  };
  write(KEY_UI_PROFILE, safe);
}

export function getCachedAuthState({ maxAgeMs = 2 * 60 * 1000 } = {}) {
  const v = getFresh(KEY_AUTH_STATE, maxAgeMs);
  if (!v || typeof v !== "object") return null;
  const loggedIn = Boolean(v.loggedIn);
  return { loggedIn, user: null };
}

export function setCachedAuthState({ loggedIn }) {
  write(KEY_AUTH_STATE, { loggedIn: Boolean(loggedIn) });
}

export function getCachedMeProfile({ maxAgeMs = 15 * 60 * 1000 } = {}) {
  const v = getFresh(KEY_ME_PROFILE, maxAgeMs);
  if (!v || typeof v !== "object") return null;
  return v;
}

export function setCachedMeProfile(value) {
  if (!value) return;
  const safe = {
    discordId: value?.discordId ?? null,
    username: value?.username ?? null,
    globalName: value?.globalName ?? null,
    avatarUrl: value?.avatarUrl ?? null,
    bannerUrl: value?.bannerUrl ?? null,
    accentColor: value?.accentColor ?? null,
    avatarDecorationUrl: value?.avatarDecorationUrl ?? null,
    createdAt: value?.createdAt ?? null,
    lastLoginAt: value?.lastLoginAt ?? null,
    connections: Array.isArray(value?.connections) ? value.connections.slice(0, 12) : null,
    apiKeyPrefix: value?.apiKeyPrefix ?? null,
  };
  write(KEY_ME_PROFILE, safe);
}
