# The Deceivers — Project Plan

A mobile-first, pass-the-phone social deduction card game. Pure HTML/CSS/vanilla
JS, no build tools, no external libraries, no copyrighted artwork. Designed to
run by opening `index.html` directly, and to be paste-portable into CodePen
(see `CODEPEN_EXPORT.md`).

## 1. Architecture

Single-page app. One `index.html` shell holds all 12 screens as hidden/visible
`<section>` elements plus a single inline SVG `<defs>` sprite sheet (icons +
card frames as `<symbol>`), so the whole game works offline with zero network
requests and zero `fetch()` calls (opening via `file://` blocks `fetch` of
local files in most browsers — inline `<symbol>` + `<use>` sidesteps this).

Standalone `.svg` files also exist under `/assets/` as the deliverable asset
library and as a source-of-truth if assets are ever needed individually (e.g.
dropped into CodePen's Asset panel) — the inline sprite in `index.html` is
generated from the same shapes.

**Strict separation of data / state / logic / rendering:**

| File | Responsibility |
|---|---|
| `index.html` | Markup shell for all 12 screens, SVG sprite defs, script/style includes |
| `css/style.css` | Design tokens, textures, components, layout, animation — no logic |
| `js/data.js` | Static game data: roles, card definitions, deck composition, config, icon/frame ID tables. Pure constants, no DOM, no state mutation |
| `js/state.js` | Game state shape, mutators, localStorage save/load/reset. No DOM access |
| `js/engine.js` | Game rules: dealing, night resolution, vote resolution, elimination, win checks, round progression. Operates only on the state object; returns result objects. No DOM access |
| `js/ui.js` | Rendering only: builds DOM for each screen from current state. Never mutates game state directly (calls engine functions, then re-renders) |
| `js/main.js` | Bootstrap, screen router, event wiring, "pass the device" overlay, sound/settings/help modal wiring |

This means: to change a game rule, edit `engine.js`. To restyle, edit
`style.css`. To change wording/copy or add a card, edit `data.js`. Rendering
never contains rule logic, and rule logic never touches `document`.

**Cache-busting on every deploy**: `index.html`'s `css/style.css` and every
local `js/*.js` tag carries a `?v=<timestamp>` query string (the external
Google Fonts link and the site-wide `/Gameshed/nav.js` don't need it — that
file isn't part of this app's own deploys). With no build step, nothing
else fingerprints these filenames, and GitHub Pages' caching plus phone
browsers (iOS Safari especially) will happily keep serving an old cached
copy indefinitely after a push — a returning player's already-open tab can
silently keep running stale game logic well after a fix has shipped and
the deploy workflow has gone green. Caught live: a designer playtest hit
an already-fixed bug because their phone was still running `ui.js`/`data.js`
cached from before that session even started. **Bump the `?v=` value on
every commit that touches `css/style.css` or any `js/*.js` file** — a
UTC timestamp (`date -u +%Y%m%d%H%M`) is the convention, applied to all
seven local tags identically with one `sed` pass across `index.html`.

## 2. Folder Structure

```
index.html
css/
  style.css
js/
  data.js
  state.js
  engine.js
  ui.js
  main.js
assets/
  icons/        coin, dagger, shield, raven, candle, skull, vote, hourglass,
                 hooded-figure, compass-emblem, sound, menu, settings, help
  cards/        card-back, frame-generic, frame-gold, frame-action,
                 frame-protection, frame-event, frame-role
  roles/        role-deceiver, role-loyal
  gamecards/    gold-one, gold-three, gold-five, dagger, shield, quiet-night,
                 murder, banishment, final-banishment, deceivers-choice
  ui/           button-primary, button-danger, button-confirm, modal-panel,
                 player-row, prize-pot-panel, hand-panel
  brand/        deceivers-title-poster.jpg, mancave-gameshed-badge.jpg,
                 grain.png — raster key art and texture, not vector; see
                 "Visual Design System" below for why these three are raster
PROJECT_PLAN.md
TEST_REPORT.md
CODEPEN_EXPORT.md
legacy/         (previous, unrelated prototype — preserved, not part of this game)
```

## 3. Visual Design System

Dark ceremonial aesthetic, entirely original (no Traitors branding/marks/copy):

- **Palette**: charcoal black (`#0c0b0e`, `#161319`), antique gold
  (`#c9a24b`, `#e6c877`), dark crimson (`#5c1420`, `#7d1f2b`), midnight blue
  (`#141c30`, `#1f2a44`), aged parchment (`#e9dcc0`, `#d8c9a3`).
- **Type**: `Oswald` (Google Fonts, weights 500/700) for ceremonial
  headings/display text — the one network-dependent asset in the app,
  loaded via `<link>` in `index.html`'s `<head>`; falls back to `'Arial
  Narrow', 'Helvetica Neue', sans-serif` if it fails to load, so a blocked
  font request degrades gracefully rather than breaking anything. System
  sans (`--font-body`) stays for UI body text/buttons, unaffected.
  Replaces the earlier Georgia/Times serif stack, which read as "elegant
  parlor game" rather than the brand's stamped/industrial key art. Every
  `font-size` in `css/style.css` was later scaled up ~15% (e.g. 13.5px →
  15.5px body text, 20px → 23px screen titles), rounded to the nearest
  half-pixel — real-device testing on a phone found the original sizes hard
  to read at arm's length around a table, which matters more for a
  pass-the-phone party game than it would for a single-player app.
- **"Grainy gold" display text**: the larger headlines (`.screen-title-
  row`, `.reveal-headline`, `.winner-banner h2`, `.modal-title`,
  `.prize-pot-value`) fill with a gold gradient blended with the same
  grain tile used on `.app-grain` (grain listed first/as the blend
  source, the gradient second/as the backdrop, `background-blend-mode:
  soft-light`), then clip that combined image to the glyphs themselves
  (`background-clip: text`, `-webkit-text-fill-color: transparent` for
  Safari) instead of sitting flat behind them — so the text itself reads
  as subtly worn/textured, not just flat gold. (A follow-up round fixed
  this from its original `overlay`-blend, gradient-as-source version,
  which read as sparkly/broken rather than aged on thin letter strokes —
  the same backwards-layer-order bug diagnosed and fixed for panel/button
  backgrounds elsewhere, just never applied here since this rule hadn't
  been touched by that round.) Left off smaller labels (round counter,
  seat numbers, avatar initials) where the grain tile would just read as
  noise at that size, and off player names (`.pass-overlay-name`) since
  forcing a person's name into stamped caps looks odd.
- **"Crumbling relic stone" borders**: an SVG `feTurbulence` +
  `feDisplacementMap` filter (`#crumble`, defined inline in `index.html`,
  referenced via `filter: url(#crumble)`) gives the app-wide corner-
  bracket frame (`.app::after`) genuinely eroded, irregular edges instead
  of clean geometric brackets. Deliberately scoped to that one decorative,
  text-free element — applying a displacement filter to anything with
  live text inside would warp/blur the text along with the border, and
  applying it to interactive elements (buttons) would undermine the tap-
  target clarity worked out earlier (see "Edge safe zones" and the
  Setup-screen spacing fixes). Separately, `--radius-lg/-md/-sm` (every
  panel, card, row, and input's corner radius) were redefined from a
  single uniform value to four slightly different corner values each —
  a hand-carved-not-machine-stamped feel applied everywhere at once by
  changing three tokens, with zero per-selector work. `--radius-pill`
  (buttons) stays a true pill on purpose — that shape is load-bearing tap
  affordance, not decoration.
- **Texture**: mostly CSS — radial vignettes, hairline gold borders, soft
  inner shadows — plus three small raster assets (`assets/brand/`) where
  CSS alone couldn't do the job: `deceivers-title-poster.jpg` (the real
  brand key art — portrait, built for a phone screen — runs full-bleed as
  `#screen-title`'s own `background-image`, `contain`-sized so none of it
  is cropped; a hand-distressed stamped-medallion look isn't something
  gradients and box-shadows can fake convincingly), `mancave-gameshed-
  badge.jpg` (the app-wide watermark, §below), and a tiny 64×64
  `grain.png` tile (`.app-grain`, `overlay` blend at 10% opacity) laid
  over the whole app for a faint, always-on film-grain pass — pushing the
  general feel toward that key art's distressed/stamped-metal look
  without needing a texture behind every individual component.
- **Motion**: restrained — fades, gentle scale-ins, a candle flicker
  keyframe, card flip on reveal. No bouncy/gamey easing.
- **Icons/cards**: all inline SVG, single/double color (gold line art on
  transparent, or gold-on-crimson/midnight fills for frames), so they inherit
  `currentColor` and scale crisply at any size. The Title screen is the one
  exception (raster key art, above) — every other icon, card frame, and UI
  chrome piece stays vector so it scales crisply and costs nothing to load.
- **Edge safe zones**: `--edge-buffer-top`/`--edge-buffer-bottom`
  (`:root`, `css/style.css`) each reserve `max(10vh, env(safe-area-inset-*,
  0px))` — a flat 10% of viewport height at top and bottom, with the iOS
  notch/home-indicator inset layered on top for devices where that's
  larger. `env(safe-area-inset-*)` alone only covers notches and
  home-indicators; it says nothing about an address bar, a bottom toolbar,
  or an in-app-browser's own nav chrome (Instagram/TikTok/etc. when a link
  is opened from inside those apps) sitting over part of the viewport,
  which is the more common real complaint on a shared-link party game. The
  header absorbs the top buffer in its own height; every `.screen` absorbs
  the bottom one in its own bottom padding, so no screen-specific code was
  needed — every button in the app respects both automatically. On
  screens that legitimately don't fit without scrolling regardless (Setup
  with close to the 8-player max), the buffer is still there below the
  final button once the screen is scrolled to its natural resting point —
  the goal was never zero scrolling, just that a button never rests flush
  against the literal device edge.

