# Batch 6 Re-check — PR #6's narration suite

Confirms the Critical audio-overlap fix (item #4) and the three-level
audio control (item #3) didn't break PR #6's own narration suite.

`tests/narration/harness.cjs` needed two fixes along the way, both about
test setup rather than the game itself:

1. The suite's "sound on" step was a single `#soundBtn` tap, written when
   sound defaulted off. Sound now defaults on (Partial), so that same tap
   could turn it *off* depending on the current state — driving the
   desired state explicitly instead.
2. One test called `Sound.narrate(['intro2'])` directly (bypassing the
   UI) without selecting Full first, so Partial's filter correctly
   dropped it — the test now selects Full explicitly, matching what a
   real Settings choice would do.

With both fixed: **34/34 passed**, including the matched-pair and
recruit-vs-ordinary-murder audio equivalence checks (Deceiver's Choice
hand-outs didn't happen to be drawn in these particular runs, but the
Recruit-or-Die card logic itself is covered separately — see
`../batch6-recruit-cards-recheck`).
