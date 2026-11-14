// FreshTrack Phase 25 Playwright verification: music made audible on phone
// speakers. Phase 23 shipped the horror music too quiet and too low:
// master gain 0.05, drone 55Hz + 55.5Hz (below what phone speakers can
// reproduce), eerie notes at 0.03. Phase 25 raises master gain to 0.15,
// drone to 110Hz + 110.5Hz, eerie notes to 0.05 base, wind to 0.02.
// Phase 29 superseded that mix (master 0.8, 220 Hz drone harmonic,
// eerie 0.12 base, wind 0.04); the checks below track the live mix.
// Run from the repo root:
//   NODE_PATH=/home/hatch/workspace/shoppal-v2/node_modules node tests/test-phase25-music.cjs
// Serves the repo on port 8906 itself and stops the server when done.
// Audio cannot be heard in headless Chrome, so music is verified through
// the window.__freshTrack hook, not by listening.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const REPO = '/home/hatch/workspace/freshtrack';
const BASE = 'http://127.0.0.1:8906/';
const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  if (!ok) failures++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
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
  const server = spawn('python3', ['-m', 'http.server', '8906', '--directory', REPO], { stdio: 'ignore' });
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

    // ===== Static: new audibility values, old ones gone =====
    const src = fs.readFileSync(REPO + '/app.js', 'utf-8');
    check('music25: drone 110Hz present', src.indexOf('drone1.frequency.value = 110;') !== -1);
    check('music25: drone 110.5Hz present', src.indexOf('drone2.frequency.value = 110.5;') !== -1);
    check('music25: master gain is 0.8', src.indexOf('master.gain.value = 0.8;') !== -1);
    check('music25: eerie note base vol 0.15', src.indexOf('vol: 0.15 + Math.random() * 0.05') !== -1);
    check('music25: harmony vol 0.10', src.indexOf('vol: 0.10 });') !== -1);
    check('music25: wind gain 0.05', src.indexOf('windGain.gain.value = 0.05;') !== -1);
    check('music25: old 55Hz drone gone', src.indexOf('frequency.value = 55') === -1);
    check('music25: old 0.05 master gain gone', src.indexOf('master.gain.value = 0.05') === -1);
    check('music25: footer reads v27.4', src.indexOf('FreshTrack v27.4 (loud + autoplay)') !== -1);
    check('music25: sw cache is freshtrack-v9', fs.readFileSync(REPO + '/sw.js', 'utf-8').indexOf('freshtrack-v9') !== -1);

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);

    // ===== Runtime: autoplays on load at the louder gain (v27.4) =====
    const fresh = await musicState(page);
    check('music25: autoplays on load, no gesture needed (v27.4)', fresh.started === true && Math.abs(fresh.gain - 0.8) < 0.001, JSON.stringify(fresh));
    await page.click('.app-title');
    await page.waitForTimeout(900);
    const started = await musicState(page);
    check('music25: AudioContext running after gesture', started.state === 'running', started.state);
    check('music25: started after gesture', started.started === true, JSON.stringify(started));
    check('music25: live gain is 0.8', Math.abs(started.gain - 0.8) < 0.001, 'gain=' + started.gain);
    check('music25: music-start logged', started.log.indexOf('music-start') !== -1, started.log.join(','));

    // ===== Eerie notes still arrive on schedule =====
    await page.waitForTimeout(9500);
    const withNote = await musicState(page);
    check('music25: eerie note scheduled within ~10s', withNote.log.indexOf('music-note') !== -1, withNote.log.join(','));

    // ===== Toggle off/on still works at the new gain =====
    await page.click('[data-action="toggle-music"]');
    await page.waitForTimeout(400);
    const offState = await musicState(page);
    check('music25: toggle off stops music', offState.started === false && offState.on === false, JSON.stringify(offState));
    await page.click('[data-action="toggle-music"]');
    await page.waitForTimeout(600);
    const onState = await musicState(page);
    check('music25: toggle on restarts music at 0.8', onState.started === true && Math.abs(onState.gain - 0.8) < 0.001, JSON.stringify(onState));

    // ===== Footer version visible in the page =====
    const version = await page.evaluate(() => (document.querySelector('.footer-version') || {}).textContent || '');
    check('music25: footer in page reads v27.4', version.indexOf('v27.4') !== -1, version.trim());

    check('music25: 0 console errors', errors.length === 0, errors.slice(0, 3).join(' ; '));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('music25: 0 horizontal overflow', overflow <= 0, 'overflow=' + overflow + 'px');
  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n' + results.filter((r) => r.ok).length + '/' + results.length + ' passed');
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Phase 25 test crashed:', err);
  process.exit(1);
});
