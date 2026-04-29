const express = require('express');
const http = require("http");
const cron = require('node-cron');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
require('dotenv').config();
const { getConfig } = require('./src/config');
const { configurePassport } = require('./src/passport');
const { createScraperScheduler } = require('./src/scraperScheduler');
const { ensureAuthenticated } = require('./src/middleware/ensureAuthenticated');
const { createCorsMiddleware } = require('./src/middleware/cors');
const { createRateLimit } = require('./src/middleware/rateLimit');
const { createUserRateLimit } = require("./src/middleware/userRateLimit");
const { createPublicApiRouter } = require('./src/publicApi');
const { connectToMongo } = require('./src/db');
const { requirePrivateAccess } = require('./src/middleware/requireApiKey');
const { trackApiUsage } = require("./src/middleware/trackApiUsage");
const { loadStatsRegistry, loadCachedStatsRegistry } = require('./src/upstream/statsRegistry');
const { createStatsRouter } = require('./src/upstream/statsRouter');
const { cleanupUpstreamCache } = require("./src/upstream/upstreamCache");
const { getBotProfile } = require("./src/lib/botProfile");
const { WebSocketServer } = require("ws");
const { verifyWsToken } = require("./src/lib/wsToken");
const { buildAnalytics } = require("./src/lib/analytics");
const { analyticsUpdates } = require("./src/lib/analyticsUpdates");
const { createServersRouter } = require("./src/serversApi");
const { createServersPublicRouter } = require("./src/serversPublicApi");
const { createServersBotRouter } = require("./src/serversBotApi");
const { syncLikesLeaderboard } = require("./src/lib/likesLeaderboardSync");

const app = express();
const config = getConfig();

if (
    config.session?.trustProxy === true ||
    config.session?.cookie?.secure === true ||
    config.session?.cookie?.secure === "auto"
) {
    app.set("trust proxy", 1);
}

console.log(
    "Session cookie secure:",
    config.session?.cookie?.secure,
    "| trust proxy:",
    config.session?.trustProxy === true
);

if (String(process.env.DEBUG_REQUESTS || '') === '1') {
    app.use((req, res, next) => {
        if (req.url.startsWith('/api/v1')) {
            console.log('REQ', req.method, req.url);
        }
        next();
    });
}

app.use(session({
    secret: config.session.secret || 'dev_only_change_me',
    resave: false,
    saveUninitialized: false,
    proxy: config.session?.trustProxy === true,
    cookie: {
        httpOnly: config.session.cookie.httpOnly,
        sameSite: config.session.cookie.sameSite,
        secure: config.session.cookie.secure,
        maxAge: config.session.cookie.maxAgeMs,
    },
}));

configurePassport(passport, config.discord);

app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());

function requireAuthPage(req, res, next) {
    if (req.isAuthenticated?.() === true) return next();
    res.redirect('/');
}

function sendPublicFile(res, filePathParts) {
    res.sendFile(path.join(__dirname, 'public', ...filePathParts));
}

function redirectTo(res, to) {
    res.redirect(301, to);
}

app.get('/dashboard', requireAuthPage, (req, res) => sendPublicFile(res, ['dashboard.html']));
app.get(/^\/dashboard(\/.*)?$/, requireAuthPage, (req, res) => sendPublicFile(res, ['dashboard.html']));
app.get('/analytics', requireAuthPage, (req, res) => sendPublicFile(res, ['analytics.html']));
app.get('/account', requireAuthPage, (req, res) => sendPublicFile(res, ['account.html']));
app.get('/servers', (req, res) => sendPublicFile(res, ['servers.html']));
app.get(/^\/servers\/[^/]+$/, (req, res) => sendPublicFile(res, ['servers.html']));
app.get('/docs', (req, res) => sendPublicFile(res, ['docs.html']));
app.get('/docs/overview', (req, res) => sendPublicFile(res, ['docs', 'overview.html']));
app.get('/docs/auth', (req, res) => sendPublicFile(res, ['docs', 'auth.html']));
app.get('/docs/examples', (req, res) => sendPublicFile(res, ['docs', 'examples.html']));
app.get('/docs/notes', (req, res) => sendPublicFile(res, ['docs', 'notes.html']));
app.get('/terms', (req, res) => sendPublicFile(res, ['terms.html']));
app.get('/privacy', (req, res) => sendPublicFile(res, ['privacy.html']));

