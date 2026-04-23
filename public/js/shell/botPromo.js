const BOT_ID = "1496178595889025135";
const FALLBACK_NAME = "Corallo Stats";
const FALLBACK_LOCAL_AVATAR = "/images/corallo_stats_icon.png";
const PROFILE_ENDPOINT = "/bot/profile";

const SLIDES = [
  {
    title: "Leaderboard Bedwars",
    text: "Classifiche player e clan Bedwars: top XP, ranking e snapshot rapidi da Discord.",
  },
  {
    title: "Stats player",
    text: "Kills, final kills, wins/losses, beds broken e level: tutto in un comando, con link diretto alle pagine stats.",
  },
  {
    title: "Clans Bedwars",
    text: "Dettagli clan (tag/colore), lista membri e progressi. Perfetto per controlli rapidi in chat.",
  },
  {
    title: "KitPvP & Duels",
    text: "Leaderboards e statistiche per KitPvP e Duels: confronti veloci e riepiloghi puliti.",
  },
  {
    title: "CoralCUP",
    text: "Edizioni, leaderboard e dettagli match/team: utile per seguire l’evento senza uscire da Discord.",
  },
  {
    title: "Link & API",
    text: "Genera link agli endpoint e ai risultati delle API (utile per bot, tool e dev).",
  },
];

function defaultAvatarIndex(discordId) {
  try {
    return Number((BigInt(String(discordId)) >> 22n) % 6n);
  } catch {
    return 0;
  }
}

function inviteUrl() {
  const base = "https://discord.com/oauth2/authorize";
  const params = new URLSearchParams({
    client_id: BOT_ID,
    scope: "bot applications.commands",
    permissions: "0",
  });
  return `${base}?${params.toString()}`;
}

