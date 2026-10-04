/* ==========================================================================
   THE DECEIVERS — Bootstrap, router, event wiring
   ========================================================================== */

/* Always boot to the Title screen; a saved in-progress game is only resumed
   when the player explicitly taps Continue (see 'continue-game' action). */
let state = createInitialState();

/* Ephemeral UI-only sequencing (pass-device ceremony, in-progress selections).
   None of this is game data — it resets on each screen visit and is never
   persisted to localStorage. */
const uiStage = {
  revealTapped: false,
  drawTapped: false,
  murderTapped: false,
  murderTarget: null,
  useChoice: false,
  voteTapped: false,
  voteSelected: null,
  useDagger: false,
  eliminationRevealed: false,
  votingAnnounced: false,
  discussSecondsLeft: 0,
};

Sound.setEnabled(state.settings.sound);
Sound.setMusicEnabled(state.settings.music);

let setupNames = Array(CONFIG.minPlayers).fill('');
let setupIsComputer = Array(CONFIG.minPlayers).fill(false);
let seriesLength = 1;

/* Computer seats never wait for a tap: this pauses briefly, then resolves
   their turn with the same bot logic no matter which seat holds the secret
   Deceiver role, and re-renders. Guarded so a phase change mid-render can't
   schedule a second overlapping timer for the same turn. */
const COMPUTER_TURN_DELAY_MS = 700;
let computerTurnTimer = null;