function safeDecodeSegment(segment) {
    try {
        return decodeURIComponent(String(segment || ''));
    } catch {
        return String(segment || '');
    }
}

function normalizeStatsMode(mode) {
    const m = String(mode || '').toLowerCase().trim();
    if (m === 'kitpvp') return 'kitpvp';
    if (m === 'duels') return 'duels';
    if (m === 'player') return 'player';
    return 'bedwars';
}

function parseModeTokenFromSearch(search, params) {
    const byKey = params?.get('m') || params?.get('mode') || null;
    if (byKey) return normalizeStatsMode(byKey);

    const s = String(search || '');
    if (!s || s === '?') return null;
    const raw = s.startsWith('?') ? s.slice(1) : s;
    const first = (raw.split('&')[0] || '').trim();
    if (!first || first.includes('=')) return null;
    return normalizeStatsMode(first);
}

const reservedRootSegments = new Set([
    'dashboard',
    'analytics',
    'account',
    'servers',
    'docs',
    'terms',
    'privacy',
    'health',
    'api',
    'auth',
    'bot',
    'ws',
    'css',
    'js',
    'images',
    'icons',
    'vendor',
]);

function isReservedRootSegment(segment) {
    const s = String(segment || '').toLowerCase().trim();
    return reservedRootSegments.has(s);
}

function redirectToLogin(req, res) {
    const returnTo = encodeURIComponent(String(req.originalUrl || '/'));
    res.redirect(302, `/auth/login?returnTo=${returnTo}`);
}

// Legacy: /<clanName>/<playerNick>  ->  /<playerNick>?<mode>
app.get(/^\/([^/.]+)\/([^/.]+)\/?$/, (req, res, next) => {
    const clan = String(req.params?.[0] || '').trim();
    const player = String(req.params?.[1] || '').trim();
    if (!clan || !player) return next();
    if (isReservedRootSegment(clan)) return next();

    try {
        const u = new URL(req.originalUrl || '', `http://${req.headers.host || 'localhost'}`);
        const mode = parseModeTokenFromSearch(u.search, u.searchParams) || 'bedwars';
        const to = `/${encodeURIComponent(safeDecodeSegment(player))}?${encodeURIComponent(mode)}`;
        return redirectTo(res, to);
    } catch {
        const to = `/${encodeURIComponent(safeDecodeSegment(player))}?bedwars`;
        return redirectTo(res, to);
    }
});

// Canonical: /<clanName> and /<playerNick>?<mode> both load the dashboard UI.
app.get(/^\/([^/.]+)\/?$/, (req, res, next) => {
    const name = String(req.params?.[0] || '').trim();
    if (!name) return next();
    if (isReservedRootSegment(name)) return next();
    if (req.isAuthenticated?.() !== true) return redirectToLogin(req, res);
    return sendPublicFile(res, ['dashboard.html']);
});

app.get('/dashboard.html', requireAuthPage, (req, res) => redirectTo(res, '/dashboard'));
app.get('/analytics.html', requireAuthPage, (req, res) => redirectTo(res, '/analytics'));
app.get('/account.html', requireAuthPage, (req, res) => redirectTo(res, '/account'));
app.get('/servers.html', (req, res) => redirectTo(res, '/servers'));
app.get('/docs.html', (req, res) => redirectTo(res, '/docs'));
app.get('/docs/overview.html', (req, res) => redirectTo(res, '/docs/overview'));
app.get('/docs/auth.html', (req, res) => redirectTo(res, '/docs/auth'));
app.get('/docs/examples.html', (req, res) => redirectTo(res, '/docs/examples'));
app.get('/docs/notes.html', (req, res) => redirectTo(res, '/docs/notes'));
app.get('/terms.html', (req, res) => redirectTo(res, '/terms'));
app.get('/privacy.html', (req, res) => redirectTo(res, '/privacy'));

