/* ==========================================================================
   THE DECEIVERS — Game Engine
   Rules and round progression. Operates only on the state object (state.js
   shape) and data.js constants. No DOM access — returns plain result objects
   for ui.js to render.
   ========================================================================== */

function log(state, text) {
  state.history.push({ round: state.round, text });
}

/* ---------- Setup ---------- */

function setupNewGame(state, playerNames, isComputerFlags) {
  const computerFlags = isComputerFlags || playerNames.map(() => false);
  state.players = playerNames.map((name, i) => createPlayer(`p${i + 1}_${Date.now()}_${i}`, name.trim(), computerFlags[i]));
  playerNames.forEach((name) => {
    const key = name.trim();
    if (!(key in state.seriesScores)) state.seriesScores[key] = 0;
  });

  const deceiverCount = deceiverCountForPlayers(state.players.length);
  // The Instigator is one specific seat, drawn first and tracked across
  // the series: from game 2 on, the seat that instigated last game is
  // left out of this draw (there's always at least one alternative seat
  // at every supported player count). This is the only seat the rotation
  // rule constrains -- when a table has more than one Deceiver, the
  // remaining slot(s) are filled by a fully unconstrained draw from
  // everyone else, so a previous game's *other* Deceiver(s) stay equally
  // eligible again this game, per the brief ("do not exclude all
  // previous Deceivers unless independently required"). seriesGame is
  // already bumped to this game's number by the time setupNewGame runs
  // (see startNextGameInSeries), so > 1 means "there was a previous
  // game."
  const allIndexes = state.players.map((_, i) => i);
  const avoidInstigator = state.seriesGame > 1 ? state.lastInstigatorIndex : null;
  const instigatorPool = avoidInstigator == null ? allIndexes : allIndexes.filter((i) => i !== avoidInstigator);
  const instigatorIndex = shuffle(instigatorPool)[0];
  const remainingDeceivers = deceiverCount > 1
    ? shuffle(allIndexes.filter((i) => i !== instigatorIndex)).slice(0, deceiverCount - 1)
    : [];
  const shuffledIndexes = [instigatorIndex, ...remainingDeceivers];
  state.players.forEach((p, i) => {
    p.role = shuffledIndexes.includes(i) ? ROLES.DECEIVER.id : ROLES.LOYAL.id;
  });
  state.lastInstigatorIndex = instigatorIndex;
  // Recruit or Die only ever applies to a game that started with more than
  // one Deceiver and has since lost all but one — a game that only ever
  // had a single Deceiver (3-6 players) has no one to "replenish" and
  // should never trigger it. See shouldTriggerRecruitment, below.
  state.initialDeceiverCount = deceiverCount;

  state.fortuneDeck = buildDeck(FORTUNE_DECK_DEF);
  state.fortuneDiscard = [];
  state.fateDeck = keepBanishmentOffTop(buildDeck(FATE_DECK_DEF));
  state.fateDiscard = [];
  state.prizePot = 0;
  state.round = 1;
  state.winner = null;
  state.gamePayout = null;
  state.currentFateCard = null;
  state.nightResult = null;
  state.voteResult = null;
  state.finalBanishmentActive = false;
  state.finalCircleActive = false;
  state.finalCircleDecisions = {};
  state.recruitment = { recruiterId: null, targetId: null };
  state.recruitmentAttempted = false;
  state.history = [];

  state.pendingQueue = state.players.map((p) => p.id);
  state.phase = PHASES.REVEAL;
  log(state, 'The circle gathers. Roles are sealed.');
  return state;
}

/* ---------- Series (several games back to back, points carried across) ---------- */

function startNewSeries(state, playerNames, seriesLength, isComputerFlags, deceiverKnowledge) {
  state.seriesLength = Math.max(1, Math.min(20, seriesLength | 0));
  state.seriesGame = 1;
  state.seriesScores = {};
  state.rosterNames = playerNames.map((n) => n.trim());
  state.rosterIsComputer = playerNames.map((_, i) => !!(isComputerFlags && isComputerFlags[i]));
  // A whole-series choice, not per-game — setupNewGame (called once per
  // game, including every game in a series) never touches state.settings,
  // so this holds for every game in the series once set here.
  state.settings.deceiverKnowledge = deceiverKnowledge === 'hidden' ? 'hidden' : 'known';
  setupNewGame(state, state.rosterNames, state.rosterIsComputer);
}

function startNextGameInSeries(state) {
  state.seriesGame += 1;
  setupNewGame(state, state.rosterNames, state.rosterIsComputer);
}

function fellowDeceivers(state, playerId) {
  // alive-only: at the initial Reveal this is a no-op (nobody's dead yet),
  // but Recruit or Die's post-join confirmation also calls this, and a
  // lone surviving Deceiver can have an already-eliminated former
  // teammate -- naming them as a current "fellow Deceiver" would be both
  // wrong and confusing to a player who just joined.
  return state.players.filter((p) => p.id !== playerId && p.alive && p.role === ROLES.DECEIVER.id).map((p) => p.name);
}

function currentQueuePlayer(state) {
  if (!state.pendingQueue.length) return null;
  return findPlayer(state, state.pendingQueue[0]);
}

function advanceQueue(state) {
  return state.pendingQueue.shift();
}

/* ---------- Private Role Reveal ---------- */

function confirmRevealCurrent(state) {
  const player = currentQueuePlayer(state);
  if (!player) return { done: true };
  player.revealed = true;
  advanceQueue(state);
  if (!state.pendingQueue.length) {
    state.phase = PHASES.MAIN;
    return { done: true };
  }
  return { done: false };
}

/* ---------- Deck helper ---------- */

