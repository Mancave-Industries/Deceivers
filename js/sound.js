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

  function startMusic() {
    if (!musicEnabled || musicState) return;
    try {
      const c = getCtx();
      const t0 = c.currentTime;

      const master = c.createGain();
      master.gain.setValueAtTime(0.0001, t0);
      master.gain.exponentialRampToValueAtTime(0.05, t0 + 3);
      master.connect(c.destination);

      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.Q.value = 0.6;
      filter.connect(master);

      // A low, somber open fifth + octave drone — quiet enough to sit
      // under table talk, not a melody to listen to.
      const droneFreqs = [73.42, 110, 146.83];
      const oscillators = droneFreqs.map((f, i) => {
        const osc = c.createOscillator();
        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.value = f;
        const g = c.createGain();
        g.gain.value = i === 0 ? 1 : 0.45;
        osc.connect(g).connect(filter);
        osc.start(t0);
        return osc;
      });

      // Slowly sweeping filter cutoff so the drone breathes instead of
      // sitting static.
      const lfo = c.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.06;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start(t0);

      musicState = { master, filter, nodes: [...oscillators, lfo] };
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
      const { master, nodes } = musicState;
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

  function speak(text, onEnd) {
    const finish = () => { if (onEnd) onEnd(); };
    if (!enabled || !('speechSynthesis' in window)) {
      finish();
      return;
    }
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.82;
      utter.pitch = 0.65;
      utter.volume = 1;
      const voices = window.speechSynthesis.getVoices();
      const deepVoice = voices.find((v) => /male|daniel|fred|alex|david/i.test(v.name));
      if (deepVoice) utter.voice = deepVoice;
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

  return { setEnabled, play, setMusicEnabled, startMusic, stopMusic, announceVotingBegins };
})();