app.get('/bot/profile', async (req, res) => {
    try {
        const profile = await getBotProfile();
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.json(profile);
    } catch {
        res.status(500).json({ error: 'Bot profile error' });
    }
});

app.use(
    express.static(path.join(__dirname, "public"), {
        maxAge: 24 * 60 * 60 * 1000,
        setHeaders: (res, filePath) => {
            const p = String(filePath || "").toLowerCase();
            if (p.endsWith(".html") || p.endsWith(".json")) {
                res.setHeader("Cache-Control", "no-store");
                return;
            }
            // Make JS/CSS update quickly during dev without killing caching for images/fonts.
            if (p.endsWith(".js") || p.endsWith(".css")) {
                res.setHeader("Cache-Control", "no-store");
            }
        },
    })
);

const authRouter = require('./src/auth');
const apiRouter = require('./src/api');

app.use('/auth', authRouter);
app.use('/api', apiRouter);
app.use("/api/servers", createServersRouter());
app.use("/api/public", createServersPublicRouter());
app.use("/api/bot", createServersBotRouter());

let v1Mounted = false;

app.get('/health', (req, res) => {
    res.json({ ok: true });
});

let scheduler = null;
let scraperDisabled = null;

function initScraper() {
    if (scheduler) return scheduler;

    const disabled =
        String(process.env.DISABLE_SCRAPER || '').toLowerCase() === '1' ||
        String(process.env.DISABLE_SCRAPER || '').toLowerCase() === 'true';

    scraperDisabled = disabled;
    if (disabled) {
        console.log('Scraper disabilitato via DISABLE_SCRAPER=1');
        scheduler = null;
        return null;
    }

    scheduler = createScraperScheduler({
        scriptCommand: 'node coralmc-clans.js',
        onLog: (line) => console.log(line),
    });

    cron.schedule('0 * * * *', () => scheduler.runOnce());
    scheduler.runOnce();
    return scheduler;
}

let likesJobStarted = false;
function initLikesLeaderboardJob() {
    if (likesJobStarted) return;
    likesJobStarted = true;
    const run = async () => {
        try {
            await syncLikesLeaderboard({ windowMs: 24 * 60 * 60 * 1000 });
        } catch {
            // ignore
        }
    };
    cron.schedule('*/10 * * * *', () => run());
    run();
}

app.get('/api/scraper-status', ensureAuthenticated, (req, res) => {
    if (scraperDisabled === true) {
        res.json({ disabled: true, running: false });
        return;
    }

    if (!scheduler) {
        res.json({ disabled: false, running: false });
        return;
    }

    res.json(scheduler.getStatus());
});