let profileTask = null;
async function getProfile() {
  if (profileTask) return profileTask;
  profileTask = (async () => {
    try {
      const res = await fetch(PROFILE_ENDPOINT, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      const name = typeof json?.name === "string" && json.name.trim() ? json.name.trim() : FALLBACK_NAME;
      const avatarUrl =
        typeof json?.avatarUrl === "string" && json.avatarUrl.trim() ? json.avatarUrl.trim() : FALLBACK_LOCAL_AVATAR;
      return { name, avatarUrl };
    } catch {
      return { name: FALLBACK_NAME, avatarUrl: FALLBACK_LOCAL_AVATAR };
    }
  })();
  return profileTask;
}

function bindModalProfile(dialog) {
  if (!dialog || dialog.dataset.profileBound === "1") return;
  dialog.dataset.profileBound = "1";

  getProfile().then(({ name, avatarUrl }) => {
    const title = dialog.querySelector(".bot-title");
    if (title) title.textContent = name;
    const avatar = dialog.querySelector(".bot-avatar");
    if (avatar) avatar.src = avatarUrl;
  });
}

function ensureModal() {
  let dialog = document.querySelector("#bot-dialog");
  if (dialog) {
    bindModalProfile(dialog);
    return dialog;
  }

  dialog = document.createElement("dialog");
  dialog.id = "bot-dialog";
  dialog.className = "bot-dialog";
  dialog.innerHTML = `
    <div class="modal bot-modal" role="document" aria-label="Bot Discord">
      <header>
        <div class="dialog-head-left">
          <div class="bot-head">
            <img class="bot-avatar" alt="" aria-hidden="true" />
            <div class="bot-meta">
              <div class="bot-title">${FALLBACK_NAME}</div>
              <div class="muted bot-sub">Invita il bot nel tuo server</div>
            </div>
          </div>
        </div>
        <button class="icon-btn" type="button" id="bot-dialog-close" aria-label="Chiudi">
          <span class="aico btn-ico" data-icon="line-md:close" aria-hidden="true"></span>
        </button>
      </header>

      <div class="body">
        <section class="bot-slider" aria-label="Cosa può fare il bot">
          <div class="bot-slider-top">
            <div class="bot-slider-kicker">Funzioni</div>
            <div class="bot-slider-progress" aria-hidden="true"></div>
          </div>
          <div class="bot-slide">
            <div class="bot-slide-title"></div>
            <div class="muted bot-slide-text"></div>
          </div>
          <div class="bot-slider-nav">
            <button class="icon-btn bot-slide-btn" type="button" id="bot-slide-prev" aria-label="Slide precedente">
              <span class="aico btn-ico" data-icon="line-md:chevron-left" aria-hidden="true"></span>
            </button>
            <div class="bot-dots" id="bot-dots"></div>
            <button class="icon-btn bot-slide-btn" type="button" id="bot-slide-next" aria-label="Slide successiva">
              <span class="aico btn-ico" data-icon="line-md:chevron-right" aria-hidden="true"></span>
            </button>
          </div>
        </section>

        <section class="bot-features" aria-label="Funzioni principali">
          <div class="bot-section-title">Cosa puoi fare</div>
          <div class="bot-feature-grid">
            <div class="bot-feature">
              <i class="bot-feature-ico fa-solid fa-bed" aria-hidden="true"></i>
              <b>Bedwars</b>
              <span class="muted">Leaderboard player e clan, dettagli match e profili.</span>
            </div>
            <div class="bot-feature">
              <i class="bot-feature-ico fa-solid fa-users" aria-hidden="true"></i>
              <b>Clan</b>
              <span class="muted">Tag/colore, membri e snapshot rapidi senza aprire il browser.</span>
            </div>
            <div class="bot-feature">
              <i class="bot-feature-ico fa-solid fa-crosshairs" aria-hidden="true"></i>
              <b>KitPvP</b>
              <span class="muted">Stats e classifiche: confronti veloci in chat.</span>
            </div>
            <div class="bot-feature">
              <i class="bot-feature-ico fa-solid fa-hand-fist" aria-hidden="true"></i>
              <b>Duels</b>
              <span class="muted">Leaderboard e match info per analisi rapide.</span>
            </div>
            <div class="bot-feature">
              <i class="bot-feature-ico fa-solid fa-trophy" aria-hidden="true"></i>
              <b>CoralCUP</b>
              <span class="muted">Edizioni, team e leaderboard dell’evento.</span>
            </div>
            <div class="bot-feature">
              <i class="bot-feature-ico fa-solid fa-layer-group" aria-hidden="true"></i>
              <b>API & link</b>
              <span class="muted">Link agli endpoint e output “developer-friendly”.</span>
            </div>
          </div>
        </section>

        <section class="bot-commands" aria-label="Esempi">
          <div class="bot-section-title">Esempi rapidi</div>
          <div class="muted bot-section-sub">I nomi possono variare: sono esempi di utilizzo.</div>
          <div class="bot-cmds" aria-hidden="true">
            <code class="bot-cmd">/bedwars &lt;nick&gt;</code>
            <code class="bot-cmd">/clan &lt;nome&gt;</code>
            <code class="bot-cmd">/leaderboard bedwars</code>
            <code class="bot-cmd">/kitpvp &lt;nick&gt;</code>
            <code class="bot-cmd">/duels &lt;nick&gt;</code>
            <code class="bot-cmd">/coralcup leaderboard</code>
          </div>
        </section>

        <p class="bot-desc muted">
          Questo bot ti permette di usare Corallo Stats direttamente da Discord: comandi rapidi, link utili e integrazione con le API.
          L’invito apre la classica schermata di autorizzazione Discord.
        </p>

        <div class="bot-actions">
          <a class="btn primary" id="bot-invite" target="_blank" rel="noreferrer">Invita il bot</a>
          <button class="btn" type="button" id="bot-close-secondary">Chiudi</button>
        </div>
      </div>
    </div>
  `;

  document.body.append(dialog);

  let slideIdx = 0;
  let autoTimer = null;

  const slideEl = dialog.querySelector(".bot-slide");
  const titleEl = dialog.querySelector(".bot-slide-title");
  const textEl = dialog.querySelector(".bot-slide-text");
  const dotsEl = dialog.querySelector("#bot-dots");
  const progEl = dialog.querySelector(".bot-slider-progress");

  function renderDots() {
    if (!dotsEl) return;
    dotsEl.innerHTML = "";
    for (let i = 0; i < SLIDES.length; i++) {
      const d = document.createElement("button");
      d.type = "button";
      d.className = `dot${i === slideIdx ? " active" : ""}`;
      d.setAttribute("aria-label", `Vai alla slide ${i + 1}`);
      d.addEventListener("click", () => {
        slideIdx = i;
        renderSlide({ animate: true });
        startAuto();
      });
      dotsEl.append(d);
    }
  }

  function renderProgress() {
    if (!progEl) return;
    progEl.textContent = `${slideIdx + 1} / ${SLIDES.length}`;
  }

  function renderSlide({ animate = false } = {}) {
    const s = SLIDES[slideIdx] || SLIDES[0];
    if (animate && slideEl) {
      slideEl.classList.remove("is-changing");
      slideEl.offsetWidth;
      slideEl.classList.add("is-changing");
      window.setTimeout(() => slideEl.classList.remove("is-changing"), 180);
    }
    if (titleEl) titleEl.textContent = s.title;
    if (textEl) textEl.textContent = s.text;
    renderDots();
    renderProgress();
  }

  function stopAuto() {
    if (autoTimer) window.clearInterval(autoTimer);
    autoTimer = null;
  }

  function startAuto() {
    stopAuto();
    autoTimer = window.setInterval(() => {
      slideIdx = (slideIdx + 1) % SLIDES.length;
      renderSlide({ animate: true });
    }, 4200);
  }

  function prev() {
    slideIdx = (slideIdx - 1 + SLIDES.length) % SLIDES.length;
    renderSlide();
  }
  function next() {
    slideIdx = (slideIdx + 1) % SLIDES.length;
    renderSlide();
  }

  dialog.querySelector("#bot-slide-prev")?.addEventListener("click", () => {
    prev();
    renderSlide({ animate: true });
    startAuto();
  });
  dialog.querySelector("#bot-slide-next")?.addEventListener("click", () => {
    next();
    renderSlide({ animate: true });
    startAuto();
  });

  dialog.addEventListener("close", () => stopAuto());
  dialog.addEventListener("pointerenter", () => stopAuto());
  dialog.addEventListener("pointerleave", () => startAuto());

  const avatar = dialog.querySelector(".bot-avatar");
  if (avatar) {
    avatar.src = FALLBACK_LOCAL_AVATAR;
    avatar.loading = "lazy";
    avatar.decoding = "async";
    avatar.referrerPolicy = "no-referrer";
    avatar.onerror = () => {
      avatar.onerror = null;
      const idx = defaultAvatarIndex(BOT_ID);
      avatar.src = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    };
  }

  const invite = dialog.querySelector("#bot-invite");
  if (invite) invite.href = inviteUrl();

  const close = () => {
    try {
      dialog.close();
    } catch {
      // ignore
    }
  };

  dialog.querySelector("#bot-dialog-close")?.addEventListener("click", close);
  dialog.querySelector("#bot-close-secondary")?.addEventListener("click", close);

  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });

  renderSlide({ animate: false });
  startAuto();

  return dialog;
}

