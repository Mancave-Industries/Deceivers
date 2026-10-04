/* ==========================================================================
   THE DECEIVERS — Sound
   A synthesized (WebAudio, no audio files) sound design matching the dark
   ceremonial theme: bell tolls, low drones, bright coin chimes, dark/bright
   resolving chords for the two endings. Entirely self-contained — main.js
   only ever calls Sound.setEnabled(bool), Sound.play(name),
   Sound.setMusicEnabled(bool), Sound.startMusic(), Sound.stopMusic(), and
   Sound.announceVotingBegins(onComplete).

   Anonymity note: during the Murder phase's per-player turn queue, the
   *same* device that's passed hand to hand plays these sounds out loud for
   the whole table to hear — not just the person holding it. So every turn
   in that queue (tap-murder-turn / confirm-murder-turn) must play an
   identical sound regardless of whether that player is the acting
   Deceiver, exactly mirroring the on-screen decoy. The distinctive
   "something happened" sounds only ever play once everyone is already
   gathered around for the reveal, where audibility is no longer a leak.

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

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function setEnabled(value) {
    enabled = !!value;
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

  /* ---------- Spoken line (Web Speech API — no audio files, same
     "no external assets" rule as the rest of this module; silently no-ops
     wherever speech synthesis isn't available). ---------- */

  // Common female-leaning voice names across Chrome/Android, Safari/iOS,
  // and Windows — the Web Speech API has no standard gender field, so this
  // is a best-effort name match; falls back to the platform default voice
  // (whatever that happens to be) if none of these are installed.
  const FEMALE_VOICE_PATTERN = /female|woman|samantha|victoria|karen|moira|tessa|fiona|zira|susan|allison|ava|serena|salli|joanna|ivy|kendra|kimberly|hazel|google us english female|google uk english female/i;

  // Platforms that ship multiple quality tiers of the same voice label them
  // this way (iOS/macOS "Enhanced"/"Premium" Siri voices, Android's
  // "Natural"/neural voices, Chrome's "Google" network voices) — these sound
  // markedly less robotic than the default compact/offline tier of the same
  // name, so prefer one of these over a plain female-name match when both
  // are available.
  const HIGH_QUALITY_VOICE_PATTERN = /enhanced|premium|natural|neural|google/i;

  function pickVoice(voices) {
    const female = voices.filter((v) => FEMALE_VOICE_PATTERN.test(v.name));
    const pool = female.length ? female : voices;
    return pool.find((v) => HIGH_QUALITY_VOICE_PATTERN.test(v.name)) || pool[0];
  }

  function speak(text, onEnd) {
    const finish = () => { if (onEnd) onEnd(); };
    if (!enabled || !('speechSynthesis' in window)) {
      finish();
      return;
    }
    try {
      const utter = new SpeechSynthesisUtterance(text);
      // Natural rate/pitch — no artificial pitch shift. A heavily slowed,
      // deepened, or pitch-bent voice came across as a flat robotic drone
      // rather than ominous; a real/enhanced voice at its own natural pitch
      // reads as ominous from the words and pacing alone.
      utter.rate = 0.94;
      utter.pitch = 1.0;
      utter.volume = 1;
      const voices = window.speechSynthesis.getVoices();
      const chosenVoice = pickVoice(voices);
      if (chosenVoice) utter.voice = chosenVoice;
      let done = false;
      const finishOnce = () => { if (!done) { done = true; finish(); } };
      utter.onend = finishOnce;
      utter.onerror = finishOnce;
      // Some platforms occasionally never fire onend — don't let that hang the game.
      setTimeout(finishOnce, 6000);
      window.speechSynthesis.speak(utter);
    } catch (e) {
      finish();
    }
  }

  /* The Open Discussion screen's closing beat: swell the drone (if music
     is on) to a peak, then speak the line, then call back once it's done
     so main.js can move on to the vote queue. If sound effects are off,
     resolves immediately with no sound at all — this is a flourish, never
     a thing the game waits on. */
  function announceVotingBegins(onComplete) {
    const done = () => { if (onComplete) onComplete(); };
    if (!enabled) { done(); return; }
    const riseSeconds = crescendoMusic(0.17, 0.9);
    if (riseSeconds > 0) {
      setTimeout(() => speak('The time for talk is over.', done), riseSeconds * 1000);
    } else {
      speak('The time for talk is over.', done);
    }
  }

  /* Announces whose turn it is to hold the phone — called once for every
     per-player queue turn (Reveal, Draw, Murder, Vote, Final Circle
     decision). Deliberately just the player's own name, nothing else: it
     carries no role information, so it's exactly as identical-every-turn
     as the Murder queue's anonymity rule already requires (see this
     file's header note) — every living player's turn gets this same
     announcement, naming whoever's turn it actually is, Deceiver or not.
     Cancels any previous still-speaking utterance first, since a table
     tapping through turns quickly could otherwise queue up a backlog of
     stale "pass to X" lines that would play late/out of order. */
  function announcePassDevice(name) {
    if (!enabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      /* ignore */
    }
    speak(`Pass the phone to ${name}.`);
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

  /* ---------- Named cues ---------- */

  const cues = {
    // Generic UI navigation click — quiet, brief, used everywhere that
    // doesn't have a more specific cue of its own.
    tap: () => envTone(1180, { type: 'sine', dur: 0.05, peak: 0.05, attack: 0.004 }),

    // Opening a private role card: a mysterious rising interval.
    reveal: () => chord([220, 293.66], { type: 'sine', dur: 0.16, peak: 0.13, stagger: 0.09, attack: 0.01 }),
    // Hiding it again / closing a private screen: the same interval falling.
    hide: () => chord([293.66, 220], { type: 'sine', dur: 0.14, peak: 0.1, stagger: 0.07, attack: 0.008 }),

    // Drawing a card: a light paper-flip tick.
    draw: () => {
      noiseBurst({ dur: 0.05, peak: 0.08, filterFreq: 2200, filterType: 'highpass' });
      envTone(329.63, { type: 'triangle', dur: 0.1, peak: 0.1, attack: 0.006, start: 0.02 });
    },
    // Gold landing in the Prize Pot: a bright ascending coin arpeggio.
    gold: () => {
      noiseBurst({ dur: 0.04, peak: 0.1, filterFreq: 3500, filterType: 'highpass' });
      chord([523.25, 659.25, 783.99], { type: 'triangle', dur: 0.14, peak: 0.11, stagger: 0.05, attack: 0.006 });
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
      osc.frequency.value = 110;
      lfo.type = 'sine';
      lfo.frequency.value = 4.5;
      lfoGain.gain.value = 3;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      lfo.start(t0);
      osc.stop(t0 + 1.6);
      lfo.stop(t0 + 1.6);
    },

    // The ceremonial ready-bell — reused for "Seal the Roles & Begin",
    // "Next Game", and the Elimination Reveal's "Gather Everyone" moment.
    gather: () => bellTone(293.66, { dur: 1.2, peak: 0.14 }),

    // Hand-off cue: plays every time the phone moves on to the next
    // player's turn inside a per-player queue (Reveal, Draw, Murder, Vote)
    // — a soft two-note "here, take it" tick, louder and more distinct than
    // the generic `tap` it replaces in those spots, but still identical
    // every time regardless of who's turn is next or what role they hold
    // (see the anonymity note at the top of this file — Murder's queue
    // depends on that).
    passDevice: () => chord([392, 329.63], { type: 'sine', dur: 0.1, peak: 0.08, stagger: 0.05, attack: 0.006 }),

    // A new round's Fate card is about to be drawn: a single clear rising
    // tone, brighter than `tap`, marking "Round N" as its own moment
    // instead of blending into the previous round's closing sound.
    roundBegin: () => envTone(349.23, { type: 'triangle', dur: 0.3, peak: 0.1, attack: 0.01, endFreq: 440 }),

    // Quiet Night outcome: soft, warm, relieved.
    quietNight: () => chord([440, 523.25], { type: 'sine', dur: 0.45, peak: 0.1, stagger: 0.09, attack: 0.02 }),
    // A Shield blocked the Murder: bright protective shimmer.
    shieldSaved: () => chord([523.25, 659.25, 783.99], { type: 'triangle', dur: 0.22, peak: 0.12, stagger: 0.055, attack: 0.008 }),
    // Someone was murdered: a dark descending tone under a soft thud.
    murdered: () => {
      noiseBurst({ dur: 0.14, peak: 0.16, filterFreq: 400, filterType: 'lowpass' });
      envTone(293.66, { type: 'triangle', dur: 0.9, peak: 0.13, endFreq: 146.83, attack: 0.01 });
    },

    // The vote was tied: a single flat, anticlimactic knock — no melody.
    tie: () => noiseBurst({ dur: 0.16, peak: 0.14, filterFreq: 260, filterType: 'lowpass' }),
    // Someone was banished: a sharper gavel-knock under a falling tone.
    banished: () => {
      noiseBurst({ dur: 0.1, peak: 0.24, filterFreq: 900, filterType: 'bandpass', filterQ: 2 });
      envTone(196, { type: 'sawtooth', dur: 0.4, peak: 0.1, endFreq: 130.81, attack: 0.008 });
    },

    // Endings: dark minor chord for the Deceivers, bright major for Loyal.
    deceiverWin: () => chord([110, 220, 261.63, 329.63], { type: 'sawtooth', dur: 1.4, peak: 0.09, stagger: 0.05, attack: 0.02 }),
    loyalWin: () => chord([220, 277.18, 329.63, 440], { type: 'triangle', dur: 1.3, peak: 0.1, stagger: 0.05, attack: 0.02 }),

    modalOpen: () => chord([440, 523.25], { type: 'sine', dur: 0.09, peak: 0.06, stagger: 0.045, attack: 0.006 }),
    modalClose: () => chord([523.25, 440], { type: 'sine', dur: 0.08, peak: 0.05, stagger: 0.04, attack: 0.006 }),
  };

  function play(name, delay = 0) {
    if (!enabled) return;
    const cue = cues[name];
    if (!cue) return;
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

  return { setEnabled, play, setMusicEnabled, startMusic, stopMusic, announceVotingBegins, announcePassDevice };
})();
