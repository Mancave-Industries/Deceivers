# Handoff Screen Artwork — Test Evidence

Branch: `feature/handoff-screen-artwork`. Development/testing only, per the
approval — not merged, not deployed.

## What changed

`passPrompt()` (`js/ui.js`) now renders each pass-the-phone screen over a
background artwork layer plus a dark scrim, driven by a new `artworkKey`
param and a `HANDOFF_ARTWORK` lookup table:

| Phase | Artwork key | File |
|---|---|---|
| Reveal | `reveal` | `reveal.jpg` |
| Draw | `draw` | `draw.jpg` |
| Murder | `murder` | `night-falls.jpg` |
| Recruit-or-Die | `recruit` | `night-falls.jpg` (same key as Murder) |
| Recruit response | `recruitResponse` | `night-falls.jpg` (same key as Murder) |
| Banishment / Final Banishment vote | `vote` | `banishment.jpg` |
| Final Circle Decision | `finalCircleDecision` | `night-skyline.png` |

Murder, Recruit-or-Die and the Recruit response step all point at one
shared JS constant (`MURDER_RECRUIT_ARTWORK`) rather than three keys
independently set to the same path, so the artwork can't drift apart under
a future edit. `UI.renderComputerTurn` (the no-phone-needed "Computer
Seat" decoy screen) and `UI.renderHand` (the post-draw content screen) are
unchanged — out of scope, since the task was specifically the pass-the-
phone handoff screens.

New CSS: `.handoff-screen` / `.handoff-art` in `css/style.css`, with a
flat radial scrim that never drops below 0.88 opacity anywhere behind the
text (math in the CSS comment), and a `prefers-reduced-motion`-gated slow
background scale-drift (`handoffDrift`, 26s, 1 → 1.035 scale) — no video,
per the approval.

## How this was tested

`observable_equivalence_report.json` is a 10-game regression run (3p
through 8p, including the two-Deceiver shortlist/veto flow) played via
real UI taps in headless Chromium — the harness that produced it lives
outside this repo (in the session's scratchpad, not committed). Each run
is logged with:

- `finished`: did the game reach the Results screen without hanging.
- `pageErrors`: any uncaught JS exception during the run (none, across
  all 10 games).
- Every handoff screen's rendered `background-image` URL, tagged by
  phase.

Result: **10/10 games finished, 0 page errors.** Aggregated across all 10
games, `murderUrlsDistinct`, `recruitUrlsDistinct` and
`recruitResponseUrlsDistinct` are each a single-element array containing
the exact same `night-falls.jpg` URL — `allThreeIdentical: true`. No game
ever produced a different Murder vs. Recruit artwork URL.

`screenshots/handoff_*.png` are real in-game captures of each of the 7
pass-the-phone screen types (mobile viewport, 420×820), taken after the
existing `.fade-in` transition settles.

## Not covered by this evidence

- Audio/timing equivalence was not re-tested here — unchanged from the
  already-merged P0 work (`test-evidence/p0-fixes/`,
  `test-evidence/p0-followup-murder-sound/`); this change only touches
  rendering, not `js/main.js` or `js/sound.js`.
- No real-device/manual accessibility pass (screen reader, actual phone
  hardware) was done; the contrast figures are computed, not measured
  with a device colorimeter.
