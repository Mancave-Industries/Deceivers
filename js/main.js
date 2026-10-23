/* ==========================================================================
   THE DECEIVERS — Bootstrap, router, event wiring
   ========================================================================== */

/* Always boot to the Title screen; a saved in-progress game is only resumed
   when the player explicitly taps Continue (see 'continue-game' action). */
let state = createInitialState();

/* Bumped every time `state` itself is replaced (new-game, continue-game,
   play-again, reset-game) -- never on an in-place mutation of the same
   object. A callback that spans a real-world delay (the Discuss timer's
   voting-begins announcement is the one case long enough to matter) reads
   `state` by closing over this outer binding, not a snapshot, so if the
   game gets reset or restarted mid-announcement it would otherwise act on
   whatever fresh game now sits in that variable. beginVotingSequence
   captures the epoch before waiting and checks it's unchanged before
   touching state. */
let gameEpoch = 0;

/* Ephemeral UI-only sequencing (pass-device ceremony, in-progress selections).
   None of this is game data — it resets on each screen visit and is never
   persisted to localStorage. */
const uiStage = {
  revealTapped: false,
  drawTapped: false,
  murderTapped: false,
  murderTarget: null,
  murderShortlist: [],
  useChoice: false,
  voteTapped: false,
  voteSelected: null,
  useDagger: false,
  eliminationRevealed: false,
  votingAnnounced: false,
  discussSecondsLeft: 0,
  finalCircleTapped: false,
  recruitTapped: false,
  recruitTarget: null,
  // Recruit pass: the turn's middle step is done, showing the hand screen.
  recruitConfirmed: false,
  // Between the two Recruit passes: showing the public Night screen, exactly
  // as an ordinary murder round does between its Draw and Murder passes.
  recruitNight: false,
  recruitResponseTapped: false,
  recruitJoinConfirmed: false,
  // Which response the "You Are Now A Deceiver" confirmation screen is
  // for -- 'join' (an ordinary accept) or 'swap' (a played Deceiver's
  // Choice). Both land the player in the exact same post-confirm state,
  // so one screen covers both; this says which one to actually record
  // when they tap through it.
  recruitPendingResponse: 'join',
};

/* Set by an action handler right before calling render() to request a
   brief fullscreen interstitial (see ui.js's showInterstitial) ahead of
   the next screen. Checked first thing in render(), below — intentionally
   NOT part of uiStage/state, since it's a one-shot request, not
   persistent UI state to track across renders. */
let interstitialPending = null;

/* Tracked separately from state.phase so render() can tell a genuine
   phase change from a same-phase re-render. A stale narration line (a
   winner announcement, a vote beat) belongs to the phase it started in --
   once we've moved to a new one, anything still sounding is cut off
   immediately, before an interstitial or anything else can let it keep
   playing underneath screens it no longer applies to (issue: winner
   announcements bleeding into the next game's Draw phase). */
let lastRenderedPhase = null;

// settings.audio: 'off' | 'partial' | 'full'. 'off' disables Sound
// entirely (effects and narration alike); 'partial'/'full' both leave
// effects on and only change which narration pools are allowed to speak
// (see narration.js's ESSENTIAL_POOLS and sound.js's narrationLevel).
function applyAudioSettings(audioLevel) {
  Sound.setEnabled(audioLevel !== 'off');
  Sound.setNarrationLevel(audioLevel);
}

applyAudioSettings(state.settings.audio);
Sound.setMusicEnabled(state.settings.music);

let setupNames = Array(CONFIG.minPlayers).fill('');
let setupIsComputer = Array(CONFIG.minPlayers).fill(false);
let seriesLength = 1;
let setupDeceiverKnowledge = 'known';

/* Computer seats never wait for a tap: this pauses briefly, then resolves
   their turn with the same bot logic no matter which seat holds the secret
   Deceiver role, and re-renders. Guarded so a phase change mid-render can't
   schedule a second overlapping timer for the same turn. */
const COMPUTER_TURN_DELAY_MS = 700;
let computerTurnTimer = null;

const QUEUE_PHASES = [PHASES.REVEAL, PHASES.DRAW, PHASES.MURDER, PHASES.VOTE, PHASES.FINAL_BANISHMENT, PHASES.FINAL_CIRCLE_DECISION, PHASES.RECRUIT, PHASES.RECRUIT_RESPONSE];

function cancelComputerTurnTimer() {
  if (computerTurnTimer !== null) {
    clearTimeout(computerTurnTimer);
    computerTurnTimer = null;
  }
}

function autoAdvanceComputerTurns() {
  if (!QUEUE_PHASES.includes(state.phase)) return false;
  const player = currentQueuePlayer(state);
  if (!player || !player.isComputer) return false;

  UI.renderComputerTurn(state, player);
  if (computerTurnTimer !== null) return true;
  computerTurnTimer = setTimeout(() => {
    computerTurnTimer = null;
    resolveComputerTurn();
    persist();
    render();
  }, COMPUTER_TURN_DELAY_MS);
  return true;
}

/* Recorded narration (see sound.js / narration.js). Each render collects
   what should be spoken for the screen it's showing, in order, and hands
   it to Sound.narrate as ONE sequence — phase-arrival lines first, then
   the hand-off line for a human queue turn. Every line fires once per
   arrival, tracked by the flags below (reset the moment the game leaves
   that screen-state), so repeat renders of the same still-current screen
   never repeat it.

   Hand-offs are always the generic "next player" lines (05-08), in every
   queue — no player name is ever spoken; names stay on screen. Nothing
   chosen here depends on anyone's secret role. */
let lastAnnouncedTurn = null;
let nightAnnounced = false;
let gatherAnnounced = false;
let discussAnnounced = false;
let finalDecisionAnnounced = false;
let resultsAnnounced = false;
let gameBeginsAnnouncedFor = null;
let finalCircleIntroducedFor = null;
let murdersThisGame = 0;
// Set by start-game: holds the Reveal interstitial on screen while the
// opening lines (01-03) play, before anyone sees a private role.
let introPending = false;

