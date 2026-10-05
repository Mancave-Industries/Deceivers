/* ==========================================================================
   THE DECEIVERS — State
   Game state shape, mutators, and localStorage persistence.
   No DOM access here — engine.js and ui.js read/write this shape.
   ========================================================================== */

const STATE_VERSION = 1;

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(defs) {
  const ids = [];
  defs.forEach((def) => {
    for (let i = 0; i < def.count; i++) ids.push(def.id);
  });
  return shuffle(ids);
}

function createInitialState() {
  return {
    version: STATE_VERSION,
    phase: PHASES.TITLE,
    round: 1,
    players: [],
    currentPlayerIndex: 0,
    pendingQueue: [],
    fortuneDeck: [],
    fortuneDiscard: [],
    fateDeck: [],
    fateDiscard: [],
    prizePot: 0,
    currentFateCard: null,
    nightResult: null,
    voteResult: null,
    eliminationContext: null,
    actingDeceiverId: null,
    pendingMurderChoice: null,
    finalBanishmentActive: false,
    // Final Circle: once living players drop to CONFIG.finalCircleThreshold,
    // this flips true for the rest of the game and never resets mid-game
    // (see engine.js's "Final Circle" section). finalCircleDecisions maps
    // playerId -> 'end' | 'banish' for the current round's secret ballot.
    finalCircleActive: false,
    finalCircleDecisions: {},
    // Recruit or Die: set once per game in setupNewGame (engine.js) to
    // that game's starting Deceiver count, so the mechanic only ever
    // triggers for a game that's lost Deceivers down to one, never for a
    // game that only ever had one. recruitment holds the in-progress
    // recruiter/target pair for the current attempt, if any.
    // recruitmentAttempted caps the mechanic at one attempt per game --
    // once a lone Deceiver has been offered the choice, win or refuse, it
    // never fires again that game (see shouldTriggerRecruitment).
    initialDeceiverCount: 1,
    recruitment: { recruiterId: null, targetId: null },
    recruitmentAttempted: false,
    history: [],
    winner: null,
    gamePayout: null,
    // Series: several games played back to back by the same roster, with
    // points carried across games and the Prize Pot paid out each game.
    seriesLength: 1,
    seriesGame: 1,
    seriesScores: {},
    rosterNames: [],
    rosterIsComputer: [],
    // deceiverKnowledge: 'known' (default — Deceivers see their fellow
    // Deceivers at Reveal) or 'hidden' (they don't, until/unless a
    // recruitment pact introduces them — see ui.js renderReveal and
    // engine.js's Recruit or Die section). A whole-series choice, set
    // once at Setup via startNewSeries, not reset per game.
    settings: { sound: false, music: false, deceiverKnowledge: 'known' },
  };
}

function createPlayer(id, name, isComputer) {
  return {
    id,
    name,
    role: null,
    alive: true,
    hand: [],
    revealed: false,
    drawnThisRound: false,
    isComputer: !!isComputer,
  };
}

function livingPlayers(state) {
  return state.players.filter((p) => p.alive);
}

function findPlayer(state, id) {
  return state.players.find((p) => p.id === id) || null;
}

function saveState(state) {
  try {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
  } catch (e) {
    /* localStorage unavailable (private mode / quota) — game still playable this session */
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== STATE_VERSION) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function clearState() {
  try {
    localStorage.removeItem(CONFIG.storageKey);
  } catch (e) {
    /* ignore */
  }
}

function hasSavedGame() {
  const s = loadState();
  return !!(s && s.phase && s.phase !== PHASES.TITLE && s.phase !== PHASES.RESULTS);
}
