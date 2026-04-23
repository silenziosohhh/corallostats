const express = require('express');
const path = require('path');
const router = express.Router();
const { ensureAuthenticated } = require('./middleware/ensureAuthenticated');
const { JsonFileStore } = require('./lib/jsonFileStore');
const { getStatsRegistry } = require('./upstream/statsRegistry');
const { getConfig } = require("./config");
const { issueWsToken } = require("./lib/wsToken");
const { buildAnalytics } = require("./lib/analytics");

const DATA_PATH = path.join(__dirname, '..', 'data');
const store = new JsonFileStore(DATA_PATH);

router.get('/results', ensureAuthenticated, (req, res) => {
    const data = store.read('results.json');
    res.json(data || []);
});

router.get('/clans', ensureAuthenticated, (req, res) => {
    const data = store.read('clans.json');
    res.json(data || []);
});

router.get('/clan-members/:name', ensureAuthenticated, (req, res) => {
    const data = store.read('clan_members.json');
    if (!data) return res.status(404).json([]);
    const members = data[req.params.name] || [];
    res.json(members);
});

router.get('/summary', ensureAuthenticated, (req, res) => {
    const meta = store.read('metadata.json');
    const clans = store.read('clans.json');
    const coveredPlayers = store.read('covered_players.json');
    const withoutClan = store.read('players_without_clan.json');

    res.json({
        updatedAt: meta?.updatedAt || null,
        durationMs: meta?.durationMs || null,
        clansCount: Array.isArray(clans) ? clans.length : null,
        coveredPlayersCount: Array.isArray(coveredPlayers) ? coveredPlayers.length : null,
        playersWithoutClanCount: Array.isArray(withoutClan) ? withoutClan.length : null,
    });
});

router.get('/stats/endpoints', ensureAuthenticated, (req, res) => {
    const reg = getStatsRegistry();
    const list = reg?.endpoints || [];
    res.json({
        fetchedAt: reg?.fetchedAt || null,
        count: list.length,
        endpoints: list.map((e) => ({
            method: e.method,
            path: e.localPathTemplate,
            summary: e.summary,
            tags: e.tags,
            params: e.params,
            exampleUrl: e.exampleUrl,
        })),
    });
});

router.get("/analytics", ensureAuthenticated, async (req, res) => {
    const discordId = String(req.user?.id || "").trim();
    if (!discordId) return res.status(401).json({ error: "Not authenticated" });

    const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
    const max = Number(process.env.RATE_LIMIT_MAX || 240);

    try {
        const out = await buildAnalytics({ discordId, windowMs, max });
        res.json(out);
    } catch {
        res.status(500).json({ error: "Analytics error" });
    }
});

router.get("/analytics/ws-token", ensureAuthenticated, (req, res) => {
    const discordId = String(req.user?.id || "").trim();
    if (!discordId) return res.status(401).json({ error: "Not authenticated" });

    const cfg = getConfig();
    const secret = cfg.session.secret || "dev_only_change_me";
    const token = issueWsToken({ discordId, secret, ttlMs: 60_000 });
    if (!token) return res.status(500).json({ error: "Token error" });
    res.setHeader("Cache-Control", "no-store");
    res.json({ token });
});

module.exports = router;