function resetNarrationTracking() {
  lastAnnouncedTurn = null;
  nightAnnounced = false;
  gatherAnnounced = false;
  discussAnnounced = false;
  finalDecisionAnnounced = false;
  resultsAnnounced = false;
  gameBeginsAnnouncedFor = null;
  finalCircleIntroducedFor = null;
  murdersThisGame = 0;
}

function collectPhaseNarration() {
  const parts = [];
  const phase = state.phase;

  // Round 1's board, once per game: "Let the game begin."
  if (phase === PHASES.MAIN && state.round === 1 && gameBeginsAnnouncedFor !== state.seriesGame) {
    gameBeginsAnnouncedFor = state.seriesGame;
    parts.push('gameBegins');
  }

  // The Night screen — shown both in an ordinary murder round and, looking
  // and sounding identical, between the two Recruit-or-Die passes.
  if (phase === PHASES.NIGHT || (phase === PHASES.RECRUIT_RESPONSE && uiStage.recruitNight)) {
    if (!nightAnnounced) { nightAnnounced = true; parts.push('nightFalls'); }
  } else {
    nightAnnounced = false;
  }

  if (phase === PHASES.ELIMINATION && !uiStage.eliminationRevealed) {
    if (!gatherAnnounced) { gatherAnnounced = true; parts.push('gather'); }
  } else {
    gatherAnnounced = false;
  }

  if (phase === PHASES.DISCUSS) {
    if (!discussAnnounced && !uiStage.votingAnnounced) {
      discussAnnounced = true;
      parts.push(state.finalBanishmentActive ? 'banishAgain' : 'discussion');
    }
  } else {
    discussAnnounced = false;
  }

  if (phase === PHASES.FINAL_CIRCLE_DECISION) {
    if (!finalDecisionAnnounced) {
      finalDecisionAnnounced = true;
      if (finalCircleIntroducedFor !== state.seriesGame) {
        finalCircleIntroducedFor = state.seriesGame;
        parts.push('finalCircle');
      }
      parts.push('finalDecision');
    }
  } else {
    finalDecisionAnnounced = false;
  }

  if (phase === PHASES.RESULTS) {
    if (!resultsAnnounced) {
      resultsAnnounced = true;
      parts.push('endLeadIn');
      parts.push(state.winner === ROLES.DECEIVER.id ? 'deceiverWin' : 'loyalWin');
      if (state.seriesGame >= state.seriesLength) parts.push('seriesClosing');
    }
  } else {
    resultsAnnounced = false;
  }

  return parts;
}

/* The hand-off line for a human queue turn (computer turns never reach
   this — autoAdvanceComputerTurns returns early for those). Keyed on
   phase+player so a repeat render of the same turn doesn't repeat it. */
function collectHandoffNarration() {
  if (!QUEUE_PHASES.includes(state.phase)) {
    lastAnnouncedTurn = null;
    return [];
  }
  const player = currentQueuePlayer(state);
  if (!player) return [];
  const key = `${state.phase}:${player.id}`;
  if (key === lastAnnouncedTurn) return [];
  lastAnnouncedTurn = key;
  return ['handoff'];
}

/* The outcome line for the Elimination Reveal, chosen purely from the
   public outcome the card flip is about to show. */
function revealNarrationPool() {
  const context = state.eliminationContext;
  if (context === 'quiet') return 'quietNight';
  if (context === 'night') {
    if (state.nightResult.protected) return 'shieldSaved';
    const pool = murdersThisGame > 0 ? 'murderLater' : 'murderFirst';
    murdersThisGame += 1;
    return pool;
  }
  const tied = state.voteResult.tie || !state.voteResult.banishedId;
  return tied ? 'tie' : 'banished';
}

/* Open Discussion runs on a clock — 30 seconds per living player — instead
   of a tap-when-ready button, so the table can't accidentally skip past it
   before anyone's actually talked. Ticks once a second; at zero it moves
   straight into the crescendo/voice-line/vote-queue sequence with no tap
   required. */
let discussTimerId = null;

function cancelDiscussTimer() {
  if (discussTimerId !== null) {
    clearInterval(discussTimerId);
    discussTimerId = null;
  }
}

function startDiscussTimer() {
  cancelDiscussTimer();
  uiStage.discussSecondsLeft = 30 * livingPlayers(state).length;
  discussTimerId = setInterval(() => {
    uiStage.discussSecondsLeft -= 1;
    if (uiStage.discussSecondsLeft <= 0) {
      cancelDiscussTimer();
      beginVotingSequence();
    } else {
      render();
    }
  }, 1000);
}

/* Crescendo (if music is on) -> spoken line (if sound is on) -> actually
   move to the vote queue. Triggered only by the Discuss timer reaching
   zero (see startDiscussTimer) — there's no button for this anymore. */
function beginVotingSequence() {
  // Guard: the clock and the "vote now" button can't both start it.
  if (uiStage.votingAnnounced) return;
  uiStage.votingAnnounced = true;
  render();
  const epoch = gameEpoch;
  const isFinal = state.finalBanishmentActive;
  Sound.announceVotingBegins(() => {
    // The announcement spans a real delay (narration, or the hard
    // ceiling if it's superseded/muted) -- if the game was reset or
    // restarted in the meantime, `state` by now refers to a different
    // game than the one this sequence was announcing for. Stale: do
    // nothing rather than force that fresh game into a vote it never
    // asked for.
    if (epoch !== gameEpoch) return;
    Sound.stopMusic();
    beginVotePhase(state, isFinal);
    uiStage.votingAnnounced = false;
    uiStage.voteTapped = false;
    uiStage.voteSelected = null;
    uiStage.useDagger = false;
    persist();
    render();
  }, isFinal);
}

/* Shared by the choose-end-game / choose-banish-again action handlers —
   records the current player's secret choice, advances the queue, and
   either hands the phone on or (once everyone's decided) resolves the
   round via resolveFinalCircleDecision, same pattern as the Murder/Vote
   queues' confirm handlers. */
