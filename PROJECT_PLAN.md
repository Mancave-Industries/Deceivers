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

## 4. Game Design Assumptions

The brief specifies required screens and required card types but not exact
rules. Documenting the interpretation used, per the instruction to record
assumptions rather than pause for questions:

### Roles
- 3–8 players (local pass-and-play, one shared phone).
- Deceiver count scales with player count: 3–6 players → 1 Deceiver; 7–8 → 2.
  Remaining players are Loyal.
- During private role reveal, a Deceiver also privately sees who their fellow
  Deceivers are (if more than one); Loyal players see only their own role.

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
     after), then every living player takes a turn (see below); the acting
     Deceiver privately chooses one living, non-Deceiver target via Murder
     Selection. A Shield card the target is holding deploys automatically
     and is spent the instant it blocks a Murder — the target never has to
     act on it; a Deceiver's Choice card played by the Deceivers overrides a
     Shield in effect (and still spends the Shield). A "Gather Everyone"
     checkpoint, then an Elimination Reveal shows the outcome, then the
     round ends.
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

### The Final Circle (End Game)

Modeled directly on The Traitors UK's endgame structure, added as a
follow-up round specifically because the original "instant Loyal win the
moment the last Deceiver is eliminated" design gave the Loyal team a
no-tension confirmation they'd never get in real life — they can never
actually know they've caught every Deceiver, only suspect it.

Once living players drop to **4** (`CONFIG.finalCircleThreshold`), ordinary
rounds stop for good — no more Fate cards, no more Draws, no more Murders —
and every remaining round takes this shape instead:

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
5. A Deceiver-majority win (step 3 above) can still fire mid–Final Circle
   at any point, same as ever — e.g. a wrongly-banished Loyal could hand a
   2-Deceiver, 1-Loyal circle an instant win without even reaching another
   ballot.

**How the Final Circle actually resolves a winner is a different, simpler
rule than the ordinary-round majority check**: once the Final Circle
concludes on its own terms (unanimous End Game, or down to two), *any*
surviving Deceiver wins outright — even a single Deceiver sitting alongside
two or three Loyal, a case the majority check (`livingDeceivers >=
livingLoyal`) would never have been able to resolve on its own. This
mirrors the real show's final-two table exactly:

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

18 named cues cover every meaningful moment: a mysterious rising interval
for a private role reveal (and its mirror-image fall for hiding it again), a
light tick for drawing a card, a bright ascending coin arpeggio when Gold
hits the pot, a low swelling drone for Night falling, a recurring ceremonial
bell (`gather`) reused for "Seal the Roles," "Next Game," and — now every
time, not just when its button is tapped — the moment the Elimination
Reveal's "Gather Everyone" screen itself first appears (at the end of the
Murder and Vote queues, as well as a Quiet Night), distinct outcome stings
for a Quiet Night / a Shield block / a Murder / a tied vote / a Banishment,
a bright single rising tone (`roundBegin`) marking a new round's start
distinctly from the previous round's closing sound, and a dark minor chord
vs. a bright major chord for the two endings.

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
built-in background-music toggle off.

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
