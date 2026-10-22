/* ==========================================================================
   THE DECEIVERS — Recorded narration manifest
   The Mancaveman voice, recorded as 39 scripted lines with up to three
   takes each (A/B/C). Files live at assets/audio/narration/NN_X.m4a
   (AAC-LC, 96 kbps mono, 48 kHz, normalised to -20 LUFS). Lines 16 and 35
   only have two clean takes (A/B) — never pad them with a duplicate.

   Nothing here plays anything; sound.js owns playback. This file only says
   which recordings exist and which lines belong to which game moment.
   ========================================================================== */

const NARRATION = (() => {
  // Bump whenever any clip is re-exported, so phones never keep a stale
  // cached copy (same idea as the ?v= on every script/image).
  const VERSION = '202610192200';
  const BASE = 'assets/audio/narration/';

  // Line number -> how many clean takes exist.
  const TAKES = {};
  for (let n = 1; n <= 39; n++) TAKES[n] = 3;
  TAKES[16] = 2;
  TAKES[35] = 2;

  // Script text, for logs/tests only — never shown or spoken by the game.
  const SCRIPT = {
    1: 'Welcome to The Deceivers.',
    2: 'Among you are those who cannot be trusted. They will lie. They will deceive. And, given the opportunity, they will murder.',
    3: 'The Loyal must find the Deceivers. The Deceivers must survive. Trust nobody.',
    4: 'Let the game begin.',
    5: 'Pass the phone to the next player.',
    6: 'Hand it to the next player.',
    7: 'On to the next turn.',
    8: 'The next player, please.',
    9: 'Night falls. Keep your card secret.',
    10: 'The night falls. Guard your card.',
    11: 'Night has come. Keep it hidden.',
    12: 'Gather everyone. Place the phone in the centre.',
    13: 'Everyone, gather round. Set the phone down in the centre.',
    14: 'Bring the circle together. Phone in the centre.',
    15: 'The time for talk is over.',
    16: 'Talk ends now.',
    17: 'Enough talk. It is time to vote.',
    18: 'The floor is yours. Ask your questions. Make your accusations. And remember, somebody here is lying.',
    19: "It is time to decide who you trust. And who you don't.",
    20: 'A terrible thing has happened. There has been a murder.',
    21: 'The Deceivers have claimed another victim.',
    22: 'The night has passed. And everyone has survived.',
    23: 'Someone was marked for death. But tonight, they were protected.',
    24: 'The votes have been counted. The circle has spoken.',
    25: 'One of you must leave.',
    26: 'The vote is tied. Nobody will be banished.',
    27: 'And now, the truth.',
    28: 'The night is not yet over.',
    29: 'The circle has changed. But who can you trust?',
    30: "The Final Circle. You've made it this far. But the game is not yet over.",
    31: 'You must now decide. End the game. Or banish again.',
    32: 'The circle has chosen to continue. Another decision must be made.',
    33: 'There is nowhere left to hide. The truth will now be revealed.',
    34: 'The Deceivers have been discovered. The Loyal have prevailed.',
    35: 'Against the odds, the truth has won. Victory belongs to the Loyal.',
    36: 'You trusted the wrong people. The Deceivers have won.',
    37: 'They lied to your faces. And you believed every word. Victory belongs to the Deceivers.',
    38: 'The game is over. But remember, the next Deceiver might be sitting right beside you.',
    39: 'Until next time. Trust nobody.',
  };

  /* Named pools — each game moment picks one line from its pool at
     random, then one recorded take of that line at random. Every pool is
     public, whole-table content: nothing here is ever chosen by, or
     differs with, any player's secret role.

     Deliberately unused: 19 (no clean trigger), 28 and 29 (Recruit or
     Die must have no public announcement of its own — a line heard only
     in recruit rounds would tell the table exactly one Deceiver is left;
     see engine.js's "Recruit or Die" section). */
  const POOLS = {
    handoff: [5, 6, 7, 8],
    nightFalls: [9, 10, 11],
    gather: [12, 13, 14],
    votingBegins: [15, 16, 17],
    finalVotingBegins: [25],
    discussion: [18],
    banishAgain: [32],
    murderFirst: [20],          // "another victim" makes no sense for the first murder
    murderLater: [20, 21],
    quietNight: [22],
    shieldSaved: [23],
    banished: [24],
    tie: [26],
    finalCircle: [30],
    finalDecision: [31],
    endLeadIn: [27, 33],
    loyalWin: [34, 35],
    deceiverWin: [36, 37],
    seriesClosing: [38],
    farewell: [39],
    intro1: [1],
    intro2: [2],
    intro3: [3],
    gameBegins: [4],
  };

  /* Three-level audio control: FULL plays every pool above; PARTIAL
     retains all of it except the per-turn "pass the phone" line
     (handoff -- it fires on every single turn and repeats what's
     already on screen) and the opening flavour (intro1-3, gameBegins,
     heard once at the very start of a series/game). OFF plays nothing
     (see sound.js's narrationLevel / enabled). Defined as an exclusion
     from the full pool list rather than an inclusion set, so a newly
     added pool defaults to essential (Partial-included) unless it's
     deliberately added here. */
  const PARTIAL_EXCLUDED_POOLS = new Set(['handoff', 'intro1', 'intro2', 'intro3', 'gameBegins']);
  const ESSENTIAL_POOLS = new Set(Object.keys(POOLS).filter((p) => !PARTIAL_EXCLUDED_POOLS.has(p)));

  function clipKey(line, takeIndex) {
    return `${String(line).padStart(2, '0')}_${'ABC'[takeIndex]}`;
  }

  function clipUrl(key) {
    return `${BASE}${key}.m4a?v=${VERSION}`;
  }

  function allClipKeys() {
    const keys = [];
    Object.keys(TAKES).forEach((n) => {
      for (let t = 0; t < TAKES[n]; t++) keys.push(clipKey(Number(n), t));
    });
    return keys;
  }

  return { VERSION, BASE, TAKES, SCRIPT, POOLS, ESSENTIAL_POOLS, clipKey, clipUrl, allClipKeys };
})();
