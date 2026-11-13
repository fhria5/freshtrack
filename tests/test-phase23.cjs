// FreshTrack Phase 23 Playwright verification: horror background music +
// header Music toggle (sound effects were removed per user order, see
// test-phase22.cjs). Run from the repo root:
//   NODE_PATH=/home/hatch/workspace/shoppal-v2/node_modules node tests/test-phase23.cjs
// Serves the repo on port 8905 itself and stops the server when done.
// Music: Web Audio only, no audio files. Low detuned drone (55Hz +
// 55.5Hz) through a breathing lowpass filter, faint wind bed, random
// eerie notes every few seconds, one quiet master gain (0.05). Starts
// after the first user gesture (autoplay policy), default ON, pauses
// when the tab is hidden. Music toggle lives in the header, visible on
// every tab. Audio cannot be heard in headless Chrome, so music is
// verified through the window.__freshTrack hook (musicStarted, musicLog,
// audioState), not by listening.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const REPO = '/home/hatch/workspace/freshtrack';
const BASE = 'http://127.0.0.1:8905/';
const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  if (!ok) failures++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

async function toggleState(page) {
  return page.evaluate(() => {
    const btn = document.querySelector('[data-action="toggle-music"]');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return {
      label: btn.textContent.trim(),
      pressed: btn.getAttribute('aria-pressed'),
      visible: r.width > 0 && r.height > 0,
      height: Math.round(r.height),
      width: Math.round(r.width),
    };
  });
}

async function musicState(page) {
  return page.evaluate(() => ({
    on: window.__freshTrack.musicOn(),
    started: window.__freshTrack.musicStarted(),
    gain: window.__freshTrack.musicGainValue(),
    state: window.__freshTrack.audioState(),
    log: window.__freshTrack.musicLog().map((e) => e.name),
  }));
}

