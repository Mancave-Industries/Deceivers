/* Launch a real game in a mobile-sized browser and verify that selected
   host audio starts at the opening and at the first generic handoff.
   No ElevenLabs calls, billing, real role data, or deployment. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml'
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/Gameshed/nav.js') { res.writeHead(200, { 'content-type': 'application/javascript' }); res.end(''); return; }
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, bytes) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(bytes);
  });
});

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('http://127.0.0.1:' + server.address().port + '/');
    await page.evaluate(() => {
      window.__voiceEvents = [];
      Sound._onEvent((type, detail) => window.__voiceEvents.push({type, detail}));
    });
    await page.click('[data-action="title-open-settings"]');
    await page.click('[data-action="choose-narrator"][data-host="timothy"]');
    assert.equal(await page.evaluate(() => state.settings.narratorHost), 'timothy');
    assert.equal(await page.evaluate(() => state.settings.audio), 'full');
    await page.click('[data-action="test-game-narration"]');
    await page.waitForFunction(() => {
      const text = document.getElementById('game-narration-status')?.textContent || '';
      return text.includes('Playback started');
    }, null, { timeout: 20000 });
    console.log('PASS: Test narration button starts audible game clip and reports playback');
    await page.evaluate(() => Sound.stopNarration());
    await page.click('[data-close-modal]');
    await page.click('.screen.active [data-action="new-game"]');
    const inputs = page.locator('.screen.active .name-input');
    for (let i=0; i<await inputs.count(); i++) await inputs.nth(i).fill('Player' + (i+1));
    await page.click('.screen.active [data-action="start-game"]');
    await page.waitForFunction(() => window.__voiceEvents.some(e =>
      e.type === 'clip-start' && /^host:timothy:opening_/.test(e.detail.key)
    ), null, {timeout:20000});
    console.log('PASS: Timothy started speaking at game opening');
    await page.click('#interstitialOverlay');
    await page.waitForFunction(() => window.__voiceEvents.some(e =>
      e.type === 'clip-start' && /^host:timothy:anonymous_handoff_/.test(e.detail.key)
    ), null, {timeout:20000});
    console.log('PASS: Timothy started speaking at first pass-the-phone moment');
    await page.click('#menuBtn');
    await page.click('[data-action="restore-game-audio"]');
    await page.waitForFunction(() =>
      document.getElementById('audio-recovery-status')?.textContent.includes('Audio reconnected')
    , null, {timeout:20000});
    assert.equal(await page.evaluate(() => state.phase), 'reveal');
    assert.equal(await page.evaluate(() => state.settings.narratorHost), 'timothy');
    await page.click('[data-action="test-game-narration"]');
    await page.waitForFunction(() =>
      document.getElementById('game-narration-status')?.textContent.includes('Playback started')
    , null, {timeout:20000});
    console.log('PASS: Restore Audio keeps the game state and narrator and recovers playback');
    assert.equal(errors.length,0, 'JavaScript errors: ' + errors.join('; '));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(e => { console.error(e); process.exitCode=1; server.close(); });