function drawFrom(state, deckKey, discardKey, fallbackDefs) {
  if (!state[deckKey].length) {
    if (state[discardKey].length) {
      state[deckKey] = shuffle(state[discardKey]);
      state[discardKey] = [];
      log(state, 'The deck is spent and reshuffled.');
    } else {
      state[deckKey] = buildDeck(fallbackDefs);
    }
  }
  return state[deckKey].pop();
}

/* A Banishment must never be the first event drawn after a fresh shuffle —
   a Quiet Night or Murder always has to happen first. Cards are drawn from
   the end of the array (pop()), so "first drawn" is the last element; if
   that's Banishment, swap it with any non-Banishment card elsewhere in the
   same shuffle. This runs every time the Fate deck is freshly assembled —
   at game start and every reshuffle-from-discard — so it holds after every
   reshuffle cycle, not just round 1. */
function keepBanishmentOffTop(deck) {
  const topIndex = deck.length - 1;
  if (topIndex > 0 && deck[topIndex] === 'banishment') {
    const swapIndex = deck.findIndex((id) => id !== 'banishment');
    if (swapIndex !== -1) {
      [deck[topIndex], deck[swapIndex]] = [deck[swapIndex], deck[topIndex]];
    }
  }
  return deck;
}

function drawFateCard(state) {
  if (!state.fateDeck.length) {
    if (state.fateDiscard.length) {
      state.fateDeck = keepBanishmentOffTop(shuffle(state.fateDiscard));
      state.fateDiscard = [];
      log(state, 'The deck is spent and reshuffled.');
    } else {
      state.fateDeck = keepBanishmentOffTop(buildDeck(FATE_DECK_DEF));
    }
  }
  return state.fateDeck.pop();
}

/* ---------- Round start: reveal this round's Fate card ---------- */

function startRound(state) {
  state.nightResult = null;
  state.voteResult = null;
  state.players.forEach((p) => {
    p.drawnThisRound = false;
  });

  state.finalBanishmentActive = false;

  // Recruit or Die takes priority over entering the Final Circle if both
  // conditions are somehow true on the same round -- see the "Recruit or
  // Die" section below. Checked first, before the Final Circle threshold,
  // so a lone surviving Deceiver always gets the chance to replenish
  // before the game moves into its endgame mode.
  if (!state.finalCircleActive && shouldTriggerRecruitment(state)) {
    // Looks identical to an ordinary round on the MAIN screen (same
    // "Begin Draw Phase" button, same round/player-list display) -- the
    // branch into Recruit happens invisibly in main.js's begin-draw
    // handler, not here, so nothing on screen outwardly signals that
    // anything is different this round. See sound.js/main.js for why the
    // spoken cues around it are equally careful not to leak anything.
    state.currentFateCard = FINAL_BANISHMENT_DEF.id; // non-null sentinel only
    state.phase = PHASES.MAIN;
    return null;
  }

  // Final Circle begins once living players drop to the threshold -- but
  // never on round 1, even for a game that *starts* at or below the
  // threshold (a 3- or 4-player game). It's meant to be an end-state
  // reached after some normal play, not a shortcut a small game falls
  // into immediately; requiring round > 1 guarantees at least one
  // ordinary round (Fate card, Draw, possibly a Murder or Banishment)
  // happens first regardless of starting player count, while not
  // changing anything for larger games, which would already be well
  // past round 1 by the time eliminations bring them down to the
  // threshold anyway.
  if (state.round > 1 && livingPlayers(state).length <= CONFIG.finalCircleThreshold) {
    state.finalCircleActive = true;
  }
  if (state.finalCircleActive) {
    // No Fate card this round or ever again — the Final Circle has its own
    // shape (see below). currentFateCard is just a non-null sentinel here
    // so main.js's "only call startRound once per round" guard still works;
    // nothing reads it as a real Fate card while finalCircleActive is true.
    state.currentFateCard = FINAL_BANISHMENT_DEF.id;
    state.phase = PHASES.MAIN;
    return null;
  }
  state.currentFateCard = drawFateCard(state);
  state.phase = PHASES.MAIN;
  return cardDefById(state.currentFateCard);
}

/* ---------- Draw Phase (Fortune deck) ---------- */

function beginDrawPhase(state) {
  state.pendingQueue = livingPlayers(state).map((p) => p.id);
  state.phase = PHASES.DRAW;
}

function drawFortuneCard(state, playerId) {
  const player = findPlayer(state, playerId);
  const cardId = drawFrom(state, 'fortuneDeck', 'fortuneDiscard', FORTUNE_DECK_DEF);
  const def = cardDefById(cardId);
  player.drawnThisRound = true;

  if (def.type === 'gold') {
    state.prizePot += def.value;
    state.fortuneDiscard.push(cardId);
    log(state, `${player.name} drew ${def.name} — the Prize Pot grows.`);
    return { cardId, def, wentToPot: true };
  }
  player.hand.push(cardId);
  log(state, `${player.name} drew ${def.name} and kept it.`);
  return { cardId, def, wentToPot: false };
}

function finishDrawForCurrent(state) {
  advanceQueue(state);
  return state.pendingQueue.length === 0;
}

/* ---------- Fate branch routing (after Draw Phase completes) ----------
   Only ever reached pre-Final-Circle: once state.finalCircleActive is true,
   startRound never sets a real Fate card and the Draw Phase is never
   entered at all, so this never runs during the Final Circle. */

