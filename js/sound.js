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

  /* Shared by every short host-style instruction below — cancels any
     previous still-speaking utterance first (a table moving quickly
     through turns could otherwise queue up a backlog of stale lines that
     play late/out of order), then speaks the new one. Fire-and-forget;
     nothing here waits on the result. */
  function announceInstruction(text) {
    if (!enabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      /* ignore */
    }
    speak(text);
  }

  /* Announces whose turn it is to hold the phone — called once for every
     per-player queue turn (Reveal, Draw, Vote, Final Circle decision).
     Deliberately just the player's own name, nothing else: it carries no
     role information, so naming whoever's turn it actually is leaks
     nothing even for the Murder queue's acting-Deceiver turn specifically
     — every living player's turn already gets this same announcement.
     Pass a falsy name (used for the Murder queue, and never for the
     Recruit-response hand-off — see main.js) to get a generic "next
     player" line instead of a name: Murder's queue already treats every
     turn as identical in screen and sound (see this file's header note),
     and a bare "next player" line matches that same ritual anonymity a
     touch better than naming each person in turn would, even though
     naming would still be technically safe there too. The Recruit-
     response hand-off is different in kind, not just in style — saying
     the recruit's real name aloud would be audible to the whole room even
     though the screen itself stays private, so main.js announces that
     one with its own fixed, non-identifying line instead of calling this
     function at all. */
  function announcePassDevice(name) {
    announceInstruction(name ? `Pass the phone to ${name}.` : 'Pass the phone to the next player.');
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

  return { setEnabled, play, setMusicEnabled, startMusic, stopMusic, announceVotingBegins, announcePassDevice, announceInstruction };
})();
