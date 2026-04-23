const crypto = require("crypto");

function base64urlEncode(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecodeToString(str) {
  const s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return Buffer.from(s + pad, "base64").toString("utf8");
}

function sign({ payloadB64, secret }) {
  return base64urlEncode(crypto.createHmac("sha256", String(secret)).update(payloadB64).digest());
}

function issueWsToken({ discordId, secret, ttlMs = 60_000 } = {}) {
  const id = String(discordId || "").trim();
  if (!id) return null;
  const now = Date.now();
  const payload = { discordId: id, exp: now + Number(ttlMs || 0), iat: now };
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sig = sign({ payloadB64, secret });
  return `${payloadB64}.${sig}`;
}

function verifyWsToken({ token, secret } = {}) {
  const raw = String(token || "");
  const [payloadB64, sig] = raw.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = sign({ payloadB64, secret });
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(base64urlDecodeToString(payloadB64));
    const id = String(payload?.discordId || "").trim();
    const exp = Number(payload?.exp || 0);
    if (!id) return null;
    if (!Number.isFinite(exp) || exp <= Date.now()) return null;
    return { discordId: id, exp };
  } catch {
    return null;
  }
}

module.exports = { issueWsToken, verifyWsToken };

