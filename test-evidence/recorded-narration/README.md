# Recorded narration — test evidence

Produced by `tests/narration/harness.cjs` (local headless Chromium, local static server, no network or paid services). **34/34 checks passed** (`run.log`, `results.json`).

| File | What it is |
|---|---|
| `run.log` | Console output of the full run |
| `results.json` | Every check with pass/fail and detail |
| `gate_games.json` | Per game: phases, every narration requested (pool, chosen clips, phase), clip starts/failures |
| `matched_pairs.json` | Full audio event sequences for each matched pair, and the recruit-vs-ordinary round comparisons (with per-gap timings for the all-computer run) |

## Recruit round vs ordinary murder round
Same table and seeds; compared from the "Begin Draw Phase" tap through the Gather line. With human seats, ordinary / recruit-refuse / recruit-accept give identical sequences (46 events: every sound, voice line and take). With all computer seats, the sequences are identical and every gap between sounds matches within 42 ms (round length 9175 / 9121 / 9120 ms).

**Still visible, not audio:** after a recruit round the public board shows no new cards and an unchanged Prize Pot (no one drew — that's the rule), and the recruiter's turn has one extra silent tap.

## Important limitation
Open-source Chromium has no AAC decoder (Safari and Chrome do), so the game runs here were served WAV decodes of the same 115 clips. The real `.m4a` files were exercised in the `m4a` failure-mode run, where decoding fails in Chromium — proving the game degrades silently. **AAC playback itself, the iPhone silent switch, lock-screen interruption and memory over a long series still need checking on a real iPhone.**
