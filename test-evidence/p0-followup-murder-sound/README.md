# Murder-phase sound leak — follow-up fix evidence

Alfred's review on issue #2 ([comment](https://github.com/Mancave-Industries/Deceivers/issues/2#issuecomment-6252304316)) identified that selecting a murder target played an extra audible `tap` that a "Nothing To Do" turn didn't, letting a listener who can't see the screen count sounds to infer the Deceiver's seat.

Fix: removed the `Sound.play('tap')` call from `select-murder-target`, `select-murder-shortlist-target`, and `select-murder-narrow-target` in `js/main.js`. Every Murder-queue turn now plays exactly two sounds (the opening tap, the closing confirm) regardless of whether it's a real decision or "Nothing To Do" — matching the veto step and every other queue phase, which already had no such asymmetry.

## Evidence

- `observable_equivalence_report.json` — matched-pair comparison, same config, only which seat(s) hold the Deceiver role(s) differ:
  - Pair 1 (3p, single decider): sound/screen sequence for the forced Murder round is **byte-identical** regardless of seat.
  - Pair 2 (7p, two Deceivers, shortlist → narrow-final flow — the multi-tap case): the full-game shapes diverge after round 1 only because each run independently drew a different fate card in round 2+ (unrelated random variance, not a leak — see the pair's `note` field). The forced round-1 Murder segment itself (`forcedMurderRoundShapeA`/`B`) is **byte-identical**, 32 events each.
- `run_all_v2.log` — full re-run of the 10-game required test gate (3–8 seats, human/bot mixes, both knowledge modes, recruit accept/refuse, murder, banishment, series) against the fix: **10/10 reached Results, 0 errors**. Leak-scan hits are the same two pre-existing false positives as every prior run (generic card-rules text on Hand, generic Night flavor text) — no new patterns.

## Not touched by this fix

- The bot path required no change: `resolveComputerTurn`'s Murder case makes zero per-decision `Sound.play` calls (only role-blind collective phase-transition cues like `nightFalls`/`gather`), confirmed by reading `js/main.js:216-315` in full — bots were never vulnerable to this specific defect.
- Recruit-or-Die's own privacy fix (full-table uniform queue, from the original P0.1 work) is untouched and still passes.
