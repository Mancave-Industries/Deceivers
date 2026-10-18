# P0 fixes — test evidence (issue #2)

Real in-game captures from the `fix/p0-secrecy-contrast-handoffs` branch, not mockups. All taken at 390×844 (iPhone-sized viewport), 2x device scale.

## P0.4 — contrast

- `BEFORE_title_contrast.png` — unpatched `main`: "NEW GAME" renders pale cream text on gold (measured 1.39:1).
- `AFTER_title_contrast.png` — same screen after the one-line fix: black text on gold.

## P0.1 — Recruit-or-Die secrecy

- `AFTER_recruit_decision.png` — the recruiting Deceiver's real decision screen, now carrying the new PRIVATE badge, reached only after cycling through every living player's turn in seat order (see `run_all.log` / `observable_equivalence_report.json`).
- `game_G6_recruit_accept_results.png`, `game_G7_recruit_refuse_results.png` — automated playthroughs confirming both outcomes still work end to end.

## PRIVATE / PUBLIC hand-off labeling

- `AFTER_private_badge_passprompt.png` — the standardized hand-off screen (Reveal shown here), lock badge + dynamic name + "look away."
- `AFTER_private_badge_content.png` — the private content screen behind it, gated by the tap.
- `AFTER_public_badge.png` — the Main hub, group badge.

## Test gate

- `run_all.log` — all 10 required playthroughs (3–8 seats, human/bot mixes, both knowledge modes, recruit accept/refuse, murder, banishment, series) against the fixed code: 10/10 reached Results, 0 errors.
- `observable_equivalence_report.json` — matched Loyal/Deceiver comparison for the Murder phase (same config, only which seat holds the secret role differs). See the Job Done Report on issue #1 for the full reading of this file, including the one disclosed residual (a pre-existing, out-of-scope asymmetry in Murder's own tap pattern).
- `game_G1_3p_murder_results.png`, `game_G10_series_results.png` — representative Results screens from the full batch.

Full accounting (leak-scan false-positive review, per-game breakdown, privacy methodology, what's still untested) is in the Job Done Report posted to issue #1.
