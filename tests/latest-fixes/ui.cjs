const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, ensureWavs } = require('../narration/harness.cjs');

const out = path.resolve('test-evidence/latest-fixes');
const checks = [];
async function check(name, fn) {
  try { await fn(); checks.push({ name, pass: true }); console.log('PASS ' + name); }
  catch (error) { checks.push({ name, pass: false, error: error.message }); console.error('FAIL ' + name + ': ' + error.message); }
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  ensureWavs();
  const server = await startServer('wav');
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    for (const viewport of [{ width: 375, height: 620 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 812, height: 375 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const tag = `${viewport.width}x${viewport.height}`;

      await check(`${tag}: approved image loads, one New Game, all touch targets >=44px`, async () => {
        assert.equal(await page.locator('.title-art-img').evaluate((img) => img.complete && img.naturalWidth === 864), true);
        assert.equal(await page.locator('[data-action="new-game"]:visible').count(), 1);
        assert.equal(await page.locator('.app-header--bare').count(), 1);
        const targets = await page.locator('.title-hotspot').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).every((r) => r.width >= 44 && r.height >= 44));
        assert.equal(targets, true);
      });
      await check(`${tag}: title Settings, sound, and both help controls work`, async () => {
        await page.click('[data-action="title-open-settings"]');
        assert.equal(await page.locator('#modalTitle').textContent(), 'Settings');
        await page.click('[data-close-modal]');
        const before = await page.evaluate(() => state.settings.audio);
        await page.click('[data-action="title-toggle-sound"]');
        assert.equal(await page.evaluate(() => state.settings.audio), 'off');
        await page.click('[data-action="title-toggle-sound"]');
        assert.equal(await page.evaluate(() => state.settings.audio), before);
        for (let i = 0; i < 2; i++) {
          await page.locator('[data-action="open-help"]').nth(i).click();
          assert.equal(await page.locator('#modalTitle').textContent(), 'How To Play');
          await page.click('[data-close-modal]');
        }
      });
      await page.evaluate(() => UI.hideModal());
      await page.screenshot({ path: path.join(out, `title-${tag}.png`), fullPage: true });
      await check(`${tag}: New Game starts a real game and the header returns`, async () => {
        await page.click('[data-action="new-game"]');
        assert.equal(await page.locator('#screen-title').isVisible(), false, 'title artwork must hide after New Game');
        for (let i = 0; i < 3; i++) await page.locator('.name-input').nth(i).fill(['Avery', 'Blake', 'Casey'][i]);
        await page.click('[data-action="start-game"]');
        await page.click('#interstitialOverlay');
        assert.equal(await page.evaluate(() => state.phase), 'reveal');
        assert.equal(await page.locator('.app-header--bare').count(), 0);
        assert.equal(await page.locator('.screen.active .privacy-badge span').textContent(), 'Avery’s Eyes Only');
        const revealButton = page.locator('[data-action="tap-reveal"]');
        await revealButton.scrollIntoViewIfNeeded();
        const reachable = await revealButton.evaluate((button) => {
          const box = button.getBoundingClientRect();
          if (box.top < 0 || box.bottom > innerHeight) return false;
          for (let parent = button.parentElement; parent; parent = parent.parentElement) {
            if (/hidden|auto|scroll|clip/.test(getComputedStyle(parent).overflowY)) {
              const clip = parent.getBoundingClientRect();
              if (box.top < clip.top - 1 || box.bottom > clip.bottom + 1) return false;
            }
          }
          return document.elementFromPoint(box.x + box.width / 2, box.bottom - 4)?.closest('button') === button;
        });
        assert.equal(reachable, true, 'the whole reveal button must be reachable, including its bottom edge');
        await page.screenshot({ path: path.join(out, `handoff-button-${tag}.png`) });
        await revealButton.click();
        assert.equal(await page.locator('.screen.active .privacy-badge span').textContent(), 'Avery’s Eyes Only');
      });

      await page.evaluate(() => {
        Sound.setEnabled(false);
        cancelComputerTurnTimer(); cancelDiscussTimer(); UI.hideWinnerReveal();
        gameEpoch++; state = createInitialState(); resetNarrationTracking();
        startNewSeries(state, ['Avery', 'Blake', 'Casey', 'Drew', 'Ellis', 'Frankie', 'Gray'], 3);
        state.players.forEach((p, i) => { p.role = i === 0 || i === 3 ? 'deceiver' : 'loyal'; });
        state.players[3].alive = false; state.players[1].hand = ['deceivers-choice'];
        state.initialDeceiverCount = 2;
        beginRecruitment(state); recordRecruitTarget(state, state.players[1].id); resolveRecruitmentSwap(state);
        state.phase = PHASES.DRAW; state.pendingQueue = [state.players[0].id]; uiStage.drawTapped = false; render();
      });
      await check(`${tag}: the Pariah notification appears only after their private tap`, async () => {
        assert.equal((await page.locator('.screen.active').innerText()).includes('Pariah'), false);
        await page.click('[data-action="tap-draw"]');
        assert.match(await page.locator('.screen.active').innerText(), /You are now the Pariah/);
        await page.screenshot({ path: path.join(out, `pariah-private-${tag}.png`), fullPage: true });
      });
      await check(`${tag}: fellow Deceivers refresh; Hidden, Loyal and public views disclose no team`, async () => {
        await page.evaluate(() => {
          state.players[5].role = 'deceiver';
          state.pendingQueue = [state.players[1].id]; state.phase = PHASES.HAND; render();
        });
        assert.match(await page.locator('.screen.active .private-role-note').innerText(), /Frankie/);
        assert.doesNotMatch(await page.locator('.screen.active .private-role-note').innerText(), /Avery|Pariah|Drew/);
        await page.evaluate(() => { state.players[5].alive = false; render(); });
        assert.match(await page.locator('.screen.active .private-role-note').innerText(), /only remaining/);
        await page.evaluate(() => { state.settings.deceiverKnowledge = 'hidden'; render(); });
        assert.equal(await page.locator('.screen.active .private-role-note').count(), 0);
        await page.evaluate(() => { state.pendingQueue = [state.players[2].id]; render(); });
        assert.equal(await page.locator('.screen.active .private-role-note').count(), 0);
        await page.evaluate(() => { state.phase = PHASES.MAIN; render(); });
        assert.doesNotMatch(await page.locator('.screen.active').innerText(), /Pariah|Your fellow Deceivers/);
      });
      await check(`${tag}: discussion and ballot show living names only, with no roles`, async () => {
        await page.evaluate(() => { state.phase = PHASES.DISCUSS; uiStage.votingAnnounced = false; render(); });
        const roster = await page.locator('.screen.active .living-player-list').innerText();
        assert.doesNotMatch(roster, /Drew|Frankie|Deceiver|Pariah|Loyal/);
        assert.match(roster, /Avery/);
        await page.evaluate(() => { beginVotePhase(state, false); state.pendingQueue = [state.players[0].id]; uiStage.voteTapped = true; render(); });
        assert.equal(await page.locator('.screen.active .target-card').count(), 4);
        assert.equal(await page.locator('.screen.active .target-card').allTextContents().then((texts) => texts.some((text) => /Drew|Frankie/.test(text))), false);
        await page.screenshot({ path: path.join(out, `ballot-${tag}.png`), fullPage: true });
      });
      await check(`${tag}: HTML in a player name stays text on private screens`, async () => {
        await page.evaluate(() => { state.players[0].name = '<img src=x>'; render(); });
        assert.equal(await page.locator('.screen.active .privacy-badge img').count(), 0);
        assert.match(await page.locator('.screen.active .privacy-badge span').textContent(), /<img src=x>/);
        await page.evaluate(() => { state.players[0].name = 'Avery'; });
      });
      await check(`${tag}: Final Two can be skipped and replayed without another payout`, async () => {
        await page.evaluate(() => {
          state.players.forEach((p, i) => { p.alive = i < 2; }); state.players[1].role = 'loyal';
          UI.showModal('Settings', UI.settingsContent(state));
          state.prizePot = 100; finalizeGame(state, 'loyal'); interstitialPending = 'final-two'; render();
        });
        assert.equal(await page.locator('#winnerRevealOverlay').isVisible(), true);
        assert.equal(await page.locator('#modalOverlay').isVisible(), false);
        await page.click('#skipWinnerReveal');
        assert.equal(await page.locator('#winnerRevealOverlay').isVisible(), false);
        assert.match(await page.locator('.screen.active').innerText(), /12.5 gold/);
        const scores = await page.evaluate(() => JSON.stringify(state.seriesScores));
        await page.click('[data-action="replay-winner-reveal"]');
        await page.waitForTimeout(3100);
        assert.match(await page.locator('#winnerRevealBody').innerText(), /Blake/);
        await page.screenshot({ path: path.join(out, `final-two-${tag}.png`), fullPage: true });
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => JSON.stringify(state.seriesScores)), scores);
        assert.equal(await page.evaluate(() => document.getElementById('screens').inert), false);
      });
      await check(`${tag}: no horizontal overflow or JavaScript errors`, async () => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(errors, []);
      });
      await check(`${tag}: Off, Partial and Full survive Play Again and New Game`, async () => {
        for (const level of ['off', 'partial', 'full']) {
          await page.evaluate((level) => { state.settings.audio = level; applyAudioSettings(level); }, level);
          await page.evaluate(() => actions['play-again']());
          assert.equal(await page.evaluate(() => state.settings.audio), level);
          await page.click('[data-action="new-game"]');
          assert.equal(await page.evaluate(() => state.settings.audio), level);
        }
      });
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
  const summary = { passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass).length, checks };
  fs.writeFileSync(path.join(out, 'ui-results.json'), JSON.stringify(summary, null, 2));
  console.log(`${summary.passed}/${checks.length} UI checks passed`);
  if (summary.failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
