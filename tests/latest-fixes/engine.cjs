const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine, swapFixture } = require('./fixture.cjs');

test('the approached Loyal spends their own card; the recruiter becomes Pariah', () => {
  const { run } = swapFixture();
  assert.equal(run('state.players[0].role'), 'pariah');
  assert.equal(run('state.players[1].role'), 'deceiver');
  assert.equal(run('state.players[0].alive && state.players[1].alive'), true);
  assert.equal(run("state.fortuneDiscard.filter(c => c === 'deceivers-choice').length"), 1);
  assert.equal(run("state.players[1].hand.includes('deceivers-choice')"), false);
  assert.equal(run('state.nightResult.quiet'), true);
  assert.equal(run('state.phase'), 'elimination');
  assert.equal(run('resolveRecruitmentSwap(state)'), false, 'a repeated stale resolution cannot convert the Pariah again');
});

test('Pariah has no murder or recruitment power, but is a valid murder target', () => {
  const { run } = swapFixture();
  run('beginMurderPhase(state)');
  assert.equal(run('murderStepFor(state, state.players[0].id)'), null);
  assert.equal(run('murderStepFor(state, state.players[1].id)'), 'single');
  assert.equal(run('eligibleMurderTargets(state).some(p => p.id === state.players[0].id)'), true);
  assert.equal(run('eligibleRecruitTargets(state).some(p => p.id === state.players[0].id)'), false);
  assert.equal(run('shouldTriggerRecruitment(state)'), false);
  run("state.currentFateCard = 'murder'; resolveMurder(state, state.players[0].id, false)");
  assert.equal(run('state.players[0].alive'), false);
});

test('Pariah retains a normal banishment vote and can be banished', () => {
  const { run } = swapFixture();
  run('beginVotePhase(state, false)');
  assert.equal(run('state.pendingQueue.includes(state.players[0].id)'), true);
  run('castVote(state, state.players[0].id, state.players[1].id, false)');
  assert.equal(run('state.voteResult.tally[state.players[1].id]'), 1);
  run('state.voteResult.tally = { [state.players[0].id]: 4 }; resolveBanishment(state)');
  assert.equal(run('state.players[0].alive'), false);
});

for (const winner of ['loyal', 'deceiver']) {
  test(`${winner} winners: £100-style pot pays 12.5 to Pariah and 87.5 to the winner`, () => {
    const { run } = swapFixture();
    run(`state.players.forEach((p, i) => { p.alive = i < 2; }); state.players[1].role = '${winner}'; state.prizePot = 100; finalizeGame(state, checkFinalCircleWinner(state))`);
    assert.equal(run('state.winner'), winner);
    assert.equal(run('state.gamePayout.pariahShare'), 12.5);
    assert.equal(run('state.gamePayout.share'), 87.5);
    assert.equal(run('state.seriesScores.Mark'), 12.5);
    assert.equal(run('state.seriesScores.Lila'), 87.5);
    assert.equal(run('state.prizePot'), 0);
  });
}

test('Loyal victory does not require eliminating a surviving Pariah', () => {
  const { run } = swapFixture();
  run("state.players.forEach((p, i) => { if (i !== 0) p.role = 'loyal'; }); state.finalCircleActive = true;");
  assert.equal(run('checkFinalCircleWinner(state)'), 'loyal');
  run("beginFinalCircleDecision(state); livingPlayers(state).forEach(p => recordFinalCircleDecision(state, p.id, 'end')); resolveFinalCircleDecision(state)");
  assert.equal(run('state.phase'), 'results');
  assert.equal(run('state.winner'), 'loyal');
});

test('an eliminated Pariah receives nothing and ordinary equal splits stay unchanged', () => {
  const { run } = swapFixture();
  run("state.players.forEach((p, i) => { p.alive = i === 2 || i === 4; }); state.prizePot = 101; finalizeGame(state, 'loyal')");
  assert.equal(run('state.gamePayout.share'), 50);
  assert.equal(run('state.seriesScores.Mark'), 0);
  assert.equal(run('state.gamePayout.recipients.length'), 2);
});

test('Pariah payout conserves every hundredth of gold across pots and winner counts', () => {
  const { run } = loadEngine();
  assert.equal(run(`(() => {
    for (let count = 1; count <= 8; count++) for (let pot = 0; pot <= 301; pot++) {
      const s = createInitialState();
      s.players = Array.from({length: count + 1}, (_, i) => ({...createPlayer('p'+i, 'P'+i), role: i === count ? 'pariah' : 'loyal'}));
      s.prizePot = pot;
      const paid = payoutPrizePot(s, 'loyal');
      if (Math.round(paid.allocations.reduce((sum, p) => sum + p.amount, 0) * 100) !== pot * 100) return false;
      if (paid.pariahShare > pot / (count + 1) / 4 + 1e-9) return false;
    }
    return true;
  })()`), true);
});

test('the next series game clears Pariah roles and prior payout, and rotates only the Instigator', () => {
  const { run } = swapFixture();
  run("state.gamePayout = {pot:100}; var previousInstigator = state.lastInstigatorIndex; startNextGameInSeries(state)");
  assert.equal(run("state.players.some(p => p.role === 'pariah')"), false);
  assert.equal(run('state.gamePayout'), null);
  assert.equal(run('state.lastInstigatorIndex !== previousInstigator'), true);
  assert.equal(run('state.recruitmentAttempted'), false);
});

test('Shield still saves a refused recruit and Deceiver’s Choice still counters a Shield at Night', () => {
  const { run } = swapFixture();
  run("state.players[2].hand = ['shield']; state.recruitment.targetId = state.players[2].id; resolveRecruitmentRefusal(state)");
  assert.equal(run('state.players[2].alive'), true);
  assert.equal(run('state.nightResult.protected'), true);
  run("beginMurderPhase(state); state.players[1].hand = ['deceivers-choice']; state.players[2].hand = ['shield']; state.murderDecision.deciderId = state.players[1].id; resolveMurder(state, state.players[2].id, true)");
  assert.equal(run('state.players[2].alive'), false);
  assert.equal(run('state.players[1].hand.length'), 0);
});