async function main() {
  const server = spawn('python3', ['-m', 'http.server', '8905', '--directory', REPO], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  const browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

    // ===== Static: music engine present, effects gone =====
    const src = fs.readFileSync(REPO + '/app.js', 'utf-8');
    check('music: startMusic exists', src.indexOf('function startMusic(') !== -1);
    check('music: stopMusic exists', src.indexOf('function stopMusic(') !== -1);
    check('music: drone 55Hz present', src.indexOf('frequency.value = 55') !== -1);
    check('music: master gain is 0.05', src.indexOf('master.gain.value = 0.05') !== -1);
    check('music: visibility suspend/resume wired', src.indexOf('visibilitychange') !== -1 && src.indexOf('ctx.suspend()') !== -1 && src.indexOf('ctx.resume()') !== -1);
    check('music: eerie notes scheduled', src.indexOf('scheduleEerieNote') !== -1 && src.indexOf('EERIE_NOTES') !== -1);
    for (const token of ['playTab(', 'playAdd(', 'playCreak(', 'playChime(', 'playSecret(', 'playTestSound(', 'toggle-sounds', 'test-sound']) {
      check('removed: app.js has no "' + token + '"', src.indexOf(token) === -1);
    }

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);

    // ===== Music default ON on a fresh profile, not started yet =====
    const fresh = await musicState(page);
    const freshToggle = await toggleState(page);
    check('music: default ON (fresh profile)', fresh.on === true, 'musicOn=' + fresh.on);
    check('music: toggle label reads On', freshToggle && freshToggle.label.indexOf('On') !== -1, freshToggle && freshToggle.label);
    check('music: toggle aria-pressed true', freshToggle && freshToggle.pressed === 'true', freshToggle && freshToggle.pressed);
    check('music: no explicit off stored', await page.evaluate(() => localStorage.getItem('freshtrack.music')) !== 'false');
    check('music: not started before any gesture', fresh.started === false && fresh.gain === 0, JSON.stringify(fresh));
    check('music: header toggle visible on Pantry', freshToggle && freshToggle.visible === true && freshToggle.height >= 44, JSON.stringify(freshToggle));

    // ===== Toggle visible on every tab (mobile) =====
    for (const tab of ['impact', 'codex', 'share', 'pantry']) {
      await page.click('#navtab-' + tab);
      await page.waitForTimeout(300);
      const ts = await toggleState(page);
      check('music: toggle visible on ' + tab + ' tab (mobile)', ts && ts.visible === true && ts.height >= 44, JSON.stringify(ts));
    }

    // ===== Music starts after the first gesture =====
    await page.click('.app-title');
    await page.waitForTimeout(900);
    const started = await musicState(page);
    check('music: AudioContext running after gesture', started.state === 'running', started.state);
    check('music: started after gesture', started.started === true, JSON.stringify(started));
    check('music: master gain is 0.05 (quiet)', Math.abs(started.gain - 0.05) < 0.001, 'gain=' + started.gain);
    check('music: music-start logged', started.log.indexOf('music-start') !== -1, started.log.join(','));

    // ===== Eerie notes arrive on their own schedule =====
    await page.waitForTimeout(9500);
    const withNote = await musicState(page);
    check('music: eerie note scheduled within ~10s', withNote.log.indexOf('music-note') !== -1, withNote.log.join(','));

    // ===== No effect sounds on tab/add/rescue events =====
    await page.click('#navtab-codex');
    await page.waitForTimeout(300);
    await page.click('#navtab-pantry');
    await page.waitForTimeout(300);
    const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    await page.fill('#item-name', 'Test Lettuce');
    await page.fill('#item-expiry', future);
    await page.click('.btn-submit');
    await page.waitForTimeout(300);
    await page.click('.card[data-id] .btn-rescue');
    await page.waitForTimeout(300);
    const afterEvents = await musicState(page);
    check('music: still playing after tab/add/rescue', afterEvents.started === true, JSON.stringify(afterEvents));
    check('removed: music log holds only music events', afterEvents.log.length > 0 && afterEvents.log.every((n) => n.indexOf('music-') === 0), afterEvents.log.join(','));

    // ===== Toggle off: music stops, pref saved =====
    await page.click('[data-action="toggle-music"]');
    await page.waitForTimeout(400);
    const offState = await musicState(page);
    const offToggle = await toggleState(page);
    check('music: toggle off stops music', offState.started === false, JSON.stringify(offState));
    check('music: toggle off logs music-stop', offState.log.indexOf('music-stop') !== -1, offState.log.join(','));
    check('music: toggle off saves pref false', offState.on === false && (await page.evaluate(() => localStorage.getItem('freshtrack.music'))) === 'false', JSON.stringify(offState));
    check('music: toggle label reads Off', offToggle && offToggle.label.indexOf('Off') !== -1, offToggle && offToggle.label);

    // ===== Toggle on: music starts again immediately =====
    await page.click('[data-action="toggle-music"]');
    await page.waitForTimeout(600);
    const onState = await musicState(page);
    check('music: toggle on restarts music', onState.started === true && onState.on === true, JSON.stringify(onState));
    check('music: toggle on logs a new music-start', onState.log.filter((n) => n === 'music-start').length >= 2, onState.log.join(','));

    // ===== Hidden tab suspends, visible tab resumes =====
    // document.hidden is a prototype getter reading internal tab state, so
    // shadowing visibilityState alone is not enough: define both.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    const hiddenState = await page.evaluate(() => window.__freshTrack.audioState());
    check('music: AudioContext suspended when tab hidden', hiddenState === 'suspended', hiddenState);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    const visibleState = await page.evaluate(() => window.__freshTrack.audioState());
    check('music: AudioContext running when tab visible again', visibleState === 'running', visibleState);

    // ===== Off pref survives reload =====
    await page.click('[data-action="toggle-music"]'); // turn off
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const persisted = await musicState(page);
    const persistedToggle = await toggleState(page);
    check('music: off pref survives reload', persisted.on === false && persistedToggle.label.indexOf('Off') !== -1, JSON.stringify(persisted));
    check('music: stays stopped after reload until a gesture', persisted.started === false, JSON.stringify(persisted));
    // Turn it back on for the next visitor.
    await page.click('[data-action="toggle-music"]');
    await page.waitForTimeout(400);

    // ===== Footer version stamp =====
    const version = await page.evaluate(() => (document.querySelector('.footer-version') || {}).textContent || '');
    check('version: footer reads v23.1', version.indexOf('v23.1') !== -1, version.trim());

    // ===== Desktop: toggle visible in the header on every tab =====
    const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await desk.goto(BASE, { waitUntil: 'networkidle' });
    await desk.waitForTimeout(400);
    for (const tab of ['pantry', 'impact', 'codex', 'share']) {
      await desk.click('#tab-' + tab);
      await desk.waitForTimeout(300);
      const ts = await toggleState(desk);
      check('music: toggle visible on ' + tab + ' tab (desktop)', ts && ts.visible === true && ts.height >= 44, JSON.stringify(ts));
    }

    // ===== Mobile tab heights with the demo pantry (info + bound) =====
    await page.click('#navtab-pantry');
    await page.waitForTimeout(300);
    await page.click('.form-panel [data-action="summon-demo"]');
    await page.waitForTimeout(500);
    const mobHeights = {};
    for (const tab of ['pantry', 'impact', 'codex', 'share']) {
      await page.click('#navtab-' + tab);
      await page.waitForTimeout(400);
      mobHeights[tab] = await page.evaluate(() => document.documentElement.scrollHeight);
    }
    console.log('INFO | mobile heights with header audio bar (px, demo pantry): ' + JSON.stringify(mobHeights));
    check('mobile: Impact/Codex/Share tabs fit ~2 screens (<=1760px)', mobHeights.impact <= 1760 && mobHeights.codex <= 1760 && mobHeights.share <= 1760, JSON.stringify(mobHeights));

    // ===== No console errors overall =====
    check('0 console errors during Phase 23 checks', errors.length === 0, errors.slice(0, 3).join(' ; '));

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('0 horizontal overflow', overflow <= 0, 'overflow=' + overflow + 'px');
  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n' + results.filter((r) => r.ok).length + '/' + results.length + ' passed');
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Phase 23 test crashed:', err);
  process.exit(1);
});
