export function preferAnimatedCdnUrl(url) {
  const raw = typeof url === "string" ? url : "";
  if (!raw) return raw;

  try {
    const u = new URL(raw, window.location.origin);
    const host = u.hostname.toLowerCase();
    if (host !== "cdn.discordapp.com") return raw;

    // /avatars/{id}/a_hash.png -> .gif
    // /banners/{id}/a_hash.png -> .gif
    const m = u.pathname.match(/^\/(avatars|banners)\/[^/]+\/(a_[^./]+)\.(png|webp)$/i);
    if (!m) return raw;

    u.pathname = u.pathname.replace(/\.(png|webp)$/i, ".gif");
    return u.toString();
  } catch {
    return raw;
  }
}