export function initBotPromo() {
  const sidebar = document.querySelector("#sidebar");
  if (!sidebar) return;
  if (sidebar.dataset.botPromoBound === "1") return;
  sidebar.dataset.botPromoBound = "1";

  const nav = sidebar.querySelector("nav.nav");
  if (!nav) return;

  const promo = document.createElement("button");
  promo.type = "button";
  promo.className = "nav-item bot-promo";
  promo.setAttribute("aria-haspopup", "dialog");
  promo.innerHTML = `
    <span class="bot-pill">
      <img class="bot-pill-avatar" alt="" aria-hidden="true" />
      <span class="bot-pill-text">
        <span class="bot-pill-name">${FALLBACK_NAME}</span>
        <span class="bot-pill-cta muted">Invita</span>
      </span>
    </span>
  `;

  const img = promo.querySelector(".bot-pill-avatar");
  if (img) {
    img.src = FALLBACK_LOCAL_AVATAR;
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.onerror = () => {
      img.onerror = null;
      const idx = defaultAvatarIndex(BOT_ID);
      img.src = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    };
  }

  promo.addEventListener("click", () => {
    const dialog = ensureModal();
    try {
      dialog.showModal();
    } catch {
      // ignore
    }
  });

  const insertAt = nav.querySelector(".nav-title") || nav.firstChild;
  if (insertAt) nav.insertBefore(promo, insertAt);
  else nav.prepend(promo);

  // Fill name + avatar from server profile when available.
  getProfile().then(({ name, avatarUrl }) => {
    const nameEl = promo.querySelector(".bot-pill-name");
    if (nameEl) nameEl.textContent = name;
    if (img) img.src = avatarUrl;
    bindModalProfile(document.querySelector("#bot-dialog"));
  });
}
