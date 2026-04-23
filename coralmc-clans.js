const fs = require("fs");
const { chromium } = require("playwright");

const BASE = "https://coralmc.it";
const START_URL = "https://coralmc.it/en/stats/bedwars";
const MAX_PAGES = 100;
const BAR_WIDTH = 30;
const CAN_PROGRESS = Boolean(process.stdout && process.stdout.isTTY);

const PLAYER_API = (nick) =>
  `https://coralmc.it/api/v1/stats/bedwars/${encodeURIComponent(nick)}`;

const CLAN_API = (clan) =>
  `https://coralmc.it/api/v1/stats/bedwars/clans/${encodeURIComponent(clan)}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderBar(current, total, label = "") {
  const safeTotal = Math.max(total, 1);
  const ratio = Math.min(current / safeTotal, 1);
  const filled = Math.round(ratio * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const bar = `[${"#".repeat(filled)}${"-".repeat(empty)}]`;
  const percent = Math.round(ratio * 100);
  return `${label}${bar} ${current}/${total} (${percent}%)`;
}

function updateBar(current, total, label = "") {
  if (!CAN_PROGRESS) return;
  try {
    if (!process.stdout.writable) return;
    process.stdout.write("\r" + renderBar(current, total, label));
  } catch {
    // ignore (e.g. EPIPE)
  }
}

function finishBar() {
  if (!CAN_PROGRESS) return;
  try {
    if (!process.stdout.writable) return;
    process.stdout.write("\n");
  } catch {
    // ignore (e.g. EPIPE)
  }
}

async function getPlayerLinksFromCurrentPage(page) {
  const hrefs = await page.locator('a[href*="/en/stats/player/"]').evaluateAll((els) =>
    els.map((el) => el.getAttribute("href")).filter(Boolean)
  );

  return [...new Set(hrefs)].map((href) => new URL(href, BASE).toString());
}

async function goToNextPage(page) {
  const nextBtn = page.locator('button[aria-label="Go to next page"]').first();

  if ((await nextBtn.count()) === 0) return false;

  const disabled = await nextBtn.isDisabled().catch(() => false);
  if (disabled) return false;

  const firstPlayer = page.locator('a[href*="/en/stats/player/"]').first();
  const beforeHref = await firstPlayer.getAttribute("href").catch(() => null);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await nextBtn.click({ timeout: 15_000 });
    } catch {
      return false;
    }

    const navTask = page
      .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 })
      .then(() => true)
      .catch(() => false);

    const changeTask = page
      .waitForFunction(
        (prev) => {
          const a = document.querySelector('a[href*="/en/stats/player/"]');
          if (!a) return false;
          const href = a.getAttribute("href") || "";
          return prev ? href !== prev : href.length > 0;
        },
        beforeHref,
        { timeout: 45_000 }
      )
      .then(() => true)
      .catch(() => false);

    await Promise.race([navTask, changeTask]);
    await page.waitForTimeout(650);

    const afterHref = await firstPlayer.getAttribute("href").catch(() => null);
    if (afterHref && afterHref !== beforeHref) return true;

    await page.waitForTimeout(450 * attempt);
  }

  return false;
}

async function collectAllPlayers(page) {
  const allPlayers = new Set();

  async function openStart() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(START_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await page.waitForSelector('a[href*="/en/stats/player/"], button[aria-label="Go to next page"]', {
          timeout: 45_000,
        });
        await page.waitForTimeout(450);
        return;
      } catch (err) {
        if (attempt === 3) throw err;
        await page.waitForTimeout(700 * attempt);
      }
    }
  }

  await openStart();

  console.log("Raccolgo i player dalla leaderboard...");
  updateBar(0, MAX_PAGES, "Pagine ");

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const currentPlayers = await getPlayerLinksFromCurrentPage(page);

    for (const p of currentPlayers) {
      const username = p.split("/").pop();
      allPlayers.add(username);
    }

    updateBar(pageNum, MAX_PAGES, "Pagine ");

    if (pageNum === MAX_PAGES) break;

    const moved = await goToNextPage(page);
    if (!moved) {
      break;
    }
  }

  finishBar();
  console.log(`Player raccolti: ${allPlayers.size}`);
  return [...allPlayers];
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return await res.json();
}

function extractClanFromPlayerResponse(data) {
  return (
    data?.clan_name ||
    data?.clan?.name ||
    data?.clan ||
    data?.player?.clan_name ||
    data?.player?.clan?.name ||
    data?.player?.clan ||
    data?.stats?.clan_name ||
    data?.stats?.clan?.name ||
    data?.stats?.clan ||
    null
  );
}

function extractMembersFromClanResponse(data) {
  const raw =
    data?.members ||
    data?.clan?.members ||
    data?.players ||
    data?.clan?.players ||
    [];

  const members = [];

  for (const item of raw) {
    if (typeof item === "string") {
      members.push({ username: item, role: 0 });
      continue;
    }

    const username =
      item?.username ||
      item?.nick ||
      item?.name ||
      item?.player?.username ||
      item?.player?.name ||
      null;

    if (!username) continue;

    const roleRaw = item?.role ?? item?.rank ?? item?.clan_role ?? item?.player?.role ?? 0;
    const role = Number.isFinite(Number(roleRaw)) ? Number(roleRaw) : 0;
    members.push({ username, role });
  }

  const byUser = new Map();
  for (const m of members) {
    const key = String(m.username).toLowerCase();
    if (!byUser.has(key)) byUser.set(key, m);
  }

  return [...byUser.values()];
}

(async () => {
  const startedAt = Date.now();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();
    page.setDefaultTimeout(90_000);
    page.setDefaultNavigationTimeout(90_000);

    // Speed + stability: we only need DOM links/buttons.
    await page.route("**/*", (route) => {
      const t = route.request().resourceType();
      if (t === "image" || t === "font" || t === "media") return route.abort();
      return route.continue();
    });

    const players = await collectAllPlayers(page);
    const totalPlayers = players.length;
    if (totalPlayers < 10) throw new Error(`Players raccolti troppo pochi: ${totalPlayers}`);

    const seenPlayers = new Set();
    const seenClans = new Set();

    const results = [];
    const clanMembersMap = {};
    const clanMetaMap = {};
    const playersWithoutClan = [];

    console.log("\nControllo player e clan via API...");
    updateBar(0, totalPlayers, "Player ");

    for (let i = 0; i < totalPlayers; i++) {
      const username = players[i];

      if (seenPlayers.has(username)) {
        updateBar(i + 1, totalPlayers, "Player ");
        continue;
      }

      try {
        const playerData = await getJson(PLAYER_API(username));
        const clan = extractClanFromPlayerResponse(playerData);

        if (!clan) {
          seenPlayers.add(username);
          playersWithoutClan.push(username);
          results.push({ username, clan: null });
          updateBar(i + 1, totalPlayers, "Player ");
          await sleep(100);
          continue;
        }

        if (seenClans.has(clan)) {
          seenPlayers.add(username);
          results.push({ username, clan, skippedBecauseClanKnown: true });
          updateBar(i + 1, totalPlayers, "Player ");
          await sleep(100);
          continue;
        }

        const clanData = await getJson(CLAN_API(clan));
        const members = extractMembersFromClanResponse(clanData);

        seenClans.add(clan);
        seenPlayers.add(username);

        for (const member of members) {
          if (member && typeof member === "object" && member.username) seenPlayers.add(String(member.username));
        }

        clanMembersMap[clan] = members;
        clanMetaMap[clan] = {
          total_exp: clanData?.total_exp ?? null,
          member_count: Array.isArray(clanData?.members) ? clanData.members.length : null,
          tag: clanData?.tag ?? null,
          color: clanData?.color ?? null,
        };
        results.push({
          username,
          clan,
          membersCount: members.length,
          members,
        });

        updateBar(i + 1, totalPlayers, "Player ");
        await sleep(120);
      } catch (err) {
        results.push({ username, clan: null, error: err.message });
        updateBar(i + 1, totalPlayers, "Player ");
        await sleep(120);
      }
    }

    finishBar();

    const uniqueClans = [...seenClans].sort();

    console.log("\n=== RISULTATO ===");
    console.log("Clan unici trovati:", uniqueClans.length);
    console.log("Player raccolti:", players.length);
    console.log("Player coperti:", seenPlayers.size);
    console.log("Player senza clan:", playersWithoutClan.length);

    const metadata = {
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      uniqueClansCount: uniqueClans.length,
      playersFromLeaderboardCount: players.length,
      coveredPlayersCount: seenPlayers.size,
      playersWithoutClanCount: playersWithoutClan.length,
    };

    fs.writeFileSync("data/players_from_leaderboard.json", JSON.stringify(players, null, 2), "utf8");
    fs.writeFileSync("data/results.json", JSON.stringify(results, null, 2), "utf8");
    fs.writeFileSync("data/clans.json", JSON.stringify(uniqueClans, null, 2), "utf8");
    fs.writeFileSync("data/clan_members.json", JSON.stringify(clanMembersMap, null, 2), "utf8");
    fs.writeFileSync("data/clans_meta.json", JSON.stringify(clanMetaMap, null, 2), "utf8");
    fs.writeFileSync("data/covered_players.json", JSON.stringify([...seenPlayers].sort(), null, 2), "utf8");
    fs.writeFileSync("data/players_without_clan.json", JSON.stringify(playersWithoutClan.sort(), null, 2), "utf8");
    fs.writeFileSync("data/metadata.json", JSON.stringify(metadata, null, 2), "utf8");
  } catch (err) {
    console.error("Errore scraper:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
})();
