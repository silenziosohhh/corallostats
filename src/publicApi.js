const express = require("express");
const path = require("path");
const fs = require("fs");
const { JsonFileStore } = require("./lib/jsonFileStore");
const { computeClanTop15Exp } = require("./lib/clanTop15Exp");
const { readCache, writeCache } = require("./upstream/upstreamCache");

const DATA_PATH = path.join(__dirname, "..", "data");

function setCacheHeaders(req, res, { etag, lastModified }) {
  if (etag) res.setHeader("ETag", etag);
  if (lastModified) res.setHeader("Last-Modified", lastModified);
  res.setHeader("Cache-Control", "public, max-age=60");

  if (etag && req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return true;
  }
  return false;
}

function weakEtag({ mtimeMs, size }) {
  if (!Number.isFinite(mtimeMs)) return null;
  return `W/\"${Math.round(mtimeMs)}-${Number(size || 0)}\"`;
}

function combinedMeta(...items) {
  let mtimeMs = 0;
  let size = 0;
  for (const it of items) {
    if (!it) continue;
    const m = Number(it.mtimeMs || 0);
    if (Number.isFinite(m) && m > mtimeMs) mtimeMs = m;
    const s = Number(it.size || 0);
    if (Number.isFinite(s) && s > 0) size += s;
  }
  return { mtimeMs, size };
}

function metaIsFresh(meta, refreshMs) {
  if (!meta || typeof meta !== "object") return false;
  if (String(meta.source || "") !== "top15_members_total_division_exp") return false;
  const v = meta.total_exp ?? meta.totalExp ?? null;
  if (v == null) return false;

  const ttl = Number(refreshMs || 0);
  if (!Number.isFinite(ttl) || ttl <= 0) return true;

  const t = Date.parse(meta.fetchedAt || "");
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < ttl;
}

