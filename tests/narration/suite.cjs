/* Test suite for the recorded narration. See harness.cjs for how to run. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');
const { runGame, startServer, ensureWavs, sleep, ROOT, OUT, CLIPS } = require('./harness.cjs');

const results = [];
function record(name, pass, detail) { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); }

function loadNarration() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'narration.js'), 'utf8');
  return new Function(`${src}; return NARRATION;`)();
}

function staticChecks() {
  const N = loadNarration();
  const keys = N.allClipKeys();
  const files = fs.readdirSync(CLIPS).filter((f) => f.endsWith('.m4a')).map((f) => f.replace('.m4a', '')).sort();
  record('manifest lists exactly 115 clips', keys.length === 115, `${keys.length}`);
  record('every manifest clip exists on disk and no extra files', JSON.stringify(keys.slice().sort()) === JSON.stringify(files), `${files.length} files`);
  record('no 16_C or 35_C anywhere', !files.includes('16_C') && !files.includes('35_C') && !keys.includes('16_C') && !keys.includes('35_C'));
  const used = new Set(); Object.values(N.POOLS).forEach((p) => p.forEach((l) => used.add(l)));
  const unused = []; for (let n = 1; n <= 39; n++) if (!used.has(n)) unused.push(n);
  record('pools reference only lines 1-39; unused lines are exactly 19, 28, 29', [...used].every((l) => l >= 1 && l <= 39) && JSON.stringify(unused) === '[19,28,29]', `unused ${JSON.stringify(unused)}`);
  const js = ['sound.js', 'main.js', 'ui.js', 'narration.js', 'engine.js'].map((f) => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n');
  record('no text-to-speech left in the game code', !/speechSynthesis|SpeechSynthesisUtterance/.test(js));
  // Audio format of every file
  let bad = [];
  let total = 0; let bytes = 0;
  for (const f of files) {
    const p = path.join(CLIPS, `${f}.m4a`);
    bytes += fs.statSync(p).size;
    const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,channels,sample_rate:format=duration', '-of', 'json', p], { encoding: 'utf8' });
    const j = JSON.parse(r.stdout); const s = j.streams[0];
    total += parseFloat(j.format.duration);
    if (s.codec_name !== 'aac' || s.channels !== 1 || s.sample_rate !== '48000') bad.push(f);
  }
  record('all clips are AAC mono 48 kHz', bad.length === 0, bad.length ? bad : `${Math.round(total)} s total, ${(bytes / 1e6).toFixed(1)} MB`);
  return { totalSeconds: total, bytes };
}

async function pickerChecks(browser, port) {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  const r = await page.evaluate(() => {
    Sound.setEnabled(true);
    const out = {};
    const pools = Object.keys(NARRATION.POOLS);
    for (const pool of pools) {
      const counts = {}; let repeats = 0; const last = {};
      for (let i = 0; i < 6000; i++) {
        const key = Sound._pickForTest(pool);
        counts[key] = (counts[key] || 0) + 1;
        const line = key.slice(0, 2);
        if (last[line] === key && NARRATION.TAKES[+line] > 1) repeats++;
        last[line] = key;
      }
      out[pool] = { counts, repeats };
    }
    Sound.setEnabled(false);
    return out;
  });
  await page.close();
  let ok = true; const notes = [];
  for (const [pool, { counts, repeats }] of Object.entries(r)) {
    const keys = Object.keys(counts);
    const N = loadNarration();
    const expected = [];
    N.POOLS[pool].forEach((l) => { for (let t = 0; t < N.TAKES[l]; t++) expected.push(N.clipKey(l, t)); });
    if (JSON.stringify(keys.sort()) !== JSON.stringify(expected.sort())) { ok = false; notes.push(`${pool}: keys ${keys}`); }
    if (repeats) { ok = false; notes.push(`${pool}: ${repeats} back-to-back repeats`); }
    // uniformity: each line equally likely; each take within a line roughly equal
    const perLine = {};
    for (const [k, c] of Object.entries(counts)) { const l = k.slice(0, 2); (perLine[l] = perLine[l] || []).push(c); }
    const lineTotals = Object.values(perLine).map((a) => a.reduce((x, y) => x + y, 0));
    const lt = 6000 / lineTotals.length;
    if (lineTotals.some((c) => Math.abs(c - lt) / lt > 0.08)) { ok = false; notes.push(`${pool}: line skew ${lineTotals}`); }
    Object.values(perLine).forEach((a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; if (a.some((c) => Math.abs(c - m) / m > 0.08)) { ok = false; notes.push(`${pool}: take skew ${a}`); } });
  }
  record('take picker: every take reachable, uniform within 8%, no back-to-back repeat, 16/35 A/B only (6,000 picks per pool)', ok, notes.length ? notes : `${Object.keys(r).length} pools`);
  return r;
}

/* ---------- event helpers ---------- */
const narrations = (g) => g.events.filter((e) => e.type === 'narrate');
const clipStarts = (g) => g.events.filter((e) => e.type === 'clip-start');
const fails = (g) => g.events.filter((e) => e.type === 'clip-failed');
const sfx = (g) => g.events.filter((e) => e.type === 'sfx');

