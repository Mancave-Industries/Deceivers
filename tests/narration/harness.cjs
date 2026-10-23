/* ==========================================================================
   Recorded-narration test harness (local only — no network, no paid
   services). Plays real games in headless Chromium against a local static
   server, logging every Sound event (sound effects, narration requests,
   clip start/end/failure) so we can check coverage, failure handling and
   secrecy (matched pairs that differ only in who holds which role).

   Run:  NODE_PATH=<dir containing playwright> node tests/narration/harness.cjs [outDir]
   Needs ffmpeg on PATH for the default "wav" audio mode.

   Audio modes:
     wav  — .m4a requests are answered with a WAV decode of the same clip.
            Open-source Chromium has no AAC decoder (Safari/Chrome do), so
            this is how the logic is exercised headlessly.
     m4a  — the real AAC files (decode fails in Chromium: tests the
            silent-failure path end to end).
     404  — every clip request fails.
   ========================================================================== */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'test-evidence', 'recorded-narration'));
const CLIPS = path.join(ROOT, 'assets', 'audio', 'narration');
const WAV_DIR = path.join(os.tmpdir(), 'deceivers-narration-wav');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ensureWavs() {
  fs.mkdirSync(WAV_DIR, { recursive: true });
  for (const f of fs.readdirSync(CLIPS).filter((x) => x.endsWith('.m4a'))) {
    const out = path.join(WAV_DIR, f.replace('.m4a', '.wav'));
    if (fs.existsSync(out)) continue;
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(CLIPS, f), '-c:a', 'pcm_s16le', out]);
    if (r.status !== 0) throw new Error(`ffmpeg failed for ${f}`);
  }
}

