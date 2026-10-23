# Latest game fixes

This release candidate combines Batch 7 (PR #8) and the approved title artwork (PR #12), plus the gameplay/privacy fixes in issue #9 and the later Pariah rule. It is prepared on `feature/latest-game-fixes`; the original PR branches and `main` are preserved.

## Changes

- The approved 864×1536 title image has one set of working controls, with accessible touch targets; Continue Game remains available for saved games.
- Private views and safe handoffs say **[Name]’s Eyes Only**, with escaped names. Role information is shown only after the player's private tap.
- In Known mode, Deceivers see current living teammates on their private views; the list refreshes after deaths, recruitment and a Deceiver's Choice change. Loyal, Pariah, Hidden-mode and handoff screens never receive this team list.
- Discussion and voting show a list of living players without role labels. Eliminated players cannot appear as vote targets.
- A displaced recruiter becomes **Pariah**, not Loyal. They lose Deceiver decision rights, retain banishment and Final Circle ballots, remain eligible for murder/banishment, and do not block a Loyal win. Only their own private view announces the change. Public round outcomes and narration follow the existing uniform queues; final results reveal all roles.
- A surviving Pariah receives 25% of the equal share calculated with the surviving winners. The other 75% of that nominal share is redistributed to the winners. Example: pot 100, one winner plus Pariah → winner 87.5, Pariah 12.5. Eliminated players receive nothing. Hundredths of gold are conserved; any one-hundredth rounding remainder goes to winning seats in order. Games without a Pariah retain their existing payout rules.
- Final Two has a skippable ceremony naming the survivors, revealing their roles, then naming the winners. Replay does not run the engine or pay the pot again. Narration waits until the ceremony finishes; old callbacks and timers are cancelled. Reduced-motion settings are respected.
- Audio Off/Partial/Full settings survive New Game, Play Again and Reset. Partial excludes only handoff speech; opening narration remains included.
- New series games clear the prior game's payout and Pariah state while preserving series scores and the Instigator rotation fix.
- All local script/style URLs share a new cache version so phones fetch the changed game code after release.

## Validation

```sh
npm run test:rules
npm run test:ui
npm run test:narration -- test-evidence/ci-narration-check
npm run audit:banishment
```

`test:rules` exercises the actual engine: role transfer/card consumption, a repeated swap guard, murder/voting permissions, both winning sides, eliminated Pariah, pot conservation over 2,416 payout cases, Shield behavior and consecutive-game resets.

`test:ui` checks 375×812 (iPhone 11 Pro), 390×844 and landscape 812×375 viewports. It clicks the approved menu controls, starts a real game, checks private/public information, live voter lists and escaped names, and skips/replays the Final Two without changing scores. It also checks audio settings across new games. Screenshots and JSON results go to `test-evidence/latest-fixes/` on the test runner. These are automated browser viewport checks, not a physical iPhone Safari session.

The full canonical narration suite retains its existing audio, failure-mode, full-game/series and matched-pair checks. Its harness now uses the title's real visible sound control and handles the new skippable Final Two overlay.

## Banishment frequency audit

12,000 seeded games (2,000 at each size from 3–8) completed with the current deck and random bot choices. In 3–4 player games the first Fate card cannot be Banishment and Final Circle starts after that first ordinary round, so all banishments come from Final Circle decisions. In 5–8 player games, ordinary Banishment appears in roughly 14–29% of drawn Fate events, approaching the deck's 4-in-12 proportion as games get longer. Tied votes also reduce eliminations.

No deck counts, draw probabilities, starting-round restriction or Final Circle thresholds were changed. Options for a later design decision are: keep the current fast Final Circle for small games; permit an initial Banishment; or postpone Final Circle entry. Each changes game balance and is outside this fix.

The Premium/payment/login prototype from issue #10 is separate product work and is not activated by this release. No live payment processing, account collection or paid Claude run is introduced.