function routeAfterDraw(state) {
  const def = cardDefById(state.currentFateCard);
  if (def.effect === 'murder-night') {
    state.phase = PHASES.NIGHT;
    return PHASES.NIGHT;
  }
  if (def.effect === 'no-murder') {
    state.fateDiscard.push(state.currentFateCard);
    state.nightResult = { quiet: true };
    state.eliminationContext = 'quiet';
    log(state, 'A quiet night. No blade is drawn.');
    state.phase = PHASES.ELIMINATION;
    return PHASES.ELIMINATION;
  }
  // vote-only — every living player debates openly before voting begins
  // (see PHASES.DISCUSS); beginVotePhase itself isn't called until that
  // screen's "Begin Voting" button is tapped.
  state.fateDiscard.push(state.currentFateCard);
  state.phase = PHASES.DISCUSS;
  return PHASES.DISCUSS;
}

/* ---------- Night Phase / Murder Selection ----------
   Every living player takes a turn with the phone during Murder — not just
   the Deceivers — so who holds the phone never gives away who they are.
   Exactly one living Deceiver (the "acting" Deceiver, fixed for the whole
   game once chosen) sees the real target-selection screen on their turn;
   everyone else — Loyal and non-acting Deceivers alike — sees an identical,
   content-free "nothing to do" screen. */

/* In Known mode (or whenever the current step is a shared-decision one --
   'shortlist'/'narrow'/'narrow-final'/'veto' -- which only ever happen in
   Known mode to begin with), the deciding Deceiver(s) know exactly who
   their fellow Deceivers are and would never pick one, so the pool
   excludes every Deceiver, same as the original design. In Hidden mode's
   'single' step, the lone deciding Deceiver genuinely doesn't know who
   else is on their side -- the pool is every OTHER living player,
   fellow Deceivers included, since picking one by accident is a real
   possibility. (A fellow Deceiver who ends up targeted this way is
   automatically immune -- see resolveMurder's isFellowDeceiver check,
   below -- so this never actually costs the Deceiver team a member; it
   just means a Hidden-mode Murder attempt can harmlessly fail.) */
function eligibleMurderTargets(state) {
  const known = state.settings.deceiverKnowledge !== 'hidden';
  if (known) {
    return livingPlayers(state).filter((p) => p.role !== ROLES.DECEIVER.id);
  }
  const deciderId = currentQueuePlayer(state)?.id;
  return livingPlayers(state).filter((p) => p.id !== deciderId);
}

/* How multiple living Deceivers decide a Murder target together, per the
   brief: in Hidden Deceiver Knowledge mode (or whenever only one Deceiver
   is currently alive, in either mode — there's no one to hand off to),
   the lowest-seat-numbered living Deceiver decides alone, exactly as a
   single Deceiver always has; every other living Deceiver's turn looks
   identical to a Loyal player's ("Nothing To Do"), which doubles as a
   quiet tell to them that a lower-numbered Deceiver must exist, without
   ever saying who. In Known mode with two or three living Deceivers, the
   decision is shared: the lowest-numbered picks a 2-player shortlist: the
   next-lowest either picks the final target directly from it (exactly
   two living) or narrows it to one candidate for a third Deceiver to
   confirm (exactly three living), who can choose to kill that candidate
   or save them — a save resolves the round as an ordinary Quiet Night.
   state.murderDecision.order is the living Deceivers' ids in seat order,
   computed fresh every Murder phase (deaths between rounds can shrink or
   reorder who's "lowest"). */

function beginMurderPhase(state) {
  state.pendingQueue = livingPlayers(state).map((p) => p.id);
  const order = livingPlayers(state).filter((p) => p.role === ROLES.DECEIVER.id).map((p) => p.id);
  state.murderDecision = {
    order,
    shortlist: [],
    narrowedTargetId: null,
    finalTargetId: null,
    useDeceiversChoice: false,
    deciderId: null,
  };
  state.phase = PHASES.MURDER;
}

/** Returns which step, if any, the given player id performs this Murder
 *  round: 'single' (decides alone — Hidden mode, or Known mode with only
 *  one living Deceiver), 'shortlist' (Known mode, picks 2 candidates),
 *  'narrow' (Known mode, exactly 3 living — picks 1 of the shortlist,
 *  passed on to the third Deceiver rather than resolving), 'narrow-final'
 *  (Known mode, exactly 2 living — picks 1 of the shortlist, which *is*
 *  the final target), 'veto' (Known mode, exactly 3 living — confirms or
 *  overrides the narrowed target), or null (no task this round, same
 *  "Nothing To Do" turn as any Loyal player gets). */
function murderStepFor(state, playerId) {
  const { order } = state.murderDecision;
  const known = state.settings.deceiverKnowledge !== 'hidden';
  if (!known || order.length === 1) {
    return playerId === order[0] ? 'single' : null;
  }
  if (playerId === order[0]) return 'shortlist';
  if (playerId === order[1]) return order.length >= 3 ? 'narrow' : 'narrow-final';
  if (order.length >= 3 && playerId === order[2]) return 'veto';
  return null;
}

function currentMurderStep(state) {
  const player = currentQueuePlayer(state);
  return player ? murderStepFor(state, player.id) : null;
}

/** Whether the player currently holding the phone — who must be the one
 *  about to make a binding kill decision ('single', 'narrow-final', or
 *  'veto'; the 'shortlist'/'narrow' steps never offer this, since those
 *  don't commit to a final target — a provisional candidate isn't who a
 *  Shield would even be checked against) — holds a Deceiver's Choice
 *  card of their own. */
function currentMurderDeciderHoldsChoiceCard(state) {
  const player = currentQueuePlayer(state);
  return !!player && player.hand.includes('deceivers-choice');
}

function shortlistedMurderTargets(state) {
  return state.murderDecision.shortlist.map((id) => findPlayer(state, id)).filter(Boolean);
}