### Interstitials and the raster icon family (follow-up round)

Brief fullscreen transition cards between major phases, plus a new icon
family — both built from assets supplied directly, not generated/drawn as
part of this round. The brief was explicit that these should bridge "dead
space between pieces of game flow," not turn every screen into a poster,
so only 11 specific moments got one: Reveal, Draw, Night Falls, Murder,
Banishment, Final Circle (first entry only — see below), End Game,
Banish Again, Final Two, and the two win screens. Recruit or Die is the
deliberate exception — strictly private, no public interstitial of any
kind (see "Recruit or Die" below).

**Asset processing**: the 11 supplied poster images (941×1672 originals,
1-3MB each) were resized to 480px wide and re-encoded as JPEG quality 84
(`assets/brand/interstitials/`, ~35KB each, ~385KB total) — the same
compression approach already used for the title poster and watermark. The
4 supplied icon images (1254×1254 RGBA originals) were resized to 200×200
and re-saved as optimized PNG (`assets/brand/icons/`, 14-45KB each,
~132KB total). ~520KB of new assets altogether, comparable to the
existing title poster + watermark's combined weight.

**Mechanism** (`ui.js`'s `UI.showInterstitial`, `main.js`'s
`interstitialPending`): an action handler sets `interstitialPending = '
<key>'` right before calling `render()`; `render()` checks for it first,
before anything else (including the computer-seat auto-advance check),
and if set, shows the fullscreen overlay instead of the normal phase
screen, then calls `render()` again once it's dismissed — either after a
fixed 1.7s or immediately on tap, whichever comes first. This single
choke point meant every one of the ~9 distinct trigger locations only
needed one line (`interstitialPending = 'draw'`, etc.) rather than
duplicating show/hide logic at each call site.

**Trigger mapping** — the interesting cases:
- **Final Circle** shows only once, the moment it's first entered
  (`'begin-final-circle'` action) — the image's own baked-in text ("FOUR
  REMAIN") is specific to that exact moment and would read as wrong on a
  later round where only three remain. Every *subsequent* re-entry into
  the Final Circle's decision ballot (after a Banish Again vote, via
  `continue-elimination`'s loop-back branch) shows **End Game** instead,
  which has no round-specific number baked in.
- **Night Falls** vs. **Murder** are two separate moments, not one: Night
  Falls fires when the Night screen itself first appears (its own
  "Begin The Night" button is still a human tap away), Murder fires once
  that button is actually tapped and the per-player Murder queue begins.
- Exactly one interstitial per game ending, never two stacked: a forced
  end at two living players shows **Final Two** (the one ending nobody
  chose); a unanimous End Game stop at 3 or 4 shows **Loyal Win** or
  **Deceiver Win** instead — the game's only two possible endings (see
  "Win condition," below). The actual winner-sound cue still always
  plays regardless of which interstitial shows.
- **Draw** fires unconditionally on every `'begin-draw'` tap, *before*
  branching into either an ordinary Draw Phase or a secret Recruit or Die
  round — see "Recruit or Die," where this matters for staying invisible.

**The raster icon family**: `iconUse(id, cls)` (`ui.js`) now checks a
small `RASTER_ICONS` map before falling back to the original inline-SVG
sprite — if `id` is one of the 4 supplied icons (Hooded Figure
— reused for the Deceiver role *and* the Deceiver's Choice card,
Shield, Dagger, or the ceremonial compass/star medallion used for
"Gather Everyone" moments), it renders an `<img>` pointing at the new
asset instead of `<svg><use>`. Centralizing this one place meant every
one of `iconUse`'s ~15 existing call sites — direct calls and the ones
reached indirectly through the shared `passPrompt()` template alike —
picked up the new artwork automatically, with no risk of missing one by
hand-editing each call site individually. `.icon`/`.icon-lg`/`.icon-sm`'s
existing width/height sizing applies to an `<img>` exactly as it did to
an `<svg>`, so no new CSS variants were needed — just `object-fit:
contain` added defensively, in case a future icon's native aspect ratio
doesn't perfectly match its target box.

## 4. Game Design Assumptions

The brief specifies required screens and required card types but not exact
rules. Documenting the interpretation used, per the instruction to record
assumptions rather than pause for questions:

### Roles
- 3–16 players (local pass-and-play, one shared phone). Originally capped at
  8; raised to 16 in a follow-up round once the Deceiver-count formula below
  was generalized to scale cleanly past that point.
