const express = require('express');
const passport = require('passport');
const router = express.Router();
const { ensureAuthenticated } = require('./middleware/ensureAuthenticated');
const User = require('./models/User');
const { apiKeyPrefix, generateApiKey, hashApiKey } = require('./lib/apiKeys');
const {
    cdnAvatarUrl,
    cdnBannerUrl,
    avatarDecorationUrl,
    fetchDiscordConnections,
    fetchDiscordMe,
    snowflakeToDate,
} = require('./lib/discordApi');

function ensureDiscordConfigured(req, res, next) {
    const strategy =
        typeof passport._strategy === 'function' ? passport._strategy('discord') : null;
    if (strategy) return next();
    res.status(503).send('Discord OAuth non configurato sul server');
}

async function upsertDiscordUser(profile) {
    const discordId = String(profile?.id || '');
    if (!discordId) throw new Error('Missing discord id');

    const username = profile?.username || null;
    const globalName = profile?.global_name || profile?.displayName || null;
    const avatar = profile?.avatar || null;

    const now = new Date();

    const user = await User.findOneAndUpdate(
        { discordId },
        {
            $set: {
                username,
                globalName,
                avatar,
                lastLoginAt: now,
            },
        },
        { upsert: true, new: true }
    );

    return user;
}

async function ensureUserApiKey(user, req) {
    if (user.apiKeyHash) return user;

    const apiKey = generateApiKey();
    user.apiKeyHash = hashApiKey(apiKey);
    user.apiKeyPrefix = apiKeyPrefix(apiKey);
    user.apiKeyCreatedAt = new Date();
    user.apiKeyLastRotatedAt = new Date();
    await user.save();

    req.session.newApiKey = apiKey;
    req.session.newApiKeyPrefix = user.apiKeyPrefix;

    if (typeof req.session.save === 'function') {
        await new Promise((resolve, reject) => {
            req.session.save((err) => (err ? reject(err) : resolve()));
        });
    }

    return user;
}

// Rotte Autenticazione
router.get('/login', ensureDiscordConfigured, passport.authenticate('discord'));

router.get('/callback', ensureDiscordConfigured, passport.authenticate('discord', {
    failureRedirect: '/'
}), async (req, res) => {
    try {
        const user = await upsertDiscordUser(req.user);
        await ensureUserApiKey(user, req);
    } catch {
        // ignore provisioning error, UI will show error
    }
    if (typeof req.session.save === 'function') {
        req.session.save(() => res.redirect('/account'));
        return;
    }
    res.redirect('/account');
});

router.get('/logout', (req, res) => {
    req.logout(() => res.redirect('/'));
});

// Verifica stato login
router.get('/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json(req.user);
    } else {
        res.status(401).json({ error: 'Non autenticato' });
    }
});

router.get('/ui-profile', ensureAuthenticated, async (req, res) => {
    try {
        const discordId = String(req.user?.id || '');
        if (!discordId) return res.status(400).json({ error: 'Missing discord id' });

        const avatar = req.user?.avatar || null;
        const username = req.user?.username || null;
        const globalName = req.user?.global_name || req.user?.displayName || null;

        const avatarUrl = cdnAvatarUrl({ id: discordId, avatar, size: 64 });

        const cachedUrlRaw = req.session.discordDecorationUrl || null;
        const cachedAt = Number(req.session.discordDecorationFetchedAt || 0);
        const ttlMs = 10 * 60 * 1000;
        const cachedUrl =
            typeof cachedUrlRaw === 'string' && cachedUrlRaw.includes('/avatar-decoration-presets/')
                ? cachedUrlRaw.replace(/\.gif(\?|$)/, '.png$1')
                : cachedUrlRaw;
        const fresh = cachedUrl && cachedAt && Date.now() - cachedAt < ttlMs;

        if (fresh) {
            return res.json({
                discordId,
                username,
                globalName,
                avatarUrl,
                avatarDecorationUrl: cachedUrl,
            });
        }

        const accessToken =
            req.session.discordAccessToken ||
            req.user?._tokens?.accessToken ||
            null;

        let decorationUrl = null;
        if (accessToken) {
            try {
                const discordMe = await fetchDiscordMe(accessToken);
                decorationUrl = avatarDecorationUrl(discordMe?.avatar_decoration_data?.asset ?? null);
            } catch {
                decorationUrl = null;
            }
        }

        req.session.discordDecorationUrl = decorationUrl;
        req.session.discordDecorationFetchedAt = Date.now();
        if (typeof req.session.save === 'function') {
            req.session.save(() => {
                res.json({
                    discordId,
                    username,
                    globalName,
                    avatarUrl,
                    avatarDecorationUrl: decorationUrl,
                });
            });
            return;
        }

        res.json({
            discordId,
            username,
            globalName,
            avatarUrl,
            avatarDecorationUrl: decorationUrl,
        });
    } catch {
        res.status(500).json({ error: 'Errore profilo UI' });
    }
});