async function start() {
    initScraper();
    await connectToMongo(process.env.MONGO_URI);
    initLikesLeaderboardJob();

    const cacheCleanupDisabled =
        String(process.env.DISABLE_UPSTREAM_CACHE_CLEANUP || '').toLowerCase() === '1' ||
        String(process.env.DISABLE_UPSTREAM_CACHE_CLEANUP || '').toLowerCase() === 'true';

    if (!cacheCleanupDisabled) {
        try {
            const out = cleanupUpstreamCache();
            if (out.deletedFiles > 0) {
                console.log(`Upstream cache cleanup: -${out.deletedFiles} file (${Math.round(out.deletedBytes / 1024)} KB)`);
            }
        } catch {
            // ignore
        }

        setInterval(() => {
            try {
                const out = cleanupUpstreamCache();
                if (out.deletedFiles > 0) {
                    console.log(`Upstream cache cleanup: -${out.deletedFiles} file (${Math.round(out.deletedBytes / 1024)} KB)`);
                }
            } catch {
                // ignore
            }
        }, 60 * 60 * 1000);
    }

    try {
        await loadStatsRegistry({ contact: process.env.UPSTREAM_CONTACT || null });
    } catch (err) {
        console.error('Impossibile caricare registry stats:', err?.message || err);
        const cached = loadCachedStatsRegistry();
        if (cached) console.log(`Registry stats caricato da cache locale (${cached.endpoints.length} endpoint).`);
    }

    if (!v1Mounted) {
        const v1 = express.Router();
        v1.use(createCorsMiddleware({ allowOrigin: process.env.CORS_ORIGIN || '*' }));
        v1.use(
            createRateLimit({
                windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
                max: Number(process.env.RATE_LIMIT_MAX || 240),
            })
        );
        v1.use(requirePrivateAccess());
        v1.use(trackApiUsage());
        v1.use(
            createUserRateLimit({
                windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
                max: Number(process.env.RATE_LIMIT_MAX || 240),
            })
        );
        v1.use(createPublicApiRouter());
        v1.use(
            createStatsRouter({
                contact: process.env.UPSTREAM_CONTACT || null,
                ttlMs: Number(process.env.UPSTREAM_TTL_MS || 300_000),
            })
        );
        app.use('/api/v1', v1);
        v1Mounted = true;
    }

    const server = http.createServer(app);
    server.on("error", (err) => {
        const code = err?.code || null;
        if (code === "EADDRINUSE") {
            console.error(`Porta ${config.port} già in uso (EADDRINUSE). Chiudi l'altro processo o cambia PORT/.env.`);
            process.exit(1);
            return;
        }
        console.error("Errore server:", err?.message || err);
        process.exit(1);
    });

    const wsSecret = config.session.secret || "dev_only_change_me";
    const wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (req, socket, head) => {
        try {
            const u = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
            if (u.pathname !== "/ws/analytics") return socket.destroy();

            const token = u.searchParams.get("token") || "";
            const payload = verifyWsToken({ token, secret: wsSecret });
            if (!payload?.discordId) {
                socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                return socket.destroy();
            }

            req.wsAuth = payload;
            wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
        } catch {
            socket.destroy();
        }
    });

    wss.on("connection", (ws, req) => {
        const discordId = String(req?.wsAuth?.discordId || "").trim();
        if (!discordId) {
            try {
                ws.close(1008, "unauthorized");
            } catch {
                // ignore
            }
            return;
        }

        const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
        const max = Number(process.env.RATE_LIMIT_MAX || 240);

        let closed = false;
        let inFlight = false;
        let queued = false;

        const sendOnce = async () => {
            if (closed) return;
            if (inFlight) return;
            inFlight = true;
            try {
                const payload = await buildAnalytics({ discordId, windowMs, max });
                if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
            } catch {
                // ignore
            } finally {
                inFlight = false;
                if (queued) {
                    queued = false;
                    queueMicrotask(sendOnce);
                }
            }
        };

        sendOnce();

        const onChanged = (evt) => {
            if (closed) return;
            if (String(evt?.discordId || "") !== discordId) return;
            if (inFlight) {
                queued = true;
                return;
            }
            sendOnce();
        };
        analyticsUpdates.on("changed", onChanged);

        const pingInterval = setInterval(() => {
            if (closed) return;
            if (ws.readyState !== ws.OPEN) return;
            try {
                ws.ping();
            } catch {
                // ignore
            }
        }, 30_000);

        ws.on("close", () => {
            closed = true;
            clearInterval(pingInterval);
            analyticsUpdates.off("changed", onChanged);
        });
        ws.on("error", () => {
            closed = true;
            clearInterval(pingInterval);
            analyticsUpdates.off("changed", onChanged);
        });
    });

    server.listen(config.port, () => {
        console.log(`Server in ascolto su http://localhost:${config.port}`);
        if (!config.discord) {
            console.log('Discord OAuth non configurato: imposta DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET e DISCORD_CALLBACK_URL');
        }
    });
}

if (require.main === module) {
    start().catch((err) => {
        console.error('Errore avvio server:', err?.message || err);
        process.exit(1);
    });
} else {
    module.exports = { app, start };
}