function handleFinalCircleDecision(decision) {
  const player = currentQueuePlayer(state);
  if (!player) return;
  recordFinalCircleDecision(state, player.id, decision);
  uiStage.finalCircleTapped = false;
  const done = advanceFinalCircleQueue(state);
  if (!done) {
    Sound.play('passDevice');
    persist();
    render();
    return;
  }
  const nextPhase = resolveFinalCircleDecision(state);
  if (nextPhase === PHASES.RESULTS) {
    Sound.play(state.winner === ROLES.DECEIVER.id ? 'deceiverWin' : 'loyalWin', 0.3);
    Analytics.gameFinished();
    interstitialPending = state.winner === ROLES.DECEIVER.id ? 'deceiver-win' : 'loyal-win';
  } else if (nextPhase === PHASES.DISCUSS) {
    Sound.play('gather');
    interstitialPending = 'banish-again';
  }
  persist();
  render();
}

function resolveComputerTurn() {
  switch (state.phase) {
    case PHASES.REVEAL:
      confirmRevealCurrent(state);
      break;
    case PHASES.DRAW: {
      const player = currentQueuePlayer(state);
      drawFortuneCard(state, player.id);
      const done = finishDrawForCurrent(state);
      if (done) {
        routeAfterDraw(state);
        uiStage.eliminationRevealed = false;
        uiStage.votingAnnounced = false;
        if (state.phase === PHASES.NIGHT) { Sound.play('nightFalls'); interstitialPending = 'night-falls'; }
        else if (state.phase === PHASES.ELIMINATION) Sound.play('quietNight');
        else if (state.phase === PHASES.DISCUSS) { Sound.play('gather'); Sound.startMusic(); startDiscussTimer(); interstitialPending = 'banishment'; }
      }
      break;
    }
    case PHASES.MURDER: {
      // Same advanceMurderQueue() call at the end regardless of role or
      // step — only a living Deceiver whose turn the current step actually
      // is records anything first, exactly matching the human action
      // handlers (see currentMurderStep, engine.js).
      const step = currentMurderStep(state);
      if (step === 'single') {
        const targetId = botPickMurderTarget(state);
        const useChoice = botShouldUseDeceiversChoice(state);
        if (targetId) recordMurderTarget(state, targetId, useChoice);
      } else if (step === 'shortlist') {
        recordMurderShortlist(state, botPickMurderShortlist(state));
      } else if (step === 'narrow' || step === 'narrow-final') {
        const targetId = botPickFromMurderShortlist(state);
        const useChoice = step === 'narrow-final' ? botShouldUseDeceiversChoice(state) : false;
        if (targetId) recordMurderTarget(state, targetId, useChoice);
      } else if (step === 'veto') {
        const decision = botChooseMurderVeto();
        const useChoice = decision === 'kill' ? botShouldUseDeceiversChoice(state) : false;
        recordMurderVeto(state, decision, useChoice);
      }
      advanceMurderQueue(state);
      uiStage.eliminationRevealed = false;
      break;
    }
    case PHASES.VOTE:
    case PHASES.FINAL_BANISHMENT: {
      const voter = currentQueuePlayer(state);
      const targetId = botPickVoteTarget(state, voter.id);
      const useDagger = botShouldUseDagger(state, voter.id);
      const done = castVote(state, voter.id, targetId, useDagger);
      if (done) {
        resolveBanishment(state);
        uiStage.eliminationRevealed = false;
      }
      break;
    }
    case PHASES.RECRUIT: {
      // Same advanceRecruitQueue() call at the end regardless of role —
      // only the recruiting Deceiver's turn actually records anything
      // first, exactly matching the human action handler (see
      // currentRecruitStep, engine.js) and Murder's identical pattern
      // above.
      if (currentRecruitStep(state) === 'offer') {
        const targetId = botPickRecruitTarget(state);
        if (targetId) recordRecruitTarget(state, targetId);
      }
      // End of the first pass looks and sounds exactly like the end of an
      // ordinary round's Draw pass going into a murder night (secrecy fix).
      if (advanceRecruitQueue(state)) {
        Sound.play('nightFalls');
        interstitialPending = 'night-falls';
        uiStage.recruitNight = true;
      }
      break;
    }
    case PHASES.RECRUIT_RESPONSE: {
      if (currentRecruitResponseStep(state) === 'response') {
        recordRecruitResponse(state, botChooseRecruitResponse(state));
      }
      const done = advanceRecruitResponseQueue(state);
      if (done) uiStage.eliminationRevealed = false;
      break;
    }
    case PHASES.FINAL_CIRCLE_DECISION: {
      const player = currentQueuePlayer(state);
      recordFinalCircleDecision(state, player.id, botChooseFinalCircleDecision());
      const done = advanceFinalCircleQueue(state);
      if (done) {
        const nextPhase = resolveFinalCircleDecision(state);
        if (nextPhase === PHASES.DISCUSS) {
          Sound.play('gather');
          Sound.startMusic();
          startDiscussTimer();
          interstitialPending = 'banish-again';
        } else if (nextPhase === PHASES.RESULTS) {
          Sound.play(state.winner === ROLES.DECEIVER.id ? 'deceiverWin' : 'loyalWin', 0.3);
          Analytics.gameFinished();
          interstitialPending = state.winner === ROLES.DECEIVER.id ? 'deceiver-win' : 'loyal-win';
        }
      }
      break;
    }
    default:
      break;
  }
}

function showScreen(phaseName) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const target = document.getElementById(`screen-${phaseName}`);
  if (target) target.classList.add('active');
}

