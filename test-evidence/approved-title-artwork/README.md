# Approved title artwork — test report

Implements #11 / draft PR #12. Branch `feature/approved-title-artwork`.

## What changed

- **New asset**: `assets/brand/deceivers-title-poster-approved.jpg` — the
  exact approved JPEG (864×1536), byte-identical to the supplied file.
  The previous poster (`deceivers-title-poster.jpg`) is left in place,
  unused by the title screen but not deleted, in case of rollback.
- **`js/ui.js`**: `UI.renderTitle` rewritten. The approved artwork bakes
  its own menu/sound/help icons and NEW GAME / HOW TO PLAY bars into the
  image, so this now renders the image in an aspect-ratio-locked frame
  with five invisible, accessibly-labelled hotspot buttons positioned
  over those printed graphics (percentages of the source image) instead
  of a second, separately-drawn set of controls. `UI.updateHeader` now
  also toggles a `.app-header--bare` class on the real global header
  while Title is active.
- **`js/main.js`**: two new actions, `title-open-settings` and
  `title-toggle-sound`, which forward to the real `menuBtn`/`soundBtn`
  click handlers rather than duplicating their logic (`new-game`,
  `continue-game` and `open-help` already existed and are reused as-is).
- **`css/style.css`**: `.app-header--bare` collapses the real header to
  just the true hardware safe-area inset (`env(safe-area-inset-top)`,
  not the app's generic `max(10vh, …)` design buffer other screens use)
  and hides its icons/wordmark while Title is active, so nothing is ever
  drawn twice and no oversized dead gap appears above the full-bleed art
  on devices with no actual notch. New `.title-art-frame` / `.title-art-img`
  / `.title-hotspot` / `.title-continue-wrap` rules.

Continue Game has no printed graphic in the approved art (it predates
the save/continue feature), so when a saved game exists it gets one
real, clearly-labelled button of its own in the space below the art —
per the brief's explicit instruction to solve ungraphicked actions with
a single coherent control rather than hide them or mislabel a printed
button.

## Test report

Automated, Playwright-driven, against the real page (no DOM-only
assertions) — see `/tests` is not where this lives; this was run
ad hoc given the scope of this change. 14/14 checks passed:

| # | Check | Result |
|---|---|---|
| 1 | iPhone 11 Pro (375×812): no horizontal scroll | PASS |
| 2 | Real header visually collapses on Title | PASS |
| 3 | Exactly 5 hotspots render (fresh game, no saved state) | PASS |
| 4 | Every hotspot ≥ ~44 CSS px touch target | PASS (44–53px) |
| 5 | "HOW TO PLAY" hotspot opens the Help modal | PASS |
| 6 | Settings (hamburger) hotspot opens the Settings modal | PASS |
| 7 | Sound hotspot actually toggles the sound setting | PASS |
| 8 | "NEW GAME" hotspot navigates to Setup | PASS |
| 9 | Real header is restored (not bare) on Setup | PASS |
| 10 | Setup → Start Game still reaches Reveal normally | PASS |
| 11 | Header icons are real/interactive again on Reveal | PASS |
| 12 | With a saved game: still exactly 5 art hotspots (no duplicate New Game) | PASS |
| 13 | A real, separately-labelled Continue Game control appears | PASS |
| 14 | Short viewport (390×600) stress test: still no horizontal scroll | PASS |
| — | Zero console/page errors across every check | PASS |

Caveats:
- The 390×600 short-viewport case lets the "HOW TO PLAY" bar scroll
  below the fold rather than shrinking the art further — existing
  `.screen { overflow-y: auto }` makes it reachable by scroll. No real
  iPhone portrait viewport is this short, so this is a deliberate,
  acceptable degradation rather than a fix target.
- Tested headless, without a true OS-level notch/Dynamic Island to
  render against — `env(safe-area-inset-top)` correctly evaluates to 0
  in that environment, so the header correctly collapses to zero height
  here; on a real notched device it reserves exactly that hardware inset
  instead, pushing the art's own printed icons below the notch.

## Screenshots

- `BEFORE_title.png` — previous poster + separately-rendered New
  Game / How To Play buttons, old header icon row, captured from the
  project's live Batch 7 branch for an accurate baseline.
- `AFTER_title_fresh_375x812.png` — new art, no saved game, iPhone 11
  Pro viewport.
- `AFTER_title_saved_390x844.png` — new art with a saved game present,
  showing the real Continue Game control.
- `AFTER_title_short_390x600.png` — short-viewport stress test.

No merge, deploy, or paid Claude runs taken as part of this work, per #11.
