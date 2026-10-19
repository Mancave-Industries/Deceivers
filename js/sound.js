/* ==========================================================================
   THE DECEIVERS — Sound
   Sound effects and music are synthesized (WebAudio, no audio files) to
   match the dark ceremonial theme: bell tolls, low drones, coin chimes,
   dark/bright resolving chords for the two endings. Spoken narration is
   the one exception: prerecorded Mancaveman clips (see narration.js and
   "Recorded narration" below), played through the same WebAudio context.
   main.js calls Sound.setEnabled(bool), Sound.play(name),
   Sound.setMusicEnabled(bool), Sound.startMusic(), Sound.stopMusic(),
   Sound.narrate(pools), Sound.narrateIntro(release),
   Sound.announceVotingBegins(onComplete, isFinal) and
   Sound.preloadNarration().

   Anonymity note: during the Murder phase's per-player turn queue, the
   *same* device that's passed hand to hand plays these sounds out loud for
   the whole table to hear — not just the person holding it. So every turn
   in that queue (tap-murder-turn / confirm-murder-turn) must play an
   identical sound regardless of whether that player is the acting
   Deceiver, exactly mirroring the on-screen decoy. The distinctive
   "something happened" sounds only ever play once everyone is already
   gathered around for the reveal, where audibility is no longer a leak.

   This extends to COUNT, not just identity: picking a target (or a
   shortlist, or a narrowed candidate) plays no sound of its own in
   main.js — only the turn's opening tap and its closing confirm do. A
   turn with a real decision must produce exactly the same two audible
   events as a "Nothing To Do" turn; an extra click sound on the deciding
   turn would let a listener who can't see the screen simply count sounds
   to find the Deceiver (issue #2 follow-up). The same reasoning applies
   to the Recruit-or-Die queue's two full-table passes.

   Background music is a separate opt-in (off by default, its own Settings
   toggle) from the one-shot sound effects above: a quiet ambient drone
   loop, only ever played during the Open Discussion screen, where the
   phone sits untouched in the middle of the table while the group talks —
   the one moment in the game an ongoing music bed makes sense instead of
   competing with something the player is actively reading or deciding.
   ========================================================================== */

