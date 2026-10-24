# Batch 6 — Instigator anti-repeat (item #5)

`setupNewGame` now excludes the previous game's Deceiver seat(s) from the
draw when picking this game's Deceiver(s), as long as enough other seats
exist to still fill every slot without them — selection stays otherwise
random, and the constraint is dropped rather than forced if it can't be
satisfied (relevant only when deceiverCount is large relative to the
table, which doesn't happen at any supported player count: see the
`expectAvoidable` check per player count in `run.log`).

`run.log` drives `startNewSeries` + `startNextGameInSeries` directly
(bypassing full gameplay, since only the role-assignment step is under
test) for 500 consecutive game transitions at every supported player
count (3-8). Zero consecutive-game repeats found anywhere. A separate
2000-game frequency check (not saved here, see conversation) confirmed
the fix doesn't skew which seat gets picked overall — roughly uniform
across all seats, just never the same seat twice in a row.