function render() {
  if (state.phase !== lastRenderedPhase) {
    Sound.stopNarration();
    lastRenderedPhase = state.phase;
  }
  if (interstitialPending) {
    const key = interstitialPending;
    interstitialPending = null;
    if (key === 'final-two') {
      const resultState = state;
      UI.showWinnerReveal(state, () => {
        if (state === resultState && state.phase === PHASES.RESULTS) render();
      });
      return;
    }
    const hold = key === 'reveal' && introPending ? Sound.narrateIntro : null;
    introPending = false;
    UI.showInterstitial(key, render, hold);
    return;
  }

  // Recruit or Die's mid-round Night screen (see uiStage.recruitNight):
  // the public Night screen an ordinary murder round shows, waiting on the
  // same "Begin The Night" tap. Shown before any computer turn can run.
  if (state.phase === PHASES.RECRUIT_RESPONSE && uiStage.recruitNight) {
    showScreen(PHASES.NIGHT);
    UI.updateHeader(state);
    document.getElementById('phaseLabel').textContent = PHASE_LABELS[PHASES.NIGHT];
    const nightNarration = collectPhaseNarration();
    if (nightNarration.length) Sound.narrate(nightNarration);
    UI.renderNight(state, cardDefById('murder'));
    return;
  }

  showScreen(state.phase);
  UI.updateHeader(state);

  const phaseNarration = collectPhaseNarration();
  if (autoAdvanceComputerTurns()) {
    if (phaseNarration.length) Sound.narrate(phaseNarration);
    return;
  }
  const narration = phaseNarration.concat(collectHandoffNarration());
  if (narration.length) Sound.narrate(narration);

  switch (state.phase) {
    case PHASES.TITLE:
      UI.renderTitle(hasSavedGame());
      break;
    case PHASES.SETUP:
      UI.renderSetup(setupNames, seriesLength, setupIsComputer, setupDeceiverKnowledge);
      break;
    case PHASES.REVEAL:
      UI.renderReveal(state, uiStage.revealTapped);
      break;
    case PHASES.MAIN:
      if (!state.currentFateCard) startRound(state);
      UI.renderMain(state);
      break;
    case PHASES.DRAW:
      UI.renderDraw(state, uiStage.drawTapped);
      break;
    case PHASES.HAND:
      UI.renderHand(state);
      break;
    case PHASES.NIGHT:
      UI.renderNight(state);
      break;
    case PHASES.MURDER:
      UI.renderMurder(state, uiStage.murderTapped, uiStage.murderTarget, uiStage.useChoice, uiStage.murderShortlist);
      break;
    case PHASES.DISCUSS:
      UI.renderDiscuss(state, uiStage.votingAnnounced, uiStage.discussSecondsLeft);
      break;
    case PHASES.VOTE:
    case PHASES.FINAL_BANISHMENT:
      UI.renderVote(state, uiStage.voteTapped, uiStage.voteSelected, uiStage.useDagger);
      break;
    case PHASES.ELIMINATION:
      UI.renderElimination(state, uiStage.eliminationRevealed);
      break;
    case PHASES.RECRUIT:
      UI.renderRecruit(state, uiStage.recruitTapped, uiStage.recruitTarget, uiStage.recruitConfirmed);
      break;
    case PHASES.RECRUIT_RESPONSE:
      UI.renderRecruitResponse(state, uiStage.recruitResponseTapped, uiStage.recruitJoinConfirmed, uiStage.recruitPendingResponse);
      break;
    case PHASES.FINAL_CIRCLE_DECISION:
      UI.renderFinalCircleDecision(state, uiStage.finalCircleTapped);
      break;
    case PHASES.RESULTS:
      UI.renderResults(state);
      break;
    default:
      break;
  }
}

function persist() {
  saveState(state);
}

/* Called from ui.js checkbox listeners (kept as plain globals — no module system). */
function main_onToggleDeceiversChoice(checked) {
  uiStage.useChoice = checked;
}
function main_onToggleDagger(checked) {
  uiStage.useDagger = checked;
}

/* Wordle-style share text for the Results screen. Spoiler-free: an
   aggregate headline (which side won) and a few bare numbers, never who
   held which role or what happened to them -- the "Every Role Revealed"
   list above it is for the table in the room, not for a social post. */
function buildShareResultText(state) {
  const deceiversWon = state.winner === ROLES.DECEIVER.id;
  const headline = deceiversWon ? 'THE DECEIVERS BEAT ME!' : 'I BEAT THE DECEIVERS!';
  const survivors = livingPlayers(state).length;
  const resultLine = `${state.players.length} played. ${survivors} survived to the end, after ${state.round} round${state.round === 1 ? '' : 's'} of lies.`;
  return `${headline}\n\n${resultLine}\n\nPlay this... IT'S MURDER!!!\n${CONFIG.gameShareUrl}`;
}

/* ---------- Action handlers ---------- */