function recordMurderShortlist(state, targetIds) {
  state.murderDecision.shortlist = targetIds.slice(0, 2);
}

/** Used for both the 'single' step (picks straight from every eligible
 *  target) and the 'narrow'/'narrow-final' steps (picks from the
 *  2-player shortlist only) — which one depends on the current step, so
 *  this only needs the target id, not which list it came from. */
function recordMurderTarget(state, targetId, useDeceiversChoice) {
  if (currentMurderStep(state) === 'narrow') {
    // Exactly 3 living Deceivers: this narrows the shortlist to one
    // candidate for the third Deceiver to confirm or veto — not yet a
    // binding target, so no Deceiver's Choice offer and no decider
    // recorded here.
    state.murderDecision.narrowedTargetId = targetId;
    return;
  }
  state.murderDecision.finalTargetId = targetId;
  state.murderDecision.useDeceiversChoice = !!useDeceiversChoice;
  state.murderDecision.deciderId = currentQueuePlayer(state).id;
}

/** The third Deceiver's turn in a 3-living-Deceiver Known-mode round:
 *  confirm the kill against the already-narrowed candidate, or save them
 *  outright (resolves the round as an ordinary Quiet Night — see
 *  advanceMurderQueue's fallback, below, which this deliberately shares
 *  rather than duplicating). */
function recordMurderVeto(state, decision, useDeceiversChoice) {
  if (decision !== 'kill') return; // 'save' — finalTargetId stays unset
  state.murderDecision.finalTargetId = state.murderDecision.narrowedTargetId;
  state.murderDecision.useDeceiversChoice = !!useDeceiversChoice;
  state.murderDecision.deciderId = currentQueuePlayer(state).id;
}

/** Advances the per-player murder queue. Returns true once everyone has had
 *  a turn and the murder has been resolved; false if more turns remain. */
function advanceMurderQueue(state) {
  advanceQueue(state);
  if (state.pendingQueue.length) return false;
  const { finalTargetId, useDeceiversChoice } = state.murderDecision;
  if (finalTargetId) {
    resolveMurder(state, finalTargetId, useDeceiversChoice);
  } else {
    // No binding target was ever recorded — either the safety-fallback
    // case this always had (shouldn't happen; every step's confirm button
    // is disabled without a valid pick) or, new with the shared-decision
    // flow, a deliberate Save in the 3-Deceiver veto step. Both resolve
    // the same safe way: nobody dies tonight.
    state.nightResult = { quiet: true };
    state.eliminationContext = 'quiet';
    state.fateDiscard.push(state.currentFateCard);
    state.phase = PHASES.ELIMINATION;
  }
  return true;
}

function resolveMurder(state, targetId, useDeceiversChoice) {
  const target = findPlayer(state, targetId);

  if (useDeceiversChoice) {
    const holder = findPlayer(state, state.murderDecision.deciderId);
    if (holder && holder.hand.includes('deceivers-choice')) {
      holder.hand.splice(holder.hand.indexOf('deceivers-choice'), 1);
      state.fortuneDiscard.push('deceivers-choice');
    }
  }

  // A held Shield deploys automatically against a Murder attempt — no
  // action required from the target — and is spent whether or not it ends
  // up mattering (Deceiver's Choice can still override it).
  const hadShield = target.hand.includes('shield');
  if (hadShield) {
    target.hand.splice(target.hand.indexOf('shield'), 1);
    state.fortuneDiscard.push('shield');
  }

  // A fellow Deceiver is automatically immune — this can only actually
  // happen in Hidden mode (see eligibleMurderTargets, above), where the
  // deciding Deceiver genuinely didn't know their target was on their own
  // side. Deceiver's Choice cannot override this: it exists to counter a
  // target's own external protection (a held Shield), not to let the
  // Deceivers kill one of their own even by accident. Resolves identically
  // to an ordinary Shield-save in every visible way — same reveal text,
  // same sound, same everything — so the rest of the table can never tell
  // the difference, and the Shield-save branch doesn't need to special-
  // case it.
  const isFellowDeceiver = target.role === ROLES.DECEIVER.id;

  const wasShielded = isFellowDeceiver || (hadShield && !useDeceiversChoice);
  if (!wasShielded) target.alive = false;

  state.fateDiscard.push(state.currentFateCard);
  state.nightResult = {
    quiet: false,
    targetId,
    name: target.name,
    murdered: !wasShielded,
    protected: wasShielded,
    deceiversChoicePlayed: !!useDeceiversChoice,
  };
  log(state, wasShielded
    ? `${target.name} was marked for murder but a Shield saved them.`
    : `${target.name} was murdered in the night.`);
  state.eliminationContext = 'night';
  state.phase = PHASES.ELIMINATION;
  return state.nightResult;
}