function shapeOf(events, withClips) {
  return events.filter((e) => e.type === 'sfx' || e.type === 'narrate')
    .map((e) => (e.type === 'sfx' ? `sfx:${e.d.name}` : `voice:${e.d.pools.join('+')}${withClips ? '=' + e.d.clips.join('+') : ''}`));
}

/* Events from the last event before the game first enters startPhase,
   through the first sound/voice event of endPhase (inclusive) — by event
   index, not timestamp, so two events in the same millisecond can't make
   one run's window one event longer than the other's. endPhase null =
   to the end of the game. */
function segmentEvents(g, startPhase, endPhase) {
  const ev = g.events.filter((e) => e.type === 'sfx' || e.type === 'narrate');
  const s = ev.findIndex((e) => e.phase === startPhase);
  if (s < 0) return null;
  if (!endPhase) return ev.slice(Math.max(0, s - 1));
  const e = ev.findIndex((x, i) => i > s && x.phase === endPhase);
  return ev.slice(Math.max(0, s - 1), e < 0 ? ev.length : e + 1);
}

function gameChecks(g) {
  const problems = [];
  if (!g.reachedResults) problems.push('did not reach Results');
  if (g.errors.length) problems.push(...g.errors.slice(0, 5));
  const N = loadNarration();
  for (const n of narrations(g)) for (const p of n.d.pools) if (!N.POOLS[p]) problems.push(`unknown pool ${p}`);
  for (const c of clipStarts(g)) if (c.d.key === '16_C' || c.d.key === '35_C') problems.push(`played ${c.d.key}`);
  // no two clips audible at once: every clip-start must come after previous clip ended or was superseded
  return problems;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const meta = staticChecks();
  ensureWavs();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const wavServer = await startServer('wav');
  const port = wavServer.address().port;
  await pickerChecks(browser, port);

  /* ---------- 1. Full-game gate (fast play, every clip superseded quickly) ---------- */
  const gate = [
    { name: 'G1_3p_murder', players: 3, seed: 11 },
    { name: 'G2_4p_hidden', players: 4, seed: 12, knowledge: 'hidden' },
    { name: 'G3_5p_1bot', players: 5, seed: 13, bots: [2] },
    { name: 'G4_6p_2bot_vote', players: 6, seed: 14, bots: [1, 4], onMain: () => { state.currentFateCard = 'banishment'; } },
    { name: 'G5_7p_2deceiver', players: 7, seed: 15, deceivers: [1, 5] },
    { name: 'G6_7p_recruit_accept', players: 7, seed: 16, deceivers: [0, 3], prefer: { 'recruit-join': 50, 'recruit-refuse': 0 }, onMain: ({ round }) => { if (round === 1) { state.players[3].alive = false; } } },
    { name: 'G7_7p_recruit_refuse', players: 7, seed: 17, deceivers: [0, 3], prefer: { 'recruit-join': 0, 'recruit-refuse': 50 }, onMain: ({ round }) => { if (round === 1) { state.players[3].alive = false; } } },
    { name: 'G8_8p_bot_heavy', players: 8, seed: 18, bots: [0, 2, 3, 5, 6] },
    { name: 'G9_4p_series3', players: 4, seed: 19, series: 3, playAgainAtEnd: true },
    { name: 'G10_5p_series2_banishagain', players: 5, seed: 20, series: 2, prefer: { 'choose-banish-again': 6 } },
  ];
  const gateRuns = [];
  for (const cfg of gate) {
    const g = await runGame(browser, port, { mode: 'fast', ...cfg });
    gateRuns.push(g);
    const problems = gameChecks(g);
    const pools = [...new Set(narrations(g).flatMap((n) => n.d.pools))];
    record(`gate ${cfg.name}`, problems.length === 0, problems.length ? problems : `${g.phases.length} phase changes, ${narrations(g).length} narrations, pools: ${pools.join(',')}`);
  }
  const poolsSeen = new Set(gateRuns.flatMap((g) => narrations(g).flatMap((n) => n.d.pools)));
  const N = loadNarration();
  const missing = Object.keys(N.POOLS).filter((p) => !poolsSeen.has(p));
  record('gate exercised every narration pool', missing.length === 0, missing.length ? `missing: ${missing}` : `${poolsSeen.size} pools`);
  const handoffViolations = gateRuns.flatMap((g) => narrations(g).filter((n) => n.d.pools.includes('handoff') && n.d.pools.indexOf('handoff') !== n.d.pools.length - 1));
  record('hand-off line is always the last part of a sequence (never interrupts a phase line)', handoffViolations.length === 0);

  /* ---------- 2. Patient play: every requested line actually plays to the end ---------- */
  const patientCfgs = [
    { name: 'P1_5p_patient', players: 5, seed: 31, deceivers: [2], mode: 'patient', timeoutMs: 900000, playAgainAtEnd: true },
    { name: 'P2_7p_recruit_refuse_patient', players: 7, seed: 32, deceivers: [0, 3], mode: 'patient', timeoutMs: 900000, prefer: { 'recruit-join': 0, 'recruit-refuse': 50, 'choose-banish-again': 3 }, onMain: ({ round }) => { if (round === 1) { state.players[3].alive = false; } } },
  ];
  const patientRuns = [];
  for (const cfg of patientCfgs) {
    const g = await runGame(browser, port, cfg);
    patientRuns.push(g);
    const problems = gameChecks(g);
    const nar = narrations(g);
    const ends = g.events.filter((e) => e.type === 'narrate-end');
    const superseded = ends.filter((e) => e.d.superseded);
    const requested = nar.reduce((s, n) => s + n.d.clips.length, 0);
    const started = clipStarts(g).length;
    // Where a sequence was superseded, list what by
    const cut = superseded.map((e) => { const n = nar.find((x) => x.d.generation === e.d.generation); return n ? n.d.pools.join('+') : '?'; });
    // overlap check
    let overlap = 0; let live = null;
    for (const e of g.events) {
      if (e.type === 'clip-start') { if (live) overlap++; live = e.d.key; }
      if (e.type === 'clip-end') live = null;
    }
    record(`patient ${cfg.name}: all requested clips played, none overlapping`, problems.length === 0 && started === requested && overlap === 0,
      { problems, requested, started, failed: fails(g).length, superseded: cut, overlap, intro: nar[0] && nar[0].d.pools.join('+') });
  }

  /* ---------- 3. Failure modes ---------- */
  for (const mode of ['404', 'm4a']) {
    const srv = await startServer(mode);
    const g = await runGame(browser, srv.address().port, { name: `F_${mode}`, players: 5, seed: 41, mode: 'fast', prefer: {} , onMain: () => { state.currentFateCard = 'banishment'; } });
    srv.close();
    const problems = gameChecks(g);
    record(`failure mode "${mode}": game completes, vote still starts, no uncaught errors`, problems.length === 0 && g.phases.includes('vote') && clipStarts(g).length === 0,
      { problems, failedClips: fails(g).length, narrations: narrations(g).length });
  }
  {
    const g = await runGame(browser, port, { name: 'F_sound_off', players: 4, seed: 42, mode: 'fast', sound: false, onMain: () => { state.currentFateCard = 'banishment'; } });
    const audible = g.events.filter((e) => e.type !== 'narrate-end'); // narrate-end is the test logger noting "nothing to play"
    record('sound off: no sound effect, line or clip at all, vote still starts', gameChecks(g).length === 0 && audible.length === 0 && g.phases.includes('vote'), { audibleEvents: audible.length, loggerOnly: g.events.length - audible.length });
  }
  // mute mid-clip + voting callback with slow audio + supersede
  {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/index.html`);
    const r = await page.evaluate(async () => {
      const ev = []; Sound._onEvent((t, d) => ev.push({ t, d, at: performance.now() }));
      Sound.setEnabled(true);
      const out = {};
      // mute mid-clip
      await new Promise((res) => Sound.narrate(['intro2'], res));
      out.ignore = true;
      Sound.narrate(['intro2']);
      await new Promise((r) => setTimeout(r, 1500));
      const t0 = performance.now();
      Sound.setEnabled(false);
      await new Promise((r) => setTimeout(r, 400));
      const end = ev.filter((e) => e.t === 'clip-end' && e.at > t0)[0];
      out.muteStopMs = end ? Math.round(end.at - t0) : null;
      // voting callback fires once even if superseded mid-line
      Sound.setEnabled(true);
      let calls = 0;
      Sound.announceVotingBegins(() => { calls++; });
      await new Promise((r) => setTimeout(r, 600));
      Sound.narrate(['handoff']);
      await new Promise((r) => setTimeout(r, 300));
      out.votingCallsAfterSupersede = calls;
      // voting callback with sound off fires synchronously
      Sound.setEnabled(false); let c2 = 0; Sound.announceVotingBegins(() => { c2++; }); out.votingCallsSoundOff = c2;
      return out;
    });
    await page.close();
    record('mute mid-clip stops the voice within 200 ms', r.muteStopMs !== null && r.muteStopMs < 200, r);
    record('voting callback fires exactly once when its line is superseded, and immediately with sound off', r.votingCallsAfterSupersede === 1 && r.votingCallsSoundOff === 1, r);
  }

  /* ---------- 4. Matched pairs (only who holds which role differs) ---------- */
  const pairs = [
    { name: 'M1 3p single-decider murder', base: { players: 3, seed: 51, onMain: () => { state.currentFateCard = 'murder'; } }, a: { deceivers: [0] }, b: { deceivers: [2] }, seg: ['murder', 'elimination'] },
    { name: 'M2 7p two Deceivers (shortlist/narrow)', base: { players: 7, seed: 52, onMain: () => { state.currentFateCard = 'murder'; } }, a: { deceivers: [1, 4] }, b: { deceivers: [2, 6] }, seg: ['murder', 'elimination'] },
    { name: 'R1 recruit accept, different recruiter seat', base: { players: 7, seed: 53, prefer: { 'recruit-join': 50, 'recruit-refuse': 0 } }, a: { deceivers: [0, 3], onMain: ({ round }) => { if (round === 1) state.players[3].alive = false; } }, b: { deceivers: [5, 3], onMain: ({ round }) => { if (round === 1) state.players[3].alive = false; } }, seg: ['recruit', 'elimination'] },
    { name: 'R2 recruit accept vs refuse (same seats)', base: { players: 7, seed: 54, deceivers: [0, 3], onMain: ({ round }) => { if (round === 1) state.players[3].alive = false; } }, a: { prefer: { 'recruit-join': 50, 'recruit-refuse': 0 } }, b: { prefer: { 'recruit-join': 0, 'recruit-refuse': 50 } }, seg: ['recruit', 'elimination'] },
    // Round 1 is forced to a Quiet Night with one Loyal seat removed, so both runs reach the Final Circle (4 living) identically; only the Deceiver's seat differs.
    { name: 'F1 Final Circle ballot, Deceiver seat differs', base: { players: 5, seed: 55, prefer: { 'choose-banish-again': 1, 'choose-end-game': 3 }, onMain: ({ round }) => { if (round === 1) { state.currentFateCard = 'quiet-night'; state.players[4].alive = false; } } }, a: { deceivers: [0] }, b: { deceivers: [2] }, seg: ['finalCircleDecision', 'results'] },
  ];
  const pairOut = [];
  for (const p of pairs) {
    const A = await runGame(browser, port, { name: `${p.name} A`, mode: 'fast', stepMs: 80, ...p.base, ...p.a });
    const B = await runGame(browser, port, { name: `${p.name} B`, mode: 'fast', stepMs: 80, ...p.base, ...p.b });
    const sa = segmentEvents(A, p.seg[0], p.seg[1]); const sb = segmentEvents(B, p.seg[0], p.seg[1]);
    if (!sa || !sb) { record(`matched pair ${p.name}`, false, 'segment not reached'); continue; }
    const shapeA = shapeOf(sa, true); const shapeB = shapeOf(sb, true);
    const same = JSON.stringify(shapeA) === JSON.stringify(shapeB);
    pairOut.push({ name: p.name, same, eventsA: shapeA.length, eventsB: shapeB.length, shapeA, shapeB, errors: A.errors.concat(B.errors) });
    record(`matched pair ${p.name}: audio identical (sound effects, lines, takes, count)`, same && !A.errors.length && !B.errors.length, `${shapeA.length} vs ${shapeB.length} events`);
  }

  /* ---------- 5. Recruit round vs ordinary murder round ----------
     Same table (7 seats, one removed before round 1 so 6 remain), same
     seeds. Recruit: two Deceivers, one removed -> Recruit or Die fires.
     Ordinary: one Deceiver (no recruitment possible), Murder card forced.
     The round is compared from the "Begin Draw Phase" tap up to and
     including the Gather voice line — everything a listener hears before
     the public reveal (whose outcome is shown openly anyway). */
  {
    const kill3 = ({ round }) => { if (round === 1) state.players[3].alive = false; };
    const ordinaryMain = ({ round }) => { if (round === 1) { state.players[3].alive = false; state.currentFateCard = 'murder'; } };
    const roundEvents = (g) => {
      const start = g.marks.find((m) => m.label === 'click:begin-draw');
      if (!start) return null;
      const ev = g.events.filter((e) => (e.type === 'sfx' || e.type === 'narrate') && e.at >= start.at);
      const end = ev.findIndex((e) => e.type === 'narrate' && e.d.pools.includes('gather'));
      return end < 0 ? null : ev.slice(0, end + 1);
    };
    const variants = [
      { label: 'humans', extra: {} },
      { label: 'all computer seats', extra: { bots: [0, 1, 2, 3, 4, 5, 6] } },
    ];
    for (const v of variants) {
      const base = { players: 7, seed: 61, mode: 'fast', stepMs: 80, ...v.extra };
      const ord = await runGame(browser, port, { name: `S_ordinary_${v.label}`, ...base, deceivers: [0], onMain: ordinaryMain });
      const recRefuse = await runGame(browser, port, { name: `S_recruit_refuse_${v.label}`, ...base, deceivers: [0, 3], onMain: kill3, prefer: { 'recruit-join': 0, 'recruit-refuse': 50 } });
      const recAccept = await runGame(browser, port, { name: `S_recruit_accept_${v.label}`, ...base, deceivers: [0, 3], onMain: kill3, prefer: { 'recruit-join': 50, 'recruit-refuse': 0 } });
      const O = roundEvents(ord); const RR = roundEvents(recRefuse); const RA = roundEvents(recAccept);
      const isRecruit = (g) => g.phases.includes('recruit');
      const ok0 = O && RR && RA && !isRecruit(ord) && isRecruit(recRefuse) && isRecruit(recAccept);
      const so = ok0 ? shapeOf(O, true) : []; const sr = ok0 ? shapeOf(RR, true) : []; const sa = ok0 ? shapeOf(RA, true) : [];
      const same = ok0 && JSON.stringify(so) === JSON.stringify(sr) && JSON.stringify(so) === JSON.stringify(sa);
      const errs = ord.errors.concat(recRefuse.errors, recAccept.errors);
      record(`recruit round vs ordinary murder round (${v.label}): identical sounds, lines, takes and count — refuse and accept`, same && !errs.length,
        ok0 ? `${so.length} / ${sr.length} / ${sa.length} events` : 'scenario not reached');
      const entry = { name: `recruit-vs-ordinary (${v.label})`, ordinary: so, recruitRefuse: sr, recruitAccept: sa };
      if (v.label === 'all computer seats' && ok0) {
        // With no human taps inside the passes, every gap is game-driven.
        const gaps = (E) => E.slice(1).map((e, i) => e.at - E[i].at);
        const go = gaps(O); const gr = gaps(RR); const ga = gaps(RA);
        const worst = Math.max(...go.map((x, i) => Math.max(Math.abs(x - (gr[i] ?? 1e9)), Math.abs(x - (ga[i] ?? 1e9)))));
        const total = (E) => E[E.length - 1].at - E[0].at;
        entry.gapsMs = { ordinary: go, recruitRefuse: gr, recruitAccept: ga };
        record('recruit round vs ordinary murder round (all computer seats): same timing between every sound, within 250 ms', same && worst <= 250,
          `worst gap difference ${worst} ms; round length ${total(O)} / ${total(RR)} / ${total(RA)} ms`);
      }
      pairOut.push(entry);
    }
  }

  await browser.close();
  wavServer.close();

  const passed = results.filter((r) => r.pass).length;
  const summary = { when: new Date().toISOString(), passed, failed: results.length - passed, results, clipSeconds: Math.round(meta.totalSeconds), clipBytes: meta.bytes };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(summary, null, 1));
  fs.writeFileSync(path.join(OUT, 'matched_pairs.json'), JSON.stringify(pairOut, null, 1));
  fs.writeFileSync(path.join(OUT, 'gate_games.json'), JSON.stringify(gateRuns.concat(patientRuns).map((g) => ({ name: g.name, reachedResults: g.reachedResults, errors: g.errors, phases: g.phases, narrations: narrations(g).map((n) => ({ at: n.at, phase: n.phase, pools: n.d.pools, clips: n.d.clips })), clipStarts: clipStarts(g).length, clipFailures: fails(g).length })), null, 1));
  console.log(`\n${passed}/${results.length} passed`);
  if (passed !== results.length) process.exitCode = 1;
}

module.exports = { main };