const actions = {
  'replay-winner-reveal': () => {
    if (state.phase !== PHASES.RESULTS || livingPlayers(state).length !== 2) return;
    const resultState = state;
    UI.showWinnerReveal(state, () => {
      if (state !== resultState || state.phase !== PHASES.RESULTS) return;
      Sound.narrate(['endLeadIn', state.winner === ROLES.DECEIVER.id ? 'deceiverWin' : 'loyalWin']);
    });
  },
  'new-game': () => {
    UI.hideWinnerReveal();
    Sound.play('tap');
    cancelComputerTurnTimer();
    cancelDiscussTimer();
    Sound.stopMusic();
    gameEpoch++;
    const settings = { ...state.settings };
    state = createInitialState();
    state.settings = settings;
    resetNarrationTracking();
    setupNames = Array(CONFIG.minPlayers).fill('');
    setupIsComputer = Array(CONFIG.minPlayers).fill(false);
    seriesLength = 1;
    setupDeceiverKnowledge = 'known';
    state.phase = PHASES.SETUP;
    render();
  },
  'continue-game': () => {
    Sound.play('tap');
    cancelComputerTurnTimer();
    cancelDiscussTimer();
    Sound.stopMusic();
    const saved = loadState();
    if (saved) {
      gameEpoch++;
      state = saved;
      resetNarrationTracking();
      applyAudioSettings(state.settings.audio);
      Sound.preloadNarration();
      Sound.setMusicEnabled(state.settings.music);
      document.getElementById('soundBtn').classList.toggle('muted', state.settings.audio === 'off');
      if (state.phase === PHASES.DISCUSS) { Sound.startMusic(); startDiscussTimer(); }
    }
    render();
  },
  'open-help': () => {
    Sound.play('modalOpen');
    UI.showModal('How To Play', UI.helpContent());
  },
  // The Title screen's approved artwork bakes its own menu/sound icons
  // into the image, so the real header icons are hidden there (see
  // UI.updateHeader) and these invisible hotspots sit over the printed
  // graphics instead -- forwarding to the real buttons' own click
  // handlers rather than duplicating their logic.
  'title-open-settings': () => { document.getElementById('menuBtn').click(); },
  'title-toggle-sound': () => { document.getElementById('soundBtn').click(); },
  'add-player': () => {
    Sound.play('tap');
    if (setupNames.length < CONFIG.maxPlayers) {
      setupNames.push('');
      setupIsComputer.push(false);
    }
    UI.renderSetup(setupNames, seriesLength, setupIsComputer, setupDeceiverKnowledge);
  },
  'remove-player': (btn) => {
    Sound.play('tap');
    const i = Number(btn.dataset.index);
    setupNames.splice(i, 1);
    setupIsComputer.splice(i, 1);
    UI.renderSetup(setupNames, seriesLength, setupIsComputer, setupDeceiverKnowledge);
  },
  'set-seat-mode': (btn) => {
    Sound.play('tap');
    const i = Number(btn.dataset.index);
    setupIsComputer[i] = btn.dataset.mode === 'computer';
    UI.renderSetup(setupNames, seriesLength, setupIsComputer, setupDeceiverKnowledge);
  },
  'inc-series-length': () => {
    Sound.play('tap');
    seriesLength = Math.min(20, seriesLength + 1);
    UI.renderSetup(setupNames, seriesLength, setupIsComputer, setupDeceiverKnowledge);
  },
  'dec-series-length': () => {
    Sound.play('tap');
    seriesLength = Math.max(1, seriesLength - 1);
    UI.renderSetup(setupNames, seriesLength, setupIsComputer, setupDeceiverKnowledge);
  },
  'set-deceiver-knowledge': (btn) => {
    Sound.play('tap');
    setupDeceiverKnowledge = btn.dataset.mode === 'hidden' ? 'hidden' : 'known';
    UI.renderSetup(setupNames, seriesLength, setupIsComputer, setupDeceiverKnowledge);
  },
  'set-audio-level': (btn) => {
    const mode = btn.dataset.mode;
    state.settings.audio = mode === 'off' || mode === 'full' ? mode : 'partial';
    applyAudioSettings(state.settings.audio);
    document.getElementById('soundBtn').classList.toggle('muted', state.settings.audio === 'off');
    if (state.settings.audio !== 'off') {
      Sound.play('tap');
      if (state.phase !== PHASES.TITLE && state.phase !== PHASES.SETUP) Sound.preloadNarration();
    }
    persist();
    UI.showModal('Settings', UI.settingsContent(state));
  },
  'start-game': () => {
    if (!setupNames.every((n) => n.trim().length > 0)) return;
    Sound.play('gather');
    startNewSeries(state, setupNames, seriesLength, setupIsComputer, setupDeceiverKnowledge);
    Analytics.gameStarted();
    resetNarrationTracking();
    Sound.preloadNarration();
    uiStage.revealTapped = false;
    interstitialPending = 'reveal';
    introPending = true;
    persist();
    render();
  },
  'tap-reveal': () => {
    uiStage.revealTapped = true;
    Sound.play('reveal');
    render();
  },
  'confirm-reveal': () => {
    Sound.play('hide');
    confirmRevealCurrent(state);
    uiStage.revealTapped = false;
    persist();
    render();
  },
  'begin-draw': () => {
    // Looks identical regardless of which branch fires — see engine.js's
    // "Recruit or Die" section and startRound's comment for why nothing
    // here or on screen hints that this round is anything but ordinary.
    // interstitialPending is set unconditionally, before the branch, for
    // the same reason — a "Draw" card has to appear every single round
    // regardless of which branch secretly fires, or its absence on the
    // Recruit round would itself be a tell.
    Sound.play('tap');
    interstitialPending = 'draw';
    if (shouldTriggerRecruitment(state)) {
      beginRecruitment(state);
      uiStage.recruitTapped = false;
      uiStage.recruitTarget = null;
    } else {
      beginDrawPhase(state);
      uiStage.drawTapped = false;
    }
    persist();
    render();
  },
  'begin-final-circle': () => {
    Sound.play('tap');
    const nextPhase = beginFinalCircleDecision(state);
    uiStage.finalCircleTapped = false;
    if (nextPhase === PHASES.RESULTS) {
      // Entering the Final Circle already at 2 living players -- no
      // ballot to hold, Final Two concludes it on the spot. Can happen
      // when an ordinary (pre-Final-Circle) round drops straight to 2,
      // e.g. a 1-Deceiver/1-Loyal Quiet Night.
      Sound.play(state.winner === ROLES.DECEIVER.id ? 'deceiverWin' : 'loyalWin', 0.3);
      Analytics.gameFinished();
      interstitialPending = 'final-two';
    } else {
      interstitialPending = 'final-circle';
    }
    persist();
    render();
  },
  'tap-draw': () => {
    const player = currentQueuePlayer(state);
    const result = drawFortuneCard(state, player.id);
    state.lastDrawResult = result;
    uiStage.drawTapped = true;
    // Always the plain card sound, gold or not (secrecy fix): a Recruit
    // round's first pass stands in for a Draw pass but draws nothing, so a
    // coin chime on ~60% of real draws would let the table hear the
    // difference. The gold still shows on the drawer's screen and the pot.
    Sound.play('draw');
    persist();
    render();
    if (result.wentToPot) UI.showToast(`+${result.def.value} gold to the Prize Pot`);
  },
  'confirm-draw': () => {
    Sound.play('tap');
    state.phase = PHASES.HAND;
    render();
  },
  'continue-from-hand': () => {
    state.phase = PHASES.DRAW;
    uiStage.drawTapped = false;
    const done = finishDrawForCurrent(state);
    if (done) {
      routeAfterDraw(state);
      uiStage.eliminationRevealed = false;
      uiStage.votingAnnounced = false;
      if (state.phase === PHASES.NIGHT) { Sound.play('nightFalls'); interstitialPending = 'night-falls'; }
      else if (state.phase === PHASES.ELIMINATION) Sound.play('quietNight');
      else if (state.phase === PHASES.DISCUSS) { Sound.play('gather'); Sound.startMusic(); startDiscussTimer(); interstitialPending = 'banishment'; }
    } else {
      // Still more players in the Draw queue — hand the phone on.
      Sound.play('passDevice');
    }
    persist();
    render();
  },
  'proceed-to-murder': () => {
    if (state.phase === PHASES.RECRUIT_RESPONSE && uiStage.recruitNight) {
      // Recruit round: same tap and Murder card as an ordinary night, then
      // the second (response) pass.
      Sound.play('tap');
      uiStage.recruitNight = false;
      uiStage.recruitResponseTapped = false;
      uiStage.recruitJoinConfirmed = false;
      interstitialPending = 'murder';
      render();
      return;
    }
    Sound.play('tap');
    beginMurderPhase(state);
    uiStage.murderTapped = false;
    uiStage.murderTarget = null;
    uiStage.murderShortlist = [];
    uiStage.useChoice = false;
    interstitialPending = 'murder';
    render();
  },
  'begin-vote-now': () => {
    // Lets the table end discussion early instead of waiting out the full
    // clock — the clock stays the default so voting is never skipped
    // before it even starts, but a table that's genuinely done talking
    // shouldn't have to sit through dead air.
    cancelDiscussTimer();
    beginVotingSequence();
  },
  'tap-murder-turn': () => {
    // Same sound every turn regardless of role — see sound.js header note.
    uiStage.murderTapped = true;
    Sound.play('tap');
    render();
  },
  'select-murder-target': (btn) => {
    // Deliberately silent (see sound.js's header note): a nothing-to-do
    // turn plays exactly 'tap' (My Turn) then 'passDevice'/'gather'
    // (confirm) -- so this turn, the one with a real decision, must play
    // the identical two sounds and no more. Playing 'tap' here too would
    // make the deciding turn audibly countable against every other turn,
    // the exact side channel this silence closes (issue #2 follow-up).
    uiStage.murderTarget = btn.dataset.id;
    render();
  },
  'confirm-murder-turn': () => {
    if (currentMurderStep(state) === 'single') {
      if (!uiStage.murderTarget) return;
      recordMurderTarget(state, uiStage.murderTarget, uiStage.useChoice);
    }
    uiStage.murderTapped = false;
    uiStage.murderTarget = null;
    uiStage.useChoice = false;
    const done = advanceMurderQueue(state);
    uiStage.eliminationRevealed = false;
    // Same sound every turn regardless of role or whether the queue just
    // finished — see sound.js header note; `gather` is exactly as
    // role-blind as `passDevice` was, so the anonymity guarantee holds.
    Sound.play(done ? 'gather' : 'passDevice');
    persist();
    render();
  },
  'select-murder-shortlist-target': (btn) => {
    // Silent for the same reason as select-murder-target, above -- a
    // shortlist pick (up to two taps) must not sound different from a
    // single pick or no pick at all.
    const id = btn.dataset.id;
    const list = uiStage.murderShortlist;
    if (list.includes(id)) {
      uiStage.murderShortlist = list.filter((x) => x !== id);
    } else if (list.length < 2) {
      uiStage.murderShortlist = [...list, id];
    }
    // A third tap while two are already selected is simply ignored —
    // untap one first, same pattern as every other confirm-gated picker
    // in this game.
    render();
  },
  'confirm-murder-shortlist': () => {
    if (uiStage.murderShortlist.length !== 2) return;
    recordMurderShortlist(state, uiStage.murderShortlist);
    uiStage.murderTapped = false;
    uiStage.murderShortlist = [];
    // The shortlist step never resolves the round itself — there's always
    // at least one more living Deceiver still to act (narrow or
    // narrow-final) — but still advances the physical queue to them.
    advanceMurderQueue(state);
    uiStage.eliminationRevealed = false;
    Sound.play('passDevice');
    persist();
    render();
  },
  'select-murder-narrow-target': (btn) => {
    // Silent for the same reason as select-murder-target, above.
    uiStage.murderTarget = btn.dataset.id;
    render();
  },
  'confirm-murder-narrow': () => {
    if (!uiStage.murderTarget) return;
    recordMurderTarget(state, uiStage.murderTarget, uiStage.useChoice);
    uiStage.murderTapped = false;
    uiStage.murderTarget = null;
    uiStage.useChoice = false;
    const done = advanceMurderQueue(state);
    uiStage.eliminationRevealed = false;
    Sound.play(done ? 'gather' : 'passDevice');
    persist();
    render();
  },
  'murder-veto-kill': () => {
    recordMurderVeto(state, 'kill', uiStage.useChoice);
    uiStage.murderTapped = false;
    uiStage.useChoice = false;
    const done = advanceMurderQueue(state);
    uiStage.eliminationRevealed = false;
    Sound.play(done ? 'gather' : 'passDevice');
    persist();
    render();
  },
  'murder-veto-save': () => {
    recordMurderVeto(state, 'save', false);
    uiStage.murderTapped = false;
    uiStage.useChoice = false;
    const done = advanceMurderQueue(state);
    uiStage.eliminationRevealed = false;
    Sound.play(done ? 'gather' : 'passDevice');
    persist();
    render();
  },
  'tap-recruit': () => {
    // Same tap for every living player's turn during the Recruit queue
    // pass, whether they're the recruiting Deceiver or not — identical to
    // tap-murder-turn.
    // Plays the Draw pass's card sound: this pass stands in for a Draw pass,
    // turn for turn — card sound, tap, pass-on knock (secrecy fix).
    uiStage.recruitTapped = true;
    Sound.play('draw');
    render();
  },
  'select-recruit-target': (btn) => {
    // Deliberately silent, exactly like select-murder-target: the
    // recruiter's real turn must make the same two sounds (open tap,
    // closing confirm) as every "Nothing To Do" turn in this pass, or a
    // listener could count sounds to find the last Deceiver (secrecy fix).
    uiStage.recruitTarget = btn.dataset.id;
    render();
  },
  'confirm-recruit-turn': () => {
    // Used by BOTH the recruiting Deceiver's real turn and every other
    // living player's "Nothing To Do" turn. Like Draw's "Continue To My
    // Hand": a tap, then the player's own hand screen (recruit-pass-on).
    if (currentRecruitStep(state) === 'offer') {
      if (!uiStage.recruitTarget) return;
      recordRecruitTarget(state, uiStage.recruitTarget);
    }
    uiStage.recruitConfirmed = true;
    Sound.play('tap');
    render();
  },
  'recruit-pass-on': () => {
    // Like Draw's "Done — Pass The Phone": the pass-on knock, or — after
    // the last turn — the Night Falls cue, card and screen an ordinary
    // murder round gets (secrecy fix). Hand-off voice comes from render().
    uiStage.recruitTapped = false;
    uiStage.recruitTarget = null;
    uiStage.recruitConfirmed = false;
    uiStage.recruitResponseTapped = false;
    uiStage.recruitJoinConfirmed = false;
    const passDone = advanceRecruitQueue(state);
    if (passDone) {
      Sound.play('nightFalls');
      interstitialPending = 'night-falls';
      uiStage.recruitNight = true;
    } else {
      Sound.play('passDevice');
    }
    persist();
    render();
  },
  'tap-recruit-response': () => {
    // Same tap for every living player's turn during the Recruit Response
    // queue pass, whether they're the chosen target or not.
    uiStage.recruitResponseTapped = true;
    Sound.play('tap');
    render();
  },
  'confirm-recruit-response-turn': () => {
    // The "Nothing To Do" continue for every living player except the
    // chosen target during the Recruit Response queue pass — identical
    // pattern to confirm-murder-turn's "nothing to do" branch.
    uiStage.recruitResponseTapped = false;
    const done = advanceRecruitResponseQueue(state);
    if (done) uiStage.eliminationRevealed = false;
    Sound.play(done ? 'gather' : 'passDevice');
    persist();
    render();
  },
  'recruit-join': () => {
    // Doesn't resolve yet -- shows a private confirmation of the new role
    // (and fellow Deceiver, if any) first. See 'confirm-recruit-join'
    // below for where the choice is actually recorded.
    // Deliberately silent (secrecy fix): accepting must make exactly the
    // same sounds as refusing and as every "Nothing To Do" turn in this
    // pass — open tap, then one closing knock. A tap here gave the chosen
    // target's turn an extra sound, revealing who was approached and that
    // they joined.
    uiStage.recruitPendingResponse = 'join';
    uiStage.recruitJoinConfirmed = true;
    render();
  },
  'recruit-play-choice': () => {
    // Only ever offered to the approached player when they're actually
    // holding a Deceiver's Choice of their own (see ui.js). Lands on the
    // exact same "You Are Now A Deceiver" confirmation as an ordinary
    // join -- the outcome is identical, and the two options must sound
    // and feel the same from here, same as recruit-join above.
    uiStage.recruitPendingResponse = 'swap';
    uiStage.recruitJoinConfirmed = true;
    render();
  },
  'confirm-recruit-join': () => {
    recordRecruitResponse(state, uiStage.recruitPendingResponse);
    uiStage.recruitResponseTapped = false;
    uiStage.recruitJoinConfirmed = false;
    const done = advanceRecruitResponseQueue(state);
    if (done) uiStage.eliminationRevealed = false;
    Sound.play(done ? 'gather' : 'passDevice');
    persist();
    render();
  },
  'recruit-refuse': () => {
    recordRecruitResponse(state, 'refuse');
    uiStage.recruitResponseTapped = false;
    const done = advanceRecruitResponseQueue(state);
    if (done) uiStage.eliminationRevealed = false;
    Sound.play(done ? 'gather' : 'passDevice');
    persist();
    render();
  },
  'tap-final-circle-decision': () => {
    uiStage.finalCircleTapped = true;
    Sound.play('tap');
    render();
  },
  'choose-end-game': () => handleFinalCircleDecision('end'),
  'choose-banish-again': () => handleFinalCircleDecision('banish'),
  'reveal-elimination': () => {
    uiStage.eliminationRevealed = true;
    Sound.play('gather');
    const context = state.eliminationContext;
    if (context === 'quiet') {
      Sound.play('quietNight', 0.5);
    } else if (context === 'night') {
      Sound.play(state.nightResult.protected ? 'shieldSaved' : 'murdered', 0.5);
    } else {
      const tied = state.voteResult.tie || !state.voteResult.banishedId;
      Sound.play(tied ? 'tie' : 'banished', 0.5);
    }
    render();
    Sound.narrate([revealNarrationPool()], null, { delay: 0.9 });
  },
  'continue-elimination': () => {
    // A Final Circle banishment continues differently from an ordinary
    // one — no fresh Fate-card round, just another End Game / Banish
    // Again decision (or the game ending outright) — see engine.js.
    const wasFinalCircleElimination = state.eliminationContext === 'final';
    if (wasFinalCircleElimination) {
      beginFinalCircleDecision(state);
    } else {
      continueAfterElimination(state);
    }
    uiStage.voteTapped = false;
    uiStage.voteSelected = null;
    uiStage.useDagger = false;
    uiStage.eliminationRevealed = false;
    if (state.phase === PHASES.RESULTS) {
      Sound.play(state.winner === ROLES.DECEIVER.id ? 'deceiverWin' : 'loyalWin', 0.3);
      Analytics.gameFinished();
      // Reaching RESULTS from a banishment's Continue now only ever means
      // the Final Two ending (2 living players forcing an automatic end)
      // -- see engine.js's "Win condition" comment: that's the only way
      // beginFinalCircleDecision's own guard can set RESULTS here, and
      // the ordinary (non-final) path never does. Its own distinct beat,
      // rather than stacking two interstitials back to back.
      interstitialPending = 'final-two';
    } else if (state.phase === PHASES.MAIN) {
      // The game continues into a fresh round — its own distinct cue,
      // not the previous round's closing sound bleeding into it.
      Sound.play('roundBegin');
    } else if (state.phase === PHASES.FINAL_CIRCLE_DECISION) {
      // Looping back into another Final Circle round — the same summoning
      // bell used to enter Open Discussion, calling the circle back in.
      Sound.play('gather');
      interstitialPending = 'end-game';
    } else {
      Sound.play('tap');
    }
    persist();
    render();
  },
  'tap-vote': () => {
    uiStage.voteTapped = true;
    Sound.play('tap');
    render();
  },
  'select-vote-target': (btn) => {
    Sound.play('tap');
    uiStage.voteSelected = btn.dataset.id;
    render();
  },
  'confirm-vote': () => {
    if (!uiStage.voteSelected) return;
    const voter = currentQueuePlayer(state);
    const done = castVote(state, voter.id, uiStage.voteSelected, uiStage.useDagger);
    uiStage.voteTapped = false;
    uiStage.voteSelected = null;
    uiStage.useDagger = false;
    if (done) {
      resolveBanishment(state);
      uiStage.eliminationRevealed = false;
      // Every ballot's in — summon the table for the reveal.
      Sound.play('gather');
    } else {
      // More voters still to go — hand the phone on to the next one.
      Sound.play('passDevice');
    }
    persist();
    render();
  },
  'share-result': () => {
    Sound.play('tap');
    const text = buildShareResultText(state);
    if (navigator.share) {
      navigator.share({ text }).catch(() => { /* cancelled or unsupported — no-op */ });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => UI.showToast('Result copied — paste it anywhere!'))
        .catch(() => UI.showToast('Could not copy. Try again?'));
      return;
    }
    UI.showToast('Sharing is not available on this browser.');
  },
  'next-game-in-series': () => {
    Sound.play('gather');
    startNextGameInSeries(state);
    Analytics.gameStarted();
    murdersThisGame = 0;
    uiStage.revealTapped = false;
    interstitialPending = 'reveal';
    persist();
    render();
  },
  'play-again': () => {
    UI.hideWinnerReveal();
    Sound.play('tap');
    cancelComputerTurnTimer();
    cancelDiscussTimer();
    Sound.stopMusic();
    clearState();
    gameEpoch++;
    const settings = { ...state.settings };
    state = createInitialState();
    state.settings = settings;
    resetNarrationTracking();
    render();
    Sound.narrate(['farewell']);
  },
  'reset-game': () => {
    Sound.play('tap');
    UI.hideModal();
    if (!window.confirm('Reset the current game? This cannot be undone.')) return;
    UI.hideWinnerReveal();
    cancelComputerTurnTimer();
    cancelDiscussTimer();
    Sound.stopMusic();
    Sound.stopNarration();
    clearState();
    gameEpoch++;
    const settings = { ...state.settings };
    state = createInitialState();
    state.settings = settings;
    resetNarrationTracking();
    render();
  },
};