/* ---------- Recruit or Die ----------
   Triggers only when exactly one Deceiver is alive, the game started with
   more than one (see initialDeceiverCount in setupNewGame — a game that
   only ever had a single Deceiver has no one to replenish), the Final
   Circle hasn't begun, and it hasn't already been offered once this game
   (recruitmentAttempted — capped at one attempt per game regardless of
   outcome, so a refusal can't chain into repeat offers round after round
   and quietly carry a game past the Final Circle threshold without it
   ever engaging). A one-round detour that fully replaces that round's
   ordinary shape — no Fate card, no Draw, no Murder — and touches only
   two players' hands: the lone Deceiver, then whichever Loyal player they
   secretly approach. No one else is ever involved, and the brief
   explicitly asks for nothing public: no interstitial, no announcement,
   nothing on the MAIN screen or its button hints that this round is any
   different from an ordinary one. See main.js's begin-draw handler (where
   the decision to branch here actually happens).

   Privacy fix (issue #2): this used to pass the phone directly from the
   recruiter to the target and nobody else — two named hand-offs back to
   back with no filler turns, which was itself the tell (see issue #1).
   It now runs as TWO full-table queue passes, exactly mirroring Murder's
   single pass: RECRUIT cycles every living player once (only the
   recruiting Deceiver has a real task — recruitStepFor — everyone else
   gets the same content-free "Nothing To Do" turn Murder already uses),
   then RECRUIT_RESPONSE cycles every living player a second time (only
   the chosen target has a real task — recruitResponseStepFor). The
   recruiter also gets an ordinary "nothing to do" turn during the second
   pass, and the eventual target got one during the first — nobody's path
   through either queue is shaped any differently by their role. Spoken
   announcements during both phases are generic ("pass the phone to the
   next player"), never a name — see collectHandoffNarration in main.js —
   matching Murder exactly, so naming is never a secondary leak either. */

function shouldTriggerRecruitment(state) {
  if (state.finalCircleActive) return false;
  if (state.recruitmentAttempted) return false;
  if (!state.initialDeceiverCount || state.initialDeceiverCount <= 1) return false;
  return livingPlayers(state).filter((p) => p.role === ROLES.DECEIVER.id).length === 1;
}

function beginRecruitment(state) {
  const deceiver = livingPlayers(state).find((p) => p.role === ROLES.DECEIVER.id);
  state.recruitment = { recruiterId: deceiver.id, targetId: null, response: null };
  state.recruitmentAttempted = true;
  state.pendingQueue = livingPlayers(state).map((p) => p.id);
  state.phase = PHASES.RECRUIT;
}

function eligibleRecruitTargets(state) {
  return livingPlayers(state).filter((p) => p.role === ROLES.LOYAL.id);
}

/** Mirrors murderStepFor: only the recruiting Deceiver has a real task
 *  this queue pass ('offer' — choose who to approach); every other living
 *  player sees the same content-free "Nothing To Do" turn. */
function recruitStepFor(state, playerId) {
  return playerId === state.recruitment.recruiterId ? 'offer' : null;
}

function currentRecruitStep(state) {
  const player = currentQueuePlayer(state);
  return player ? recruitStepFor(state, player.id) : null;
}

function recordRecruitTarget(state, targetId) {
  state.recruitment.targetId = targetId;
}

/** Advances the Recruit queue one turn. Returns true once every living
 *  player has had a turn, at which point the second full pass (Recruit
 *  Response) begins. */
function advanceRecruitQueue(state) {
  advanceQueue(state);
  if (state.pendingQueue.length) return false;
  advanceToRecruitResponse(state);
  return true;
}

function advanceToRecruitResponse(state) {
  state.pendingQueue = livingPlayers(state).map((p) => p.id);
  state.phase = PHASES.RECRUIT_RESPONSE;
}

/** Mirrors recruitStepFor for the second pass: only the chosen target has
 *  a real task ('response' — accept or refuse); everyone else, including
 *  the recruiter themselves, sees the same "Nothing To Do" turn. */
function recruitResponseStepFor(state, playerId) {
  return playerId === state.recruitment.targetId ? 'response' : null;
}

function currentRecruitResponseStep(state) {
  const player = currentQueuePlayer(state);
  return player ? recruitResponseStepFor(state, player.id) : null;
}

/** Whether the approached (Loyal) player — who must be the one currently
 *  holding the phone during their 'response' turn — holds a Deceiver's
 *  Choice card of their own. Deceiver's Choice is normally Deceivers-
 *  only (its established Murder-Night use, cancelling a Shield, is
 *  unchanged), but a Loyal player who happens to be holding one gets a
 *  single exception here: if they're the one secretly approached, they
 *  may play it instead of answering Join/Refuse. */
function currentRecruitTargetHoldsChoiceCard(state) {
  const player = currentQueuePlayer(state);
  return !!player && player.id === state.recruitment.targetId && player.hand.includes('deceivers-choice');
}

/** Records the target's choice without resolving it yet — resolution (and
 *  the resulting public Elimination Reveal) waits until every remaining
 *  living player has also had their "Nothing To Do" turn, the same way
 *  Murder defers resolveMurder until advanceMurderQueue empties the
 *  queue. */
function recordRecruitResponse(state, response) {
  state.recruitment.response = response;
}

/** Advances the Recruit Response queue one turn. Returns true once every
 *  living player has had a turn, at which point the recorded response is
 *  resolved into a (now public) Elimination Reveal. response is one of
 *  'join', 'refuse', or 'swap' — 'swap' is the target playing their own
 *  Deceiver's Choice instead of answering (see
 *  currentRecruitTargetHoldsChoiceCard). */
function advanceRecruitResponseQueue(state) {
  advanceQueue(state);
  if (state.pendingQueue.length) return false;
  if (state.recruitment.response === 'swap') {
    resolveRecruitmentSwap(state);
  } else if (state.recruitment.response === 'join') {
    resolveRecruitmentJoin(state);
  } else {
    resolveRecruitmentRefusal(state);
  }
  return true;
}

/* Successful recruitment: the target becomes a Deceiver outright, for
   every win-condition and payout check from here on — payoutPrizePot
   already splits by current role, so nothing else needs to change for
   them to share normally if the Deceivers go on to win. Resolves to the
   table as a Quiet Night ("no murder takes place that night," per the
   brief), reusing the exact same nightResult/eliminationContext shape a
   real Quiet Night uses, so the Elimination Reveal looks completely
   ordinary. */