function createPublicApiRouter() {
  const router = express.Router();
  const store = new JsonFileStore(DATA_PATH);

  let clanMetaBuildTask = null;
  const clanMetaProgress = {
    startedAt: null,
    finishedAt: null,
    total: 0,
    done: 0,
    lastError: null,
  };

  function atomicWriteJson(filePath, value) {
    const tmp = `${filePath}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(tmp, filePath);
  }

  async function buildClansMeta({ clans, existing }) {
    const contact = process.env.UPSTREAM_CONTACT || null;
    const out = existing && typeof existing === "object" ? { ...existing } : {};
    const refreshMs = Number(process.env.CLAN_META_REFRESH_MS || 12 * 60 * 60_000);

    const allow = new Set(clans.map((c) => String(c || "")).filter(Boolean));
    for (const k of Object.keys(out)) {
      if (!allow.has(k)) delete out[k];
    }

    clanMetaProgress.startedAt = Date.now();
    clanMetaProgress.finishedAt = null;
    clanMetaProgress.total = clans.length;
    clanMetaProgress.done = 0;
    clanMetaProgress.lastError = null;

    const metaPath = path.join(DATA_PATH, "clans_meta.json");

    const concurrency = Math.max(2, Math.min(8, Number(process.env.CLAN_META_CONCURRENCY || 5)));
    let idx = 0;

    async function worker() {
      while (idx < clans.length) {
        const i = idx++;
        const name = clans[i];
        if (!name) {
          clanMetaProgress.done++;
          continue;
        }

        if (metaIsFresh(out[name], refreshMs)) {
          clanMetaProgress.done++;
          continue;
        }

        try {
          const computed = await computeClanTop15Exp({
            upstreamHost: "https://coralmc.it",
            contact,
            ttlMs: refreshMs,
            cache: { read: readCache, write: writeCache },
            clanName: name,
          });
          if (!computed) throw new Error("Compute top15 failed");

          out[name] = {
            total_exp: computed.total_exp_top15,
            total_exp_upstream: computed.total_exp_upstream ?? null,
            member_count: computed.member_count ?? null,
            tag: computed.tag ?? null,
            color: computed.color ?? null,
            source: "top15_members_total_division_exp",
            fetchedAt: new Date().toISOString(),
          };

          if ((i + 1) % 25 === 0) {
            try {
              atomicWriteJson(metaPath, out);
            } catch {
              // ignore
            }
          }
        } catch (err) {
          clanMetaProgress.lastError = err?.message || String(err);
        } finally {
          clanMetaProgress.done++;
          await new Promise((r) => setTimeout(r, 60)); // be gentle to upstream
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    atomicWriteJson(metaPath, out);
    clanMetaProgress.finishedAt = Date.now();
    return out;
  }

  router.get("/summary", (req, res) => {
    const meta = store.readWithMeta("metadata.json");
    const clans = store.readWithMeta("clans.json");
    const coveredPlayers = store.readWithMeta("covered_players.json");
    const withoutClan = store.readWithMeta("players_without_clan.json");

    const combo = combinedMeta(meta, clans, coveredPlayers, withoutClan);
    const etag = weakEtag(combo);
    const lastModified = combo?.mtimeMs ? new Date(combo.mtimeMs).toUTCString() : null;
    if (setCacheHeaders(req, res, { etag, lastModified })) return;

    res.json({
      updatedAt: meta?.value?.updatedAt || null,
      durationMs: meta?.value?.durationMs || null,
      clansCount: Array.isArray(clans?.value) ? clans.value.length : null,
      coveredPlayersCount: Array.isArray(coveredPlayers?.value) ? coveredPlayers.value.length : null,
      playersWithoutClanCount: Array.isArray(withoutClan?.value) ? withoutClan.value.length : null,
    });
  });

  router.get("/clans", (req, res) => {
    const out = store.readWithMeta("clans.json");
    const etag = weakEtag(out || {});
    const lastModified = out?.mtimeMs ? new Date(out.mtimeMs).toUTCString() : null;
    if (setCacheHeaders(req, res, { etag, lastModified })) return;
    res.json(out?.value || []);
  });

  router.get("/clans-ranked", (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    const clans = store.readWithMeta("clans.json");
    const meta = store.readWithMeta("clans_meta.json");
    const members = store.readWithMeta("clan_members.json");

    const list = Array.isArray(clans?.value) ? clans.value : [];
    const map = meta?.value && typeof meta.value === "object" ? meta.value : null;
    const membersMap = members?.value && typeof members.value === "object" ? members.value : null;

    const refreshMs = Number(process.env.CLAN_META_REFRESH_MS || 12 * 60 * 60_000);
    const covered = map ? list.filter((name) => map[name]?.total_exp != null || map[name]?.totalExp != null).length : 0;
    const stale =
      map && Number.isFinite(refreshMs) && refreshMs > 0
        ? list.some((name) => !metaIsFresh(map[name], refreshMs))
        : false;

    const rebuildParam = String(req.query.rebuild || req.query.refresh || "").toLowerCase().trim();
    const forceRebuild = rebuildParam === "1" || rebuildParam === "true" || rebuildParam === "yes";

    const needBuild = list.length && (!map || covered < list.length || stale || forceRebuild);
    if (needBuild && !clanMetaBuildTask) {
      clanMetaBuildTask = buildClansMeta({ clans: list, existing: forceRebuild ? {} : map }).finally(() => {
        clanMetaBuildTask = null;
      });
    }

    // no-store already set above

    const xpOf = (name) => {
      if (!map) return null;
      const v = map[name]?.total_exp ?? map[name]?.totalExp ?? null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const sorted = [...list].sort((a, b) => {
      const xa = xpOf(a);
      const xb = xpOf(b);
      if (xa == null && xb == null) return String(a).localeCompare(String(b));
      if (xa == null) return 1;
      if (xb == null) return -1;
      if (xb !== xa) return xb - xa;
      return String(a).localeCompare(String(b));
    });

    const preview = {};
    if (membersMap) {
      for (const clanName of list) {
        const raw = membersMap[clanName];
        const arr = Array.isArray(raw) ? raw : [];
        const names = arr
          .map((m) => (typeof m === "string" ? m : m?.username || m?.name || m?.nick || null))
          .filter(Boolean)
          .map((s) => String(s));
        preview[clanName] = { count: names.length, members: names.slice(0, 5) };
      }
    }

    res.json({
      meta: {
        ready: Boolean(map) && covered >= list.length,
        building: Boolean(clanMetaBuildTask),
        covered,
        total: list.length,
        startedAt: clanMetaProgress.startedAt,
        finishedAt: clanMetaProgress.finishedAt,
        lastError: clanMetaProgress.lastError,
      },
      preview,
      clans: sorted,
    });
  });

  router.get("/clan-members/:name", (req, res) => {
    const out = store.readWithMeta("clan_members.json");
    const etag = weakEtag(out || {});
    const lastModified = out?.mtimeMs ? new Date(out.mtimeMs).toUTCString() : null;
    if (setCacheHeaders(req, res, { etag, lastModified })) return;

    const map = out?.value;
    const members = map && typeof map === "object" ? map[req.params.name] || [] : [];
    res.json(members);
  });

  router.get("/results", (req, res) => {
    const out = store.readWithMeta("results.json");
    const etag = weakEtag(out || {});
    const lastModified = out?.mtimeMs ? new Date(out.mtimeMs).toUTCString() : null;
    if (setCacheHeaders(req, res, { etag, lastModified })) return;

    const limitRaw = req.query.limit;
    const limit = Number.isFinite(Number(limitRaw)) ? Math.max(1, Math.min(500, Number(limitRaw))) : 50;

    const list = Array.isArray(out?.value) ? out.value : [];
    res.json(list.slice(0, limit));
  });

  return router;
}

module.exports = { createPublicApiRouter };