router.get('/me', ensureAuthenticated, async (req, res) => {
    try {
        const user = await upsertDiscordUser(req.user);
        await ensureUserApiKey(user, req);

        const accessToken =
            req.session.discordAccessToken ||
            req.user?._tokens?.accessToken ||
            null;
        let discordMe = null;
        let connections = null;
        let meError = null;
        let connectionsError = null;

        if (accessToken) {
            try {
                discordMe = await fetchDiscordMe(accessToken);
            } catch {
                discordMe = null;
                meError = 'fetch_failed';
            }

            if ((process.env.DISCORD_SCOPES || '').includes('connections')) {
                try {
                    connections = await fetchDiscordConnections(accessToken);
                } catch {
                    connections = null;
                    connectionsError = 'fetch_failed';
                }
            }
        }

        const avatarUrl = cdnAvatarUrl({ id: user.discordId, avatar: user.avatar, size: 128 });
        const bannerUrl = cdnBannerUrl({
            id: user.discordId,
            banner: discordMe?.banner || null,
            size: 600,
        });
        const createdAt = snowflakeToDate(user.discordId)?.toISOString() || null;

        const payload = {
            discordId: user.discordId,
            username: user.username,
            globalName: user.globalName,
            avatarUrl,
            bannerUrl,
            accentColor: discordMe?.accent_color ?? null,
            avatarDecorationAsset: discordMe?.avatar_decoration_data?.asset ?? null,
            avatarDecorationUrl: avatarDecorationUrl(discordMe?.avatar_decoration_data?.asset ?? null),
            email: discordMe?.email ?? null,
            verified: discordMe?.verified ?? null,
            createdAt,
            connections: Array.isArray(connections) ? connections : null,
            apiKeyPrefix: user.apiKeyPrefix,
            lastLoginAt: user.lastLoginAt,
        };

        if (String(req.query.debug || '') === '1') {
            payload.discordDebug = {
                tokenPresent: Boolean(accessToken),
                scopesConfigured: process.env.DISCORD_SCOPES || 'identify',
                tokenStoredOnUser: Boolean(req.user?._tokens?.accessToken),
                meFetched: Boolean(discordMe),
                connectionsFetched: Array.isArray(connections),
                meError,
                connectionsError,
                meKeys: discordMe ? Object.keys(discordMe).sort() : [],
                avatarDecorationData: discordMe?.avatar_decoration_data ?? null,
            };
        }

        res.json(payload);
    } catch (err) {
        res.status(500).json({ error: 'Errore profilo' });
    }
});

router.get('/api-key', ensureAuthenticated, async (req, res) => {
    try {
        const discordId = String(req.user?.id || '');
        const user = await User.findOne({ discordId }).lean();
        if (!user) return res.status(404).json({ error: 'Utente non trovato' });

        const apiKey = req.session.newApiKey || null;
        const created = Boolean(apiKey);
        if (created) {
            req.session.newApiKey = null;
        }

        res.json({
            created,
            apiKey,
            apiKeyPrefix: user.apiKeyPrefix || req.session.newApiKeyPrefix || null,
        });
    } catch {
        res.status(500).json({ error: 'Errore API key' });
    }
});

router.post('/api-key/rotate', ensureAuthenticated, async (req, res) => {
    try {
        const discordId = String(req.user?.id || '');
        const user = await User.findOne({ discordId });
        if (!user) return res.status(404).json({ error: 'Utente non trovato' });

        const apiKey = generateApiKey();
        user.apiKeyHash = hashApiKey(apiKey);
        user.apiKeyPrefix = apiKeyPrefix(apiKey);
        user.apiKeyLastRotatedAt = new Date();
        if (!user.apiKeyCreatedAt) user.apiKeyCreatedAt = user.apiKeyLastRotatedAt;
        await user.save();

        req.session.newApiKey = apiKey;
        req.session.newApiKeyPrefix = user.apiKeyPrefix;

        if (typeof req.session.save === 'function') {
            await new Promise((resolve, reject) => {
                req.session.save((err) => (err ? reject(err) : resolve()));
            });
        }

        res.json({ ok: true, apiKey, apiKeyPrefix: user.apiKeyPrefix });
    } catch {
        res.status(500).json({ error: 'Errore rotazione API key' });
    }
});

router.post('/delete-account', ensureAuthenticated, async (req, res) => {
    try {
        const discordId = String(req.user?.id || '');
        if (!discordId) return res.status(400).json({ error: 'Missing discord id' });

        await User.deleteOne({ discordId });

        req.logout(() => {
            if (typeof req.session?.destroy === 'function') {
                req.session.destroy(() => res.json({ ok: true }));
                return;
            }
            res.json({ ok: true });
        });
    } catch {
        res.status(500).json({ error: 'Errore eliminazione account' });
    }
});

module.exports = router;