function resolveRecruitmentJoin(state) {
  const recruit = findPlayer(state, state.recruitment.targetId);
  recruit.role = ROLES.DECEIVER.id;
  state.nightResult = { quiet: true };
  state.eliminationContext = 'quiet';
  log(state, `${recruit.name} was secretly recruited and joined the Deceivers.`);
  state.phase = PHASES.ELIMINATION;
}

/* Refused recruitment: the recruit dies — not the existing Deceiver —
   presented to the table as an ordinary Murder (same nightResult shape
   and 'night' context resolveMurder uses, so the Elimination Reveal is
   indistinguishable from any other Murder outcome). A held Shield now
   protects here exactly as it does against a Murder: it's spent, and the
   recruit survives instead, resolved with the same shape resolveMurder's
   own Shield-save uses (protected: true) — already a publicly ordinary-
   looking outcome, so reusing it here adds no new pattern to notice. */
function resolveRecruitmentRefusal(state) {
  const recruit = findPlayer(state, state.recruitment.targetId);
  const hadShield = recruit.hand.includes('shield');
  if (hadShield) {
    recruit.hand.splice(recruit.hand.indexOf('shield'), 1);
    state.fortuneDiscard.push('shield');
    log(state, `${recruit.name} refused recruitment, but a Shield saved them.`);
  } else {
    recruit.alive = false;
    log(state, `${recruit.name} refused recruitment and was murdered in the night.`);
  }
  state.nightResult = {
    quiet: false,
    targetId: recruit.id,
    name: recruit.name,
    murdered: !hadShield,
    protected: hadShield,
    deceiversChoicePlayed: false,
  };
  state.eliminationContext = 'night';
  state.phase = PHASES.ELIMINATION;
}

/* Deceiver's Choice, played by the approached Loyal recipient instead
   of answering Join/Refuse: the recipient becomes the sole Deceiver,
   and the recruiter becomes the Pariah. Only the Pariah's own private
   view explains their new status; no new public step or cue is added.
   Resolves with the exact same Quiet Night shape as an ordinary
   successful join, so the public Elimination Reveal can't tell a swap
   from a willing join. */
function resolveRecruitmentSwap(state) {
  const recruiter = findPlayer(state, state.recruitment.recruiterId);
  const recruit = findPlayer(state, state.recruitment.targetId);
  if (!recruiter || !recruiter.alive || recruiter.role !== ROLES.DECEIVER.id
      || !recruit || !recruit.alive || recruit.role !== ROLES.LOYAL.id
      || !recruit.hand.includes('deceivers-choice')) return false;
  recruit.hand.splice(recruit.hand.indexOf('deceivers-choice'), 1);
  state.fortuneDiscard.push('deceivers-choice');
  recruit.role = ROLES.DECEIVER.id;
  recruiter.role = ROLES.PARIAH.id;
  state.nightResult = { quiet: true };
  state.eliminationContext = 'quiet';
  log(state, `${recruit.name} played Deceiver's Choice: ${recruit.name} is now a Deceiver, and ${recruiter.name} is now the Pariah.`);
  state.phase = PHASES.ELIMINATION;
  return true;
}

function botPickRecruitTarget(state) {
  const targets = eligibleRecruitTargets(state);
  if (!targets.length) return null;
  return targets[Math.floor(Math.random() * targets.length)].id;
}

/* Simple, non-strategic, consistent with the other bot* functions — a
   plain coin flip between joining and refusing, no modeling of whether
   either is the "smarter" choice for a computer-controlled Loyal seat.
   If this seat happens to be holding its own Deceiver's Choice, it gets
   the same non-strategic chance to play it instead (see
   currentRecruitTargetHoldsChoiceCard) as a Deceiver bot gets to play
   its copy during Murder (botShouldUseDeceiversChoice). */
function botChooseRecruitResponse(state) {
  if (currentRecruitTargetHoldsChoiceCard(state) && Math.random() < 0.4) return 'swap';
  return Math.random() < 0.5 ? 'join' : 'refuse';
}

/* ---------- Banishment Vote ---------- */

function beginVotePhase(state, isFinal) {
  state.pendingQueue = livingPlayers(state).map((p) => p.id);
  state.voteResult = { tally: {}, banishedId: null, tie: false, votes: [] };
  state.finalBanishmentActive = !!isFinal;
  state.phase = isFinal ? PHASES.FINAL_BANISHMENT : PHASES.VOTE;
}

function eligibleVoteTargets(state, voterId) {
  return livingPlayers(state).filter((p) => p.id !== voterId);
}

function castVote(state, voterId, targetId, useDagger) {
  const voter = findPlayer(state, voterId);
  let weight = 1;
  if (useDagger) {
    const idx = voter.hand.indexOf('dagger');
    if (idx !== -1) {
      voter.hand.splice(idx, 1);
      state.fortuneDiscard.push('dagger');
      weight = 2;
    }
  }
  const tally = state.voteResult.tally;
  tally[targetId] = (tally[targetId] || 0) + weight;
  state.voteResult.votes.push({ voterId, targetId, weight });
  advanceQueue(state);
  return state.pendingQueue.length === 0;
}

function resolveBanishment(state) {
  const tally = state.voteResult.tally;
  const entries = Object.entries(tally);
  state.voteResult.banishedId = null;
  state.voteResult.tie = false;

  if (entries.length) {
    entries.sort((a, b) => b[1] - a[1]);
    const topWeight = entries[0][1];
    const topTied = entries.filter(([, w]) => w === topWeight);
    if (topTied.length === 1) {
      const banishedId = topTied[0][0];
      const banished = findPlayer(state, banishedId);
      banished.alive = false;
      state.voteResult.banishedId = banishedId;
      log(state, `${banished.name} was banished by the circle.`);
    } else {
      state.voteResult.tie = true;
      log(state, 'The vote is tied. No one is banished.');
    }
  } else {
    state.voteResult.tie = true;
  }
  state.eliminationContext = state.finalBanishmentActive ? 'final' : 'banishment';
  state.phase = PHASES.ELIMINATION;
  return state.voteResult;
}