const Sound = (() => {
  let enabled = false;
  let musicEnabled = false;
  let musicState = null;
  let ctx = null;

  function getCtx(resume = true) {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    // iOS reports 'interrupted' after a call / lock screen, not 'suspended'.
    if (resume && (ctx.state === 'suspended' || ctx.state === 'interrupted')) {
      try {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {
        /* ignore */
      }
    }
    return ctx;
  }

  function setEnabled(value) {
    enabled = !!value;
    if (!enabled) stopNarration();
  }

  function setMusicEnabled(value) {
    musicEnabled = !!value;
    if (!musicEnabled) stopMusic();
  }

  /* ---------- Ambient discussion music ---------- */

  // A short, dark, descending chord loop (i – VII – VI – III in D minor)
  // instead of one static drone — the three voices glide from chord to
  // chord rather than re-triggering, so it reads as a slowly moving piece
  // of music, not a held note.
  const CHORD_PROGRESSION = [
    [146.83, 174.61, 220.00], // D minor
    [130.81, 164.81, 196.00], // C major
    [116.54, 146.83, 174.61], // Bb major
    [87.31, 110.00, 130.81], // F major
  ];
  const CHORD_HOLD_SECONDS = 5;
  const CHORD_GLIDE_SECONDS = 2.5;

  function startMusic() {
    if (!musicEnabled || musicState) return;
    try {
      const c = getCtx();
      const t0 = c.currentTime;

      const master = c.createGain();
      master.gain.setValueAtTime(0.0001, t0);
      master.gain.exponentialRampToValueAtTime(0.06, t0 + 3);
      master.connect(c.destination);

      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.Q.value = 0.6;
      filter.connect(master);

      const oscillators = CHORD_PROGRESSION[0].map((f, i) => {
        const osc = c.createOscillator();
        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(f, t0);
        const g = c.createGain();
        g.gain.value = i === 0 ? 1 : 0.5;
        osc.connect(g).connect(filter);
        osc.start(t0);
        return osc;
      });

      // Slowly sweeping filter cutoff so the pad breathes instead of
      // sitting static.
      const lfo = c.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.06;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start(t0);

      let chordIndex = 0;
      const advanceChord = () => {
        chordIndex = (chordIndex + 1) % CHORD_PROGRESSION.length;
        const chord = CHORD_PROGRESSION[chordIndex];
        const now = c.currentTime;
        oscillators.forEach((osc, i) => {
          osc.frequency.cancelScheduledValues(now);
          osc.frequency.setValueAtTime(osc.frequency.value, now);
          osc.frequency.linearRampToValueAtTime(chord[i], now + CHORD_GLIDE_SECONDS);
        });
      };
      const progressionTimer = setInterval(advanceChord, (CHORD_HOLD_SECONDS + CHORD_GLIDE_SECONDS) * 1000);

      musicState = { master, filter, nodes: [...oscillators, lfo], progressionTimer };
    } catch (e) {
      /* WebAudio unsupported or blocked — silently skip */
      musicState = null;
    }
  }

  function stopMusic() {
    if (!musicState) return;
    try {
      const c = getCtx();
      const t0 = c.currentTime;
      const { master, nodes, progressionTimer } = musicState;
      if (progressionTimer) clearInterval(progressionTimer);
      master.gain.cancelScheduledValues(t0);
      master.gain.setValueAtTime(master.gain.value, t0);
      master.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
      nodes.forEach((n) => n.stop(t0 + 1.5));
    } catch (e) {
      /* ignore */
    }
    musicState = null;
  }

  /* Swells the already-playing drone toward a peak and brightens its
     filter — the "something is about to happen" rise before a line is
     spoken. Returns the ramp's duration in seconds (0 if no music is
     playing), so the caller knows how long to wait before the next beat. */
  function crescendoMusic(peakGain = 0.17, dur = 0.9) {
    if (!musicState) return 0;
    try {
      const c = getCtx();
      const t0 = c.currentTime;
      const { master, filter } = musicState;
      master.gain.cancelScheduledValues(t0);
      master.gain.setValueAtTime(master.gain.value, t0);
      master.gain.exponentialRampToValueAtTime(peakGain, t0 + dur);
      filter.frequency.cancelScheduledValues(t0);
      filter.frequency.setValueAtTime(filter.frequency.value, t0);
      filter.frequency.linearRampToValueAtTime(2200, t0 + dur);
    } catch (e) {
      return 0;
    }
    return dur;
  }

  /* ---------- Recorded narration (the Mancaveman voice) ----------
     Every spoken line is a prerecorded clip (see narration.js) — no
     text-to-speech anywhere, and player names are never spoken: names stay
     on screen only. main.js asks for a *moment* (a named pool, e.g.
     'handoff' or 'gather'); this picks one line from that pool at random,
     then one recorded take of that line at random, never the same take of
     the same line twice in a row when another exists.

     Clips are decoded into the same WebAudio context the sound effects
     already use, rather than played through <audio> elements: iPhone
     Safari rejects <audio>.play() that isn't inside a tap, and several of
     these lines start from a timer (the Discuss clock, the end of an
     interstitial). Once a tap has unlocked the context, buffer playback
     from a timer is fine.

     Memory: all 115 decoded clips would be ~110 MB of PCM, too much for a
     phone. Compressed bytes (~7 MB) are fetched in the background after
     Start Game; buffers are decoded on demand and kept in a small LRU. The
     very next pick of each frequent pool is chosen and decoded ahead of
     time ("primed") so it starts instantly.

     Failure is always silent and never blocks the game: a clip that fails
     to fetch/decode, or isn't ready within CLIP_READY_TIMEOUT_MS, is
     skipped; a playing clip has a watchdog in case 'ended' never fires;
     every onEnd callback fires exactly once — including when a newer
     announcement supersedes it — so nothing waiting on a line (the vote
     queue, the opening hold) can hang.

     Secrecy: no pool, take, timing or count here depends on anyone's role.
     The random choice of take is the only variation. */

  const VOICE_GAIN = 1.0;
  const CLIP_READY_TIMEOUT_MS = 3000;
  const DECODED_LIMIT = 30;
  const FADE_OUT_SECONDS = 0.08;
  const PRIMED_POOLS = ['handoff', 'nightFalls', 'gather', 'votingBegins'];

  let random = Math.random;
  const lastTake = {};
  const bytesCache = new Map();
  const decodedCache = new Map();
  const primed = {};
  let narrationGeneration = 0;
  let currentVoice = null;
  let preloadStarted = false;
  const listeners = [];

  function emit(type, data) {
    for (let i = 0; i < listeners.length; i++) {
      try { listeners[i](type, data || {}); } catch (e) { /* ignore */ }
    }
  }

  function fetchClip(key) {
    if (!bytesCache.has(key)) {
      const p = fetch(NARRATION.clipUrl(key)).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      });
      p.catch(() => bytesCache.delete(key)); // allow a later retry
      bytesCache.set(key, p);
    }
    return bytesCache.get(key);
  }

  function decodeClip(key) {
    if (decodedCache.has(key)) {
      const b = decodedCache.get(key);
      decodedCache.delete(key);
      decodedCache.set(key, b); // most-recently-used to the back
      return Promise.resolve(b);
    }
    return fetchClip(key).then((buf) => new Promise((resolve, reject) => {
      let settled = false;
      const ok = (b) => { if (!settled) { settled = true; resolve(b); } };
      const fail = (e) => { if (!settled) { settled = true; reject(e || new Error('decode failed')); } };
      try {
        // slice(): decodeAudioData detaches its input; keep the cached bytes reusable.
        const p = getCtx(false).decodeAudioData(buf.slice(0), ok, fail);
        if (p && typeof p.then === 'function') p.then(ok, fail);
      } catch (e) {
        fail(e);
      }
    })).then((b) => {
      decodedCache.set(key, b);
      while (decodedCache.size > DECODED_LIMIT) decodedCache.delete(decodedCache.keys().next().value);
      return b;
    });
  }

  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('not ready in time')), ms);
      promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  }

  function chooseTake(line) {
    const n = NARRATION.TAKES[line] || 0;
    const options = [];
    for (let t = 0; t < n; t++) if (n === 1 || t !== lastTake[line]) options.push(t);
    return options.length ? options[Math.floor(random() * options.length)] : -1;
  }

  function pickFresh(poolName) {
    const pool = NARRATION.POOLS[poolName];
    if (!pool || !pool.length) return null;
    const line = pool[Math.floor(random() * pool.length)];
    const take = chooseTake(line);
    if (take < 0) return null;
    return { pool: poolName, line, take, key: NARRATION.clipKey(line, take) };
  }

  function choose(poolName) {
    const c = primed[poolName];
    if (c) {
      delete primed[poolName];
      // The same line may have played via another pool since this was primed.
      if ((NARRATION.TAKES[c.line] || 0) > 1 && c.take === lastTake[c.line]) {
        const take = chooseTake(c.line);
        return { pool: poolName, line: c.line, take, key: NARRATION.clipKey(c.line, take) };
      }
      return c;
    }
    return pickFresh(poolName);
  }

  function prime(poolName) {
    if (!enabled || primed[poolName]) return;
    const c = pickFresh(poolName);
    if (!c) return;
    primed[poolName] = c;
    decodeClip(c.key).catch(() => {});
  }

  /* Fetches every clip's compressed bytes in the background, most
     frequently heard first, three at a time. Idempotent. */
  function preloadNarration() {
    if (!enabled || preloadStarted || typeof fetch !== 'function') return;
    preloadStarted = true;
    PRIMED_POOLS.forEach(prime);
    const first = [];
    PRIMED_POOLS.forEach((p) => NARRATION.POOLS[p].forEach((line) => {
      for (let t = 0; t < NARRATION.TAKES[line]; t++) first.push(NARRATION.clipKey(line, t));
    }));
    const rest = NARRATION.allClipKeys().filter((k) => first.indexOf(k) === -1);
    const queue = first.concat(rest);
    let active = 0;
    const pump = () => {
      while (active < 3 && queue.length) {
        active++;
        fetchClip(queue.shift()).catch(() => {}).then(() => { active--; pump(); });
      }
    };
    pump();
  }

  function stopVoice() {
    if (!currentVoice) return;
    const { src, gain } = currentVoice;
    currentVoice = null;
    try {
      const t = getCtx(false).currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0.0001, t + FADE_OUT_SECONDS);
      src.stop(t + FADE_OUT_SECONDS + 0.01);
    } catch (e) {
      try { src.stop(); } catch (e2) { /* already stopped */ }
    }
  }

  function stopNarration() {
    narrationGeneration++;
    stopVoice();
  }

  function playBuffer(buffer, choice, generation, done) {
    let ended = false;
    let watchdog = null;
    let src = null;
    const end = () => {
      if (ended) return;
      ended = true;
      clearTimeout(watchdog);
      if (currentVoice && currentVoice.src === src) currentVoice = null;
      emit('clip-end', { key: choice.key, generation });
      done();
    };
    try {
      const c = getCtx();
      src = c.createBufferSource();
      src.buffer = buffer;
      const gain = c.createGain();
      gain.gain.value = VOICE_GAIN;
      src.connect(gain).connect(c.destination);
      src.onended = end;
      currentVoice = { src, gain };
      lastTake[choice.line] = choice.take;
      src.start();
      emit('clip-start', { key: choice.key, line: choice.line, take: 'ABC'[choice.take], pool: choice.pool, duration: buffer.duration, generation });
      watchdog = setTimeout(end, (buffer.duration + 1.5) * 1000);
    } catch (e) {
      emit('clip-failed', { key: choice.key, error: String((e && e.message) || e) });
      end();
    }
  }

  /* Speaks one line from each named pool, in order, with a short pause
     between them. Supersedes (fades out) anything already speaking.
     onEnd fires exactly once: when the last line ends, when every line
     failed, when sound is off, or when a newer announcement replaces
     this one. opts.delay (seconds) holds the first line back — e.g. to
     let a sound effect land first. */
  function narrate(poolNames, onEnd, opts = {}) {
    const generation = ++narrationGeneration;
    stopVoice();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      emit('narrate-end', { generation, superseded: generation !== narrationGeneration });
      if (onEnd) { try { onEnd(); } catch (e) { /* ignore */ } }
    };
    if (!enabled || !poolNames || !poolNames.length) { finish(); return; }
    const choices = poolNames.map(choose).filter(Boolean);
    choices.forEach((c) => decodeClip(c.key).catch(() => {}));
    emit('narrate', { generation, pools: poolNames.slice(), clips: choices.map((c) => c.key) });
    setTimeout(() => poolNames.forEach((p) => { if (PRIMED_POOLS.indexOf(p) !== -1) prime(p); }), 0);
    const gapMs = opts.gapMs != null ? opts.gapMs : 350;
    let i = 0;
    const next = () => {
      if (generation !== narrationGeneration || !enabled || i >= choices.length) { finish(); return; }
      const choice = choices[i++];
      withTimeout(decodeClip(choice.key), CLIP_READY_TIMEOUT_MS).then((buffer) => {
        if (generation !== narrationGeneration || !enabled) { finish(); return; }
        playBuffer(buffer, choice, generation, () => setTimeout(next, i < choices.length ? gapMs : 0));
      }, (err) => {
        emit('clip-failed', { key: choice.key, error: String((err && err.message) || err) });
        next();
      });
    };
    setTimeout(next, Math.max(0, (opts.delay || 0) * 1000));
  }

  /* The opening: lines 01-03 back to back, called while the Reveal
     interstitial is held on screen (see main.js render / ui.js
     showInterstitial) so it plays before anyone sees a private role.
     release() fires when it's done, failed, skipped, or sound is off. */
  function narrateIntro(release) {
    narrate(['intro1', 'intro2', 'intro3'], release, { gapMs: 600 });
  }

  /* The Open Discussion screen's closing beat: swell the drone (if music
     is on), then the line, then call back so main.js can start the vote.
     isFinal (a Final Circle "Banish Again" vote) uses line 25 instead of
     15-17. If sound is off, resolves immediately. A hard ceiling makes
     sure the vote always starts even if audio misbehaves in some way the
     per-clip guards above don't catch. */
  const VOTING_MAX_SECONDS = 12;
  function announceVotingBegins(onComplete, isFinal) {
    let called = false;
    const done = () => { if (!called) { called = true; if (onComplete) onComplete(); } };
    if (!enabled) { done(); return; }
    const riseSeconds = crescendoMusic(0.17, 0.9);
    narrate([isFinal ? 'finalVotingBegins' : 'votingBegins'], done, { delay: riseSeconds });
    setTimeout(done, (riseSeconds + VOTING_MAX_SECONDS) * 1000);
  }

  /* ---------- Primitives ---------- */

  function envTone(freq, { type = 'sine', start = 0, dur = 0.18, peak = 0.16, attack = 0.012, endFreq = null } = {}) {
    const c = getCtx();
    const t0 = c.currentTime + start;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /* Two slightly-detuned oscillators for a warmer/bell-like beating tone. */
  function bellTone(freq, { start = 0, dur = 1.1, peak = 0.15 } = {}) {
    const c = getCtx();
    const t0 = c.currentTime + start;
    [1, 1.006, 2.003].forEach((mult, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * mult, t0);
      const p = peak * (i === 2 ? 0.25 : 1);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(p, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    });
  }

  function noiseBurst({ start = 0, dur = 0.12, peak = 0.22, filterFreq = 800, filterType = 'lowpass', filterQ = 1 } = {}) {
    const c = getCtx();
    const t0 = c.currentTime + start;
    const bufferSize = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = filterQ;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function chord(freqs, opts = {}) {
    freqs.forEach((f, i) => envTone(f, { ...opts, start: (opts.start || 0) + i * (opts.stagger || 0) }));
  }

  /* A physical, dry impact — a sub-sine "body" under a short lowpassed
     noise "knock". The weighty, non-musical backbone for anything meant
     to land like a real object striking a surface (a gavel, a card
     slapped down, a door) rather than ring like an instrument. */
  function thud(freq, { start = 0, dur = 0.3, peak = 0.2, noiseFreq = 500 } = {}) {
    noiseBurst({ start, dur: Math.min(dur, 0.1), peak: peak * 0.9, filterFreq: noiseFreq, filterType: 'lowpass', filterQ: 0.8 });
    envTone(freq, { type: 'sine', start, dur, peak, attack: 0.004, endFreq: freq * 0.6 });
  }

  /* A short wooden knock — tight bandpass noise around a low-mid
     resonance, sharp attack, fast decay. No tonal/melodic content at all,
     which is the point: a dry, physical click rather than a digital
     "beep," for anything standing in for a hand, a card, or a phone
     touching a surface. */
  function woodKnock({ start = 0, dur = 0.07, peak = 0.14, freq = 320 } = {}) {
    noiseBurst({ start, dur, peak, filterFreq: freq, filterType: 'bandpass', filterQ: 2.5 });
  }

  /* A brief metallic ring — high-Q bandpass noise with a longer, ringing
     decay than woodKnock. Used sparingly (coin, shield, bell strike) —
     the one place a little brightness is earned, since actual metal
     really does ring like this. */
  function metalRing({ start = 0, dur = 0.3, peak = 0.14, freq = 2400 } = {}) {
    const c = getCtx();
    const t0 = c.currentTime + start;
    const bufferSize = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 9;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /* ---------- Named cues ----------
     Redesigned for a darker, more restrained, more physical palette —
     muted wood/metal impacts and low tones rather than bright melodic
     synth arpeggios. A few deliberate, weighty sounds rather than many
     small bright ones; the biggest moments (Murder, Banishment, the two
     endings) get the most room, everything else stays dry and brief. */

  const cues = {
    // Generic UI navigation click — a dry, near-silent wooden tap, not a
    // digital beep.
    tap: () => woodKnock({ dur: 0.045, peak: 0.07, freq: 500 }),

    // Opening a private role card: a low card-slide (filtered noise sweep)
    // under a single low tone, rising slightly — physical, not chimey.
    reveal: () => {
      noiseBurst({ dur: 0.1, peak: 0.07, filterFreq: 1400, filterType: 'bandpass', filterQ: 0.9 });
      envTone(130.81, { type: 'sine', dur: 0.22, peak: 0.1, attack: 0.02, endFreq: 174.61 });
    },
    // Hiding it again / closing a private screen: the same gesture, falling.
    hide: () => {
      noiseBurst({ dur: 0.09, peak: 0.06, filterFreq: 1100, filterType: 'bandpass', filterQ: 0.9 });
      envTone(164.81, { type: 'sine', dur: 0.18, peak: 0.08, attack: 0.015, endFreq: 116.54 });
    },

    // Drawing a card: a dry paper-flick with a muted wooden tick under it
    // — a real card hitting a real table, not a synth blip.
    draw: () => {
      noiseBurst({ dur: 0.05, peak: 0.09, filterFreq: 2000, filterType: 'highpass' });
      woodKnock({ start: 0.03, dur: 0.05, peak: 0.08, freq: 260 });
    },
    // Gold landing in the Prize Pot: a single muted coin-drop — one short
    // metallic ring over a soft low thud, not an ascending arpeggio.
    gold: () => {
      metalRing({ dur: 0.22, peak: 0.1, freq: 2600 });
      thud(98, { start: 0.02, dur: 0.16, peak: 0.09, noiseFreq: 300 });
    },

    // Night falls: a low ominous drone swelling in and fading out.
    nightFalls: () => {
      const c = getCtx();
      const t0 = c.currentTime;
      const osc = c.createOscillator();
      const lfo = c.createOscillator();
      const lfoGain = c.createGain();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = 98;
      lfo.type = 'sine';
      lfo.frequency.value = 4;
      lfoGain.gain.value = 2.5;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.7);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      lfo.start(t0);
      osc.stop(t0 + 1.8);
      lfo.stop(t0 + 1.8);
    },

    // The ceremonial ready-bell — reused for "Seal the Roles & Begin",
    // "Next Game", and the Elimination Reveal's "Gather Everyone" moment.
    // A real bell's strike is noisy before it rings, so a brief knock
    // leads the tonal body in in now, instead of a pure, clean chime.
    gather: () => {
      noiseBurst({ dur: 0.05, peak: 0.1, filterFreq: 1800, filterType: 'bandpass', filterQ: 1.5 });
      bellTone(246.94, { start: 0.015, dur: 1.3, peak: 0.13 });
    },

    // Hand-off cue: plays every time the phone moves on to the next
    // player's turn inside a per-player queue (Reveal, Draw, Murder, Vote)
    // — a soft double wooden knock, like setting the phone down and
    // picking it back up, louder and more distinct than the generic `tap`
    // it replaces in those spots, but still identical every time
    // regardless of who's turn is next or what role they hold (see the
    // anonymity note at the top of this file — Murder's queue depends on
    // that).
    passDevice: () => {
      woodKnock({ dur: 0.06, peak: 0.1, freq: 340 });
      woodKnock({ start: 0.09, dur: 0.06, peak: 0.08, freq: 280 });
    },

    // A new round begins: a single low tone, rising slightly — restrained,
    // marking "Round N" as its own moment without the previous round's
    // closing sound bleeding into it, but no brighter than it needs to be.
    roundBegin: () => envTone(130.81, { type: 'sine', dur: 0.32, peak: 0.09, attack: 0.015, endFreq: 164.81 }),

    // Quiet Night outcome: a soft, low exhale — relief, not a chime.
    quietNight: () => {
      noiseBurst({ dur: 0.5, peak: 0.045, filterFreq: 700, filterType: 'lowpass', filterQ: 0.6 });
      envTone(196, { type: 'sine', dur: 0.5, peak: 0.07, attack: 0.05 });
    },
    // A Shield blocked the Murder: a brighter metallic ring (earned
    // brightness — this is the one moment something protective and
    // slightly magical is allowed to shimmer) over a low grounding tone.
    shieldSaved: () => {
      metalRing({ dur: 0.35, peak: 0.13, freq: 3200 });
      envTone(196, { type: 'sine', dur: 0.3, peak: 0.08, attack: 0.01 });
    },
    // Someone was murdered: a weighty physical impact under a dark,
    // descending low tone — the strongest, darkest cue in the game short
    // of the Deceiver ending.
    murdered: () => {
      thud(110, { dur: 0.35, peak: 0.22, noiseFreq: 350 });
      envTone(220, { type: 'sine', dur: 1.1, peak: 0.14, endFreq: 98, attack: 0.015, start: 0.04 });
    },

    // The vote was tied: a single flat, anticlimactic wooden knock — no
    // melody, nothing resolves.
    tie: () => woodKnock({ dur: 0.15, peak: 0.13, freq: 220 }),
    // Someone was banished: a sharp gavel-strike (wood, not metal) under
    // a low falling tone — no sawtooth buzz.
    banished: () => {
      woodKnock({ dur: 0.08, peak: 0.22, freq: 380 });
      envTone(164.81, { type: 'sine', dur: 0.55, peak: 0.12, endFreq: 92.5, attack: 0.008, start: 0.02 });
    },

    // Endings: the two heaviest, longest cues in the game. The Deceivers'
    // win is a dark, dissonant, slow-swelling drone with a heavy impact
    // under it — dread, not a jingle. The Loyal's win is warmer and
    // resolves cleanly, but still a slow swell, not a bright arpeggio.
    deceiverWin: () => {
      thud(73.42, { dur: 0.5, peak: 0.2, noiseFreq: 250 });
      chord([73.42, 87.31, 138.59], { type: 'sawtooth', dur: 2.2, peak: 0.06, stagger: 0.18, attack: 0.35 });
    },
    loyalWin: () => {
      noiseBurst({ dur: 0.3, peak: 0.06, filterFreq: 1200, filterType: 'bandpass', filterQ: 0.8 });
      chord([130.81, 164.81, 196], { type: 'sine', dur: 1.8, peak: 0.09, stagger: 0.15, attack: 0.25 });
    },

    modalOpen: () => woodKnock({ dur: 0.05, peak: 0.07, freq: 700 }),
    modalClose: () => woodKnock({ dur: 0.05, peak: 0.06, freq: 500 }),
  };

  function play(name, delay = 0) {
    if (!enabled) return;
    const cue = cues[name];
    if (!cue) return;
    emit('sfx', { name, delay });
    try {
      if (delay > 0) {
        setTimeout(() => { try { cue(); } catch (e) { /* ignore */ } }, delay * 1000);
      } else {
        cue();
      }
    } catch (e) {
      /* WebAudio unsupported or blocked — silently skip */
    }
  }

  return {
    setEnabled, play, setMusicEnabled, startMusic, stopMusic,
    narrate, narrateIntro, announceVotingBegins, stopNarration, preloadNarration,
    // Test hooks only (tests/narration): observe audio events, seed picks.
    _onEvent: (fn) => listeners.push(fn),
    _setRandom: (fn) => { random = fn; },
    _pickForTest: (pool) => { const c = choose(pool); if (c) lastTake[c.line] = c.take; return c ? c.key : null; },
  };
})();
