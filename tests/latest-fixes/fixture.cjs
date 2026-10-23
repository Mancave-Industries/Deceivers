const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadEngine(seed = 42) {
  const math = Object.create(Math);
  let a = seed;
  math.random = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const context = vm.createContext({ Math: math, Date, console });
  const root = path.resolve(__dirname, '../..');
  const source = ['data.js', 'state.js', 'engine.js'].map((f) => fs.readFileSync(path.join(root, 'js', f), 'utf8')).join('\n');
  vm.runInContext(source, context);
  const run = (code) => vm.runInContext(code, context);
  return { context, run };
}

function swapFixture() {
  const fixture = loadEngine();
  fixture.run(`
    var state = createInitialState();
    startNewSeries(state, ['Mark', 'Lila', 'TK', 'max', 'Libby', 'Simon', 'Warwick'], 3);
    state.players.forEach((p, i) => { p.role = i === 0 || i === 3 ? 'deceiver' : 'loyal'; });
    state.players[3].alive = false;
    state.players[1].hand = ['deceivers-choice'];
    state.initialDeceiverCount = 2;
    beginRecruitment(state);
    recordRecruitTarget(state, state.players[1].id);
    while (state.phase === PHASES.RECRUIT) advanceRecruitQueue(state);
    state.pendingQueue = [state.players[1].id];
    recordRecruitResponse(state, 'swap');
    advanceRecruitResponseQueue(state);
  `);
  return fixture;
}

module.exports = { loadEngine, swapFixture };
