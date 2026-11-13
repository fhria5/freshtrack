// FreshTrack Phase 22 Playwright verification: horror design + spooky sounds.
// Run from the repo root:
//   NODE_PATH=/home/hatch/workspace/shoppal-v2/node_modules node tests/test-phase22.cjs
// Serves the repo on port 8904 itself and stops the server when done.
// Design: blood-red accents, drifting mist, flickering title, glowing
// danger/rotten cards, pulsing rescue buttons, captured Codex glow.
// Contrast of every text token is re-checked (AA, 4.5:1) after the palette
// change. Sounds: default ON, AudioContext runs after a gesture, Test Sound
// button, sounds on tab switch / add / rescue / secret unlock, pref saved.
// Audio cannot be heard in headless Chrome, so sounds are verified through
// the window.__freshTrack hook (soundLog + audioState), not by listening.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');

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
    check('design: title flickers', fx.titleAnim.indexOf('titleFlicker') !== -1, fx.titleAnim);
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

    // ===== Sounds: default ON on a fresh profile =====
    const freshSounds = await page.evaluate(() => ({
      on: window.__freshTrack.soundsOn(),
      label: (document.querySelector('.ctrl-sounds') || {}).textContent || '',
      pressed: (document.querySelector('.ctrl-sounds') || {}).getAttribute('aria-pressed'),
      stored: localStorage.getItem('freshtrack.sounds'),
      testBtn: !!document.querySelector('[data-action="test-sound"]'),
    }));
    check('sound: default ON (fresh profile)', freshSounds.on === true, 'soundsOn=' + freshSounds.on);
    check('sound: toggle label reads On', freshSounds.label.indexOf('On') !== -1, freshSounds.label.trim());
    check('sound: toggle aria-pressed true', freshSounds.pressed === 'true', freshSounds.pressed);
    check('sound: no explicit off stored', freshSounds.stored !== 'false', 'stored=' + freshSounds.stored);
    check('sound: Test Sound button exists', freshSounds.testBtn === true);

    // ===== Test Sound button: plays test sound, AudioContext runs =====
    await page.click('[data-action="test-sound"]');
    await page.waitForTimeout(600);
    const afterTest = await page.evaluate(() => ({
      last: window.__freshTrack.lastSound(),
      state: window.__freshTrack.audioState(),
    }));
    check('sound: Test Sound logs a test sound', afterTest.last && afterTest.last.name === 'test', JSON.stringify(afterTest.last));
    check('sound: AudioContext running after gesture', afterTest.state === 'running', afterTest.state);

    // ===== Toggle off: pref saved, sounds stop; toggle on: confirmation sound =====
    await page.click('[data-action="toggle-sounds"]');
    await page.waitForTimeout(200);
    const offState = await page.evaluate(() => ({
      on: window.__freshTrack.soundsOn(),
      label: (document.querySelector('.ctrl-sounds') || {}).textContent || '',
      stored: localStorage.getItem('freshtrack.sounds'),
    }));
    check('sound: toggle off saves pref false', offState.on === false && offState.stored === 'false', JSON.stringify(offState));
    await page.click('[data-action="toggle-sounds"]');
    await page.waitForTimeout(300);
    const onState = await page.evaluate(() => ({
      on: window.__freshTrack.soundsOn(),
      stored: localStorage.getItem('freshtrack.sounds'),
      last: window.__freshTrack.lastSound(),
    }));
    check('sound: toggle on plays confirmation sound', onState.on === true && onState.last && onState.last.name === 'test', JSON.stringify(onState.last));

    // ===== Tab switch plays a sound =====
    await page.click('.bottom-nav [data-tab="codex"]');
    await page.waitForTimeout(300);
    const tabSound = await page.evaluate(() => window.__freshTrack.lastSound());
    check('sound: tab switch logs a tab sound', tabSound && tabSound.name === 'tab', JSON.stringify(tabSound));
    const codexVisible = await page.evaluate(() => !document.getElementById('panel-codex').hidden && document.getElementById('panel-pantry').hidden);
    check('tabs: Codex visible, Pantry hidden after switch', codexVisible === true);

    // Back to Pantry for the item tests.
    await page.click('.bottom-nav [data-tab="pantry"]');
    await page.waitForTimeout(300);

    // ===== Add a fresh item: pop sound =====
    const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    await page.fill('#item-name', 'Test Lettuce');
    await page.fill('#item-expiry', future);
    await page.click('.btn-submit');
    await page.waitForTimeout(300);
    const addSound = await page.evaluate(() => window.__freshTrack.lastSound());
    check('sound: adding a fresh item logs an add sound', addSound && addSound.name === 'add', JSON.stringify(addSound));

    // ===== Rescue it: chime sound =====
    await page.click('.card[data-id] .btn-rescue');
    await page.waitForTimeout(300);
    const rescueSound = await page.evaluate(() => window.__freshTrack.lastSound());
    check('sound: rescue logs a chime sound', rescueSound && rescueSound.name === 'chime', JSON.stringify(rescueSound));

    // ===== Danger add: creak sound =====
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await page.fill('#item-name', 'Test Milk');
    await page.fill('#item-expiry', tomorrow);
    await page.click('.btn-submit');
    await page.waitForTimeout(300);
    const creakSound = await page.evaluate(() => window.__freshTrack.lastSound());
    check('sound: adding a danger item logs a creak sound', creakSound && creakSound.name === 'creak', JSON.stringify(creakSound));

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

    // ===== Secret unlock: shimmer sound (Triple Threat = 3 rescues in a day) =====
    // Two rescues already happened today (Lettuce + Milk is still in the
    // fridge; rescue Milk plus one more demo item to reach 3).
    await page.click('[data-action="summon-demo"]');
    await page.waitForTimeout(300);
    // Rescue Milk (danger) -> 2nd rescue today.
    const milkCard = await page.$('.card[data-urgency="danger"] .btn-rescue');
    if (milkCard) { await milkCard.click(); await page.waitForTimeout(300); }
    // Rescue one demo item -> 3rd rescue today, Triple Threat unlocks.
    const anyRescue = await page.$('.card .btn-rescue');
    if (anyRescue) { await anyRescue.click(); await page.waitForTimeout(400); }
    const log = await page.evaluate(() => window.__freshTrack.soundLog().map((s) => s.name));
    check('sound: secret unlock logs a secret sound', log.indexOf('secret') !== -1, log.join(','));
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

    // ===== Pref survives reload =====
    await page.click('.bottom-nav [data-tab="pantry"]');
    await page.waitForTimeout(200);
    await page.click('[data-action="toggle-sounds"]'); // turn off
    await page.waitForTimeout(200);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const persisted = await page.evaluate(() => ({
      on: window.__freshTrack.soundsOn(),
      label: (document.querySelector('.ctrl-sounds') || {}).textContent || '',
    }));
    check('sound: off pref survives reload', persisted.on === false && persisted.label.indexOf('Off') !== -1, JSON.stringify(persisted));
    // Turn it back on for the next visitor.
    await page.click('[data-action="toggle-sounds"]');
    await page.waitForTimeout(200);

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
