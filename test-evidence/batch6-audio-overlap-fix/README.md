# Batch 6 — Critical audio-overlap fix (item #4)

Winner-announcement narration was able to keep playing into the next
game's Draw phase, because `render()`'s interstitial branch returned
before ever reaching the narration-cancellation code. Fixed by cutting
narration at the top of `render()` whenever `state.phase` has changed
since the last render — before the interstitial branch, not after.

`run.log` is a 2-game bot-heavy series: logs every narration clip's real
start/end time (from `clip-start`/`clip-end` events, not a clip's nominal
duration) and checks none of game 1's results-screen narration is still
genuinely sounding more than 400ms after game 2's Reveal phase begins.

Verified the check itself is meaningful by first reverting the fix and
re-running: it correctly failed (a results-phase clip's true end landed
~2.7s after the next game's Reveal began). Restored, it passes.
