# Recorded narration — test evidence

Produced by `tests/narration/harness.cjs` (local headless Chromium, local static server, no network or paid services). **32/32 checks passed** (`run.log`, `results.json`).

| File | What it is |
|---|---|
| `run.log` | Console output of the full run |
| `results.json` | Every check with pass/fail and detail |
| `gate_games.json` | Per game: phases, every narration requested (pool, chosen clips, phase), clip starts/failures |
| `matched_pairs.json` | Full audio event sequences for each matched pair, and the recruit-vs-ordinary round comparison |

## Important limitation
Open-source Chromium has no AAC decoder (Safari and Chrome do), so the game runs here were served WAV decodes of the same 115 clips. The real `.m4a` files were exercised in the `m4a` failure-mode run, where decoding fails in Chromium — proving the game degrades silently. **AAC playback itself, the iPhone silent switch, lock-screen interruption and memory over a long series still need checking on a real iPhone.**

## Recruit round vs ordinary murder round (what still differs)
After the fixes, both have the same number of hand-off lines (12 at 6 living), the same Night Falls cue and line, and identical per-turn sounds within each pass. Remaining differences come from the round's existing structure, not narration: an ordinary round's Draw pass plays a card sound per turn (6) and the Night screen's "Proceed" tap (1) — the recruit pass has neither, and its turns are visually different too. Closing that would mean changing the Recruit-or-Die flow itself.
