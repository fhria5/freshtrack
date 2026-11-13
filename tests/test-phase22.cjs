// FreshTrack Phase 22 Playwright verification: horror design (kept) +
// sound effects REMOVED (user order 13 Nov 2026 ~21:25 "Efek suara gausah").
// Run from the repo root:
//   NODE_PATH=/home/hatch/workspace/shoppal-v2/node_modules node tests/test-phase22.cjs
// Serves the repo on port 8904 itself and stops the server when done.
// Design: blood-red accents, drifting mist, flickering title, glowing
// danger/rotten cards, pulsing rescue buttons, captured Codex glow.
// Contrast of every text token is re-checked (AA, 4.5:1) after the palette
// change. Sound effects: NONE any more. The old playTab/playAdd/playCreak/
// playChime/playSecret/playTestSound functions, the Sounds toggle and the
// Test Sound button are all gone; tab/add/rescue/secret actions are
// silent, while the background music (Phase 23) keeps playing.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const REPO = '/home/hatch/workspace/freshtrack';
const BASE = 'http://127.0.0.1:8904/';
const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  if (!ok) failures++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

async function main() {
  const server = spawn('python3', ['-m', 'http.server', '8904', '--directory', REPO], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  const browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);

    // ===== Design tokens =====
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        bg: cs.getPropertyValue('--bg-deep').trim(),
        blood: cs.getPropertyValue('--accent-blood').trim(),
        mist: cs.getPropertyValue('--mist').trim(),
      };
    });
    check('design: bg-deep is near-black #08060f', tokens.bg === '#08060f', tokens.bg);
    check('design: blood token exists', tokens.blood === '#c1121f', tokens.blood);
    check('design: mist token exists', tokens.mist.length > 0, tokens.mist);

    // ===== Mist layer, flickering title, blood divider =====
    const fx = await page.evaluate(() => {
      const before = getComputedStyle(document.body, '::before');
      const title = document.querySelector('.app-title');
      const titleCs = getComputedStyle(title);
      const headerAfter = getComputedStyle(document.querySelector('.header'), '::after');
      return {
        mistContent: before.content,
        mistAnim: before.animationName,
        titleAnim: titleCs.animationName,
        dividerHeight: headerAfter.height,
        dividerBg: headerAfter.backgroundImage.slice(0, 60),
      };
    });
    check('design: mist layer present', fx.mistContent === '""' || fx.mistContent === '" "', fx.mistContent);
    check('design: mist drifts', fx.mistAnim.indexOf('mistDrift') !== -1, fx.mistAnim);
    // Day uses titleFlicker, night mode uses flicker; either is a flicker.
    check('design: title flickers', fx.titleAnim.toLowerCase().indexOf('flicker') !== -1, fx.titleAnim);
    check('design: blood divider under header', fx.dividerHeight === '2px', fx.dividerHeight);

    // ===== Contrast AA (4.5:1) for every text token on its background =====
    const contrast = await page.evaluate(() => {
      function lum(color) {
        let r, g, b;
        const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
        if (hex) {
          r = parseInt(hex[1].slice(0, 2), 16) / 255;
          g = parseInt(hex[1].slice(2, 4), 16) / 255;
          b = parseInt(hex[1].slice(4, 6), 16) / 255;
        } else {
          const m = color.match(/rgba?\(([^)]+)\)/);
          if (!m) return 0;
          const parts = m[1].split(',').map((v) => parseFloat(v) / 255);
          r = parts[0]; g = parts[1]; b = parts[2];
        }
        const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      }
      function ratio(fg, bg) {
        const l1 = lum(fg), l2 = lum(bg);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }
      const cs = getComputedStyle(document.documentElement);
      const bgDeep = cs.getPropertyValue('--bg-deep').trim();
      const bgPanel = cs.getPropertyValue('--bg-panel').trim();
      const pairs = [
        ['text-primary', cs.getPropertyValue('--text-primary').trim(), bgDeep],
        ['text-primary', cs.getPropertyValue('--text-primary').trim(), bgPanel],
        ['text-muted', cs.getPropertyValue('--text-muted').trim(), bgDeep],
        ['text-muted', cs.getPropertyValue('--text-muted').trim(), bgPanel],
        ['danger-text', cs.getPropertyValue('--accent-danger-text').trim(), bgPanel],
        ['rotten-text', cs.getPropertyValue('--accent-rotten-text').trim(), bgPanel],
        ['wary', cs.getPropertyValue('--accent-wary').trim(), bgPanel],
        ['fresh', cs.getPropertyValue('--accent-fresh').trim(), bgPanel],
      ];
      return pairs.map(([name, fg, bg]) => ({ name, ratio: +ratio(fg, bg).toFixed(2) }));
    });
    for (const c of contrast) {
      check('contrast AA: ' + c.name + ' >= 4.5', c.ratio >= 4.5, c.ratio + ':1');
    }

    // ===== Reduced motion: animations collapse =====
    const rmPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await rmPage.goto(BASE, { waitUntil: 'networkidle' });
    await rmPage.waitForTimeout(200);
    const rmDur = await rmPage.evaluate(() => getComputedStyle(document.querySelector('.app-title')).animationDuration);
    check('reduced motion: title animation collapses', rmDur === '0.01ms' || parseFloat(rmDur) <= 0.01, rmDur);
    await rmPage.close();

    // ===== Sound effects REMOVED (user order 13 Nov 2026 ~21:25) =====
    // No Sounds toggle, no Test Sound button, no sound-effect hook, and
    // no play* calls left in the source. The background music (Phase 23)
    // is the only audio left; it is tested in test-phase23.cjs.
    const removed = await page.evaluate(() => ({
      toggleSounds: document.querySelectorAll('[data-action="toggle-sounds"]').length,
      testSound: document.querySelectorAll('[data-action="test-sound"]').length,
      ctrlSounds: document.querySelectorAll('.ctrl-sounds').length,
      hasSoundsOn: typeof window.__freshTrack.soundsOn,
      hasSoundLog: typeof window.__freshTrack.soundLog,
      hasLastSound: typeof window.__freshTrack.lastSound,
    }));
    check('removed: no Sounds toggle in DOM', removed.toggleSounds === 0, 'count=' + removed.toggleSounds);
    check('removed: no Test Sound button in DOM', removed.testSound === 0, 'count=' + removed.testSound);
    check('removed: no .ctrl-sounds element', removed.ctrlSounds === 0, 'count=' + removed.ctrlSounds);
    check('removed: hook no longer exposes soundsOn', removed.hasSoundsOn === 'undefined', removed.hasSoundsOn);
    check('removed: hook no longer exposes soundLog', removed.hasSoundLog === 'undefined', removed.hasSoundLog);
    check('removed: hook no longer exposes lastSound', removed.hasLastSound === 'undefined', removed.hasLastSound);

    const src = fs.readFileSync(REPO + '/app.js', 'utf-8');
    const banned = ['playTab(', 'playAdd(', 'playCreak(', 'playChime(', 'playSecret(', 'playTestSound(', 'toggle-sounds', 'test-sound', 'SOUNDS_KEY', 'soundsEnabled', 'loadSoundsEnabled', 'saveSoundsEnabled'];
    for (const token of banned) {
      check('removed: app.js has no "' + token + '"', src.indexOf(token) === -1, src.indexOf(token) === -1 ? '' : 'found at ' + src.indexOf(token));
    }

    // ===== Actions still work, and stay silent (music log has no effects) =====
    // The first click is the user gesture that starts the music.
    await page.click('.bottom-nav [data-tab="codex"]');
    await page.waitForTimeout(500);
    const codexVisible = await page.evaluate(() => !document.getElementById('panel-codex').hidden && document.getElementById('panel-pantry').hidden);
    check('tabs: Codex visible, Pantry hidden after switch', codexVisible === true);
    const musicAfterTab = await page.evaluate(() => ({
      started: window.__freshTrack.musicStarted(),
      log: window.__freshTrack.musicLog().map((e) => e.name),
    }));
    check('music: starts on first gesture (tab switch)', musicAfterTab.started === true, JSON.stringify(musicAfterTab));
    check('removed: tab switch logs no effect sound', musicAfterTab.log.every((n) => n.indexOf('music-') === 0), musicAfterTab.log.join(','));

    // Back to Pantry for the item tests.
    await page.click('.bottom-nav [data-tab="pantry"]');
    await page.waitForTimeout(300);

    // ===== Add a fresh item: still works, no pop sound =====
    const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    await page.fill('#item-name', 'Test Lettuce');
    await page.fill('#item-expiry', future);
    await page.click('.btn-submit');
    await page.waitForTimeout(300);
    const addOk = await page.evaluate(() => document.querySelectorAll('.card').length >= 1);
    check('pantry: adding a fresh item works', addOk === true);

    // ===== Rescue it: still works, no chime sound =====
    const beforeRescue = await page.evaluate(() => document.querySelectorAll('.card').length);
    await page.click('.card[data-id] .btn-rescue');
    await page.waitForTimeout(300);
    const afterRescue = await page.evaluate(() => document.querySelectorAll('.card').length);
    check('pantry: rescue removes the item', afterRescue === beforeRescue - 1, beforeRescue + ' -> ' + afterRescue);

    // ===== Danger add: still works, no creak sound =====
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await page.fill('#item-name', 'Test Milk');
    await page.fill('#item-expiry', tomorrow);
    await page.click('.btn-submit');
    await page.waitForTimeout(300);
    const dangerOk = await page.evaluate(() => !!document.querySelector('.card[data-urgency="danger"]'));
    check('pantry: adding a danger item works', dangerOk === true);

    // ===== Danger card horror styling =====
    const dangerFx = await page.evaluate(() => {
      const card = document.querySelector('.card[data-urgency="danger"]');
      if (!card) return null;
      const cs = getComputedStyle(card);
      const btn = card.querySelector('.btn-rescue');
      const btnCs = btn ? getComputedStyle(btn) : null;
      const monster = card.querySelector('.monster');
      const monsterCs = monster ? getComputedStyle(monster) : null;
      return {
        shadow: cs.boxShadow,
        rescueAnim: btnCs ? btnCs.animationName : '',
        monsterFilter: monsterCs ? monsterCs.filter : '',
      };
    });
    check('design: danger card has blood glow', dangerFx && dangerFx.shadow.indexOf('193, 18, 31') !== -1, dangerFx && dangerFx.shadow.slice(0, 80));
    check('design: rescue button pulses on danger card', dangerFx && dangerFx.rescueAnim.indexOf('rescuePulse') !== -1, dangerFx && dangerFx.rescueAnim);
    check('design: danger monster glows red', dangerFx && dangerFx.monsterFilter.indexOf('drop-shadow') !== -1, dangerFx && dangerFx.monsterFilter);

    // ===== Secret unlock still works (Triple Threat = 3 rescues in a day) =====
    // One rescue already happened today (Lettuce); rescue Milk plus one
    // more demo item to reach 3.
    await page.click('[data-action="summon-demo"]');
    await page.waitForTimeout(300);
    // Rescue Milk (danger) -> 2nd rescue today.
    const milkCard = await page.$('.card[data-urgency="danger"] .btn-rescue');
    if (milkCard) { await milkCard.click(); await page.waitForTimeout(300); }
    // Rescue one demo item -> 3rd rescue today, Triple Threat unlocks.
    const anyRescue = await page.$('.card .btn-rescue');
    if (anyRescue) { await anyRescue.click(); await page.waitForTimeout(400); }
    const secretCard = await page.evaluate(() => {
      const el = document.querySelector('.codex-card.secret[data-state="captured"]');
      return !!el;
    });
    check('codex: a secret monster is captured', secretCard === true);

    // ===== Captured Codex card glow =====
    await page.click('.bottom-nav [data-tab="codex"]');
    await page.waitForTimeout(300);
    const codexGlow = await page.evaluate(() => {
      const card = document.querySelector('.codex-card[data-state="captured"]');
      if (!card) return '';
      return getComputedStyle(card).boxShadow;
    });
    check('design: captured Codex card glows', codexGlow.indexOf('224, 164, 74') !== -1, codexGlow.slice(0, 80));

    // ===== No effect sounds anywhere in the music log =====
    const finalLog = await page.evaluate(() => window.__freshTrack.musicLog().map((e) => e.name));
    check('removed: music log holds only music events', finalLog.length > 0 && finalLog.every((n) => n.indexOf('music-') === 0), finalLog.join(','));

    // ===== No console errors overall =====
    check('0 console errors during Phase 22 checks', errors.length === 0, errors.slice(0, 3).join(' ; '));

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
  console.error('Phase 22 test crashed:', err);
  process.exit(1);
});