const QUEUE_PHASES = [PHASES.REVEAL, PHASES.DRAW, PHASES.MURDER, PHASES.VOTE, PHASES.FINAL_BANISHMENT];

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
  uiStage.votingAnnounced = true;
  render();
  Sound.announceVotingBegins(() => {
    Sound.stopMusic();
    beginVotePhase(state, state.finalBanishmentActive);
    uiStage.votingAnnounced = false;
    uiStage.voteTapped = false;
    uiStage.voteSelected = null;
    uiStage.useDagger = false;
    persist();
    render();
  });
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
        if (state.phase === PHASES.NIGHT) Sound.play('nightFalls');
        else if (state.phase === PHASES.ELIMINATION) Sound.play('quietNight');
        else if (state.phase === PHASES.DISCUSS) { Sound.play('gather'); Sound.startMusic(); startDiscussTimer(); }
      }
      break;
    }
    case PHASES.MURDER: {
      // Same two calls regardless of role — recordMurderChoice only runs on
      // the acting Deceiver's own turn, exactly like confirm-murder-turn.
      if (isActingDeceiverTurn(state)) {
        const targetId = botPickMurderTarget(state);
        const useChoice = botShouldUseDeceiversChoice(state);
        if (targetId) recordMurderChoice(state, targetId, useChoice);
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
  showScreen(state.phase);
  UI.updateHeader(state);

  if (autoAdvanceComputerTurns()) return;

  switch (state.phase) {
    case PHASES.TITLE:
      UI.renderTitle(hasSavedGame());
      break;
    case PHASES.SETUP:
      UI.renderSetup(setupNames, seriesLength, setupIsComputer);
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
      UI.renderMurder(state, uiStage.murderTapped, uiStage.murderTarget, uiStage.useChoice);
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

/* ---------- Action handlers ---------- */

const actions = {
  'new-game': () => {
    Sound.play('tap');
    cancelComputerTurnTimer();
    cancelDiscussTimer();
    Sound.stopMusic();
    state = createInitialState();
    setupNames = Array(CONFIG.minPlayers).fill('');
    setupIsComputer = Array(CONFIG.minPlayers).fill(false);
    seriesLength = 1;
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
      state = saved;
      Sound.setEnabled(state.settings.sound);
      Sound.setMusicEnabled(state.settings.music);
      document.getElementById('soundBtn').classList.toggle('muted', !state.settings.sound);
      if (state.phase === PHASES.DISCUSS) { Sound.startMusic(); startDiscussTimer(); }
    }
    render();
  },
  'open-help': () => {
    Sound.play('modalOpen');
    UI.showModal('How To Play', UI.helpContent());
  },
  'add-player': () => {
    Sound.play('tap');
    if (setupNames.length < CONFIG.maxPlayers) {
      setupNames.push('');
      setupIsComputer.push(false);
    }
    UI.renderSetup(setupNames, seriesLength, setupIsComputer);
  },
  'remove-player': (btn) => {
    Sound.play('tap');
    const i = Number(btn.dataset.index);
    setupNames.splice(i, 1);
    setupIsComputer.splice(i, 1);
    UI.renderSetup(setupNames, seriesLength, setupIsComputer);
  },
  'set-seat-mode': (btn) => {
    Sound.play('tap');
    const i = Number(btn.dataset.index);
    setupIsComputer[i] = btn.dataset.mode === 'computer';
    UI.renderSetup(setupNames, seriesLength, setupIsComputer);
  },
  'inc-series-length': () => {
    Sound.play('tap');
    seriesLength = Math.min(20, seriesLength + 1);
    UI.renderSetup(setupNames, seriesLength, setupIsComputer);
  },
  'dec-series-length': () => {
    Sound.play('tap');
    seriesLength = Math.max(1, seriesLength - 1);
    UI.renderSetup(setupNames, seriesLength, setupIsComputer);
  },
  'start-game': () => {
    if (!setupNames.every((n) => n.trim().length > 0)) return;
    Sound.play('gather');
    startNewSeries(state, setupNames, seriesLength, setupIsComputer);
    Analytics.gameStarted();
    uiStage.revealTapped = false;
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
    Sound.play('tap');
    beginDrawPhase(state);
    uiStage.drawTapped = false;
    persist();
    render();
  },
  'tap-draw': () => {
    const player = currentQueuePlayer(state);
    const result = drawFortuneCard(state, player.id);
    state.lastDrawResult = result;
    uiStage.drawTapped = true;
    Sound.play(result.wentToPot ? 'gold' : 'draw');
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
      if (state.phase === PHASES.NIGHT) Sound.play('nightFalls');
      else if (state.phase === PHASES.ELIMINATION) Sound.play('quietNight');
      else if (state.phase === PHASES.DISCUSS) { Sound.play('gather'); Sound.startMusic(); startDiscussTimer(); }
    } else {
      // Still more players in the Draw queue — hand the phone on.
      Sound.play('passDevice');
    }
    persist();
    render();
  },
  'proceed-to-murder': () => {
    Sound.play('tap');
    beginMurderPhase(state);
    uiStage.murderTapped = false;
    uiStage.murderTarget = null;
    uiStage.useChoice = false;
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
    Sound.play('tap');
    uiStage.murderTarget = btn.dataset.id;
    render();
  },
  'confirm-murder-turn': () => {
    if (isActingDeceiverTurn(state)) {
      if (!uiStage.murderTarget) return;
      recordMurderChoice(state, uiStage.murderTarget, uiStage.useChoice);
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
  },
  'continue-elimination': () => {
    continueAfterElimination(state);
    uiStage.voteTapped = false;
    uiStage.voteSelected = null;
    uiStage.useDagger = false;
    uiStage.eliminationRevealed = false;
    if (state.phase === PHASES.RESULTS) {
      Sound.play(state.winner === ROLES.DECEIVER.id ? 'deceiverWin' : 'loyalWin', 0.3);
      Analytics.gameFinished();
    } else if (state.phase === PHASES.MAIN) {
      // The game continues into a fresh round — its own distinct cue,
      // not the previous round's closing sound bleeding into it.
      Sound.play('roundBegin');
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
  'next-game-in-series': () => {
    Sound.play('gather');
    startNextGameInSeries(state);
    Analytics.gameStarted();
    uiStage.revealTapped = false;
    persist();
    render();
  },
  'play-again': () => {
    Sound.play('tap');
    cancelComputerTurnTimer();
    cancelDiscussTimer();
    Sound.stopMusic();
    clearState();
    state = createInitialState();
    render();
  },
  'reset-game': () => {
    Sound.play('tap');
    UI.hideModal();
    if (!window.confirm('Reset the current game? This cannot be undone.')) return;
    cancelComputerTurnTimer();
    cancelDiscussTimer();
    Sound.stopMusic();
    clearState();
    state = createInitialState();
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
  const toggle = document.getElementById('soundToggle');
  if (toggle) {
    toggle.addEventListener('change', (e) => {
      state.settings.sound = e.target.checked;
      Sound.setEnabled(state.settings.sound);
      if (state.settings.sound) Sound.play('tap');
      persist();
    });
  }
  const musicToggle = document.getElementById('musicToggle');
  if (musicToggle) {
    musicToggle.addEventListener('change', (e) => {
      state.settings.music = e.target.checked;
      Sound.setMusicEnabled(state.settings.music);
      if (state.settings.music && state.phase === PHASES.DISCUSS) Sound.startMusic();
      persist();
    });
  }
});

document.getElementById('helpBtn').addEventListener('click', () => {
  Sound.play('modalOpen');
  UI.showModal('How To Play', UI.helpContent());
});

document.getElementById('soundBtn').addEventListener('click', () => {
  state.settings.sound = !state.settings.sound;
  Sound.setEnabled(state.settings.sound);
  document.getElementById('soundBtn').classList.toggle('muted', !state.settings.sound);
  if (state.settings.sound) Sound.play('tap');
  persist();
});

/* ---------- Boot ---------- */

document.getElementById('soundBtn').classList.toggle('muted', !state.settings.sound);
render();