- **Deceiver count** (`deceiverCountForPlayers`, `data.js`) —
  `Math.min(3, Math.ceil((playerCount - 2) / 4))`, targeting roughly a 1:4
  Deceiver-to-player ratio, never exceeding 1:3 (the absolute max — any
  worse and the Loyal side's "spot the minority" premise erodes), and
  capped at an absolute maximum of 3 regardless of player count — a fourth
  Deceiver was judged too many to track at the table even at 16 players.
  This formula was chosen specifically because it exactly reproduces the
  original, already-shipped-and-tested 3–6→1, 7–8→2 table with zero
  change to those player counts, and extends the same pattern upward:
  9–10→2, then the cap holds flat at 3 from 11 all the way through 16
  (the uncapped formula would have reached 4 at 15–16; the `Math.min(3,
  ...)` wrapper stops that). The cap bounds Recruit or Die for free too —
  that mechanic only ever replenishes from one living Deceiver back up to
  two, never above a game's own `initialDeceiverCount`, so capping this
  function at 3 means recruitment can never produce a fourth Deceiver
  either, with no separate check needed anywhere else. Worst-case ratio
  across the whole range is exactly 1:3 at the minimum 3-player game
  (unavoidable — a game needs at least one Deceiver to mean anything, and
  one in three is as good as it gets at that size) and ~1:3.5 at 7 players
  (already true of the original
  table, not a new compromise). Remaining players are Loyal.
- **Deceiver Knowledge** (Setup screen, a whole-series choice —
  `state.settings.deceiverKnowledge`, 'known' by default): in **Known**
  mode, a Deceiver also privately sees who their fellow Deceivers are
  during the role reveal (if more than one); in **Hidden** mode they don't
  — each Deceiver only ever learns their own role at Reveal. The one
  exception either way: a successful Recruit or Die pact (below) always
  introduces the recruiter and the new Deceiver to each other, since
  they've just made the pact directly — Hidden mode just means that
  doesn't also reveal anyone else's identity.

### Decks
Two separate decks, both reshuffled from discard when exhausted:
- **Fortune Deck** (drawn by each living player once per Draw Phase): One
  Gold, Three Gold, Five Gold, Dagger, Shield, Deceiver's Choice. Gold cards
  are resolved immediately into the shared Prize Pot; Dagger/Shield/
  Deceiver's Choice are kept in the drawing player's hand for later use.
- **Fate Deck** (one card drawn per round, determines that round's shape):
  Quiet Night, Murder, Banishment — but only while the game is still in its
  ordinary rounds. Once living players drop to a configured threshold
  (default: 4), the Fate deck stops being drawn from entirely and the game
  moves permanently into the Final Circle (see below) — there is no going
  back to ordinary rounds once that happens, even if the Final Circle's own
  banishments bring the player count back up relative to some earlier point
  (they never do; it only ever shrinks).

### Round Flow

Each round has **exactly one event** — a Murder night, a Quiet Night, or a
Banishment Vote — and every round starts with its own Draw Phase. A Murder
is never immediately followed by a Banishment Vote (or vice versa) without a
fresh round of card-drawing in between; the event that just happened always
ends the round.

1. **Draw Phase** — each living player (turn order) draws one Fortune card.
2. **Fate card revealed** for the round, deciding that round's one event:
   - **Quiet Night** — no murder. Proceeds straight to an Elimination Reveal
     announcing nothing happened, then the round ends.
   - **Murder** — a ceremonial "pass the phone" Night transition that states
     outright that tonight's Fate is Murder (there's nothing left to guess —
     by design the Fate card is only ever hidden before the Draw Phase, not
     after), then every living player takes a turn (see below); the living
     Deceivers privately choose one living, non-Deceiver target via Murder
     Selection — see "How multiple Deceivers decide a Murder target,"
     below, for exactly how that choice gets made when more than one
     Deceiver is alive. A Shield card the target is holding deploys
     automatically and is spent the instant it blocks a Murder — the target
     never has to act on it; a Deceiver's Choice card played by whichever
     Deceiver makes the final call overrides a Shield in effect (and still
     spends the Shield). A "Gather Everyone" checkpoint, then an Elimination
     Reveal shows the outcome, then the round ends.
   - **Banishment** — skips the night entirely. An explicit **Open
     Discussion** screen comes first: put the phone down, the whole table
     talks it out loud — accuse, defend, ask questions — with a "Begin
     Voting" button for whenever the table is ready. Only then does every
     living player privately cast one vote (pass device between voters) for
     who to banish. A held Dagger card can be played to add +1 weight to
     that vote. Most votes banished; ties banish no one. A "Gather Everyone"
     checkpoint, then an Elimination Reveal shows the outcome, then the
     round ends.
3. **Win check** (after every event's Elimination Reveal): Deceivers win
   instantly, any time, the moment remaining Deceivers ≥ remaining Loyal —
   no vote can ever remove enough of them past that point, so there's no
   reason to delay ending it. Loyal eliminating every Deceiver does **not**
   instantly end the game, though — see "The Final Circle" below for the
   only way Loyal can actually win. If neither applies, the round counter
   increments and play loops back to a fresh Draw Phase — unless the living
   player count has now reached the Final Circle threshold, in which case
   the game permanently switches modes (see below) instead of drawing
   another Fate card.
4. **Results Screen** — winning side, full role reveal of every player, this
   game's Prize Pot payout, series standings, and either "Next Game" or
   "New Series" depending on whether the series is complete.

### How multiple Deceivers decide a Murder target

With Deceiver counts now able to reach 2 or 3 (see "Deceiver count" under
Roles, above), the question of what happens when they'd pick different
victims needed an actual answer — the original design only ever had one
Deceiver acting. The brief's answer, directly from the game's designer,
splits on the Deceiver Knowledge setting:

**Hidden mode, or whenever only one Deceiver is currently alive (either
mode)** — the lowest-seat-numbered living Deceiver still decides alone,
exactly as a single Deceiver always has. Every other living Deceiver's
turn in the queue looks identical to a Loyal player's ("Nothing To Do") —
which doubles as a quiet, nameless tell to them that a lower-numbered
Deceiver must exist (since *someone* has to be deciding), without ever
revealing who.

**Hidden-mode "friendly fire" and automatic immunity (follow-up round)** —
one further rule, specified directly by the game's designer: in Hidden
mode specifically, the lone decider genuinely doesn't know who their
fellow Deceivers are, so their target pool is no longer every *non*-
Deceiver — it's every *other* living player, full stop, fellow Deceivers
included (`eligibleMurderTargets` branches on `deceiverKnowledge` for
exactly this). Picking a teammate by accident is a real possibility now,
not a null case. But a Deceiver is automatically immune to Murder
(`resolveMurder`'s `isFellowDeceiver` check) — a held Deceiver's Choice
card cannot override this, since Choice exists to counter a target's own
*external* protection (a held Shield), not to let the Deceivers kill one
of their own even unknowingly. The outcome resolves exactly like an
ordinary Shield-save in every visible way — same `protected`/`murdered`
flags, same reveal text ("A Shield protected them. They survive the
night."), same everything — so the rest of the table can never tell the
difference between a real Shield and a Deceiver who got lucky, and the
existing Shield-save code path doesn't need a special case for it. Known
mode is unaffected: a shortlisting or narrowing Deceiver there knows
exactly who their teammates are and the target pool still excludes every
Deceiver outright, same as the original design.

**Known mode, exactly two living Deceivers** — a two-step hand-off: the
lowest-numbered Deceiver shortlists exactly two candidates; the phone then
passes to the next-lowest-numbered living Deceiver, who picks the final
target from that shortlist of two. That pick *is* the binding target — a
held Deceiver's Choice card is only ever offered to whoever makes this
final call, never at the shortlist step (a provisional candidate isn't
what a Shield would even be checked against).

**Known mode, exactly three living Deceivers** — the same shortlist step,
then a third step instead of a final one: the second Deceiver narrows the
shortlist to a single candidate, and the phone passes to the third
Deceiver, who is told "your fellow Deceiver has chosen [name] — confirm
the kill, or save them instead." **Kill** resolves as an ordinary Murder
against that candidate (Shield/Deceiver's Choice logic unchanged, the
Choice card only offered here). **Save** resolves the round as an
ordinary Quiet Night — nobody dies, same `nightResult`/`eliminationContext`
shape a real Quiet Night uses, sharing the exact fallback branch
`advanceMurderQueue` already had for "no valid target was ever recorded,"
rather than a separate code path.

`state.murderDecision.order` — the currently-living Deceivers' ids, lowest
seat number first — is recomputed fresh at the start of *every* Murder
phase (`beginMurderPhase`), not persisted across rounds the way the
original single-Deceiver `actingDeceiverId` was: a Banishment Vote between
rounds can kill a Deceiver and reshuffle who's "lowest," or shrink a
3-Deceiver game down to 2 or 1, and the shape of the decision (single /
shortlist+narrow-final / shortlist+narrow+veto) has to re-derive from
however many are alive *this* round, not whatever the game started with.
`murderStepFor(state, playerId)` is the single source of truth for which
step, if any, a given living Deceiver performs that round — both the human
action handlers and the computer-seat bot logic (`resolveComputerTurn`'s
`MURDER` case) dispatch off its return value, so there's exactly one place
that decides who does what, not two implementations that could drift out
of sync.

Bots mirror the human steps with the same simple, non-strategic spirit as
every other `bot*` function: `botPickMurderShortlist` picks two random
eligible targets, `botPickFromMurderShortlist` picks one of whichever
shortlist it's handed, and `botChooseMurderVeto` is a plain 50/50 coin
flip — same spirit as `botChooseRecruitResponse`'s coin flip, since the
third Deceiver has no information a real strategic AI would weigh here
either.

### The Final Circle (End Game)

Modeled directly on The Traitors UK's endgame structure, added as a
follow-up round specifically because the original "instant Loyal win the
moment the last Deceiver is eliminated" design gave the Loyal team a
no-tension confirmation they'd never get in real life — they can never
actually know they've caught every Deceiver, only suspect it.

Once living players drop to **4** (`CONFIG.finalCircleThreshold`) **and at
least one ordinary round has already been played** (`state.round > 1`),
ordinary rounds stop for good — no more Fate cards, no more Draws, no more
Murders — and every remaining round takes this shape instead. The round>1
requirement exists specifically so a game that *starts* at or below the
threshold (a 3- or 4-player game) doesn't skip straight into the Final
Circle on round 1 — it's meant to be an end-state reached after some
normal play, not a shortcut a small game falls into immediately. It costs
nothing for larger games, which are already well past round 1 by the time
eliminations bring them down to the threshold anyway.

1. **A secret per-player ballot**: pass the phone to each living player in
   turn, same private pass-device pattern as a vote; each one chooses
   **End Game** or **Banish Again**, with no way for anyone else to ever
   learn what anyone else chose.
2. **If every living player chose End Game**, the game ends right there —
   full role reveal, normal payout rules apply (see below).
3. **Otherwise** (at least one Banish Again — it only takes one), the circle
   moves to Open Discussion and then a Banishment Vote exactly like an
   ordinary one, except the Elimination Reveal that follows **never shows
   the banished player's role** — just "X Is Banished. Their allegiance
   stays hidden — for now." The suspense that normally ends at every single
   Elimination Reveal now survives all the way to whenever the Final Circle
   itself concludes.
4. **Once living players reach 2, there is no more voting** — the game ends
   automatically, right then, with a full role reveal. This is the one
   fixed exit that doesn't depend on anyone's choice.

**These two endings — unanimous End Game, or down to two — are the
*only* ways a game can ever end**, resolved by `checkFinalCircleWinner`:
*any* surviving Deceiver wins outright, even a single Deceiver sitting
alongside two or three Loyal. This mirrors the real show's final-two
table exactly:

| Final survivors | Result |
|---|---|
| Loyal + Loyal | Split the pot |
| Loyal + Deceiver | Deceiver takes the pot |
| Deceiver + Deceiver | Deceivers split the pot |

— and generalizes it cleanly to a 3- or 4-player unanimous End Game stop
too, using the same "any surviving Deceiver wins" rule rather than a
table limited to exactly two survivors. Payout math itself didn't need to
change at all: the existing `payoutPrizePot` (split among winning-side
survivors) already implements this correctly once the right winner is
passed in — the only new code was *deciding* who that winner is.

**There used to be a third way to end a game — a "Deceiver majority"
shortcut — and it was removed entirely.** `checkDeceiverMajorityWin`
ended the game the instant living Deceivers numerically overtook living
Loyal, anywhere, Final Circle or not, on the reasoning that such a
position was already unwinnable for the Loyal so there was no suspense
value in dragging it out. That reasoning went through two rounds of
scrutiny from the game's designer, both triggered by real games that
ended with no Final Banishment at all:

- First (TEST_REPORT.md §43): the check originally fired on
  `livingDeceivers >= livingLoyal` — *equal* counts, not just outnumbered
  ones. An 8-player game's two Deceivers both surviving down to a
  4-player, 2-vs-2 standoff (also exactly the Final Circle's own entry
  threshold) ended the game on the spot, before the Final Circle ever
  got a chance to start. The reasoning at the time was that the
  Deceivers could always force a tied vote by voting as a bloc, and a
  tie banishes no one — but that doesn't actually hold in this game: the
  Dagger card (+1 weight to a single vote during a Banishment) can break
  an otherwise-even split, so the Loyal genuinely could still win a
  Banishment Vote at equal counts. Fixed by requiring *strict*
  outnumbering (`>`) instead.
- Then (TEST_REPORT.md §44): even strict outnumbering turned out to be
  the wrong rule to auto-end on at all, anywhere. The designer's point:
  the game has exactly two endings, full stop — not "two endings, plus a
  shortcut for when the vote is already decided." A lopsided ordinary
  round (every Loyal eliminated while a handful of Deceivers remain, or
  a wrongly-banished Loyal handing the Deceivers a majority mid-Final-
  Circle) now just keeps playing — ordinary rounds until the threshold,
  then the Final Circle — exactly like any other count, all the way to
  one of the two real endings. `checkDeceiverMajorityWin` was deleted
  outright rather than left unused.

### Recruit or Die

Also modeled on the real show, and strictly private — the brief is explicit
that this mechanic gets no public interstitial or announcement of any
kind, unlike every other event in the game.

**Trigger**: `shouldTriggerRecruitment(state)` — exactly one living
Deceiver, the game started with *more than one* (`state.
initialDeceiverCount`, set once in `setupNewGame`), the Final Circle
hasn't begun, and it hasn't already fired once this game (`state.
recruitmentAttempted`, set the moment `beginRecruitment` runs). The
"started with more than one" guard matters: a 3–6 player game only ever
has a single Deceiver from the start, with no one to replenish, so it
should never trigger there — this is specifically about a lone *survivor*
of an originally larger Deceiver team. The once-per-game cap matters too:
without it, a lone Deceiver whose recruit keeps choosing Refuse could be
offered the same choice again every single round, round after round,
which could in principle carry a game past the Final Circle threshold
without the Final Circle ever actually engaging (found and flagged during
overnight testing — see TEST_REPORT.md §28 for the original write-up).
One attempt per game, win or refuse, closes that off cleanly: the lone
Deceiver gets exactly one shot at replenishing, and if it's refused, the
game carries on as an ordinary round from there (including, eventually,
the Final Circle, on its own normal terms).

**Shape**: a one-round detour that fully replaces that round's ordinary
structure — no Fate card, no Draw, no Murder — and touches exactly two
players' hands, nobody else:

1. The lone Deceiver gets a private **Recruit Or Die** screen and secretly
   picks one living Loyal player.
2. The phone passes *directly* to that player (no one else is involved in
   this round at all) for a private **Join Us** / **Refuse** choice.
3. **Join Us**: before anything resolves, the recruit sees one more
   private screen — "You Are Now A Deceiver," the role's own description,
   and the name of their (sole, by construction — see "Trigger," above)
   fellow living Deceiver, exactly as the original Reveal screen shows a
   starting Deceiver their teammates. Only once they tap through does
   `resolveRecruitmentJoin` actually flip their role, for every future
   win-condition and payout check — `payoutPrizePot` already splits by
   current role, so nothing else needs to change for them to share
   normally if the Deceivers later win. Resolves to the table as an
   ordinary Quiet Night ("no murder takes place that night") — same
   `nightResult`/`eliminationContext` shape a real Quiet Night uses, so
   the Elimination Reveal is indistinguishable from any other Quiet Night.
   This two-step confirmation was added after the initial version jumped
   straight from "Join Us" to the public Elimination screen with no
   private moment in between — unclear to the recruit both that they'd
   actually just become a Deceiver and who their new teammate was,
   reported directly by the game's designer. (This is also the one
   documented exception to Hidden-mode knowledge: the fellow-Deceiver
   reveal fires regardless of the `deceiverKnowledge` setting, since a
   successful recruitment pact is specifically what's meant to introduce
   two Deceivers to each other in Hidden mode — see Deceiver Knowledge,
   below.)
4. **Refuse**: that player dies instead — not the existing Deceiver —
   resolved to the table as an ordinary Murder (same shape `resolveMurder`
   produces, so the reveal looks identical to any other Murder outcome,
   role and all). A held Shield does **not** protect against this; the
   kill is unconditional, deliberately bypassing the Shield-check logic a
   real Murder goes through. The pre-choice screen now states this cost
   explicitly ("Refuse: you are murdered tonight instead, Shield or no
   Shield") rather than the vaguer "Refusing has a cost" it used before —
   found alongside the Join confirmation gap above, same report.

**Staying invisible to the rest of the table**: the MAIN screen's "Begin
Draw Phase" button is *exactly* the same button, text, and action
regardless of whether this round is actually an ordinary Draw or a
Recruit-or-Die detour — the branch happens invisibly inside the
begin-draw handler the instant it's tapped (`main.js`), not anywhere
startRound or the screen itself can be inspected in advance. The same
logic extends to the "Draw" interstitial added in a later round (see
"Interstitials and the raster icon family," above) — it's set
unconditionally, before the branch, so a Draw card appears every single
round regardless of which one secretly fires; its absence specifically on
the Recruit round would otherwise be exactly the kind of pattern this
mechanic is designed to never produce. The spoken cues are equally
careful, but got this wrong once: both hand-offs — the lone Deceiver's own
turn, *and* the hand-off to their chosen target — now go through the exact
same generic `maybeAnnouncePassDevice` path every other queue turn uses,
named out loud with the same phrase bank as any other hand-off ("Ann, it's
your turn," etc.). An earlier version deliberately avoided naming the
*target* specifically, worried that saying their name aloud would leak who
they were, and gave that hand-off its own fixed line instead — "Pass the
phone to your chosen recruit." That reasoning was backwards, and was
caught as a live bug after shipping (reported directly by the game's
designer): naming a player is not the leak — every living player's name
already gets called out loud at some point during an ordinary Draw queue,
so one more named hand-off reveals nothing on its own. The real leak was
the word *"recruit"* itself, spoken aloud to the whole table, not just
whoever's holding the phone — it announced that a recruitment was
happening at all, independent of whether a name was ever said, which is
exactly the kind of public announcement the brief says this mechanic must
never produce. Fixed by deleting the special case entirely rather than
patching its wording: the Recruit-response hand-off no longer gets any
bespoke announcement, manual call, or guard in `main.js` — it is now
*structurally* indistinguishable from any other named queue turn, because
it *is* one.

**Bots**: `botPickRecruitTarget` (uniform random among eligible Loyal
players) and `botChooseRecruitResponse` (a plain 50/50 coin flip) — simple
and non-strategic, consistent with every other `bot*` function's
documented design intent. A computer seat on either end of a recruitment
attempt never needs special anonymity handling beyond what the existing
generic "Computer Seat — taking its turn" decoy screen already provides.

### A Banishment never opens a fresh shuffle

The Fate deck is fixed so a Banishment card can never be the very first card
drawn after a fresh shuffle — at game start, and again every time the deck
is exhausted and reshuffled from its discard pile. A Quiet Night or Murder
always happens before the next Banishment becomes possible (see
`keepBanishmentOffTop` in `engine.js`), so the circle is never asked to vote
someone out with zero information from a preceding night.

### Every event ends with an obvious "gather everyone" checkpoint

The private, sequential, pass-the-phone turns of a Murder or Banishment
Vote are followed by a distinct, unmissable screen — "Gather Everyone: The
Circle Must See This" — before the actual outcome is shown. This is a
deliberate second step, not just a caption on the result screen, so there's
no ambiguity about when the phone should stop being private and start being
watched by the whole table.

### Fate is not revealed in advance

The Main hub no longer previews which Fate card (Quiet Night / Murder /
Banishment) is active for the round before the Draw Phase begins — only
whether the Final Circle has begun (a structural fact derived from the
living-player count, not a hidden card, so naming it isn't a spoiler). The
actual branch a round takes is revealed only as it happens, through the
Night/Murder or Banishment Vote screens themselves, to keep every round
suspenseful rather than telegraphed.

### Series play and the Prize Pot economy

Several games can be played back to back as a **series**, chosen as a count
on the Setup screen (default 1). The same named roster plays every game in
the series; roles are reshuffled fresh each game. `state.seriesScores`
(keyed by player name) persists across games within a series and is never
reset until a brand new series is started from the Title screen.

The Prize Pot itself does **not** carry over between games — it resets to 0
at the start of each game and builds fresh from that game's Gold draws. When
a game ends, its pot is paid out immediately and split evenly among the
survivors on the winning side only (anyone already eliminated, on either
side, gets nothing that game):
- **Loyal win** — the pot is split among whichever Loyal players are still
  alive.
- **Deceiver win** — the pot is split among whichever Deceivers are still
  alive (framed as "the whole pot" since it isn't shared with Loyal at all,
  unlike a Loyal win where it's necessarily divided among a larger group).

This assumption — splitting evenly among winning-side survivors rather than,
say, giving every survivor the full pot amount — was chosen as the simplest
economy consistent with "share of pot" (Loyal) vs "whole pot" (Deceiver)
that avoids uncapped point inflation.

### Why this shape
It gives every required card a real mechanical purpose (gold → pot; dagger →
vote weight; shield → protection; quiet night/murder/banishment → round
branching; final banishment → forced endgame climax; deceiver's choice →
shield counter), touches all 12 required screens in a natural sequence, and
is simple enough to implement correctly and test end-to-end in this
prototype pass.

## 5. Persistence

`localStorage` key `deceivers_state_v1` holds the full serializable game
state (players, roles, decks, hands, pot, phase, round, history). On load,
`main.js` checks for a saved in-progress game and offers **Continue** vs
**New Game** from the Title screen. State is cleared on Results → Play Again
or via Settings → "Reset Game".

## 6. Milestones

1. PROJECT_PLAN.md (this file) + folder structure
2. SVG asset library (icons, card frames, role cards, game cards, UI art)
3. CSS design system
4. Data / state / engine (game logic, no DOM)
5. UI rendering + main.js router wiring all 12 screens into a playable loop
6. Manual + scripted (headless Chromium, 390×844) test pass across the full
   game loop; fixes logged
7. TEST_REPORT.md
8. CODEPEN_EXPORT.md

## 7. Sound design

`js/sound.js` is a self-contained WebAudio synthesis module (no audio
files — everything is generated from oscillators, noise buffers, and
filters at runtime, consistent with "no paid libraries / no external
assets"). It exposes `Sound.setEnabled(bool)` and `Sound.play(name,
delay?)` for one-shot effects, plus `Sound.setMusicEnabled(bool)`,
`Sound.startMusic()` and `Sound.stopMusic()` for the looping ambient bed
described below; nothing else in the codebase touches `AudioContext`
directly. Sound effects are muted by default (shared-device etiquette),
toggled from the header speaker icon or Settings.

18 named cues cover every meaningful moment: a low card-slide for a private
role reveal (and its mirror-image fall for hiding it again), a dry paper-flick
with a wooden tick for drawing a card, a single muted coin-drop when Gold
hits the pot, a low swelling drone for Night falling, a recurring ceremonial
bell (`gather`) reused for "Seal the Roles," "Next Game," and — now every
time, not just when its button is tapped — the moment the Elimination
Reveal's "Gather Everyone" screen itself first appears (at the end of the
Murder and Vote queues, as well as a Quiet Night), distinct outcome stings
for a Quiet Night / a Shield block / a Murder / a tied vote / a Banishment,
a restrained low rising tone (`roundBegin`) marking a new round's start
distinctly from the previous round's closing sound, and two long, slow-
swelling drones for the two endings — dark and dissonant for the Deceivers,
warmer but still restrained for the Loyal.

**A darker, more physical palette (follow-up round)**: the original cues
leaned on bright melodic synth arpeggios (a three-note ascending triangle
chime for Gold, four-note sawtooth/triangle chords for the two endings) that
read as "mobile game," not the dark-ceremonial key art the rest of the app
chases. Rebuilt around three new primitives — `thud` (a sub-sine "body"
under a short lowpassed-noise "knock," for a weighty physical impact),
`woodKnock` (tight bandpass noise, no tonal content at all, for a dry click
rather than a digital beep), and `metalRing` (high-Q bandpass noise with a
longer ringing decay, used sparingly — Gold's coin-drop and the Shield's
protective shimmer are the only two places real brightness is still
earned) — and almost every cue was rebuilt on top of them: `tap` is now a
near-silent wood tap instead of a pure sine beep, `gold` a single coin-drop
instead of an ascending arpeggio, `banished` a wooden gavel-strike instead
of a sawtooth buzz, and the two endings slow-swelling dissonant/warm drones
instead of bright jingle-like chords. `nightFalls` and `gather` (now with a
brief noisy strike leading its tonal body in, since a real bell's strike
isn't a clean sine either) needed the least change — they were already
closest to the target in character. The guiding principle throughout was
"a few good sounds, not many small bright ones" — several cues (`gold`,
`shieldSaved`, `banished`) actually got *simpler* (fewer layered elements)
while landing harder, rather than gaining more.

**A spoken host instruction wherever the phone needs to move or the group
needs to act, not just per-player hand-offs (follow-up round)**: on top of
the existing "Pass the phone to X" per-turn announcements (Reveal, Draw,
Vote, Final Circle decision), two collective lines were added — "Night
falls. Keep your card secret." the moment the Night screen appears, and
"Gather everyone. Place the phone in the centre." the moment the
Elimination Reveal's pre-reveal "Gather Everyone" screen appears — both
centralized in `main.js`'s `render()` (`maybeAnnounceNightFalls`,
`maybeAnnounceGather`), the same pattern as the existing
`maybeAnnouncePassDevice`, so they fire exactly once on arrival regardless
of which of several possible code paths got there. The Murder queue's
per-turn hand-off switched from naming each player to a generic "Pass the
phone to the next player." line — not a leak fix (every Murder turn already
looks and sounds identical regardless of role, so naming would have been
just as safe as it is for Reveal/Draw/Vote), but it better matches that
same ritual anonymity than naming each person in turn would. The one
genuinely new mechanism, not just a new line: `Sound.announceInstruction`,
a shared cancel-then-speak helper both the per-turn and collective
announcers now go through, and `Sound.announcePassDevice(name)` accepts a
falsy name to fall back to the generic phrasing (used for Murder, and
separately for Recruit or Die's name-free hand-off to the recruit — see
"Recruit or Die" above). The existing "The time for talk is over" line
already covers "the circle must now vote," so nothing new was added there.

**A hand-off cue for every queue, not just the murder-identity-safe one**:
earlier rounds gave each per-player queue (Reveal, Draw, Murder, Vote) a
*button*-press sound, but advancing to the *next* player's turn reused the
same near-silent generic `tap` used for ordinary UI navigation — easy to
miss as a deliberate cue. `passDevice` (a soft two-note "here, take it"
chime, louder and more distinct than `tap`) now plays specifically at that
hand-off moment in the Draw, Murder, and Vote queues, replacing `tap` there;
`gather`'s ceremonial bell plays instead once a queue's *last* player
finishes, since that's the moment to look up rather than pass the phone
again. (Reveal's queue keeps its existing `reveal`/`hide` pair unchanged —
opening and closing a role card is already its own distinct pair of sounds,
so no separate hand-off cue was added there.) `passDevice` is exactly as
identical-every-turn as the `tap` it replaces in the Murder queue, so the
anonymity guarantee below is unaffected.

**A spoken "Pass the phone to X" for every hand-off**: on top of the
`passDevice` chime above, `Sound.announcePassDevice(name)` (`sound.js`)
speaks the next player's name out loud the moment their pass-prompt screen
actually appears — reusing the same Web Speech API voice-selection logic
as the Discuss-closing line (§ below), not a separate implementation.
Wired centrally in `main.js`'s `render()` (`maybeAnnouncePassDevice`,
called once per render right after the computer-seat auto-advance check)
rather than scattered across every action handler that can lead to a new
turn — it tracks the last `phase:playerId` it already announced so it
fires exactly once per turn regardless of which of the several possible
code paths got there, and resets whenever the game leaves queue-phase
territory so the same player leading a later round's queue is announced
again. Computer seats are silently skipped (nobody's physically holding a
phone for them), and the announcement itself is deliberately just a bare
name — nothing about role, phase, or what to do — so it's exactly as
identical-every-turn as the Murder queue's anonymity rule requires: every
living player's turn gets this same announcement, naming whoever's turn it
actually is, with zero information content beyond what's already shown on
screen. Covers Reveal, Draw, Murder, Vote/Final Banishment, and the Final
Circle's own decision queue — every screen built on the shared
`passPrompt()` template; the Night and Elimination "gather everyone"
screens are addressed to the whole table at once rather than one named
player, so they were left without a spoken line.

**Anonymity constraint carried over from the visual design**: because the
phone is a *physical, audible* object passed hand to hand, a sound that only
plays on the real Deceiver's turn would leak their identity to the room just
as surely as a different-looking screen would. `tap-murder-turn` and
`confirm-murder-turn` always play the same generic `tap` cue regardless of
who's actually acting that turn — the distinctive "something happened"
sounds are deferred until the Elimination Reveal, once everyone is already
gathered and audibility is no longer a leak.

**Background music (opt-in, Open Discussion only)**: a separate Settings
checkbox, off by default, independent of the sound-effects toggle. When on,
a quiet dark chord progression (three glide-tuned voices moving through a
short descending loop — D minor, C major, Bb major, F major — under a slow
filter-cutoff LFO) fades in the moment the Open Discussion screen appears,
evolving slowly rather than sitting on one static note. Every other screen
stays effects-only; a continuous bed anywhere else would compete with the
thing on screen instead of setting a mood for it.

**The discussion runs on a clock, not a button**: 30 seconds per living
player, shown as a countdown on the Discuss screen. An earlier version had
a tap-when-ready "Begin Voting" button instead; in practice it got tapped
almost immediately, before the table had actually talked anything through,
so it was replaced with a clock that counts down on its own. A smaller,
deliberately de-emphasized "Everyone's Ready — Skip Ahead" button (ghost
style, not the prominent gold CTA the rest of the game uses for its primary
action) still lets a table that's genuinely done early end discussion
before the clock runs out — the default is still the full clock, this is
an opt-in shortcut, not a replacement for it.

**Real licensed music, outside the app**: `CONFIG.spotifyPlaylistUrl` holds
a link to a curated Spotify playlist. "Open Our Playlist In Spotify"
appears both in Settings and on the Discuss screen — a plain `<a target=
"_blank" rel="noopener noreferrer">`, nothing more. Tapping it hands off to
the host's own Spotify app entirely; the game never embeds, streams,
authenticates against, or otherwise talks to Spotify's API. This was a
deliberate choice over an embedded player: no login requirement, no new
third-party dependency inside the app itself, and it was the simpler of
the two options weighed, at the cost of the two audio sources (this and the
synthesized discussion music) not being able to duck or coordinate with
each other — a host who wants the real playlist should probably leave the
built-in background-music toggle off. Both appearances of the link are
followed by a short note telling the table to play it through a connected
speaker, not the phone itself — the phone's own speaker is about to be
passed hand-to-hand for the rest of the game.

**Promo link, shown when a full game ends**: `CONFIG.tiktokAdUrl` holds a
link to a promo clip, shown on the Results screen as a graphic banner
(designer-supplied artwork, resized/compressed the same way as the
interstitial posters — see "Asset processing" above — and saved to
`assets/brand/watch-our-ad.jpg`) wrapped in the same plain link-out pattern
as the Spotify link. Gated on `isLastGame` — a standalone single game's
results, or the last game of a series — and never on any mid-game screen,
so it can't interrupt the game itself. Originally gated the opposite way
(shown *between* games in a series, hidden on the game/series' actual
conclusion); flipped per the designer's explicit call once the first
version shipped — the moment a player is done and about to close the
game out is the one that actually makes sense for this, not mid-series
when they're eager to keep playing.

**Tip link, dual placement**: `CONFIG.tipUrl` holds a Stripe Payment Link
("Send a Tip to MANCAVEMAN"), rendered the same graphic-banner way as the
TikTok ad (`assets/brand/send-a-tip.jpg`, same resize/compress convention,
chosen from 6 designer-supplied variants for matching the TikTok banner's
style — crowned/bearded figure, drippy stencil-graffiti treatment, the
Mancave Industries stamp — so the two read as a matching pair rather than
unrelated ads). Appears in two places: Settings (always available,
directly below the Spotify link) and the Results screen (same
end-of-game `isLastGame` gating as the TikTok banner, stacked directly
beneath it). The game never embeds a payment form or touches Stripe's API
— tapping it just opens the hosted Stripe Payment Link in a new tab, same
"hand off to the real thing" pattern as every other external link here.

**Closing the discussion**: when the clock hits zero, voting doesn't start
immediately. If music is playing, it first swells to a brief, brighter
crescendo (`Sound.crescendoMusic` — louder, more open filter, ~0.9s); then,
if sound effects are on, a synthesized voice (the browser's own Web Speech
API — no audio files, nothing recorded, same "no external assets" rule as
everything else here; it silently no-ops on browsers without speech
synthesis) says "The time for talk is over," at the voice's own natural
rate and pitch (`rate: 0.94`, `pitch: 1.0` — no artificial pitch-bend) — an
earlier version slowed and deepened it heavily for drama and it came across
as a flat robotic drone rather than ominous. Voice selection now prefers a
female-sounding installed voice by name match as before, but within that
pool prefers whichever one is labeled as a higher-quality tier — "Enhanced"/
"Premium" (iOS/macOS Siri voices), "Natural"/"Neural" (Android), or "Google"
(Chrome's network voices) — over the default compact/offline tier of the
same name, since platforms that ship both make the higher tier sound
noticeably less robotic; falls back to the platform default where no match
of either kind is found. (The headless browser used for this project's own
automated testing reports zero installed voices at all, same as most
server/CI environments — this preference logic is exercised by code review
and a live run in a real browser, not by the automated test suite.) Only
once that finishes does the music
fade out and the game actually move to the vote queue; the Discuss screen
shows a button-less "The Time For Talk Is Over" sting for that whole
stretch, so there's nothing to tap through that could cut the line off
mid-sentence. With sound effects off this entire sequence resolves
instantly, same as the clock simply running out silently.

**Phrase variety, tone, and jitter — a more natural voice without a cloud
TTS service (follow-up round)**: every spoken line used to be one fixed
sentence at one fixed rate/pitch (`0.94`/`1.0`, see above) — accurate when
first written, but "Pass the phone to X" is the single most-repeated line
in the game (every Reveal/Draw/Vote/Final-Circle-decision queue turn), and
hearing the literal same sentence at the literal same rate 20+ times in one
session reads as mechanical regardless of how good the underlying voice is.
Three changes, still entirely on the free, offline, no-API Web Speech
API already in use — a genuine cloud neural voice (ElevenLabs, Google/
Azure/Amazon TTS) would sound more human still, but needs an API key, a
network call per line, and ongoing cost; that's a real architecture
decision for this no-backend static site, deliberately left as a separate
future conversation rather than folded into this round:
1. **Phrase variety** — most cues now have 2-4 interchangeable wordings
   (the `*_PHRASES` constants in `sound.js`) picked at random each time
   ("Pass the phone to X." / "X, you're up." / "Over to you, X." / "X,
   it's your turn."), so the same functional announcement doesn't come out
   as identical text call after call. The anonymity-critical generic
   (name-free) Murder-queue variant got its own separate phrase pool
   (`PASS_DEVICE_GENERIC_PHRASES`) — varied in the same way, but never at
   risk of leaking a name, since Murder's queue only ever calls
   `announcePassDevice(null)`.
2. **Named tone presets + per-utterance jitter** — three small rate/pitch
   shapes (`TONES`: `calm` for routine hand-offs, `ominous` for Night
   Falls, `urgent` for Gather Everyone and "the time for talk is over"),
   each nudged by a small random amount per line (`jitterTone`) so even
   repeated instances of the *same* tone land at slightly different
   rate/pitch rather than a flat, identical reading every time. The spread
   stays deliberately subtle — not a cartoon voice change, and still no
   heavy artificial pitch-bend (the original flat-robotic-drone lesson
   above still holds); just enough that different moments read in
   different registers.
3. **Paced multi-part sequences** — two-sentence lines (Night Falls,
   Gather Everyone) now speak as two short utterances with a real pause
   between them (`speakSequence`, 300ms) rather than one utterance
   containing both sentences back to back, closer to how someone actually
   pauses between sentences than most engines' own default inter-sentence
   gap.

`Sound.announceInstruction` now accepts an optional `onEnd` callback and
`tone` name, and `text` can be a single string or an array of parts for a
paced sequence; `announceNightFalls()`, `announceGather()`, and
`announceRecruitHandoff()` are new named wrappers (replacing the raw
strings that used to live directly in `main.js`) so the phrase banks and
tone choices for every line live in one place, `sound.js`, rather than
scattered across call sites. A shared `announceGeneration` counter (bumped
at the start of every new announcement) lets an in-flight multi-part
sequence detect it's been superseded by a newer announcement and stop
advancing silently, on top of the existing `speechSynthesis.cancel()` that
already stopped whatever was audibly playing.

Verified directly: a monkey-patched `SpeechSynthesisUtterance` captured the
exact text/rate/pitch of 30 consecutive `announcePassDevice('Ann')` calls
— all 4 named phrase variants appeared, rate/pitch both varied call to
call within the `calm` tone's range, and every one still correctly
included "Ann." The generic (Murder-queue) variant was checked the same
way across 20 calls — all 3 generic variants appeared, and none ever
contained a player name. Night Falls and Gather Everyone were each
confirmed to produce exactly two utterances (one per sentence) at their
tone's rate, with the real pause between them. A full live 3-player
playthrough with sound enabled showed genuine phrase variety across real
in-game turns, not just isolated calls. 0 console errors throughout.

## 8. Computer players

Any seat on the Setup screen can be marked **Computer** instead of Human via
a per-row segmented toggle (`js/ui.js` `UI.renderSetup`), so a table can play
with fewer physical humans than the seat count requires — down to zero
seated humans, with one person left to act as "host" tapping through the
communal screens (see below). `state.players[i].isComputer` is set at game
creation from the Setup screen's choice and carries through the whole game
and, via `state.rosterIsComputer`, across every game in a series.

Bot decisions are deliberately simple and non-strategic — random-but-
plausible, not adaptive or "smart" — since this is a static client-side site
with no AI backend (`engine.js`: `botPickMurderTarget`,
`botShouldUseDeceiversChoice`, `botPickVoteTarget`, `botShouldUseDagger`).
There's nothing to tune for difficulty; the point is filling an empty seat,
not posing a challenge.

**The anonymity constraint applies to computer seats exactly as it already
applied to human ones.** Whether a seat is Human or Computer is public
information (it's chosen openly on the Setup screen), but which seat holds
the secret Deceiver role must never leak — and a computer seat behaving
differently on its turn depending on whether it happens to be the acting
Deceiver would leak that instantly, since there's no human at the table for
the "nothing to do" decoy screen to fool. So instead of showing a decoy
screen, a computer seat's turn is skipped entirely — but that skip has to be
the same skip regardless of role:

- `main.js`'s `render()` calls `autoAdvanceComputerTurns()` before doing any
  phase-specific rendering. If the current turn (Reveal / Draw / Murder /
  Vote / Final Circle decision / Final Circle Vote queue) belongs to a
  computer seat, it shows one
  generic "Computer Seat — Taking its turn" screen (`UI.renderComputerTurn`,
  content driven only by the player's name, never by their role or by what
  the bot decided) and, after a short fixed pause
  (`COMPUTER_TURN_DELAY_MS`), resolves the turn automatically and re-renders.
- The Murder-phase resolution (`resolveComputerTurn`'s `PHASES.MURDER` case)
  calls `recordMurderChoice` only when `isActingDeceiverTurn(state)` is
  true, then *always* calls `advanceMurderQueue` — the identical two-call
  shape the human `confirm-murder-turn` handler already used for its decoy
  pattern. A non-acting-Deceiver computer seat and the acting-Deceiver
  computer seat are visually and timing-wise indistinguishable turns.
- Communal, non-identity-specific screens (Main hub, Night transition,
  Elimination Reveal, Results) are unaffected — those already require just
  one tap from whoever is holding the phone, human or not, and stay that
  way even in an all-computer roster (the host taps through on the players'
  behalf without ever seeing anyone's private information).

Public UI surfaces that are allowed to show Human/Computer status — because
it was never secret — mark it plainly: the Setup screen's per-seat toggle,
the Main hub's player list, and the Results screen's full role reveal.

## 9. Out of scope for this prototype

- Networked/multi-device play (explicitly a shared-phone prototype per brief)
- Accounts, server sync, anti-cheat for private-reveal honesty (trust-based,
  as physical card games are)
