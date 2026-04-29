function safeStr(v, { max = 256 } = {}) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function buildServerPublishedWebhookPayload(server) {
  const name = safeStr(server?.name || server?.discordGuildName || "Discord Server", { max: 256 });
  const description = safeStr(server?.description || "", { max: 1800 }) || "—";
  const inviteCode = server?.discordInviteCode || server?.discord?.inviteCode || null;
  const inviteUrl = inviteCode ? `https://discord.gg/${inviteCode}` : null;
  const tags = Array.isArray(server?.tags) ? server.tags.map((t) => safeStr(t, { max: 32 })).filter(Boolean) : [];
  const online = Number.isFinite(Number(server?.approxPresenceCount)) ? Number(server.approxPresenceCount) : null;
  const members = Number.isFinite(Number(server?.approxMemberCount)) ? Number(server.approxMemberCount) : null;

  const fields = [];
  if (inviteUrl) fields.push({ name: "Invite", value: inviteUrl, inline: false });
  if (tags.length) {
    const parts = chunks(tags, 12).map((x) => x.join(", "));
    fields.push({ name: "Tag", value: parts[0] || "—", inline: false });
  }
  if (online != null || members != null) {
    fields.push({
      name: "Stats",
      value: `${online != null ? `Online: ${online.toLocaleString("it-IT")}` : "Online: —"} • ${
        members != null ? `Members: ${members.toLocaleString("it-IT")}` : "Members: —"
      }`,
      inline: false,
    });
  }

  const embed = {
    title: `Nuovo server: ${name}`,
    description,
    color: 0x38bdf8,
    fields,
    timestamp: new Date().toISOString(),
  };

  return {
    content: null,
    embeds: [embed],
    allowed_mentions: { parse: [] },
  };
}

async function postWebhook(url, payload) {
  const u = String(url || "").trim();
  if (!u) return { ok: false, error: "missing_url" };

  const res = await fetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true };
}

function fireAndForget(p) {
  Promise.resolve(p).catch(() => {});
}

function notifyServerPublished(serverDocOrShape) {
  const url = String(process.env.SERVER_MESSAGE_WEBHOOK || "").trim();
  if (!url) return;

  const payload = buildServerPublishedWebhookPayload(serverDocOrShape);
  fireAndForget(postWebhook(url, payload));
}

module.exports = { notifyServerPublished, buildServerPublishedWebhookPayload };