/* ---------- Global event delegation ---------- */

document.addEventListener('click', (e) => {
  const modalClose = e.target.closest('[data-close-modal]');
  if (modalClose) {
    Sound.play('modalClose');
    UI.hideModal();
    return;
  }
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = actions[btn.dataset.action];
  if (action) action(btn);
});

document.addEventListener('input', (e) => {
  if (!e.target.classList.contains('name-input')) return;
  const i = Number(e.target.dataset.index);
  setupNames[i] = e.target.value;
  const startBtn = document.querySelector('[data-action="start-game"]');
  if (startBtn) startBtn.disabled = !setupNames.every((n) => n.trim().length > 0);
});

document.getElementById('menuBtn').addEventListener('click', () => {
  Sound.play('modalOpen');
  UI.showModal('Settings', UI.settingsContent(state));
});

// A checkbox's own 'click' (not 'change') is used here so this goes
// through the same global data-action delegation as every other control
// -- including after 'set-audio-level' redraws the modal body, which
// would otherwise orphan a listener attached directly to the old node.
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('#musicToggle');
  if (!toggle) return;
  state.settings.music = toggle.checked;
  Sound.setMusicEnabled(state.settings.music);
  if (state.settings.music && state.phase === PHASES.DISCUSS) Sound.startMusic();
  persist();
});

document.getElementById('helpBtn').addEventListener('click', () => {
  Sound.play('modalOpen');
  UI.showModal('How To Play', UI.helpContent());
});

// Quick mute/restore, independent of the Full/Partial choice made in
// Settings: remembers the level it was on (for this tab session only,
// not persisted) and restores exactly that rather than always falling
// back to the Partial default.
let lastNonOffAudioLevel = state.settings.audio !== 'off' ? state.settings.audio : 'partial';
document.getElementById('soundBtn').addEventListener('click', () => {
  if (state.settings.audio === 'off') {
    state.settings.audio = lastNonOffAudioLevel;
  } else {
    lastNonOffAudioLevel = state.settings.audio;
    state.settings.audio = 'off';
  }
  applyAudioSettings(state.settings.audio);
  document.getElementById('soundBtn').classList.toggle('muted', state.settings.audio === 'off');
  if (state.settings.audio !== 'off') { Sound.play('tap'); if (state.phase !== PHASES.TITLE && state.phase !== PHASES.SETUP) Sound.preloadNarration(); }
  persist();
});

/* ---------- Boot ---------- */

document.getElementById('soundBtn').classList.toggle('muted', state.settings.audio === 'off');
render();
