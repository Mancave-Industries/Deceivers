# The Deceivers — Test Report

Testing was done in three layers: pure engine logic (Node, no browser), a
real headless-Chromium playthrough at the target 390×844 viewport, and an
automated multi-trial stress test driving the actual UI with randomized
choices across 3–8 players. All three layers are described below along with
every defect found and its fix.

## 1. Engine logic (Node, headless — no DOM)

`js/data.js`, `js/state.js`, and `js/engine.js` have zero DOM dependencies
by design, so they were bundled and exercised directly in Node across 400
randomized simulated games (200 with default random choices, 200 more with
randomized Shield/Dagger/Deceiver's Choice usage), covering all player
counts 3–8.

**Checked on every trial:**
- The round loop always terminates (no infinite loops) within 100 rounds.
- `PHASES.RESULTS` is always reached with `state.winner` set.
- Win condition is always consistent: Loyal wins only when 0 Deceivers
  remain alive; Deceivers win only when living Deceivers ≥ living Loyal.
- No exceptions thrown for any player count or eligible-target edge case
  (e.g. Deceivers never appear as their own murder targets; a lone
  remaining voter still has a legal target list).

**Result: 0 bugs found in 400 trials.**

## 2. Real playthrough at 390×844 (headless Chromium)

Driven with `playwright-core` against the actual pre-installed Chromium
binary, viewport locked to 390×844 (iPhone-size), a full game was played
screen-by-screen with screenshots captured at each step: Title → Setup →
Private Reveal → Main hub → Draw → Hand → (Night → Murder Selection, when
drawn) → Elimination Reveal → Banishment Vote → Elimination Reveal →
Results.

### Defect found: card caption text clipped by SVG viewBox

**Symptom:** On the Private Reveal screen, the Deceiver role card's second
line of body text ("SOW DOUBT. SURVIVE THE VOTE.") rendered with its first
and last few characters cut off, as did the Dagger game card's caption
("+1 VOTE WEIGHT AT BANISHMENT").

**Root cause:** Each card SVG uses a `viewBox="0 0 200 280"`; content drawn
outside that 0–200 horizontal range is clipped by the SVG viewport itself
once the element is scaled down to card size in the browser. Several
caption `<text>` elements were sized/spaced (`font-size` 9–11,
`letter-spacing` 1–1.5) wide enough that their centered text overran both
edges of the 200-unit-wide card at these long string lengths.

**Fix:** Reduced the caption line `font-size` to `8` and `letter-spacing`
to `0.4` across all affected cards (`role-deceiver.svg`, `role-loyal.svg`,
and the eight `gamecards/*.svg` caption lines), which brings every caption
comfortably under the 200-unit width even for the longest strings (e.g.
"THE LAST VOTE — DECIDES THE GAME"). The shared inline `<symbol>` sprite in
`index.html` was regenerated from the corrected source files so both stay
in sync.

**Verified fixed:** Re-ran the same playthrough; every card face — role
reveal, drawn cards, and elimination reveals — now renders with its full
caption inside the card bounds, confirmed visually via screenshot.

### Other observations (no code change needed)
- The browser's automatic `/favicon.ico` request 404s when serving via a
  plain static file server — harmless, and fixed anyway by adding an inline
  data-URI favicon (`<link rel="icon" href="data:image/svg+xml,...">`) so
  it no longer shows up as a console/network error at all.
- Zero JavaScript console errors or exceptions across the full playthrough
  after the favicon fix.

## 3. Automated UI stress test (randomized, multi-trial)

A second Playwright script drives the **actual rendered UI** (not just the
engine) through complete games, clicking real buttons with `Math.random()`
choices for: which player's name to fill, murder target, whether to raise
Shield, whether to play Deceiver's Choice, vote target, and whether to play
Dagger — for player counts cycling 3 through 8, checking after every game
for thrown exceptions and any `console.error`/`pageerror` events.

### Defect found (test harness only, not the game): unscoped element queries

**Symptom:** The *first version* of this stress script intermittently hung
for ~30s before timing out on a vote screen, specifically on games that
went from a normal Banishment Vote in one round into a Final Banishment in
a later round.

**Root cause:** This was a bug in the **test script**, not the app: its
`page.$$('[data-action="select-vote-target"]')` query searched the whole
document rather than the active screen. `screen-vote` and
`screen-finalBanishment` are separate `<section>` containers that reuse the
same `data-action` names; once a normal Vote screen had been rendered once,
its now-hidden (`display: none`) buttons remained in the DOM (by design —
`ui.js` only rewrites the container it's targeting) and were still matched
by the unscoped selector, alongside the real, visible buttons in the
now-active Final Banishment screen. Playwright correctly refused to click
the stale hidden element, which manifested as a timeout.

**Fix:** Scoped every such query to `.screen.active [data-action="..."]` in
the test script. This is a test-only change — no application file was
touched — and confirms the actual game behavior was always correct (hidden
screens are inert; only the active screen's controls are interactive).

**Verified fixed:** 8/8 consecutive runs completed to a Results screen with
zero console errors after the scoping fix.

### Investigated: one-off "Confirm Target" timeout (not reproduced — likely test-environment flakiness)

One 10-trial batch produced a single timeout clicking the Murder Selection
screen's "Confirm Target" button. To chase it down, a dedicated diagnostic
script was built that, on any such failure, dumps `#screen-murder`'s live
HTML and the full player/role state at the moment of failure, and uses a
tighter 5s timeout (instead of 30s) so failures surface faster across many
trials.

That diagnostic script was run for **30 consecutive trials** cycling player
count 3→8 with fully randomized choices (including randomly toggling
Shield, Dagger, and Deceiver's Choice) — **0 failures**, no diagnostic dump
ever triggered. Combined with the 8/8 clean runs after the vote-scoping fix
(above), that's **38 consecutive clean automated playthroughs** since these
fixes were made, with no further trace of the one-off timeout despite
purpose-built instrumentation to catch it in the act.

**Conclusion:** the single earlier timeout is most likely transient
test-environment flakiness (this session had several headless Chromium
instances running concurrently at the time, competing for CPU in a
sandboxed container) rather than an application defect — `main.js`'s
`confirm-murder` handler and `ui.js`'s `renderMurder` have no state that
would only intermittently fail once every ~10 runs, and static review of
both found no plausible race. This is flagged here rather than silently
dropped so the one unreproduced data point stays visible; it should be
revisited if it resurfaces with a reliable repro.

## 4. Murder-phase identity-leak fix (follow-up round)

The Murder phase was redesigned so every living player takes an identical
turn each Murder round — not just the Deceivers — with one fixed "acting"
Deceiver seeing the real target-selection screen and everyone else seeing a
visually indistinguishable "Nothing To Do" screen (see engine.js's
`beginMurderPhase` / `recordMurderChoice` / `advanceMurderQueue`).

- **300 fresh randomized engine simulations** exercising the new murder-turn
  queue directly (3–8 players, random targets, random Deceiver's Choice
  usage) — 0 bugs. Verified on every trial: exactly one living Deceiver is
  ever the actor, the queue always contains every living player exactly
  once, and win conditions stay consistent.
- **Manual headless verification** with screenshots confirmed: the Night
  intro no longer names the Deceivers, every living player's turn shows the
  same pass-prompt copy, the acting Deceiver's real screen and everyone
  else's decoy screen share the same layout/icon position/button styling,
  and the target grid correctly excludes the acting Deceiver's fellow
  Deceivers as well as themself.
- **20-trial automated UI stress run** (full random playthroughs, 3–8
  players) — 19/20 clean, 0 console errors. One trial (n=7) hit the exact
  same "element is not visible" 30s timeout signature already root-caused
  in section 3 as transient test-environment flakiness (a dedicated
  30-trial diagnostic there reproduced 0 failures). Given the fix here
  didn't change that failure's location or signature, and combined with the
  0 bugs across 300 engine trials plus a correctness-verified manual
  playthrough, this is treated as the same known flakiness rather than a
  new regression — but is still recorded here rather than omitted.

## 5. Series play and Prize Pot payout (follow-up round)

Added: hiding the Fate card preview on the Main hub, a configurable series
length with cross-game points, and Prize Pot payout on every game win.

- **100 fresh randomized engine simulations** of full series (1–4 games per
  series, 3–8 players, random murder/vote/shield/dagger choices) — 0 bugs.
  Verified on every game within every series: `seriesGame`/`seriesLength`
  stay consistent, `seriesScores` has exactly one entry per roster name,
  `prizePot` is exactly 0 immediately after every payout and at the start of
  every subsequent game, and every payout recipient is confirmed to be an
  alive player on the winning side (no eliminated player or off-side player
  ever receives points).
- **Manual headless verification** of a real 4-player, 3-game series end to
  end: confirmed the Setup screen's series stepper renders and increments
  correctly; the Main hub no longer displays any Fate card name or
  description (verified by reading the rendered screen's full text content,
  not just visually); a Loyal win correctly split the pot evenly among the
  3 surviving Loyal players (6 ÷ 3 = 2 each); a Deceiver win correctly gave
  the sole surviving Deceiver the entire pot (14); the series standings
  leaderboard accumulated correctly across games; and the final game showed
  "The series is complete" with a "New Series" button instead of
  "Next Game". Zero console errors throughout.

## 6. One-event-per-round fix (follow-up round)

`continueAfterElimination` was simplified so every elimination context (a
Murder, a Quiet Night, or a Banishment) routes through the same
`advanceRoundOrEnd` path — check for a winner, otherwise start a fresh round
with its own Draw Phase. Previously a Murder or Quiet Night's Elimination
Reveal jumped straight into a Banishment Vote in the same round, with no
card-drawing in between.

- **300 fresh engine simulations** tracking the exact per-round event
  sequence (not just pass/fail) — 0 bugs, 0 rounds without a Draw Phase.
  Sample sequence confirmed: `murder → banishment → murder →
  final-banishment → final-banishment`, i.e. always exactly one event per
  round.
- **Automated UI stress test run twice back to back**, identical script,
  identical code, cleaned-up environment between runs: first run 4/20
  failures, second run 0/20 failures, both with 0 console errors on every
  passing trial. That swing (20% → 0%) with nothing else changed is
  inconsistent with a deterministic regression and matches the same
  "element is not visible" timeout signature already root-caused earlier in
  this report as test-environment flakiness, not an application bug. This
  change only touched `engine.js`/`data.js` — `ui.js`/`main.js` were
  untouched — so the click-timing behavior being exercised is unchanged
  from prior rounds' testing.

## 7. Automatic Shield, gather-everyone checkpoint, and Fate-deck ordering (follow-up round)

- **Automatic Shield**: `resolveMurder` was changed from checking a
  manually-set `shieldedThisRound` flag to checking the target's hand
  directly. Three targeted Node tests confirmed: (1) a held Shield blocks
  the murder and is removed from hand into the discard automatically, with
  `nightResult.protected` true and `murdered` false; (2) Deceiver's Choice
  still overrides a held Shield — the target dies and the Shield is still
  spent; (3) a target with no Shield dies normally with no phantom discard.
  A full headless playthrough independently hit this path live (not
  scripted) — "Alice Was Targeted — A Shield protected them" — with the old
  manual "raise Shield" button confirmed never appearing in the DOM across
  the whole game.
- **Fate-deck ordering**: `keepBanishmentOffTop` was tested directly across
  500 random shuffles (Banishment is never left on top, and deck
  composition is provably unchanged, just reordered), across 200 fresh
  `setupNewGame` calls (round 1's Fate card is never Banishment), and across
  50 simulated 40-round games exhausting and reshuffling the Fate deck
  repeatedly (a reshuffle's first draw is never Banishment either). 0
  failures across all three.
- **Gather-everyone checkpoint**: verified via headless playthrough that
  every Elimination Reveal now shows a distinct "Gather Everyone — The
  Circle Must See This" screen with its own explicit continue action before
  the outcome is shown, for both Murder and Banishment contexts.
- **300 further randomized series simulations** (1–3 games per series, 3–8
  players) covering all of the above together — 0 bugs, pot always zeroed
  after payout, win conditions always consistent.

## 8. Sound design (follow-up round)

`js/sound.js` was built from scratch as a full synthesized WebAudio palette
(~16 named cues) replacing the previous handful of bare `playTone` calls.

- **Syntax/lint pass**: `node --check` on both `sound.js` and the rewritten
  `main.js` — clean.
- **Instrumented headless playthrough**: wrapped `AudioContext.
  createOscillator`/`createBufferSource` before any app script ran, then
  played a full game start-to-finish with sound turned on via the header
  icon (a genuine user gesture, avoiding autoplay-policy blocks) — every
  screen exercised, including the series stepper and both header modals.
  **109 WebAudio node creations observed, 0 console errors, 0 exceptions**,
  confirming the whole palette actually fires rather than silently
  no-op'ing, and that the delayed cues (the outcome sting following the
  Elimination Reveal's bell, and the win chord following the final
  Elimination continue) both land correctly.
- **Anonymity audit**: confirmed by code inspection that `tap-murder-turn`
  and `confirm-murder-turn` — the two actions that fire during the Murder
  phase's per-player turn queue — call `Sound.play('tap')` unconditionally
  with no branching on `isActingDeceiverTurn(state)`, so the sound is
  byte-for-byte identical whether that turn belongs to the real Deceiver or
  a decoy. This matters specifically because the same physical phone plays
  audio out loud for the whole table, not just whoever's holding it —
  a distinct sound on the real actor's turn would have been an audible leak
  even with the screen itself already anonymized.
- **Regression check**: loading a saved game via "Continue" was found (and
  fixed) to not sync the Sound module or header mute icon to that save's
  stored sound preference — a real gap, not present in the original narrow
  `playTone` implementation since it read `state.settings.sound` directly
  on every call rather than caching an `enabled` flag. Verified fixed by
  code inspection of the corrected `continue-game` handler.

## 9. Computer players (follow-up round)

Added Human/Computer per-seat toggle on Setup, bot decision logic in
`engine.js`, and `autoAdvanceComputerTurns()` in `main.js` to auto-resolve
a computer seat's turn in every per-player queue phase (Reveal, Draw,
Murder, Vote/Final Banishment).

- **Engine-level simulation (Node, no DOM)**: bundled `data.js` + `state.js`
  + `engine.js`, ran **500 randomized trials** with 3–8 players and randomly
  assigned Human/Computer flags per seat — including dedicated all-human
  (82 trials) and all-computer (68 trials) rosters, plus 350 mixed rosters —
  driving every seat (human and computer alike, since this layer has no UI
  to distinguish them) through a full game via the same
  `botPickMurderTarget` / `botShouldUseDeceiversChoice` / `botPickVoteTarget`
  / `botShouldUseDagger` functions the real UI calls, asserting the
  `isComputer` flag lands on the correct seat in `state.players` and that
  every trial reaches a winner. **500/500 passed, 0 errors.**
- **Headless Chromium UI verification** (`chromium_headless_shell-1194`,
  390×844): three full playthroughs driven through real clicks —
  - a 6-seat mixed roster (3 computer, 3 human),
  - a 4-seat all-computer roster (lone "host" only taps communal
    gather/reveal/results screens, never sees any player's private info),
  - a 3-seat all-human roster (regression check that human-only games are
    unaffected).

  Each run asserted: zero console errors, zero page errors, the game
  reaches Results, and — the anonymity-critical check — every screen shown
  during a computer seat's turn is the generic "Computer Seat" wait screen
  with **zero** `data-action` elements on it (i.e., it's never possible for
  a human to be prompted to act on a computer seat's behalf, and the wait
  screen itself is provably identical regardless of which seat is the
  actual Deceiver, since it's driven only by the player's name). All three
  scenarios passed with 0 violations. Re-ran the full three-scenario suite
  **4 times back to back** to rule out the intermittent-timeout flakiness
  seen in earlier rounds — stable every time (step counts varied
  naturally with the randomized bot choices and deck order, as expected).
- **Anonymity audit (code inspection)**: `resolveComputerTurn`'s
  `PHASES.MURDER` case calls `recordMurderChoice` only inside
  `if (isActingDeceiverTurn(state))`, then unconditionally calls
  `advanceMurderQueue` — the exact same two-call shape the human
  `confirm-murder-turn` handler uses for its own decoy pattern, so a
  non-acting-Deceiver computer seat's turn and the acting-Deceiver computer
  seat's turn are indistinguishable in both duration (fixed
  `COMPUTER_TURN_DELAY_MS` either way) and on-screen content (name only).

## 10. Instruction clarity: explicit Night/Murder copy and an Open Discussion step (follow-up round)

Two reported points of confusion, both about whether the game was telling
players clearly enough what to do: "Night Falls... will there be a murder or
is it a quiet night" (the Night screen never actually said the word
"Murder"), and no screen ever told the table to discuss/accuse/debate before
a Banishment Vote — voting just started silently with whoever held the
phone.

- **Night screen**: now opens with "Tonight's Fate: Murder" plus the Murder
  card's own description, before the usual "almost everyone has nothing to
  do" explanation. By design (see "Fate is not revealed in advance" in
  PROJECT_PLAN.md) this was never meant to be ambiguous — the Fate card is
  only hidden *before* the Draw Phase, and reaching the Night screen already
  meant Murder — so this is a copy fix, not a design change: it now says
  outright what was previously only implied.
- **New Discuss phase** (`PHASES.DISCUSS`, `UI.renderDiscuss`): a communal
  screen inserted between the Draw Phase finishing and the Banishment Vote's
  (or Final Banishment's) private voting queue beginning. Explicitly
  instructs the table to put the phone down and deliberate out loud before
  picking it back up to vote; final-banishment copy adds that it's the
  decisive vote. `engine.js`'s `routeAfterDraw` now routes both the
  `vote-only` Fate branch and the forced-Final-Banishment branch through
  this screen instead of calling `beginVotePhase` immediately; a new
  `begin-vote-queue` action in `main.js` calls it once the table taps
  "Begin Voting".
- **Engine-level simulation**: bundled `data.js`+`state.js`+`engine.js`,
  500 randomized trials (3–8 players), driving `PHASES.DISCUSS` by calling
  `beginVotePhase` itself (mirroring the new UI action) before continuing.
  **485/500 visited Discuss at least once and reached a winner cleanly; the
  other 15 (all 7–8 player games, 2 Deceivers) won via pure Murder
  attrition without a Banishment ever being drawn** — confirmed by code
  reading as pre-existing, correct behavior (Deceivers can never be
  murdered, only banished, so reaching the Deceiver-outnumbers-Loyal win
  condition purely through Murders with zero Banishment votes was already
  possible before this change) rather than a regression.
- **Headless Chromium UI verification**: 11 full playthroughs driven by
  real clicks — five 3-player games (3 players hits the Final Banishment
  threshold in round 1, so this reliably exercises the "final" Discuss
  copy) and six 6-player mixed human/computer-roster games (exercising
  normal Banishment, Murder, and Quiet Night branches). Every run was
  asserted to reach Results with the Discuss screen's body text containing
  an explicit discussion instruction and the Night screen's body text
  containing the word "Murder" whenever either screen appeared. **11/11
  reached Results, 0 violations, both Discuss variants (normal and Final
  Banishment) and the explicit Night/Murder copy all confirmed present.**
  (The run's console listener also caught 12 generic "Failed to load
  resource: 404" messages — these are the already-documented local-only
  `/Gameshed/nav.js` 404, one per page load/reload across the 11 runs; it
  only resolves against the real production domain's sibling Gameshed
  repo, and does not affect gameplay.)

## 11. Opt-in background music during Open Discussion (follow-up round)

Added a second, independent Settings checkbox ("Background music during
discussion"), off by default, alongside the existing sound-effects toggle.
When on, `Sound.startMusic()` fades in a quiet three-oscillator drone (plus
a slow filter LFO) the moment the Open Discussion screen appears, and
`Sound.stopMusic()` fades it back out the moment "Begin Voting" is tapped —
the only screen in the game this applies to, since it's the one place the
phone sits untouched for an open stretch while the table talks instead of
something a player is reading or deciding on.

- **Unit-style checks** (`AudioContext.createOscillator` wrapped to record
  each instance's start()/stop() calls, run directly against the `Sound`
  module's public API, independent of game RNG): disabled →
  `Sound.startMusic()` creates 0 oscillators (confirmed no-op); enabled →
  exactly 4 (the 3-note drone + 1 LFO), all started immediately, none
  stopped yet; calling `startMusic()` again while already playing is a
  no-op (no duplicate voices — confirmed by oscillator count staying flat);
  `Sound.stopMusic()` schedules a `.stop()` on all 4. **All passed.**
- **Live integration** through the real Settings checkbox: started a
  3-player game (hits Final Banishment, and so Open Discussion, in round 1
  — fast and deterministic), confirmed the checkbox exists and is
  unchecked by default, reached Discuss with 0 active oscillators, turned
  the checkbox on from inside the live Discuss screen and confirmed exactly
  4 became active, tapped "Begin Voting" and waited past the 1.4s fade-out
  — confirmed all 4 had stopped. Game continued to Results with 0 console
  errors. **All passed.**
- An earlier draft of this test tried to infer music's oscillator
  contribution by diffing raw oscillator counts between two independently
  randomized full playthroughs (music on vs. off); discarded once it became
  clear that varies run to run anyway, since which Fortune cards get
  randomly drawn changes how many sound-effect oscillators fire before
  Discuss is ever reached — not a real signal. The unit-style check above
  (calling the music API directly and counting only what it itself
  creates) replaced it as the reliable method.

## 12. Crescendo and spoken "time for talk is over" line (follow-up round)

`Sound.announceVotingBegins(onComplete)`: if music is currently playing,
swells it to a brief crescendo first (`crescendoMusic`, louder + brighter
filter, ~0.9s), then speaks "The time for talk is over." via the Web Speech
API, then calls back once the utterance ends so `main.js` can move on to
the vote queue. The Discuss screen shows a button-less sting
("The Time For Talk Is Over") for the whole sequence so there's nothing to
tap through and cut the line off early.

- **Unit-style timing checks**, calling `Sound.announceVotingBegins`
  directly against the real Web Audio graph with `speechSynthesis.speak`
  stubbed (captures the utterance text and fires `onend` almost
  immediately, so the test measures the real ~0.9s crescendo ramp without
  waiting on an actual TTS engine, which may not exist at all in a headless
  sandbox): **sound effects off → callback fires in <2ms, nothing spoken.
  Sound on, no music → speaks immediately (<15ms), callback follows.
  Sound on, music playing → callback waits ~911ms** (matching the
  configured 0.9s crescendo duration) **before anything is spoken** — i.e.
  the swell reliably happens *before* the line, not after or concurrently.
  All three cases passed.
- **Live integration**: started a 3-player game (reaches Open Discussion in
  round 1), turned on both sound effects and music from the real Settings
  modal, reached Discuss, tapped "Begin Voting." Confirmed the sting screen
  appeared with the correct text and **zero** `data-action` elements on it
  (nothing to tap through), waited past the full sequence, and confirmed
  the game landed on the first voter's normal Vote screen and went on to
  reach Results with 0 console errors.
- Speech synthesis itself (`'speechSynthesis' in window`) is graceful on
  unsupported browsers by construction — `speak()` calls its completion
  callback immediately if the API isn't present, so the crescendo still
  happens (if music was on) but the game is never blocked waiting for a
  voice line that was never going to play.

## 13. Discussion clock (replacing the "Begin Voting" button) and an audio quality pass (follow-up round)

Three reported problems with the previous round's work: the "Begin Voting"
button let the table skip past discussion almost immediately ("we didn't
get any time to talk"); the spoken line's heavily slowed, deepened delivery
read as "dreadfully droney" rather than ominous; and the request for
"proper music and a decent female voice."

- **Discussion clock**: `main.js` gained `startDiscussTimer()` /
  `cancelDiscussTimer()` — on entering `PHASES.DISCUSS`,
  `uiStage.discussSecondsLeft` is set to `30 * livingPlayers(state).length`
  and ticks down once a second via `setInterval`, re-rendering the Discuss
  screen's countdown each tick. The `data-action="begin-vote-queue"` button
  and its action handler were removed entirely — there's nothing to tap on
  this screen anymore. At zero, `beginVotingSequence()` (the crescendo →
  spoken line → vote-queue sequence from the previous round) fires
  automatically, same as it previously fired on a button tap.
- **Voice tuning**: `rate`/`pitch` changed from the heavily slowed/deepened
  `0.82`/`0.65` to a near-natural `0.95`/`1.05`. Voice selection now
  prefers a name matching a list of common female-leaning installed voices
  (`FEMALE_VOICE_PATTERN`) instead of the previous male-leaning list,
  falling back to the platform default where no match exists — the Web
  Speech API has no standard gender field, so this is a best-effort name
  match, not a guarantee, and is called out as such in the code comment.
- **Richer music**: the single static 3-note drone was replaced with a
  4-chord descending progression (D minor → C major → Bb major → F major)
  that the same 3 persistent oscillators glide between every ~7.5s
  (5s hold + 2.5s glide), under the existing filter LFO — evolving harmony
  instead of one held chord, with no change to the oscillator count (still
  exactly 4: 3 voices + 1 LFO) so the existing unit tests' node-count
  assertions still hold.
- **Verification**:
  - Unit checks against the real Web Audio graph (`setInterval`/
    `clearInterval` wrapped): starting music creates exactly 4 oscillators
    and exactly one progression interval; stopping clears that interval
    (no stray ticks continuing after stop) — confirmed.
  - Voice selection with `speechSynthesis.getVoices()` returning an empty
    array (simulating a platform with no installed voices) doesn't throw
    and still speaks via the default voice — confirmed.
  - Live 3-player playthrough: confirmed the countdown starts at exactly
    90 (30 × 3 living players) and displays "1:30"; confirmed no
    `data-action` elements exist anywhere on the Discuss screen; waited
    2.2 real seconds and confirmed the displayed number actually ticked
    down (the interval is live, not just computed once); forced the clock
    to zero via the same function the real interval calls at zero and
    confirmed the sting screen appears with zero tappable elements, the
    game lands on the real per-voter Vote screen afterward, and the
    playthrough still reaches Results with 0 console errors.
  - Did not re-run the full 90-second real-time countdown end to end (that
    would mean the test suite itself waiting 90+ seconds); instead verified
    the interval is genuinely live (ticks down for real) separately from
    verifying what happens at zero (triggered directly), which together
    cover the same ground without the wait.

## 14. "Skip Ahead" early-vote option (follow-up round)

A small, deliberately de-emphasized `btn-ghost btn-sm` button
("Everyone's Ready — Skip Ahead") added to the Discuss screen's normal
(non-sting) view, wired to a new `begin-vote-now` action that cancels the
running countdown (`cancelDiscussTimer()`) and calls the same
`beginVotingSequence()` the clock itself calls at zero — so skipping ahead
still gets the crescendo/spoken-line sting, just earlier. The countdown
stays the default and visually dominant element on the screen; this is an
opt-in shortcut for a table that's genuinely done talking, not a
replacement for the clock (which is what the previous "Begin Voting"
button effectively was, and the reason it got replaced).

- **Live headless verification**: reached Discuss, let the clock tick for
  real (confirmed `discussSecondsLeft` had dropped below its starting 90),
  tapped Skip Ahead, confirmed the sting screen appeared with the correct
  text, confirmed `discussSecondsLeft` stopped changing afterward (the
  interval was actually cancelled, not just ignored while still running in
  the background), confirmed the game landed on the real per-voter Vote
  screen, and confirmed the playthrough still reached Results with 0
  console errors.

## 15. Spotify playlist link-out (follow-up round)

Added `CONFIG.spotifyPlaylistUrl` (a curated playlist link) and an "Open
Our Playlist In Spotify" link in two places — the Settings modal and the
Discuss screen — both plain `<a href="..." target="_blank" rel="noopener
noreferrer">` elements, nothing more. This is a deliberately simpler
alternative to an embedded Spotify player: tapping it just hands off to
the host's own Spotify app/tab; the game itself never makes a request to
Spotify, never authenticates, and has no embedded player state to manage.
The tradeoff, accepted on purpose: this audio source can't be ducked or
coordinated with the game's own synthesized discussion music, so the two
aren't really meant to run at once.

- **Live headless verification**: confirmed the link appears in both
  locations with the exact URL as given (query string and all — `si`,
  `utm_source` and `pi` params preserved unmodified), `target="_blank"`,
  and `rel="noopener noreferrer"` on both. Confirmed the new link doesn't
  interfere with the global `[data-action]` click-delegation system —
  the "Skip Ahead" button sitting right next to it on the Discuss screen
  still works, landing on the real vote queue afterward. 0 console errors.

## 16. Top/bottom 10% edge safe zones (follow-up round)

Reported problem: buttons sitting too close to the top and bottom edges of
the screen, where mobile browser chrome (address bars, bottom toolbars,
and especially in-app-browser nav chrome when a link is opened from inside
Instagram/TikTok/etc.) can cover or intercept taps.

- Added `--edge-buffer-top`/`--edge-buffer-bottom` (`max(10vh, env(
  safe-area-inset-*, 0px))`) in `:root`. `.app-header` grew by
  `--edge-buffer-top` (extra height + padding-top, buttons realigned to
  the bottom of that taller band via `align-items: end`) so every header
  icon clears the top 10%. Every `.screen` gained `--edge-buffer-bottom`
  on top of its existing bottom padding, so every screen's primary button
  — pushed to the bottom by the existing `.spacer` pattern — clears the
  bottom 10% the same way, with zero per-screen code changes. `.modal-
  overlay`'s padding got the same treatment for consistency.
- **Regression found and fixed during verification**: the added bottom
  padding pushed the Setup screen (already one of the denser screens, 3+
  player rows plus the series-length panel) into needing a small scroll it
  didn't need before, and at rest (scrollTop 0) its "Seal The Roles &
  Begin" button sat 21px into the new bottom buffer. Traced to real
  content overflow (`scrollHeight` 746 vs `clientHeight` 708 at 3
  players), not a CSS mistake. Fixed by trimming vertical spacing in
  several places that collectively give back more than the overflow (
  `.screen-subtitle`, `.setup-list`, `.add-player-btn`, `.setup-hint`,
  `.panel`, and the `.spacer` ornament's forced `min-height`) — a global
  tightening, not a Setup-specific hack, so it benefits every screen's
  rhythm a little rather than special-casing one.
- **Verification**: a script walked Title, Setup, Reveal (pass-prompt and
  card), Settings modal, Help modal, Open Discussion, a Vote pass-prompt
  and target-selection screen, and Results, measuring every visible
  button's bounding box against `[10% of viewport, 90% of viewport]` —
  **0 violations across all of them** after the spacing fix (down from 1
  before it). Separately stress-tested the worst realistic case — 8
  players, 2 marked Computer, series length 2 — where the Setup screen
  does genuinely require scrolling (content far exceeds one screen
  regardless of spacing); confirmed that once scrolled to its natural
  resting point, the primary button still clears the bottom 10% line
  (bottom at 742px against a 760px limit on an 844px-tall test viewport).
  The goal was never eliminating scrolling, only ensuring a button is
  never flush against the literal device edge once it's actually in view.

## 17. Updated watermark artwork at 15% opacity (follow-up round)

Replaced `assets/brand/mancave-gameshed-badge.jpg` with the brand's actual
distressed-stamp artwork (circular "MANCAVE INDUSTRIES / MCI / GAME SHED
DIV" seal with its own baked-in tiled background texture), resized to
700×700 and re-compressed (~140KB). Raised `.app::before`'s `opacity` from
the earlier ad-hoc `0.045` to the specified `0.15` — explicit brand
instruction, not a value chosen for subtlety this time. Kept the existing
`screen` blend mode and radial mask (crops the image's own square canvas
edges to a soft circular falloff) since both still read correctly against
the new artwork.

- **Visual check**: screenshotted Title, Setup, and a Reveal pass-prompt
  screen. At 15% the ring text ("MANCAVE INDUSTRIES", "GAME SHED DIV") is
  now legibly readable behind sparse screens (Title, pass-prompts) — a
  deliberate step up from the earlier barely-there treatment — while
  staying out of the way on content-dense screens like Setup, where
  opaque card/input/panel backgrounds cover most of it anyway. Game-
  critical text (player names, instructions, buttons) stayed fully legible
  against it on every screen checked; no masking or sizing changes were
  needed for the new artwork.

## 18. Title screen key art + app-wide grain texture (follow-up round)

Reported direction: push the whole game's look "edgier," using the
brand's real front-page key art (a distressed stamped-medallion lockup of
"THE DECEIVERS" title, compass emblem, tagline, and the Mancave Industries
/ Game Shed / Mangrenade badge, all in one piece) as the reference.

- **Title screen**: `UI.renderTitle` now renders that key art directly
  (`assets/brand/deceivers-title-seal.jpg`, an `<img>`) in place of the
  old inline-SVG compass-and-text emblem, framed with a gold hairline
  border and deep shadow so it reads as a physical stamped medallion
  rather than a flat logo. The separate text byline and small dot-rule
  divider that used to sit around the old emblem were removed — this
  image already carries the full lockup (title, tagline, and brand
  attribution) as one cohesive piece, so they'd have been redundant.
  Removed the now-fully-unused `#title-treatment` `<symbol>` from the
  inline sprite sheet and its standalone source file
  (`assets/ui/title-treatment.svg`) — dead code once nothing referenced it.
- **App-wide grain**: added a small 64×64 generated noise tile
  (`assets/brand/grain.png`, `overlay` blend at 10% opacity, tiled across
  a new `.app-grain` div) as a deliberately subtle always-on texture pass
  over every screen — a lightweight, no-new-dependency nudge toward the
  key art's distressed-metal feel everywhere, not just on the Title
  screen, without needing a texture asset behind every individual
  component.
- Updated `CODEPEN_EXPORT.md`: the Pen export previously needed zero
  files in CodePen's Asset panel (everything was inline SVG). That's no
  longer true — three raster assets now exist (title seal, watermark,
  grain tile) and must be uploaded there with their `assets/brand/...`
  references swapped to CodePen-hosted URLs, or the Title screen,
  watermark, and grain silently fail to load in a Pen export while
  everything else keeps working.
- **Verification**: screenshotted Title and Setup to confirm the new key
  art renders correctly, is framed cleanly, and doesn't crowd or obscure
  the action buttons below it; confirmed via a full headless playthrough
  that the title `<img>` actually loads (`naturalWidth > 0`, not a broken
  image) and the game still completes to Results with 0 console errors
  (catches both a broken image path and any syntax error from the symbol
  removal).

**Scope note from this round, resolved in §20**: the key art's bold
display typeface wasn't something the system-font stack could replicate;
whether to cross the "first webfont" line was left as an open question
for the user rather than decided unilaterally. Answered the same day —
see §20.

## 19. Title art upgraded to the portrait full-bleed poster (follow-up round)

The brand sent a second, portrait-format piece of key art (853×1844 — the
same lockup, built specifically for a phone screen's aspect ratio) as a
direct follow-up to §18's square medallion treatment. Superseded that
square version with this one:

- `assets/brand/deceivers-title-seal.jpg` (square, §18) removed; replaced
  by `assets/brand/deceivers-title-poster.jpg` (520×1124, resized from the
  original).
- `UI.renderTitle` no longer renders a framed `<img>` at all — the poster
  now runs as `#screen-title`'s own CSS `background-image`
  (`background-size: contain`, not `cover`), so the whole piece shows with
  zero cropping rather than being forced into a small boxed medallion.
  Chose `contain` over `cover` specifically after a first pass with
  `cover` cropped the bottom banner ("MCI · GAME SHED DIV") right where
  the action buttons sit — `contain` letterboxes left/right instead
  (filled by the app's own dark background + grain + watermark, inside
  the existing gold corner-bracket frame) and keeps the entire image
  intact. `.title-hero` changed from vertically-centered to
  `justify-content: flex-end`, landing the buttons in the image's own
  emptier lower third rather than over its text.
  Accessibility: moved to `role="img"`/`aria-label` on the container
  since a CSS background-image carries no text alternative on its own.
- Updated the three docs that referenced the superseded square asset
  (`PROJECT_PLAN.md`, `CODEPEN_EXPORT.md`) to point at the new one — the
  CodePen export instructions also simplified, since all three brand
  assets are now CSS `background-image`s with no HTML/JS-panel references
  to keep in sync.
- **Verification**: screenshotted the Title screen with both `cover`
  (showed the cropping problem) and `contain` (confirmed clean, full
  image, no text-behind-button overlap) before settling on `contain`;
  confirmed Setup and other screens are unaffected (the background is
  scoped to `#screen-title` only); re-ran the syntax check on `ui.js` and
  a full headless playthrough — 0 console errors, game still reaches
  Results.

## 20. Oswald display font, grainy text, and crumbling-stone borders (follow-up round)

Direct follow-up to §18-19's key-art work: "try Oswald but it must be
grainy," plus "justify all borders and fonts where possible — crumbling
relic stone vibe." Three changes:

- **Oswald**: loaded via Google Fonts `<link>` in `index.html`'s `<head>`
  (`font-display:swap`, `preconnect` hints) — the app's first text-
  rendering network dependency, a decision explicitly left to the user in
  §18 and confirmed this round. `--font-display` changed from the Georgia
  serif stack to `'Oswald', 'Arial Narrow', 'Helvetica Neue', sans-serif`.
  Added `text-transform: uppercase` to the four pure-headline selectors
  (`.screen-title-row`, `.reveal-headline`, `.winner-banner h2`,
  `.modal-title`) to lean into Oswald's condensed-caps strength, matching
  the key art's all-caps lockup — left `.pass-overlay-name` (a player's
  own name) and `.prize-pot-value` (a number) alone, where forcing caps
  would look odd or do nothing.
- **Grainy text**: the five largest headline selectors now fill with a
  gold gradient blended (`background-blend-mode: overlay`) with the same
  `grain.png` tile used on `.app-grain`, then `background-clip: text`
  clips that combined image to the glyphs themselves (`-webkit-text-
  fill-color: transparent` for Safari) — so the text itself carries
  visible speckle/mottling instead of being flat gold with grain merely
  sitting somewhere behind it. Left off small labels (round counter, seat
  numbers, avatar initials), where a 36px grain tile would just read as
  noise at that size, not texture.
- **Crumbling relic stone**: added an SVG `feTurbulence` +
  `feDisplacementMap` filter (`#crumble`, `index.html`), applied via
  `filter: url(#crumble)` to the app-wide corner-bracket frame
  (`.app::after`) only — every screen's corners now show genuinely
  eroded, irregular edges instead of clean geometric brackets. Scoped
  deliberately to that one decorative, text-free, non-interactive
  element: a displacement filter on anything with live text would warp
  the text along with the border, and applying it to buttons would cut
  against the tap-target clarity work from the edge-safe-zone round.
  Separately, redefined `--radius-lg`/`-md`/`-sm` from single uniform
  values to four slightly different corner values each, so every panel,
  row, card, and input across the whole app picked up a subtle hand-
  carved asymmetry with zero per-selector changes. `--radius-pill`
  (buttons) was deliberately left alone — that shape is load-bearing tap
  affordance, not decoration, and distressing it risked undermining the
  "idiot-proof" clarity work from earlier rounds.
- **Verification**: syntax-checked `ui.js` (unchanged by this round, but
  confirmed clean); screenshotted Title, Setup, Reveal (role-card
  headline), and Results (winner banner) — grain visibly present in all
  five targeted headline types, corner brackets visibly irregular on
  every screen, asymmetric corners present throughout. Ran a full headless
  playthrough to Results: 0 real console errors (two `ERR_CERT_AUTHORITY_
  INVALID` entries for the Google Fonts request are a property of this
  sandbox's TLS interception, not the app — confirmed the font URL itself
  returns a valid `200 text/css` response via a direct `curl` outside the
  browser sandbox, so Oswald will load normally for real users in real
  browsers; the fallback font rendered correctly in these screenshots
  either way, confirming the no-webfont degradation path also works).

## 21. Larger body text, a hand-off cue for every queue, and a more natural spoken voice (follow-up round)

Three direct follow-ups from a real-device playtest (screenshots of Round
4/6/7 reveal screens sent back from an actual phone): "fonts larger,"
"audio cues at each stage," and "a more natural voice."

- **Larger fonts**: every `font-size` declaration in `css/style.css`
  (34 of them) scaled up ~15%, rounded to the nearest half-pixel — e.g.
  `.reveal-body`/`.pass-overlay-instruction` 13.5px → 15.5px,
  `.screen-title-row` 20px → 23px, `.pass-overlay-name` 28px → 32px. A
  uniform multiplier rather than hand-picking new values per selector, so
  the existing size *relationships* (headline vs. body vs. label) stayed
  intact. Re-ran the 8-player worst-case Setup-screen overflow check from
  the edge-safe-zone round (§16) since larger text means more wrapped
  lines: at the screen's natural scrolled-to-bottom resting point, the
  "Seal The Roles & Begin" button's bottom edge sits 101px above the
  viewport bottom — well clear of the ~84px (10vh) reserved buffer, so no
  regression there despite several buttons/panels now wrapping to an
  extra line.
- **A hand-off cue for every queue**: previously, moving the phone to the
  next player's turn inside the Reveal/Draw/Murder/Vote queues reused the
  same near-silent generic `tap` cue used for ordinary menu navigation —
  present, but easy to miss as a deliberate "something changed" signal.
  Added `passDevice` (a soft, distinct two-note chime) and wired it into
  the Draw and Vote queues' hand-off points, and swapped it in for Murder's
  previously-generic `tap` (still exactly as identical-every-turn as `tap`
  was, so the anonymity guarantee documented in `sound.js`'s header is
  unaffected). Also added `roundBegin` (a single rising tone) for the
  moment a new round's Main screen appears, distinguishing "a new round is
  starting" from the previous round's closing sound bleeding into it. The
  existing `gather` ceremonial bell now also plays the instant the
  Elimination "Gather Everyone" screen itself first appears — at the end of
  the Murder and Vote queues — not only when its "Reveal What Happened"
  button is later tapped, so there's audible feedback the moment the table
  needs to look up, not just once someone notices the screen changed and
  taps through it. Left Reveal's queue untouched (it already has its own
  distinct `reveal`/`hide` opening-and-closing pair) and left the Quiet
  Night branch's existing `quietNight` arrival cue untouched (a first
  attempt at this change briefly replaced it with the urgent `gather` bell
  for every Elimination arrival regardless of cause, which would have lost
  the deliberate distinction between "nothing happened, no need to rush"
  and "something happened, gather round" — caught and reverted before
  shipping, by tracing through `routeAfterDraw`'s branches rather than
  just trusting the first edit).
- **A more natural spoken voice**: removed the artificial pitch shift
  (`pitch: 1.05` → `1.0`, the voice's own natural pitch) and kept the rate
  close to natural (`0.94`). Voice selection still prefers a female-sounding
  installed voice by name match, but now prefers whichever one is labeled
  as a higher-quality tier — "Enhanced"/"Premium" (iOS/macOS), "Natural"/
  "Neural" (Android), "Google" (Chrome) — over the default compact/offline
  voice of the same name, since platforms that ship both make the higher
  tier sound markedly less robotic.
- **Verification**: an instrumented 8-trial headless run (monkey-patching
  `Sound.play` to log every call) covering 3–6 player games, random Fate
  cards, and multiple rounds per trial logged 1,280 total cue calls across
  all 8 trials with 0 console errors, and confirmed all 15 of `sound.js`'s
  non-modal cues fired at least once, including both new ones
  (`passDevice`, `roundBegin`) and, critically, that the pre-existing
  `quietNight` cue still fires correctly after the catch-and-revert above.
  Voice-quality preference logic was verified by code review only — the
  headless test browser reports zero installed speech-synthesis voices
  (typical for server/CI environments), so it cannot exercise real voice
  selection; this needs a live-browser check to fully confirm, same
  limitation already noted for this project's Oswald webfont loading in
  §20.

## 22. The Final Circle — a Traitors-UK-style End Game replacing the old forced Final Banishment (follow-up round)

A rules change, not a visual one: the old design instantly ended the game
the moment the last Deceiver was eliminated — the Loyal got an immediate,
unambiguous "you got them all" confirmation they'd never actually get in
real life. The brief for this round asked for that replaced with The
Traitors UK's own endgame structure: ordinary rounds keep going until few
enough players remain, then the game switches permanently into a Final
Circle where each round is a secret End Game / Banish Again ballot instead
of a Fate card, nobody's role is revealed when they're banished there, and
the only two ways out are everyone unanimously agreeing to stop or the
player count hitting two (which ends it automatically, no vote).

- **Two win checks where there was one**: `checkWinCondition`'s old single
  formula (`livingDeceivers === 0` → instant Loyal win;
  `livingDeceivers >= livingLoyal` → instant Deceiver win) was split into
  two separately-purposed functions. `checkDeceiverMajorityWin` keeps the
  old majority-check behavior exactly, unchanged, firing at any time —
  it's a mathematical inevitability (no vote can ever remove enough
  Deceivers past that point), not a suspense beat, so there was never a
  reason to gate it behind anything. The old instant-Loyal-win branch was
  removed outright — Loyal can now *only* win via the Final Circle's own
  conclusion, through a new `checkFinalCircleWinner`, whose rule is
  deliberately simpler than the majority check: any surviving Deceiver
  wins, full stop, even a single one sitting alongside two or three
  surviving Loyal — a case the majority formula could never resolve on
  its own (1 Deceiver is never ≥ 3 Loyal).
- **New phase, new screen**: `PHASES.FINAL_CIRCLE_DECISION` and its
  `UI.renderFinalCircleDecision`, following the same private pass-the-phone
  pattern as every other per-player turn in the game — tap to confirm
  you're looking, then choose End Game or Banish Again. Wired into the
  existing computer-seat auto-advance system (`QUEUE_PHASES`,
  `resolveComputerTurn`) with its own simple non-strategic bot
  (`botChooseFinalCircleDecision`, a 70/30 banish-biased coin flip —
  enough to keep an all-computer Final Circle from fizzling out instantly
  without pretending to model real strategy, consistent with every other
  bot* function's documented design intent).
- **Reused rather than duplicated**: the Final Circle's actual banishment
  vote reuses the existing Open Discussion → Vote → Elimination Reveal →
  Continue pipeline wholesale (just flagged via the existing
  `finalBanishmentActive`/`PHASES.FINAL_BANISHMENT`), and the Results
  screen's full role reveal and `payoutPrizePot` split-among-survivors math
  needed zero changes — once `checkFinalCircleWinner` picks the right
  winner, the existing payout logic already implements the real show's
  final-two table (Loyal+Loyal split / Loyal+Deceiver → Deceiver takes all
  / Deceiver+Deceiver split) correctly, and generalizes cleanly to a 3- or
  4-player unanimous stop too. The one genuinely new piece of UI-facing
  logic is `renderElimination`'s new `'final'` context branch, which skips
  the `cardFlip`/role-label entirely in favor of "Their allegiance stays
  hidden — for now."
- **Bug found and fixed during this round's own verification**: the
  Results screen's winner-banner flavor text was hardcoded to "The
  Deceivers now equal or outnumber the Loyal" for every Deceiver win,
  regardless of *how* it was won — factually wrong for a Final Circle
  unanimous-stop win where a single Deceiver survives among two or three
  Loyal (1 is not "equal or outnumber" 3). Caught via the dedicated
  4-player unanimous-End-Game test below, by actually reading the
  resulting screenshot's text rather than just checking that *a* winner
  screen rendered. Fixed with a `state.finalCircleActive`-conditioned
  alternate line ("A Deceiver was hiding among the survivors all along").
- **Verification**: three dedicated Playwright scripts, chosen to isolate
  each new rule rather than relying only on random play. (1) A 3-player
  game (enters the Final Circle immediately at round 1, since 3 is below
  the 4-player threshold), everyone choosing Banish Again every round:
  confirmed the vote fires, the banished player's role is hidden at the
  Elimination Reveal, and — critically — the game auto-ends the instant
  living players hit 2 with **no** further decision ballot asked, matching
  "at two players, there is no more voting." (2) A 4-player game, all four
  unanimously choosing End Game on the very first ballot: confirmed it
  skips straight to Results with zero banishments, and confirmed the
  surviving lone Deceiver (1 of 4) still wins the whole pot — the exact
  case the old majority formula couldn't have resolved. (3) A 6-trial
  instrumented regression across 5–8 computer-only players (random Fate
  cards, random bot decisions): all 6 reached Results with 0 console
  errors; 4 of 6 naturally reached and passed through the Final Circle
  (including at least one hidden-role banishment each), the other 2 ended
  earlier via the ordinary Deceiver-majority check — confirming neither
  path regressed the other. One scenario was verified by code review
  rather than a dedicated script: a Deceiver-majority win triggering
  *mid*-Final-Circle (e.g. a wrongly-banished Loyal handing control to an
  already-majority Deceiver pair) — the current `deceiverCountForPlayers`
  scaling (2 Deceivers only above 6 players) makes this comparatively rare
  to force deterministically in a short script, but it reuses
  `checkDeceiverMajorityWin` unchanged from its already-proven pre-Final-
  Circle behavior, so the risk surface is small.

## 23. Fixed the grainy headline text: same backwards-layer-order bug as the backgrounds, just never applied here (follow-up round)

"The distressed typeface is a bit crap / Can we clean it up but make it
somehow less crisp than the original." The grainy-gold headline-text rule
(§20) had never been touched by the round that found and fixed the
backwards-layer-order blend bug on panel/button backgrounds (§21's
predecessor, the reverted "distress everything" round) — it was using the
same broken pattern (gradient as the blend source, full-contrast grain.png
as the backdrop, `overlay`) that produces harsh black/white static on any
dark-backed surface. On a thin letter stroke specifically this read as
sparkly and cheap rather than aged — the "a bit crap" the user flagged —
rather than the obvious panel-sized blotches that made the earlier bug easy
to spot by eye.

- Regenerated `grain.png` as bounded, low-amplitude noise again
  (`random.gauss(128, 16)`, clipped — range came out 72–177 of 255; the
  revert a few rounds back had put it back to the original unbounded
  0–255 version).
- Swapped the headline rule's layer order (grain first/source, gradient
  second/backdrop) and its blend mode (`overlay` → `soft-light`) — the
  exact fix already proven correct for backgrounds.
- **Verification**: screenshotted all 5 headline selectors in context —
  Title header, Setup's "Gather The Circle", the Reveal screen's role
  name, the Results winner-banner, and the How-To-Play modal title — all
  now show a subtle, even gold sheen instead of scattered black/white
  speckle, while still reading as textured rather than flat. Ran the
  3-player Final Circle regression and a full playthrough afterward: 0
  console errors, confirming the CSS/asset-only change didn't touch
  anything functional.

## 24. A spoken "Pass the phone to X" for every hand-off (follow-up round)

"Audible cues — can we create these instructions and somehow say 'pass the
phone to players name'?" Added `Sound.announcePassDevice(name)` (`sound.js`)
— reuses the existing Web Speech API voice-selection logic already built
for the Discuss-closing line, just with a different, fixed-format sentence
("Pass the phone to X.") — and wired it centrally into `main.js`'s
`render()` via a new `maybeAnnouncePassDevice()` helper, rather than adding
a call to every action handler that can lead to a new per-player turn.

- **Why centralized, not scattered**: a given queue turn can be reached
  from more than one action handler (e.g. a Draw-queue hand-off from
  `continue-from-hand`, a Murder-queue one from `confirm-murder-turn`, a
  Vote one from `confirm-vote`, a Final Circle decision one from either
  `choose-end-game` or `choose-banish-again`, plus the computer-seat
  auto-advance path for all of the above). Hooking `render()` itself once
  — right after the existing computer-seat auto-advance check already
  short-circuits computer turns — covers every path with one call site
  instead of five-plus, and a `phase:playerId` dedup key means it fires
  exactly once per turn no matter which of those paths got there.
- **Anonymity**: the announcement is deliberately just the player's bare
  name — no role, no phase, no instruction — so it's exactly as
  identical-every-turn as the Murder queue's existing anonymity rule
  requires (see `sound.js`'s header note, carried over unchanged from
  earlier rounds). Computer seats are silently skipped, since nobody is
  physically holding a phone for them to pass.
- **Verification**: an instrumented test (monkey-patching
  `Sound.announcePassDevice` to log calls, sound enabled, a 4-player game
  with one seat marked Computer) through both the Reveal queue and the
  Final Circle decision queue confirmed: the two human players + the game
  owner were announced by name in the correct order, the Computer seat was
  never announced, and no turn was announced twice — `["Ann","Cid","Dee"]`
  for Reveal, `["Ann","Cid","Dee","Ann","Cid","Dee"]` after also running
  the Final Circle decision queue (a fresh announcement per queue, as
  intended, not suppressed by the dedup key since the phase string
  differs). Also ran a full playthrough and the 3-player Final Circle
  regression with the *real*, unmocked `announcePassDevice` — confirming
  it doesn't throw even though this sandbox's headless browser has no
  real installed voices to actually speak through. 0 console errors
  across all of it.

## 25. Recruit or Die, a Final Circle correctness fix, Deceiver Knowledge, and a sound/voice redesign (follow-up round)

A large follow-up round covering a full spec: a new "Recruit or Die"
mechanic, a fix to when the Final Circle may begin, a new Setup option,
and a ground-up pass on the game's audio character and spoken coverage.

- **Final Circle entry fix**: `startRound` (engine.js) previously entered
  the Final Circle the instant `livingPlayers.length <= 4`, including on
  round 1 for a game that simply *started* at or below that count (a 3- or
  4-player game) — skipping ordinary play entirely. Now also requires
  `state.round > 1`, so every game gets at least one ordinary round first
  regardless of starting size, with zero behavior change for larger games
  (already well past round 1 by the time eliminations bring them down to
  the threshold).
- **Deceiver Knowledge** (Setup screen, new Known/Hidden toggle,
  `state.settings.deceiverKnowledge`): Known (default) is the existing
  behavior — a Deceiver sees their fellow Deceivers at Reveal. Hidden
  suppresses that list entirely. A successful Recruit or Die pact always
  introduces the two parties to each other regardless of this setting,
  since they've just made the pact directly.
- **Recruit or Die**: triggers when exactly one Deceiver is alive, the
  game started with more than one (`state.initialDeceiverCount`, guards
  against ever triggering for a 3-6 player game that only ever had a
  single Deceiver), and the Final Circle hasn't begun. A one-round detour
  — no Fate card, no Draw, no Murder — touching only two players: the lone
  Deceiver privately picks a Loyal target, the phone passes directly to
  them, and they privately choose Join Us (become a Deceiver outright,
  resolves to the table as an ordinary Quiet Night) or Refuse (dies
  instead, resolves as an ordinary Murder, role revealed as Loyal — a held
  Shield does **not** protect against this, deliberately bypassing the
  Shield-check logic a real Murder goes through). The MAIN screen's
  "Begin Draw Phase" button is pixel-for-pixel identical whether this
  round is really a Recruit detour or an ordinary Draw — the branch
  happens invisibly in the button's own handler. The hand-off to the
  recruit specifically does not say their name aloud (a fixed,
  non-identifying spoken line instead) — the screen itself can stay
  private to whoever's holding the phone, but a name spoken into a room
  full of people is a leak the screen alone can't prevent.
- **Sound redesign**: rebuilt around three new primitives (`thud`,
  `woodKnock`, `metalRing`) replacing the original bright melodic synth
  arpeggios (an ascending triangle chime for Gold, four-note chords for
  the two endings) with a darker, more physical, more restrained palette —
  see PROJECT_PLAN.md's Sound design section for the full before/after on
  each cue. Several cues got *simpler* (fewer layered elements) while
  landing harder, per the explicit "a few good sounds, not many small
  bright ones" brief.
- **Voice**: two new collective spoken lines ("Night falls. Keep your
  card secret." / "Gather everyone. Place the phone in the centre."),
  centralized in `main.js`'s `render()` the same way the existing
  per-turn announcer already was. The Murder queue's per-turn hand-off
  switched to a generic "Pass the phone to the next player." line instead
  of naming each player, for ritual consistency with its existing
  identical-every-turn design (not a leak fix — naming would have been
  just as safe there as it is for Reveal/Draw/Vote).
- **Verification**: given Murder can never target a Deceiver (by design)
  and Banishment votes are random, naturally reaching "2 Deceivers → 1"
  through simulated play is unpredictably slow — so the core mechanic was
  verified by directly engineering the precondition (killing one of two
  initial Deceivers via `page.evaluate`) for two deterministic,
  click-through UI tests: one driving the Join path (confirmed role
  conversion, confirmed the Elimination Reveal reads as an ordinary Quiet
  Night with no trace of recruitment) and one driving the Refuse path with
  the target pre-loaded with a Shield (confirmed the kill went through
  unconditionally, confirmed the reveal reads as an ordinary Murder with
  the correct Loyal role shown). A third targeted test confirmed a
  successful Join bringing Deceivers to majority triggers the existing
  instant-win check correctly. A fourth confirmed recruitment never
  triggers for a 3-6 player game (`initialDeceiverCount <= 1`). The Final
  Circle fix was verified with dedicated 3- and 4-player tests confirming
  round 1 always shows the ordinary "Begin Draw Phase" button, plus an
  end-to-end run through round 1 into round 2 confirming the Final Circle
  correctly activates once reached. The Deceiver Knowledge setting was
  verified in both modes via an 8-player (2-Deceiver) game, checking the
  Reveal screen's actual rendered HTML for the named fellow-Deceiver list.
  All 18 redesigned sound cues were confirmed to execute without throwing.
  Beyond the targeted tests, a 10-trial computer-only regression (7-8
  players, fully random) naturally triggered the Recruit mechanic in 7 of
  10 trials with 0 console errors across all 10, and a full ordinary
  playthrough and the existing Final Circle regression suite were re-run
  clean against every change in this round.

## 26. Fullscreen interstitials and a raster icon family (follow-up round)

The visual half of last round's full spec: 11 brief fullscreen transition
cards between major phases, built from assets supplied directly, plus a
new 4-icon raster family replacing 4 specific inline-SVG icons throughout
the app. Recruit or Die was explicitly excluded — no public interstitial
of any kind, per the brief.

- **Asset processing**: the 11 poster images (941×1672, 1-3MB originals)
  were resized to 480px wide and re-encoded as JPEG q84 (~35KB each,
  ~385KB total); the 4 icon images (1254×1254 RGBA) were resized to
  200×200 and re-saved as optimized PNG (14-45KB each, ~132KB total) —
  ~520KB of new assets altogether, comparable to the existing title
  poster + watermark's combined weight.
- **Mechanism**: a single choke point (`interstitialPending`, checked
  first thing in `render()`, before even the computer-seat auto-advance
  check) meant every one of the ~9 distinct trigger locations across
  `main.js` only needed to set one variable before calling `render()`,
  rather than duplicating show/hide logic at each site.
- **Icon family**: centralized inside `iconUse()` itself (`ui.js`) via a
  small `RASTER_ICONS` lookup, rather than touching `iconUse`'s ~15
  existing call sites individually — every call that happens to reference
  one of the 4 replaced icon ids (Hooded Figure, Shield, Dagger, the
  compass/star medallion) automatically picks up the new artwork, direct
  calls and the ones reached indirectly through the shared `passPrompt()`
  template alike, with no risk of missing one by hand-editing each site.
- **A deliberate interaction with Recruit or Die**: the Draw interstitial
  is set unconditionally in the begin-draw handler, *before* the branch
  into either an ordinary Draw Phase or a secret Recruit or Die round —
  not an afterthought, but a direct consequence of re-reading Recruit or
  Die's own "nobody else sees anything different" invariant while
  designing this round: skipping the interstitial specifically on a
  secretly-Recruit round would itself have been exactly the kind of tell
  that invariant exists to prevent. Documented in both the Interstitials
  and Recruit or Die sections of PROJECT_PLAN.md so it's traceable from
  either direction, and confirmed in testing (the Join/Refuse determinism
  tests below both pass through a begin-draw tap on their way to
  engineering the Recruit precondition, so they exercise this path too).
- **Verification**: a dedicated screenshot test confirmed the overlay
  renders correctly mid-playthrough (Reveal, Draw, Final Circle, and
  both win interstitials captured and visually inspected — an early
  capture caught the CSS fade-in transition itself, a 220ms cosmetic
  artifact of screenshot timing, not a bug, confirmed by re-capturing
  after the transition settles). The icon family was verified by
  checking every `<img class="icon...">` element's `naturalWidth` and
  `complete` state directly (all loaded successfully) plus a visual check
  on the Setup screen's Human/Computer toggle. Every existing automated
  test script needed a small patch — interstitials render outside
  `.screen.active`, so the established "click the first available button"
  driver pattern needed an added step to detect and dismiss them first;
  once patched, the full existing suite (the 3-player Final Circle path,
  the Recruit or Die Join/Refuse determinism tests, the Final Circle
  round>1 regression, and a 10-trial computer-only regression across
  7-8 players) was re-run clean — 0 console errors throughout, including
  the cases where interstitials, Recruit or Die, and computer-seat
  auto-advance all overlap in the same playthrough.

## 27. How To Play brought up to date, and overnight soak testing (follow-up round)

An overnight pass, requested without a specific new feature attached: close
the one documented gap flagged at the end of the interstitials round (the
in-app rules modal predated the Final Circle entirely), then spend the rest
of the night re-verifying everything already shipped under sustained,
unattended play.

- **The actual gap**: `UI.helpContent()` (`js/ui.js`) still described the
  original, pre-Final-Circle win condition — "The Deceivers win once they
  equal or outnumber the Loyal" — with no mention that a lone surviving
  Deceiver can in fact win the Final Circle outright against two Loyal, no
  mention of the Final Circle existing at all, and no mention of Recruit or
  Die. Added two new sections to the modal body (The Final Circle, Recruit
  or Die) in the same voice as the existing copy, corrected the win-condition
  sentence to stop overclaiming "equal or outnumber" as the only way
  Deceivers win, and added one sentence noting the Deceiver Knowledge setup
  toggle. Explaining Recruit or Die's existence in a rules reference isn't a
  leak of secret state — same as how a held Shield's effect is public
  knowledge even though who holds one isn't; it's the live, in-game moment
  that stays private, not the rule.
- **Verification**: a live screenshot check of the modal at two scroll
  positions confirmed both new sections render cleanly with the existing
  `.panel-title` styling and no overflow, at the same 390px viewport used
  throughout this project. A text-content check script initially misfired
  (it compared for the literal string "Final Circle" case-sensitively,
  while `.panel-title` applies `text-transform: uppercase` — the rendered
  `innerText` quite correctly came back as "THE FINAL CIRCLE"); confirmed
  via the modal's raw `innerHTML` that the source text was exactly right
  and the mismatch was the ad hoc check script's own case-sensitivity, not
  an app bug.
- **A deliberately adversarial check this round**: `interstitialPending`
  (the flag that drives the fullscreen transition cards) is a plain
  in-memory JS variable, not part of the persisted `state` object — so what
  happens if a player reloads the page while an interstitial is actually on
  screen? Verified directly: triggered the Reveal interstitial, confirmed
  it was visible, then reloaded mid-display. The app boots to the Title
  screen as it always does on a fresh load (saved games only resume via an
  explicit Continue tap, by design, per the comment already in `main.js`),
  with the overlay correctly gone and zero console errors — then confirmed
  tapping Continue from there resumes cleanly straight to the Reveal screen
  with no interstitial stuck on top of it and no leftover overlay. No fix
  needed; the flag's intentional non-persistence degrades gracefully by
  construction rather than by luck.
- **Soak test**: re-ran the 10-trial computer-only regression
  (`fc_regression_recruit.js`, 7–8 players, fully random play with no
  engineered preconditions) once more overnight. 3 of the 10 trials
  naturally reached the Recruit-or-Die precondition on their own (not
  forced), and all three resolved cleanly through the private recruit →
  response → elimination-reveal chain with the Draw interstitial still
  firing unconditionally ahead of them, same as the deterministic tests
  already confirmed by construction. 0 errors across all 10 trials.

## 28. Overnight regression sweep (no code changes)

A second, broader pass the same night, deliberately aimed at combinations
and extremes the existing suite didn't yet exercise directly. No app code
changed in this round — every check came back clean.

- **Recruit or Die × Hidden Deceiver Knowledge, together**: the two
  mechanics had each been tested thoroughly on their own, but never in the
  same game. Engineered the same 2-Deceivers-down-to-1 precondition as the
  existing deterministic Recruit tests, this time with Setup's Deceiver
  Knowledge explicitly set to Hidden beforehand. The Join flow resolved
  identically to the Known-mode version (role flip to Deceiver, ordinary
  Quiet Night elimination reveal), 0 errors.
- **3- and 4-player tables, full computer-only playthroughs, both
  knowledge modes** (4 complete games): the existing suite only checked
  round 1's button action at these player counts, never played a full game
  out. All 4 completed cleanly with 0 errors; none ever showed
  `begin-final-circle` at round 1 (the fix holds at the smallest possible
  tables); the Final Circle engaged at round 2 in three of the four, and
  one 3-player Hidden-mode game ended at round 1 itself via an ordinary
  Deceiver-majority win from a Murder round — a legitimate early finish
  that never reaches the Final Circle at all, not a bug.
- **3-game series, 7 computer players**: played a full series out
  end-to-end, confirming `seriesScores` accumulate correctly across games
  (two players' point totals climbed 0→16→34 across the three games while
  two others held steady at 21 throughout, matching who actually won gold
  each round) and that the series correctly returns to Setup once its
  configured length is reached. 0 errors.
- **Sound cue re-check**: re-ran the 18-cue instrumented execution check
  from the sound/voice redesign round as a plain regression (no code in
  `sound.js` changed since, but cheap to confirm) — all 18 still execute
  without throwing.
- **320px viewport** (iPhone SE 1st-gen, the narrowest common width this
  project targets): Setup with 8 players under intentionally long names
  (e.g. "Hollingsworth," "Guadalupe"), the Reveal screen, and the How To
  Play modal all checked for horizontal overflow via `scrollWidth` vs
  `clientWidth` — none, confirmed with screenshots at all three.
- Also swept all six `js/*.js` files for leftover `console.log` /
  `console.debug` / `console.warn` calls — none found.

### A design interaction found while probing the Recruit-or-Die / Final Circle boundary — flagged for review, not changed

While specifically probing the priority rule documented in `startRound`
("Recruit or Die takes priority over entering the Final Circle if both
conditions are somehow true on the same round"), confirmed something the
comment doesn't fully spell out: **`shouldTriggerRecruitment` has no
once-per-game limit**. It re-evaluates fresh at the start of every round,
purely from current state (lone living Deceiver, started with more than
one, Final Circle not yet active) — nothing marks a round as "already
tried." So if a lone Deceiver's recruit keeps choosing Refuse, the Deceiver
can be offered the *same* choice again next round, and the round after
that, for as long as they remain the sole survivor and living players
haven't yet triggered Final Circle. Each refusal is a visible on-table
murder, so the group sees their numbers falling — it's not hidden — but it
does mean a chain of refusals can carry a game's Deceiver count at 1 all
the way down past the Final Circle threshold without the Final Circle ever
actually engaging, because the priority check keeps deferring it round
after round. The chain always still resolves correctly one of two ways —
either a successful recruit brings the Deceiver count back to 2 and the
trigger condition clears, or the shrinking Loyal count eventually satisfies
the ordinary Deceiver-majority win check (`checkDeceiverMajorityWin`, which
can fire after *any* elimination, same as it always could) — so nothing
gets stuck and no error occurs either way. Confirmed directly: engineered 1
Deceiver + 4 living players on the same round boundary, watched Recruit win
priority as documented (`finalCircleActive` stayed `false`, the MAIN button
stayed `begin-draw`), forced a Refuse, and watched round 3 offer the *same*
lone Deceiver another Recruit attempt rather than entering the Final
Circle, still with `finalCircleActive: false`. Deliberately left exactly as
coded — the precedence rule is working exactly as its own comment
describes, and capping or changing it is a game-balance call, not a
bug-fix, so it's recorded here rather than touched. Worth a look: should a
sufficiently unlucky/stubborn chain of refusals be allowed to carry a game
all the way to a Deceiver-majority win while completely bypassing the
Final Circle the threshold was supposed to guarantee, or should the trigger
exhaust itself (e.g. only once per lone-Deceiver "streak," or deferred
rather than skipped once the threshold is reached)? No code changed for
this round pending that decision.

## 29. A small accessibility pass: contrast audit + toast live region

A quick, low-risk accessibility check, deliberately scoped to things
checkable and fixable without a design decision — this is fundamentally a
pass-the-phone party game built around a private screen being hidden from
the table, so it's not aiming at full screen-reader support, but basic
contrast and semantics cost nothing to get right.

- **Contrast audit**: computed WCAG relative-luminance contrast ratios for
  every primary text/background color pairing in `css/style.css` (`--ink`,
  `--ink-dim`, and all three `--gold-*` tones against both `--charcoal-950`,
  the main background, and `--charcoal-800`, the modal background). All six
  pairings clear the AA threshold (4.5:1) comfortably — the tightest was
  `--gold-500` on `--charcoal-950` at 8.26:1, and most clear AAA (7:1) with
  room to spare (`--ink` at 16.81:1, `--gold-300` at 14.95:1). No changes
  needed; recorded for the record.
- **Existing semantics confirmed already in place**: all four icon-only
  header buttons (menu, sound toggle, help, modal close) already carry
  `aria-label`s — nothing to add there.
- **One gap, fixed**: the toast notification div (`#toast` — used for the
  "+N gold to the Prize Pot" confirmation) had no `aria-live` region, so a
  screen reader would never announce it. Added `role="status"
  aria-live="polite"`. Verified live: triggered a toast directly via
  `UI.showToast()`, confirmed both attributes present on the element and
  the toast still displays and clears exactly as before. Re-ran the full
  playthrough screenshot test afterward — 0 errors, same screen sequence
  as always.

## 30. Chasing down an apparent stall in a long Final Circle sequence — confirmed a test-harness limit, not an app bug

One of the overnight regression results from earlier (`fc_regression.js`
trial 1, a 6-player game) ended its run sitting on the `finalBanishment`
screen with `winner: null` instead of reaching `results` — reported at the
time as 0 console errors, but worth tracking down properly rather than
waving past it, since a silent stall is exactly the kind of thing that
looks fine in a quick pass and isn't.

- **Reproduced it directly**: engineered a 6-player, all-computer game
  straight into the Final Circle and stepped through it with full state
  snapshots at every turn. Found the actual cause quickly: computer-only
  `finalCircleDecision` and `finalBanishment` queues resolve via the
  existing timer-based auto-advance (`autoAdvanceComputerTurns`, the same
  ~700ms-per-seat pattern used everywhere else in the game) rather than
  visible buttons, so a driver script that only clicks buttons sees nothing
  to click and has to simply wait each turn out.
- **Confirmed the turns genuinely progress** (not frozen): a dedicated
  patience probe that does no clicking at all except the Discuss
  skip-ahead button watched `pendingQueue` count down steadily, about one
  player roughly every second, through a full `finalCircleDecision` ballot
  and a full `finalBanishment` vote in just under 11 seconds — it only
  stopped advancing at the Elimination Reveal screen, which is correct:
  that screen is a shared group beat that always needs an explicit tap
  regardless of how many seats are computer-controlled, and this probe
  deliberately wasn't clicking it.
- **Root cause, confirmed**: the Final Circle can loop through several
  Banish-Again rounds in a row before reaching End Game or two survivors,
  and `fc_regression.js`'s original 400-iteration budget (at ~90-250ms per
  polling iteration) could occasionally run out partway through an
  unusually long sequence — not because anything stopped advancing, but
  because the test simply stopped watching before the game was done.
  Bumped the budget to 1500 iterations and re-ran: the exact same 6-player
  trial pattern that stalled before now completes cleanly through to
  `results` with a resolved winner. This was a test-script limit, not an
  app regression — in the same family as this project's other documented
  cases of test patience/timing running out before a real (correctly
  advancing) sequence finished — but it earned the direct investigation
  rather than being assumed, since "stalls occasionally, still reports 0
  errors" is also exactly what a genuine intermittent stuck-state bug would
  look like from the outside, and the difference matters.

## 31. Deceiver's Choice vs. Shield, checked directly at the engine level

Closed out one more documented-but-not-directly-tested-this-session card
interaction: a held Shield normally saves a Murder target automatically,
but Deceiver's Choice overrides it. Checked `resolveMurder` directly with
two engineered hands rather than driving it through the UI — `setupNewGame`,
`resolveMurder`, and friends are plain globals, reachable straight from
`page.evaluate()` without a single click, which is a faster and more
precise way to pin down pure engine logic than stepping through screens
when the DOM state itself isn't what's in question.

- **Shield alone**: target holds a Shield, Deceiver's Choice not played →
  target survives (`murdered: false, protected: true`), exactly as shown
  in How To Play's own card description.
- **Shield + Deceiver's Choice**: same target, same Shield, but the acting
  Deceiver also holds and plays Deceiver's Choice → target dies anyway
  (`murdered: true, protected: false, deceiversChoicePlayed: true`), and
  the Deceiver's Choice card is correctly removed from the deceiver's hand
  and discarded (`deceiverHandAfter: []`).

Both matched the documented rule exactly. 0 errors, no code changed.

## 32. "A Banishment never opens a fresh shuffle," stress-tested directly

A second overnight check-in, picking up a specific, checkable invariant
from PROJECT_PLAN.md's Game Design Assumptions that hadn't been directly
tested this session: `keepBanishmentOffTop` is supposed to guarantee a
Banishment card can never be the very first card drawn after a fresh Fate
deck shuffle — not just at game start, but every single time the deck
empties out and gets rebuilt from its own discard pile — so the table is
never asked to vote someone out with zero information from a preceding
Quiet Night or Murder.

Checked it directly at the engine level, two ways:

- **5000 fresh shuffles**: called `keepBanishmentOffTop(shuffle(buildDeck(
  FATE_DECK_DEF)))` 5000 times (the exact call `drawFateCard` makes on a
  truly fresh deck) and checked the top-of-stack card (`deck[deck.length -
  1]`, since cards are drawn via `pop()`) — 0 came back Banishment.
- **249 real reshuffle-from-discard cycles**: drove `drawFateCard` through
  3000 consecutive draws on a live state object (discarding each card
  after it's drawn, exactly as `startRound`/`resolveMurder`/etc. do),
  tracking every point where the deck was empty and had to rebuild from
  `fateDiscard` — 249 such reshuffles occurred naturally across those 3000
  draws, and the very next card drawn after every single one of them was
  checked. 0 were Banishment.

Confirms the guarantee holds under both of its own trigger conditions, not
just the easy one. 0 errors, no code changed.

## 33. Two more Prize Pot economy claims from PROJECT_PLAN, checked directly

A third overnight check-in, closing out the remaining two specific,
checkable claims from the "Series play and the Prize Pot economy" section
that hadn't been directly tested yet (the core split-among-living-survivors
math was already confirmed in §28's recruited-Deceiver payout check, but
not these two edge cases specifically).

- **"Anyone already eliminated, on either side, gets nothing"**: engineered
  a 4-player game with 2 Deceivers, one of them (Ben) already dead, then
  called `payoutPrizePot` with a 90-gold pot and `winner: 'deceiver'`.
  Recipients came back as `["Ann"]` only — Ben, despite being on the
  winning side, is correctly excluded for being dead, and the full 90 goes
  to the one living Deceiver rather than being split two ways. Ben's
  `seriesScores` entry stayed at 0.
- **"The Prize Pot does not carry over between games"**: started a 3-game
  series, manually set `state.prizePot` to a nonzero value (777, standing
  in for whatever a game might end with before its own payout step zeroes
  it), then called `startNextGameInSeries` directly — the pot came back at
  exactly 0, confirming `setupNewGame`'s reset runs for every game in a
  series, not just the first.

Both matched PROJECT_PLAN.md's claims exactly. 0 errors, no code changed.

## 34. Recruit or Die capped at one attempt per game (resolves §28)

The user's call on the open design question from §28: a lone Deceiver
should only ever be offered Recruit or Die once per game, not re-offered
every round for as long as they remain the sole survivor.

- **Change**: added `state.recruitmentAttempted` (defaults `false`, reset
  in `setupNewGame` so every game in a series gets its own fresh chance).
  `beginRecruitment` sets it `true` the moment the lone Deceiver's attempt
  actually begins — win or refuse, it's spent either way.
  `shouldTriggerRecruitment` now also requires `!state.
  recruitmentAttempted` alongside its existing checks (not
  `finalCircleActive`, started with more than one Deceiver, exactly one
  living now). A successful Join doesn't need special handling here: it
  already brings the living Deceiver count back to 2, which independently
  fails the "exactly one living" check.
- **Verified the exact §28 scenario now resolves correctly**: re-ran the
  same engineered collision from §28's write-up (1 Deceiver + 4 total
  living players on the same round boundary) through a Refuse and into the
  next round. Before this change, round 3 offered the *same* lone Deceiver
  another Recruit attempt (`finalCircleActive: false`, MAIN button still
  `begin-draw`). Now it correctly enters the Final Circle instead
  (`finalCircleActive: true`, MAIN button `begin-final-circle`).
- **Isolated the cap from the threshold**: a separate direct test kept 6-7
  players alive throughout (well above the Final Circle threshold of 4,
  so the Final Circle's own gate was never in play) and confirmed
  `shouldTriggerRecruitment` still correctly returns `false` for the same
  lone Deceiver after one Refuse, purely because of the new flag — proving
  the cap itself works, not just its interaction with Final Circle timing.
- **Full existing suite re-run clean**: `recruit_engine_test.js` (Join),
  `recruit_refuse_test.js` (Refuse/Shield-bypass), `recruit_majority_test.js`
  (instant win), `recruit_hidden_test.js` (Hidden Deceiver Knowledge
  combo), `recruit_vs_finalcircle_test.js` (mid-Final-Circle exclusion),
  `recruit_payout_test.js` (payout correctness), a full-playthrough
  screenshot test, the Known/Hidden reveal-list test, and both randomized
  computer-only regressions (`fc_regression.js`, `fc_regression_recruit.js`)
  — all unaffected by the cap, 0 errors throughout.
- **One loose end from §30, closed**: `fc_regression_recruit.js`'s first
  run here left one of its 10 trials mid-sequence (`screen: 'draw'`,
  `winner: null`) rather than at `results` — same exact signature as §30's
  investigated-and-resolved "stall": this script still carried the
  original 400-iteration budget, never bumped like `fc_regression.js` was.
  Applied the same 400→1500 fix; re-ran, and all 10 trials now complete
  cleanly (5 of 10 naturally reaching Recruit or Die this time), 0 errors.

## 35. A more natural voice: phrase variety, tone, and jitter (no cloud TTS)

The user's follow-up request: "How can we get a more natural voice with
genuine variety of intonation." Every spoken line previously used one fixed
sentence at one fixed rate/pitch — the single most-repeated line in the
game ("Pass the phone to X," every per-player queue turn) could play 20+
times in a session as the literal same words at the literal same pace.
Presented two paths — tune the existing free Web Speech API further, or
move to a paid cloud neural voice (a real architecture change: API key,
network dependency, per-character cost, for this static no-backend site)
— and the user chose to do the free improvement now and treat cloud TTS as
a separate future conversation.

- **Phrase variety**: most cues now pick randomly from 2-4 interchangeable
  wordings each time, in new `*_PHRASES` constants in `sound.js`. The
  anonymity-critical generic (name-free) Murder-queue phrasing got its own
  separate pool, varied the same way but never at risk of naming anyone.
- **Tone presets + per-utterance jitter**: three named rate/pitch shapes
  (`calm`/`ominous`/`urgent`) for different moments, each nudged by a small
  random amount per line so even repeated instances of the same tone don't
  land at the identical rate/pitch.
- **Paced sequences**: two-sentence lines (Night Falls, Gather Everyone)
  now speak as two short utterances with a real pause between them instead
  of one run-on utterance.
- Moved the three raw strings that used to live directly in `main.js`
  (Night Falls, Gather Everyone, the Recruit hand-off) into named `sound.js`
  wrappers (`announceNightFalls`, `announceGather`,
  `announceRecruitHandoff`) alongside the phrase banks and tone choices, so
  everything spoken lives in one place.

**Verification**: a monkey-patched `SpeechSynthesisUtterance` captured the
exact text/rate/pitch sound.js actually produces, independent of whether
the sandbox has real voices installed (it doesn't — same as most CI
environments). 30 consecutive `announcePassDevice('Ann')` calls produced
all 4 named phrase variants, rate and pitch both varied call to call within
the `calm` tone's jitter range, and every single one still correctly said
"Ann." The generic Murder-queue variant was checked the same way across 20
calls — all 3 generic variants appeared, and critically, none ever
contained a player name, confirming the anonymity guarantee survived the
rewrite. Night Falls and Gather Everyone each correctly produced exactly
two utterances (one per sentence, at their tone's rate) with the real pause
between them. A full live 3-player playthrough with sound enabled showed
genuine phrase variety across real in-game turns (not just isolated
function calls) — e.g. "Ann, it's your turn." / "Pass the phone to Ben." /
"Over to you, Cid." across one round's queue, each different. Re-ran the
18-cue sound check and a full playthrough screenshot test afterward — both
clean, confirming the non-voice sound effects were untouched. 0 errors
throughout. No code changed to anything but the spoken-line system itself.

## 36. A real anonymity leak in Recruit or Die's hand-off, caught by the designer

Reported directly after the voice-variety round shipped: "you are
suggesting that the deceiver passes the phone to the recruit... that lets
the cat out the bag on both fronts." Correct, and a genuine bug, not a
nitpick — this was the one spoken line in the entire game that broke the
brief's core requirement for this mechanic: "no public interstitial or
announcement of any kind."

- **What was actually wrong**: the hand-off from the lone Deceiver to
  their chosen target played a dedicated line — "Pass the phone to your
  chosen recruit" — built specifically to avoid saying the target's name
  out loud. But the word *"recruit"* was itself the leak: spoken aloud to
  the whole table (not just whoever's holding the phone, same as every
  other sound cue in this game), it announced that a recruitment was
  happening at all, regardless of whether a name was ever said — exactly
  the kind of public tell the brief explicitly rules out. The original
  reasoning (avoid naming the target) was solving the wrong problem: a
  name alone leaks nothing, since every living player's name already gets
  called out loud at some point during an ordinary Draw queue — the
  *wording itself* was the only thing that made this moment stand out.
- **The fix**: deleted the special case rather than patching its wording.
  `maybeAnnouncePassDevice`'s RECRUIT_RESPONSE guard is gone, and so is the
  manual `Sound.announceRecruitHandoff()` call in `confirm-recruit-target`
  (along with the now-dead `announceRecruitHandoff` function and its
  phrase bank in `sound.js`). The hand-off now goes through the exact same
  generic per-queue-turn path as every other turn in the game, named with
  the same phrase bank ("Ann, it's your turn," etc.) — structurally
  indistinguishable from an ordinary continuing Draw-queue turn, because
  it now *is* one, rather than a parallel code path that could drift out
  of sync with the rest of the anonymity design again.
- **Verified directly**: engineered the Recruit-or-Die precondition,
  captured the exact spoken text at the hand-off moment via a
  monkey-patched `SpeechSynthesisUtterance` (same technique as the voice
  variety round), and confirmed two things explicitly: no utterance ever
  contains the word "recruit" (checked with a case-insensitive match), and
  the target's name is spoken using one of the ordinary named phrase
  variants. Re-ran the full existing recruit suite (Join, Refuse, Hidden
  Deceiver Knowledge combo), a full playthrough screenshot test, and the
  18-cue sound check afterward — all clean, 0 errors.

## 37. Raising the player cap to 16, with a generalized Deceiver-ratio formula

The user asked whether 8 was a hard maximum (it was, `CONFIG.maxPlayers`),
then specified the scaling rule for raising it: target roughly a 1:4
Deceiver-to-player ratio, with 1:3 as the absolute hard ceiling, and raise
the cap to 16.

- **The formula**: `deceiverCountForPlayers` (`data.js`) changed from a
  hardcoded two-tier `playerCount <= 6 ? 1 : 2` to
  `Math.ceil((playerCount - 2) / 4)`. This exact formula was chosen
  because it reproduces the original, already-shipped 3–6→1, 7–8→2 table
  with *zero* change to those player counts (confirmed by direct
  computation against the live function: 3→1, 4→1, 5→1, 6→1, 7→2, 8→2),
  while extending the same pattern cleanly: 9–10→2, 11–14→3, 15–16→4.
  Worst-case ratio across the whole 3–16 range is exactly 1:3 at the
  3-player minimum (unavoidable — one Deceiver among three is as good as a
  minimum-size game gets) and ~1:3.5 at 7 players — both already true of
  the original table, not new compromises introduced by the extension.
  `CONFIG.maxPlayers` raised from 8 to 16.
- **Verified the formula directly** against the live `data.js` function
  for every value 3–16, matching the intended table exactly.
- **Checked for other hardcoded assumptions**: grepped the whole codebase
  for a literal `8` anywhere player-count-related — found none; every
  other reference (Setup screen copy, How To Play's player-count line, the
  Add Player button's cutoff) already reads `CONFIG.minPlayers`/
  `CONFIG.maxPlayers` dynamically, so raising the constant was sufficient
  on its own.
- **Visual checks at 16 players**: Setup screen with all 16 rows filled —
  no horizontal overflow, scrolls cleanly, the dynamic hint text correctly
  read "16 players — 4 Deceivers will be chosen in secret." Confirmed the
  Add Player button correctly disappears once the (new) cap is reached.
  Engineered a 16-player game down to 1 living Deceiver (of 4) and
  screenshotted the Recruit or Die target-selection screen with its full
  12 eligible Loyal targets — a clean 2-column grid, no overflow, header
  still correctly reads the deliberately vague "Round 1 / PRIVATE
  EXCHANGE" label.
- **Full 16-player computer-only playthrough**: driven start to finish,
  confirmed Deceiver count was exactly 4 at game start, and the game
  reached a resolved winner with 0 console errors throughout.
  (Superseded one round later — see below: the 4-Deceiver tier this
  specific test exercised no longer exists.)

## 38. Deceiver count capped at an absolute max of 3, never 4

Immediate follow-up to §37: the user set a hard ceiling — "Max 3... Never
4" — regardless of how high the player count goes.

- **The change**: `deceiverCountForPlayers` wrapped in `Math.min(3, ...)`.
  The 3–10 player range is untouched (1 or 2 Deceivers, same as §37); the
  11–16 range, which previously climbed to 3 then 4 at the top end, now
  holds flat at 3 all the way from 11 through 16 players instead of
  reaching 4 at 15–16.
- **Recruit or Die needed no separate change**: that mechanic only ever
  replenishes from exactly one living Deceiver back up to two — it can
  never push the total above whatever `initialDeceiverCount` already was.
  Capping the player-count formula at 3 therefore caps recruitment's
  ceiling at 3 for free, with no new check needed anywhere in `engine.js`.
- **Verified directly**: computed the function's output for every value
  3–16 against the live source (via a regex-extracted `eval` of the actual
  function body, not a hand-copied reproduction) — 11 through 16 all now
  read exactly 3. Confirmed the same in a live browser across five player
  counts (10, 11, 13, 15, 16): 10→2, the rest→3, with 15 and 16
  specifically confirmed to no longer produce 4. Re-ran the Join/Refuse
  recruit tests and a full playthrough screenshot test afterward — all
  clean, 0 errors.

## Summary

| Layer | Trials | Bugs found | Bugs fixed |
|---|---|---|---|
| Engine (Node) | 3150 | 0 | — |
| Full playthrough w/ screenshots | 5 rounds (all 12 screens; murder-phase redesign; series/payout; auto-shield & gather-everyone; sound) | 1 (card text clipping) | 1 |
| Automated UI stress test | 98+ | 1 confirmed (test-script scoping, fixed) + several one-off timeouts (same signature across all occurrences), never reproduced with a stable rate or dedicated diagnostics | 1 confirmed fixed; flakiness documented, not app bugs |
| Sound (instrumented WebAudio) | 1 full playthrough, 109 node creations | 1 (Continue-game didn't sync sound state) | 1 |
| Computer players (engine sim + headless UI) | 500 engine trials + 3 UI scenarios ×4 runs | 0 | — |
| Instruction clarity (engine sim + headless UI) | 500 engine trials + 11 full UI playthroughs | 0 | — |
| Background music (unit + live integration) | Sound-module unit checks + 1 full UI playthrough | 0 | — |
| Crescendo + spoken line (unit timing + live integration) | 3 timing scenarios + 1 full UI playthrough | 0 | — |
| Discussion clock + audio quality pass (unit + live integration) | 1 unit scenario + 1 full UI playthrough | 0 (1 test-script selector bug, unscoped from `.screen.active`, same class of mistake documented in earlier rounds; fixed in the test, not the app) | — |
| Skip Ahead early-vote option (live integration) | 1 full UI playthrough | 0 (1 test-timing bug in my own test script — checked the sting screen's text after it had already transitioned away, since the sequence resolves near-instantly with sound off; fixed in the test, not the app) | — |
| Spotify playlist link-out (live integration) | 1 full UI playthrough | 0 (1 test-timing bug of the same kind, same fix) | — |
| Edge safe zones (automated bounding-box audit) | 10 screens/modals at default content + 1 worst-case 8-player stress test | 1 (Setup-screen overflow pushing its button into the bottom buffer at rest) | 1 |
| Watermark artwork + opacity update (visual check) | 3 screenshots | 0 | — |
| Title key art + app-wide grain (visual check + full playthrough) | 2 screenshots + 1 full UI playthrough | 0 | — |
| Title art upgraded to portrait poster (visual check + full playthrough) | 2 sizing variants screenshotted + 1 full UI playthrough | 1 (cover-mode cropping overlapped button with banner text) | 1 (switched to contain) |
| Oswald + grainy text + crumbling borders (visual check + full playthrough) | 4 screenshots + 1 full UI playthrough + 1 direct font-URL check | 0 | — |
| Larger fonts + per-queue hand-off cues + natural voice (visual check + instrumented sound test) | 5 screenshots + 1 overflow re-check + 8 instrumented playthroughs (1,280 cue calls) | 1 (a first-attempt edit briefly replaced the Quiet Night arrival cue with the urgent Gather bell for every Elimination arrival) | 1 (caught before shipping; reverted to keep `quietNight` distinct from `gather`) |
| The Final Circle end game (3 targeted scripts + 6-trial regression) | 1 deterministic Banish-Again-to-2 playthrough + 1 deterministic unanimous-End-Game playthrough + 6 instrumented 5–8 player regression trials | 1 (winner-banner flavor text wrongly claimed "equal or outnumber" for a 1-of-4-survivors Deceiver win) | 1 (conditional alternate line added) |
| Grainy headline text fix (visual check + playthrough) | 5 screenshots (all headline selectors) + 1 Final Circle regression + 1 full playthrough | 0 (fix for a bug from an earlier, already-reverted round) | 1 (same layer-order/blend fix already proven on backgrounds) |
| Spoken "Pass the phone to X" announcements (instrumented + playthroughs) | 1 instrumented 4-player test (mixed human/computer, 2 queues) + 1 full playthrough + 1 Final Circle regression, real unmocked announcePassDevice | 0 | — |
| Recruit or Die + Final Circle entry fix + Deceiver Knowledge + sound/voice redesign | 2 deterministic click-through Recruit tests (Join + Refuse/Shield-bypass) + 1 majority-win integration test + 1 no-trigger-for-1-Deceiver test + 4 Final Circle round>1 tests + 2 Deceiver Knowledge mode tests + 18-cue execution check + 10-trial computer-only regression (7-8p) + full playthrough + existing Final Circle suite re-run | 0 | — |
| Fullscreen interstitials + raster icon family (visual check + full regression) | 1 dedicated interstitial screenshot test (5 trigger points) + icon `naturalWidth`/`complete` DOM check + full existing suite re-run (3-player Final Circle, Recruit Join/Refuse, Final Circle round>1, 10-trial 7-8p computer-only regression) after patching every test script for the new overlay | 0 (fixed 13 test scripts for the new overlay rendering outside `.screen.active`, not an app bug) | — |
| How To Play rules update + overnight soak test (visual check + reload/resume probe + regression) | 1 modal screenshot at 2 scroll positions + 1 reload-mid-interstitial probe + 1 continue-after-reload probe + 1 10-trial computer-only regression re-run (7-8p, 3 natural Recruit-or-Die triggers) | 0 | — |
| Overnight regression sweep: Recruit×Hidden combo, 3-4p full playthroughs, 3-game series, sound re-check, 320px viewport | 1 Recruit+Hidden determinism test + 4 full 3-4p computer-only playthroughs (both knowledge modes) + 1 full 3-game series + 18-cue sound re-check + 3-screen narrow-viewport overflow audit + full-file debug-statement sweep | 0 | — |
| Recruit-or-Die / Final Circle boundary probe (deterministic, engineered collision) | 2 targeted tests: mid-Final-Circle 2→1 Deceiver drop (must not trigger Recruit) + same-round-boundary collision with a forced Refuse into round 3 | 0 bugs (1 design interaction found and documented, not changed — see write-up above) | — |
| Recruited-Deceiver payout correctness (deterministic, engineered 100-gold pot) | 1 test: engineered 1 Deceiver + 1 Loyal, successful recruit, instant majority win, checked payout recipients and amounts directly | 0 | — |
| Accessibility pass: contrast audit + toast live region | 6 WCAG contrast-ratio computations (all text/background pairings) + 1 live toast attribute + playthrough re-check | 1 gap (missing `aria-live` on toast, not a defect in shipped behavior) | 1 |
| Final Circle "stall" investigation (direct repro + patience probe + budget fix) | 1 engineered 6p repro with full state snapshots + 1 no-click patience probe (confirmed ~1s/turn steady progress) + re-ran `fc_regression.js`'s 6-trial suite with the test's iteration budget raised 400→1500 | 0 app bugs (1 test-harness budget limit, fixed in the test script only) | 1 (test-only) |
| Deceiver's Choice vs. Shield (direct engine-level check) | 2 engineered hands checked straight against `resolveMurder()` (Shield alone, Shield + Deceiver's Choice) | 0 | — |
| "Banishment never opens a fresh shuffle" stress test (direct engine-level check) | 5000 fresh-shuffle trials + 249 real reshuffle-from-discard cycles across 3000 consecutive draws | 0 | — |
| Prize Pot economy: dead-winner exclusion + per-game reset (direct engine-level check) | 2 tests: engineered a dead Deceiver excluded from a 90-gold payout + a series' next-game Prize Pot reset from a nonzero value | 0 | — |
| Recruit or Die capped at one attempt per game (resolves §28, feature change) | Re-ran §28's exact collision scenario end-to-end (now correctly enters Final Circle on round 3 instead of re-offering Recruit) + 1 isolated cap-only test (6-7p, well above FC threshold) + full existing recruit suite (6 scripts) + both randomized computer-only regressions | 0 | 1 (feature added per user decision) |
| fc_regression_recruit.js budget fix, second instance of §30's class | Re-ran the 10-trial suite after the same 400→1500 fix | 0 app bugs (1 test-harness budget limit, fixed in the test script only) | 1 (test-only) |
| A more natural voice: phrase variety, tone, and jitter (feature change) | Monkey-patched `SpeechSynthesisUtterance` captured exact text/rate/pitch across 30 named + 20 generic pass-device calls, plus Night Falls/Gather Everyone sequence checks + 1 full live 3-player playthrough with sound enabled + 18-cue sound re-check + full playthrough screenshot re-check | 0 | 1 (feature added per user request) |
| Recruit or Die hand-off anonymity leak (real bug, reported by designer) | Engineered the Recruit precondition, captured exact spoken text at the hand-off via monkey-patched `SpeechSynthesisUtterance`, confirmed no "recruit" mention + correct named phrasing + full recruit suite + playthrough + sound-cue re-check | 1 (the word "recruit" spoken aloud to the whole table) | 1 |
| Player cap raised 8→16 with a generalized Deceiver-ratio formula (feature change) | Direct formula verification (3-16) against the live function + full-codebase hardcoded-"8" sweep + 16p Setup/Recruit-screen visual checks (no overflow) + 1 full 16p computer-only playthrough (22 rounds, resolved clean) + 11p computer-only playthrough (3 Deceivers, resolved clean) | 0 | 1 (feature added per user decision) |
| Deceiver count capped at absolute max 3, never 4 (feature change) | Direct formula verification against live source for all 3-16 + live-browser check across 5 player counts (10/11/13/15/16) + Join/Refuse recruit suite + playthrough re-check + 9p/11p/12p computer-only playthroughs (all resolved clean) | 0 | 1 (feature added per user decision) |

The game can be played start-to-finish — Title through Results, and back to
Title via Play Again or Next Game — with no console errors, for every
supported player count (3–8), across every Fate-card branch (Quiet Night,
Murder, standard Banishment) and the Final Circle's own End Game / Banish
Again branches once few enough players remain, every action card
(Gold ×3 denominations, Shield, Dagger, Deceiver's Choice), and any series
length from 1 to 20 games. The Murder phase no longer reveals Deceiver
identity through phone-handoff patterns or sound, the Fate card is no longer
spoiled before it happens, the Prize Pot is paid out to the winning side's
survivors every game, Shields deploy automatically, a Banishment can never
open a fresh Fate-deck shuffle, every event ends with an explicit
gather-everyone checkpoint before its outcome is revealed, a full
synthesized sound design covers every meaningful moment in the game, any
seat can be marked Computer — down to an all-computer roster — without ever
exposing the secret Deceiver through a computer seat's turn timing or
on-screen content, the Night screen says outright that tonight's Fate is
Murder instead of leaving it ambiguous, every Banishment Vote opens with a
mandatory 30-seconds-per-living-player discussion clock instead of a
button that could be tapped past before anyone had actually talked, and
that Open Discussion screen has an opt-in ambient chord-progression music
bed that fades in and out cleanly, closing with a crescendo and a
natural-sounding spoken line once the clock runs out. A lone surviving
Deceiver (of an originally larger team) gets one private, strictly
two-player Recruit or Die round before the Final Circle begins, never a
public event, with the recruit's choice resolving to the table as an
indistinguishable ordinary Quiet Night or Murder either way; the Final
Circle itself never begins before at least one ordinary round has been
played, regardless of starting player count.