function startServer(audioMode) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/Gameshed/nav.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(''); return; }
    let file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    let type = null;
    if (urlPath.endsWith('.m4a')) {
      if (audioMode === '404') { res.writeHead(404); res.end(); return; }
      if (audioMode === 'wav') { file = path.join(WAV_DIR, path.basename(urlPath).replace('.m4a', '.wav')); type = 'audio/wav'; }
      else type = 'audio/mp4';
    }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const ext = path.extname(file);
      type = type || { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NEVER_CLICK = new Set(['new-game', 'reset-game', 'open-help', 'continue-game', 'add-player', 'remove-player',
  'set-seat-mode', 'set-deceiver-knowledge', 'inc-series-length', 'dec-series-length', 'play-again']);

/* One game session. cfg:
   players, bots (seat indexes), series, deceivers (seat indexes, forced
   at Reveal), knowledge, seed, audioSeed, mode ('fast'|'patient'),
   prefer: { [action]: weight } nudges, hooks: { onMain(state info) }, ...
   Returns { events, phases, errors, reachedResults, ... }. */
async function runGame(browser, port, cfg) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.addInitScript((seed) => {
    let a = seed;
    Math.random = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    window.__unhandled = [];
    window.addEventListener('unhandledrejection', (e) => window.__unhandled.push(String(e.reason)));
    try { localStorage.clear(); } catch (e) { /* ignore */ }
  }, cfg.seed);
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.evaluate((audioSeed) => {
    window.__ev = [];
    window.__t0 = performance.now();
    let a = audioSeed;
    Sound._setRandom(function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    });
    Sound._onEvent((type, d) => window.__ev.push({ type, d, at: Math.round(performance.now() - window.__t0), phase: (typeof state !== 'undefined' ? state.phase : null) }));
  }, cfg.audioSeed || 777);

  const rng = mulberry32(cfg.seed * 7 + 1);
  const phases = [];
  const marks = [];
  const mark = async (label) => { const at = await page.evaluate(() => Math.round(performance.now() - window.__t0)); marks.push({ label, at }); };

  // Sound now defaults ON at Partial (not off), so getting to each
  // desired state is driven explicitly rather than by a single
  // "tap once to turn on" click, whose direction would otherwise depend
  // on whatever the default already is. The header icon only has an
  // on/off tap (muted class); the Full/Partial choice has no header
  // control of its own (it lives in Settings), so that's set directly.
  // This suite was written to exercise every narration pool, so it
  // selects Full unless a test asks for Partial via cfg.narrationLevel.
  // cfg.sound: true/undefined -- ensure ON, then set cfg.narrationLevel
  // (default 'full'). false -- ensure OFF. 'leave' -- touch nothing, to
  // test whatever the real boot default actually is.
  if (cfg.sound !== 'leave') {
    const mutedAtBoot = await page.evaluate(() => document.getElementById('soundBtn').classList.contains('muted'));
    if (cfg.sound !== false) {
      if (mutedAtBoot) await page.click('[data-action="title-toggle-sound"]');
      await page.evaluate((level) => {
        state.settings.audio = level;
        applyAudioSettings(level);
      }, cfg.narrationLevel || 'full');
    } else if (!mutedAtBoot) {
      await page.click('[data-action="title-toggle-sound"]');
    }
  }

  // Title -> Setup
  await page.click('.screen.active [data-action="new-game"]');
  for (let i = 3; i < cfg.players; i++) await page.click('.screen.active [data-action="add-player"]');
  const inputs = await page.$$('.screen.active .name-input');
  for (let i = 0; i < inputs.length; i++) await inputs[i].fill(`P${i + 1}`);
  for (const b of cfg.bots || []) await page.click(`.screen.active [data-action="set-seat-mode"][data-index="${b}"][data-mode="computer"]`);
  for (let i = 1; i < (cfg.series || 1); i++) await page.click('.screen.active [data-action="inc-series-length"]');
  if (cfg.knowledge === 'hidden') await page.click('.screen.active [data-action="set-deceiver-knowledge"][data-mode="hidden"]');
  await mark('start-game');
  await page.click('.screen.active [data-action="start-game"]');

  let steps = 0;
  let lastPhase = null;
  let rolesForcedFor = null;
  const forcedRounds = new Set();
  let reachedResults = false;
  const deadline = Date.now() + (cfg.timeoutMs || 240000);
  while (Date.now() < deadline && steps < 4000) {
    steps++;
    const info = await page.evaluate(() => ({
      phase: state.phase,
      round: state.round,
      seriesGame: state.seriesGame,
      seriesLength: state.seriesLength,
      winnerReveal: !document.getElementById('winnerRevealOverlay').classList.contains('hidden'),
      overlay: !document.getElementById('interstitialOverlay').classList.contains('hidden') || !document.getElementById('winnerRevealOverlay').classList.contains('hidden'),
      actions: Array.from(document.querySelectorAll('.screen.active [data-action]'))
        .filter((b) => !b.disabled && b.offsetParent !== null)
        .map((b) => ({ action: b.dataset.action, id: b.dataset.id || null })),
    }));
    if (info.phase !== lastPhase) { phases.push(info.phase); lastPhase = info.phase; }

    // Scenario control, applied through the same state the game reads.
    if (info.phase === 'reveal' && cfg.deceivers && rolesForcedFor !== info.seriesGame) {
      rolesForcedFor = info.seriesGame;
      await page.evaluate((dec) => {
        state.players.forEach((p, i) => { p.role = dec.includes(i) ? 'deceiver' : 'loyal'; });
        state.initialDeceiverCount = dec.length;
      }, cfg.deceivers);
    }
    if (info.phase === 'main' && cfg.onMain && !forcedRounds.has(`${info.seriesGame}:${info.round}`)) {
      forcedRounds.add(`${info.seriesGame}:${info.round}`);
      await page.evaluate(cfg.onMain, { round: info.round });
    }

    if (info.overlay) {
      if (cfg.mode === 'patient') { await sleep(150); continue; }
      await page.click(info.winnerReveal ? '#skipWinnerReveal' : '#interstitialOverlay').catch(() => {});
      await sleep(30);
      continue;
    }
    if (info.phase === 'results') {
      reachedResults = true;
      if (cfg.mode === 'patient') await waitNarrationIdle(page, 30000);
      if (info.actions.some((a) => a.action === 'next-game-in-series')) {
        await mark('next-game');
        await page.click('.screen.active [data-action="next-game-in-series"]');
        continue;
      }
      if (cfg.playAgainAtEnd) {
        await mark('play-again');
        await page.click('.screen.active [data-action="play-again"]');
        await sleep(cfg.mode === 'patient' ? 4000 : 300);
      }
      break;
    }
    let cands = info.actions.filter((a) => !NEVER_CLICK.has(a.action));
    if (!cands.length) { await sleep(60); continue; } // computer turn / timers running
    const prefer = cfg.prefer || {};
    // Avoid endless re-selection loops: once something is selected, confirm.
    const confirms = cands.filter((a) => /^confirm-|^murder-veto|^choose-|^recruit-(join|refuse)$/.test(a.action));
    if (confirms.length && cands.some((a) => /^select-/.test(a.action)) && rng() < 0.6) cands = confirms;
    const weighted = [];
    cands.forEach((a) => { const w = prefer[a.action] != null ? prefer[a.action] : 1; for (let i = 0; i < w; i++) weighted.push(a); });
    if (!weighted.length) { await sleep(60); continue; }
    const pick = weighted[Math.floor(rng() * weighted.length)];
    if (cfg.mode === 'patient') await waitNarrationIdle(page, 30000);
    const sel = `.screen.active [data-action="${pick.action}"]${pick.id ? `[data-id="${pick.id}"]` : ''}`;
    await mark(`click:${pick.action}`);
    await page.click(sel).catch(() => {});
    await sleep(cfg.mode === 'patient' ? 120 : (cfg.stepMs || 60));
  }
  await sleep(cfg.mode === 'patient' ? 500 : 200);
  const result = await page.evaluate(() => ({ events: window.__ev, unhandled: window.__unhandled }));
  await context.close();
  return { name: cfg.name, cfg: { ...cfg, onMain: cfg.onMain ? String(cfg.onMain) : undefined }, reachedResults, steps, phases, marks, errors: errors.concat(result.unhandled.map((u) => `unhandledrejection: ${u}`)), events: result.events };
}

async function waitNarrationIdle(page, maxMs) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const busy = await page.evaluate(() => {
      const ev = window.__ev;
      const open = new Set();
      for (const e of ev) {
        if (e.type === 'narrate') open.add(e.d.generation);
        if (e.type === 'narrate-end') open.delete(e.d.generation);
      }
      return open.size > 0;
    });
    if (!busy) return;
    await sleep(100);
  }
}

module.exports = { runGame, startServer, ensureWavs, mulberry32, sleep, ROOT, OUT, CLIPS };

if (require.main === module) {
  require('./suite.cjs').main().catch((e) => { console.error(e); process.exit(1); });
}
