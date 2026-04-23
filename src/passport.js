const DiscordStrategy = require("passport-discord").Strategy;

function configurePassport(passport, discordConfig) {
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj));

  if (!discordConfig) return;

  passport.use(
    new DiscordStrategy(
      {
        clientID: discordConfig.clientID,
        clientSecret: discordConfig.clientSecret,
        callbackURL: discordConfig.callbackURL,
        scope: discordConfig.scopes || ["identify"],
      },
      (accessToken, refreshToken, profile, done) => {
        try {
          profile._tokens = {
            accessToken: accessToken || null,
            refreshToken: refreshToken || null,
            tokenSetAt: Date.now(),
          };
        } catch {
          // ignore
        }
        done(null, profile);
      }
    )
  );
}

module.exports = { configurePassport };
