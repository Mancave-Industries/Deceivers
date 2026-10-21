# Batch 6 — Recruit-or-Die defensive cards (item #7)

Shield and Deceiver's Choice now also apply during Recruit or Die, on
top of their existing Murder-phase effects:

- **Shield**, held by the approached player: if they refuse, it's spent
  and they survive instead of dying. Resolves with the exact same shape
  Murder's own Shield-save uses (`protected: true`), so the public
  Elimination Reveal can't tell a Recruit-refusal save from a Murder
  save.
- **Deceiver's Choice**, held by the recruiter: played at the 'offer'
  step (same moment Murder offers its own Deceiver's Choice checkbox),
  it forces a straight swap regardless of the target's actual answer —
  the recipient becomes a Deceiver, the recruiter becomes Loyal. The
  target still sees the ordinary Join/Refuse screen and still taps one
  (secrecy: the pass must look identical whether or not the card was
  played). Resolves with the same shape as an ordinary successful join
  (`quiet: true`).

Both cards are consumed from hand (moved to the discard) the moment they
take effect, same as everywhere else in the game.

`run.log`: 18 direct engine-level checks (`beginRecruitment` /
`recordRecruitTarget` / `advanceRecruitQueue` / `advanceRecruitResponseQueue`
driven directly, bypassing the UI) covering: Shield saving a refusal,
the card being consumed and discarded, the no-Shield case still killing
(regression), Deceiver's Choice overriding both a 'join' and a 'refuse'
answer, the swap's role changes and discard, and a spot-check that
Murder's own existing Shield/Choice helper is untouched. All pass.

Not re-verified here: a full UI matched-pair run with these specific
cards drawn (PR #6's own matched-pair suite — see
`../batch6-recorded-narration-recheck` — already confirms the underlying
queue shape is unchanged by this work, and no new taps or screens were
added for either card).