/* ---------- Computer players (bots) ----------
   Deliberately simple, non-strategic, random-but-plausible choices — this is
   a static client-side site with no AI backend. The important rule here
   isn't intelligence, it's anonymity: every computer seat must decide and
   behave identically to every other computer seat regardless of its own
   secret role, exactly like the human decoy-screen pattern above. A bot's
   Murder-turn function for a given step is only ever invoked on a
   living Deceiver whose turn that step actually is (mirroring the human
   action handlers — see currentMurderStep), so it never runs differently
   for a non-deciding computer seat versus a Loyal one — both simply
   advance the queue with no action taken. */

function botPickMurderTarget(state) {
  const targets = eligibleMurderTargets(state);
  if (!targets.length) return null;
  return targets[Math.floor(Math.random() * targets.length)].id;
}

function botPickMurderShortlist(state) {
  const targets = shuffle(eligibleMurderTargets(state).map((p) => p.id));
  return targets.slice(0, 2);
}

function botPickFromMurderShortlist(state) {
  const list = state.murderDecision.shortlist;
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

/* A plain coin flip, same non-strategic spirit as botChooseRecruitResponse
   — the third Deceiver has no information a real strategic AI would weigh
   (the shortlist/narrow steps don't leak anything a bot could reason
   about), so a 50/50 kill-or-save call is exactly as simple and
   plausible as the rest of this project's bot logic aims to be. */
function botChooseMurderVeto() {
  return Math.random() < 0.5 ? 'kill' : 'save';
}

function botShouldUseDeceiversChoice(state) {
  if (!currentMurderDeciderHoldsChoiceCard(state)) return false;
  return Math.random() < 0.4;
}

function botPickVoteTarget(state, voterId) {
  const targets = eligibleVoteTargets(state, voterId);
  if (!targets.length) return null;
  return targets[Math.floor(Math.random() * targets.length)].id;
}

function botShouldUseDagger(state, voterId) {
  const voter = findPlayer(state, voterId);
  if (!voter || !voter.hand.includes('dagger')) return false;
  return Math.random() < 0.5;
}

/* ---------- Continuation after an Elimination Reveal ----------
   Centralizes "what happens after the ceremony" so ui.js only needs to call
   this once the player taps Continue; it never has to know the round shape.
   Every context — a Murder night, a Quiet Night, or a Banishment Vote —
   ends the round the same way: check for a winner, otherwise advance to
   the next round's own Draw Phase. A Murder is never followed straight by
   a Banishment Vote (or vice versa) without a fresh round of card-drawing
   in between; each round has exactly one event. */

function continueAfterElimination(state) {
  advanceRound(state);
  return PHASES.MAIN;
}

/* ---------- Win condition ----------
   Exactly two ways a game can ever end — both live entirely inside the
   Final Circle, both resolved by checkFinalCircleWinner below: everyone
   unanimously chooses End Game (resolveFinalCircleDecision), or living
   players drop to 2 (beginFinalCircleDecision's own guard — checked at
   every entry to a fresh ballot, not just mid-circle ones, since an
   ordinary pre-Final-Circle round can drop straight to 2 just as easily).

   There used to be a third way: an ordinary-round or mid-Final-Circle
   "Deceiver majority" shortcut that ended the game the instant living
   Deceivers outnumbered living Loyal, on the reasoning that such a
   position was already mathematically unwinnable for the Loyal. That
   reasoning turned out not to hold even for a strict majority (not just
   an exact tie — see the Dagger card's vote-weight effect, which can
   swing an outnumbered vote), and more importantly it kept robbing games
   of their actual ending: an 8-player game whose two Deceivers both
   survived to an exact 2v2 standoff would skip the Final Circle — and
   therefore any Final Banishment — entirely, since the standoff itself
   was already an auto-win. Removed per the designer's explicit call:
   every game, no matter how lopsided the living count gets, now plays
   all the way to the Final Circle and ends only by one of the two ways
   above. A lopsided ordinary round (say, every Loyal eliminated while
   Deceivers still vastly outnumber the handful left) simply keeps
   playing ordinary rounds until living drops to the Final Circle
   threshold, same as any other game. */
function checkFinalCircleWinner(state) {
  const anyDeceiverAlive = livingPlayers(state).some((p) => p.role === ROLES.DECEIVER.id);
  return anyDeceiverAlive ? ROLES.DECEIVER.id : ROLES.LOYAL.id;
}

/* Loyal winners split the pot among whoever is still standing; Deceiver
   winners take the whole pot among whichever Deceivers are still standing.
   Either way it's divided only among survivors on the winning side — no one
   who was banished or murdered earlier shares in it. The pot is spent once
   paid out and starts rebuilding from zero next game. */
function payoutPrizePot(state, winner) {
  const pot = state.prizePot;
  const survivors = livingPlayers(state).filter((p) => p.role === winner);
  const pariahs = livingPlayers(state).filter((p) => p.role === ROLES.PARIAH.id);
  if (pariahs.length) {
    // Include the Pariah in the nominal split, then give them one quarter
    // of that share. Redistribute the other three quarters among the
    // actual winners. Work in hundredths of gold so no rounding creates
    // or loses pot value. A one-hundredth remainder goes in seat order.
    const potUnits = Math.round(pot * 100);
    const pariahUnits = Math.floor(potUnits / (survivors.length + pariahs.length) / 4);
    const remaining = potUnits - pariahUnits * pariahs.length;
    const winnerUnits = survivors.length ? Math.floor(remaining / survivors.length) : 0;
    const remainder = survivors.length ? remaining % survivors.length : 0;
    const allocations = survivors.map((p, i) => ({
      playerId: p.id, name: p.name, role: p.role,
      amount: (winnerUnits + (i < remainder ? 1 : 0)) / 100,
    })).concat(pariahs.map((p) => ({
      playerId: p.id, name: p.name, role: p.role, amount: pariahUnits / 100,
    })));
    allocations.forEach((p) => {
      state.seriesScores[p.name] = Math.round(((state.seriesScores[p.name] || 0) + p.amount) * 100) / 100;
    });
    state.prizePot = 0;
    return {
      winner, pot, share: winnerUnits / 100,
      recipients: survivors.map((p) => p.name),
      pariahShare: pariahUnits / 100,
      pariahRecipients: pariahs.map((p) => p.name), allocations,
    };
  }
  const share = survivors.length ? Math.floor(pot / survivors.length) : 0;
  survivors.forEach((p) => {
    state.seriesScores[p.name] = (state.seriesScores[p.name] || 0) + share;
  });
  state.prizePot = 0;
  return { winner, pot, share, recipients: survivors.map((p) => p.name) };
}

function finalizeGame(state, winner) {
  state.winner = winner;
  state.gamePayout = payoutPrizePot(state, winner);
  state.phase = PHASES.RESULTS;
  log(state, winner === ROLES.LOYAL.id ? 'Every Deceiver has fallen. The Loyal prevail.' : 'The Deceivers now rule the circle.');
}

function advanceRound(state) {
  state.round += 1;
  state.currentFateCard = null;
  state.phase = PHASES.MAIN;
}

/* ---------- Final Circle (End Game) ----------
   Begins once living players drop to CONFIG.finalCircleThreshold (see
   startRound) and never ends until the game itself does — no going back
   to ordinary rounds. From here on there are no more Fate cards, Draws,
   or Murders: every round is a secret per-player End Game / Banish Again
   ballot, followed by a vote only if at least one player chose Banish
   Again. Whoever that vote names is banished WITHOUT revealing their
   allegiance (see ui.js renderElimination's 'final' context) — the
   suspense that normally ends at every Elimination Reveal now survives
   all the way to the Final Circle's own conclusion. */

/** Starts a fresh per-player End Game / Banish Again ballot — unless
 *  living players have already dropped to 2, in which case there is
 *  nothing left to ballot about ("once living players reach 2, there is
 *  no more voting") and the game ends immediately instead. This guard
 *  matters at every call site, not just mid-Final-Circle ones: an
 *  ordinary (pre-Final-Circle) round can drop living straight to 2 just
 *  as easily — e.g. a 1-Deceiver, 1-Loyal Quiet Night — and the very
 *  first "Enter The Final Circle" tap afterward must not offer a
 *  pointless ballot between the game's last two players. Returns the
 *  phase the game is now in, so callers (and main.js's sound/interstitial
 *  dispatch) know whether a ballot actually started. */
function beginFinalCircleDecision(state) {
  if (livingPlayers(state).length <= 2) {
    finalizeGame(state, checkFinalCircleWinner(state));
    return PHASES.RESULTS;
  }
  state.pendingQueue = livingPlayers(state).map((p) => p.id);
  state.finalCircleDecisions = {};
  state.phase = PHASES.FINAL_CIRCLE_DECISION;
  return PHASES.FINAL_CIRCLE_DECISION;
}

function recordFinalCircleDecision(state, playerId, decision) {
  state.finalCircleDecisions[playerId] = decision;
}

/** Advances the per-player decision queue. Returns true once everyone
 *  living has decided. */
function advanceFinalCircleQueue(state) {
  advanceQueue(state);
  return state.pendingQueue.length === 0;
}

function allChoseEndGame(state) {
  return livingPlayers(state).every((p) => state.finalCircleDecisions[p.id] === 'end');
}

/** Called once every living player has made their secret End Game / Banish
 *  Again choice. Unanimous End Game ends the game right here, revealing
 *  every role (checkFinalCircleWinner, above). Otherwise at least one
 *  player chose Banish Again, so the circle moves to Open Discussion and
 *  then a vote, exactly like an ordinary Banishment — just flagged final
 *  so the vote and its outcome stay anonymous. Returns the phase the game
 *  is now in, so main.js knows which sound/UI follow-up applies. */
function resolveFinalCircleDecision(state) {
  if (allChoseEndGame(state)) {
    finalizeGame(state, checkFinalCircleWinner(state));
    return PHASES.RESULTS;
  }
  state.finalBanishmentActive = true;
  state.phase = PHASES.DISCUSS;
  return PHASES.DISCUSS;
}

/* A Final Circle banishment continues into another beginFinalCircleDecision
   call, same as the very first entry — its own "living <= 2" guard
   already covers "once living players reach 2, there is no more voting"
   (see its comment, above), so there's nothing left for a separate
   wrapper to add; main.js's continue-elimination handler calls
   beginFinalCircleDecision directly. */

/* Simple, non-strategic, consistent with the other bot* functions above —
   the real tension in this decision only exists for a human group reading
   each other's faces, so a biased-toward-continuing coin flip just keeps
   a computer-only or mixed-computer Final Circle from fizzling out the
   instant a bot gets a turn, without pretending to model actual strategy. */
function botChooseFinalCircleDecision() {
  return Math.random() < 0.7 ? 'banish' : 'end';
}
