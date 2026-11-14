// FreshTrack Phase 29 music fix verification: the Phase 25 mix was still
// inaudible on the user's phone (3rd report). Root cause, proven by probe:
// the graph DID start (music-start logged, gain 0.15) — the mix itself was
// the problem: a 110 Hz sine drone phone speakers barely reproduce, eerie
// notes at ~0.05, wind at 0.02. Phase 29 (v27.2) fixes the MIX, not just
// the volume: master 0.25, a 220 Hz drone harmonic (what the ear hears),
// eerie notes 0.12-0.17 every 3-6s, wind 0.04, plus a pulsing note on the
// toggle while the graph runs, so "not started" reads apart from "on but
// too quiet". SW cache bumped v6 -> v7 so a stale install cannot survive.
// v27.3: the user laughed at the drone itself ("Masa suara drone", "Kocak")
// — a hum is not music. The melody now leads: a creepy A-minor music-box
// loop (440-880 Hz, clearly audible on phone speakers) with the drone bed
// turned quiet underneath. Cache v7 -> v8.
// Run from the repo root:
//   NODE_PATH=/home/hatch/workspace/shoppal-v2/node_modules node tests/test-phase29-music.cjs
// Serves the repo on port 8908 itself and stops the server when done.
// Audio cannot be heard in headless Chrome, so music is verified through
// the window.__freshTrack hook, not by listening.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const REPO = '/home/hatch/workspace/freshtrack';
const BASE = 'http://127.0.0.1:8908/';
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
    toggleText: (document.querySelector('[data-action="toggle-music"]') || {}).textContent || '',
    togglePlaying: !!(document.querySelector('[data-action="toggle-music"]') || {}).classList &&
      document.querySelector('[data-action="toggle-music"]').classList.contains('music-playing'),
    version: (document.querySelector('.footer-version') || {}).textContent || '',
  }));
}

async function main() {
  const src = fs.readFileSync(REPO + '/app.js', 'utf-8');
  const css = fs.readFileSync(REPO + '/styles.css', 'utf-8');
  const sw = fs.readFileSync(REPO + '/sw.js', 'utf-8');

  // Source-level mix checks (the actual fix).
  check('music29: master gain 0.25', src.indexOf('master.gain.value = 0.25;') !== -1);
  check('music29: 220 Hz drone harmonic present, bed quiet', src.indexOf('drone3.frequency.value = 220;') !== -1 &&
    src.indexOf('d3g.gain.value = 0.12;') !== -1 &&
    src.indexOf('d1g.gain.value = 0.2;') !== -1 &&
    src.indexOf('d2g.gain.value = 0.15;') !== -1);
  check('music29: music-box melody present', src.indexOf('var MELODY = [440, 523.25, 659.25, 880') !== -1 &&
    src.indexOf('function scheduleMelodyNote()') !== -1 &&
    src.indexOf('MELODY_STEP_MS = 550') !== -1);
  check('music29: eerie notes 0.12 base', src.indexOf('vol: 0.12 + Math.random() * 0.05') !== -1);
  check('music29: eerie harmony 0.08', src.indexOf('dur: 2.2, vol: 0.08') !== -1);
  check('music29: eerie interval 3-6s', src.indexOf('3000 + Math.random() * 3000') !== -1);
  check('music29: wind 0.04', src.indexOf('windGain.gain.value = 0.04;') !== -1);
  check('music29: footer v27.3', src.indexOf('FreshTrack v27.3 (music-box melody)') !== -1);
  check('music29: sw cache v8', sw.indexOf('freshtrack-v8') !== -1);
  check('music29: pulse keyframes in css', css.indexOf('@keyframes musicPulse') !== -1 &&
    css.indexOf('.ctrl-music.music-playing') !== -1);

  const server = spawn('python3', ['-m', 'http.server', '8908', '--directory', REPO], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  const browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const before = await musicState(page);
    check('music29: toggle On before tap, no pulse yet', before.on === true && before.started === false &&
      before.toggleText.indexOf('Music: On') !== -1 && before.togglePlaying === false, before.toggleText);
    check('music29: footer in page reads v27.3', before.version.indexOf('v27.3') !== -1, before.version.trim());

    await page.mouse.click(195, 400);
    await page.waitForTimeout(2500);
    const after = await musicState(page);
    check('music29: music starts after tap', after.started === true && after.state === 'running' &&
      after.log.indexOf('music-start') !== -1, JSON.stringify(after.log));
    check('music29: live gain is 0.25', Math.abs(after.gain - 0.25) < 0.001, String(after.gain));
    check('music29: toggle shows pulsing note while playing', after.toggleText.indexOf('\u266A') !== -1 &&
      after.togglePlaying === true, after.toggleText);
    check('music29: melody notes play after tap', after.log.indexOf('music-note') !== -1, JSON.stringify(after.log));

    // Toggle off: music stops, pulse clears; toggle back on: restarts.
    await page.click('[data-action="toggle-music"]');
    await page.waitForTimeout(800);
    const off = await musicState(page);
    check('music29: toggle off stops music + clears pulse', off.on === false && off.started === false &&
      off.togglePlaying === false && off.toggleText.indexOf('Music: Off') !== -1, off.toggleText);
    await page.click('[data-action="toggle-music"]');
    await page.waitForTimeout(2000);
    const backOn = await musicState(page);
    check('music29: toggle on restarts music + pulse returns', backOn.on === true && backOn.started === true &&
      backOn.togglePlaying === true, backOn.toggleText);
  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES') + ' (' + results.length + ' checks)');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('TEST CRASHED:', e); process.exit(1); });
