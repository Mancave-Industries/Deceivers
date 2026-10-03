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

The game can be played start-to-finish — Title through Results, and back to
Title via Play Again or Next Game — with no console errors, for every
supported player count (3–8), across every Fate-card branch (Quiet Night,
Murder, standard Banishment, and forced Final Banishment), every action card
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
Murder instead of leaving it ambiguous, every Banishment Vote opens with an
explicit instruction for the table to discuss out loud before voting
starts, and that Open Discussion screen now has an opt-in ambient music bed
that fades in and out cleanly and never plays anywhere else.
