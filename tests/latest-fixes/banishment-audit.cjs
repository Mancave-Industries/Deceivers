// Deterministic simulations of the current rules; no probabilities are changed.
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine } = require('./fixture.cjs');
const { run } = loadEngine(20261023);
const results = run(`(() => {
  const rows = [];
  for (let count = 3; count <= 8; count++) {
    const row = { players: count, games: 2000, completed: 0, fateDraws: 0, ordinaryVotes: 0, finalVotes: 0, tiedVotes: 0, rounds: 0 };
    for (let game = 0; game < row.games; game++) {
      const s = createInitialState();
      startNewSeries(s, Array.from({length:count}, (_, i) => 'P'+i), 1);
      s.pendingQueue = []; s.phase = PHASES.MAIN;
      for (let step = 0; step < 500 && s.phase !== PHASES.RESULTS; step++) {
        startRound(s);
        if (s.finalCircleActive) {
          beginFinalCircleDecision(s);
          if (s.phase === PHASES.RESULTS) break;
          livingPlayers(s).forEach(p => recordFinalCircleDecision(s, p.id, botChooseFinalCircleDecision()));
          resolveFinalCircleDecision(s);
          if (s.phase === PHASES.RESULTS) break;
          row.finalVotes++;
          beginVotePhase(s, true);
        } else if (shouldTriggerRecruitment(s)) {
          beginRecruitment(s);
          recordRecruitTarget(s, botPickRecruitTarget(s));
          const recruit = findPlayer(s, s.recruitment.targetId);
          if (recruit && recruit.hand.includes('deceivers-choice') && Math.random() < .4) resolveRecruitmentSwap(s);
          else if (Math.random() < .5) resolveRecruitmentJoin(s);
          else resolveRecruitmentRefusal(s);
          advanceRound(s); continue;
        } else {
          row.fateDraws++;
          beginDrawPhase(s);
          while (s.pendingQueue.length) { drawFortuneCard(s, currentQueuePlayer(s).id); finishDrawForCurrent(s); }
          routeAfterDraw(s);
          if (s.phase === PHASES.NIGHT) {
            beginMurderPhase(s);
            while (s.phase === PHASES.MURDER) {
              const step = currentMurderStep(s);
              if (step === 'single') recordMurderTarget(s, botPickMurderTarget(s), botShouldUseDeceiversChoice(s));
              else if (step === 'shortlist') recordMurderShortlist(s, botPickMurderShortlist(s));
              else if (step === 'narrow' || step === 'narrow-final') recordMurderTarget(s, botPickFromMurderShortlist(s), step === 'narrow-final' && botShouldUseDeceiversChoice(s));
              else if (step === 'veto') { const decision = botChooseMurderVeto(); recordMurderVeto(s, decision, decision === 'kill' && botShouldUseDeceiversChoice(s)); }
              advanceMurderQueue(s);
            }
            advanceRound(s); continue;
          }
          if (s.phase !== PHASES.DISCUSS) { advanceRound(s); continue; }
          row.ordinaryVotes++;
          beginVotePhase(s, false);
        }
        while (s.pendingQueue.length) {
          const voter = currentQueuePlayer(s);
          castVote(s, voter.id, botPickVoteTarget(s, voter.id), botShouldUseDagger(s, voter.id));
        }
        resolveBanishment(s);
        if (s.voteResult.tie) row.tiedVotes++;
        if (s.eliminationContext === 'final') beginFinalCircleDecision(s);
        else advanceRound(s);
      }
      if (s.phase === PHASES.RESULTS) row.completed++;
      row.rounds += s.round;
    }
    rows.push(row);
  }
  return rows;
})()`);
const out = path.resolve('test-evidence/latest-fixes');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'banishment-audit.json'), JSON.stringify(results, null, 2));
console.log('| Players | Completed | Ordinary Banishment / Fate draws | Ordinary votes/game | Final votes/game | Tied votes |');
console.log('|---|---|---|---|---|---|');
for (const r of results) console.log(`| ${r.players} | ${r.completed}/${r.games} | ${(100*r.ordinaryVotes/r.fateDraws).toFixed(1)}% | ${(r.ordinaryVotes/r.games).toFixed(2)} | ${(r.finalVotes/r.games).toFixed(2)} | ${(100*r.tiedVotes/(r.ordinaryVotes+r.finalVotes)).toFixed(1)}% |`);
if (results.some((r) => r.completed !== r.games)) process.exitCode = 1;
