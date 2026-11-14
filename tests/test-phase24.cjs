// FreshTrack Phase 24 Playwright verification: Freeze (+14 days) + Codex
// secret progress (Triple Threat n/3 bar, Void King 2-step checklist).
// Run from the repo root:
//   NODE_PATH=/home/hatch/workspace/shoppal-v2/node_modules node tests/test-phase24.cjs
// Serves the repo on port 8906 itself and stops the server when done.
// Freeze is display-neutral: no stats change, no sound, no recipe. The
// regular monster level text already existed (verified here, not re-added).
// Unlock conditions are unchanged; only their progress is now visible.
// Sync is verified by watching for the debounced POST to the pantry API
// after a freeze while a household is joined (headless cannot reach the
// live Worker, so the attempt itself is the assertion).
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

function iso(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

async function freezeByName(page, name) {
  await page.locator('.card:has-text("' + name + '") .btn-freeze').first().click();
  await page.waitForTimeout(400);
}

async function rescueByName(page, name) {
  await page.locator('.card:has-text("' + name + '") .btn-rescue').first().click();
  await page.waitForTimeout(400);
}

async function cardMeta(page, name) {
  return page.evaluate((n) => {
    const card = [...document.querySelectorAll('.card')].find((c) => c.textContent.includes(n));
    if (!card) return null;
    const badge = card.querySelector('.badge');
    const btn = card.querySelector('.btn-freeze');
    const r = btn ? btn.getBoundingClientRect() : null;
    return {
      badge: badge ? badge.textContent.trim() : '',
      freezeLabel: btn ? btn.getAttribute('aria-label') || '' : '',
      freezeVisible: !!r && r.width > 0 && r.height > 0,
      freezeSize: r ? Math.round(r.width) + 'x' + Math.round(r.height) : '',
    };
  }, name);
}

async function storedState(page) {
  return page.evaluate(() => ({
    items: JSON.parse(localStorage.getItem('freshtrack.items') || '[]'),
    souls: localStorage.getItem('freshtrack.soulsSaved'),
    history: JSON.parse(localStorage.getItem('freshtrack.history') || '[]'),
    secrets: (JSON.parse(localStorage.getItem('freshtrack.codex') || '{}').secrets) || {},
  }));
}

async function secretProgress(page) {
  return page.evaluate(() => {
    const out = {};
    for (const card of document.querySelectorAll('.codex-card.secret')) {
      const key = card.getAttribute('data-secret');
      const xp = card.querySelector('.xp-text');
      const fill = card.querySelector('.xp-fill');
      out[key] = {
        state: card.getAttribute('data-state'),
        text: xp ? xp.textContent.trim() : '',
        barWidth: fill ? fill.style.width : null,
      };
    }
    return out;
  });
}

async function main() {
  const server = spawn('python3', ['-m', 'http.server', '8906', '--directory', REPO], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  const browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
    args: ['--no-sandbox'],
  });
  try {
    // ===== Static: Freeze exists, effects still gone, versions bumped =====
    const src = fs.readFileSync(REPO + '/app.js', 'utf-8');
    check('freeze: freezeItem exists', src.indexOf('function freezeItem(') !== -1);
    check('freeze: +14 days math present', src.indexOf('setDate(d.getDate() + 14)') !== -1);
    check('freeze: button rendered on cards', src.indexOf('data-action="freeze"') !== -1);
    check('freeze: goes through saveItems (persist + sync)', src.indexOf('function freezeItem(') !== -1 && src.slice(src.indexOf('function freezeItem('), src.indexOf('function freezeItem(') + 900).indexOf('saveItems()') !== -1);
    check('freeze: no logEvent in freezeItem', src.slice(src.indexOf('function freezeItem('), src.indexOf('function freezeItem(') + 900).indexOf('logEvent') === -1);
    check('codex: secretProgressHtml exists', src.indexOf('function secretProgressHtml(') !== -1);
    check('codex: unlock conditions unchanged (3 rescues)', src.indexOf('if (n >= 3) unlockSecret(\'secretDanger\')') !== -1);
    check('codex: unlock conditions unchanged (Void King)', src.indexOf('if (tonightPlanOpen) unlockSecret(\'secretRotten\')') !== -1);
    check('version: footer v27.4', src.indexOf('FreshTrack v27.4') !== -1);
    check('version: no v23.1 left', src.indexOf('v23.1') === -1);
    check('cache: sw.js freshtrack-v9', fs.readFileSync(REPO + '/sw.js', 'utf-8').indexOf('freshtrack-v9') !== -1);
    check('css: btn-freeze styled', fs.readFileSync(REPO + '/styles.css', 'utf-8').indexOf('.btn-freeze') !== -1);
    for (const token of ['playTab(', 'playAdd(', 'playCreak(', 'playChime(', 'playSecret(', 'playTestSound(']) {
      check('removed: app.js has no "' + token + '"', src.indexOf(token) === -1);
    }
    const freezeSlice = src.slice(src.indexOf('function freezeItem('), src.indexOf('function summonDemoPantry'));
    const progressSlice = src.slice(src.indexOf('function secretProgressHtml('), src.indexOf('function renderSecretCard('));
    check('no em dash in new Phase 24 code', freezeSlice.indexOf('\\u2014') === -1 && progressSlice.indexOf('\\u2014') === -1 && freezeSlice.indexOf('—') === -1 && progressSlice.indexOf('—') === -1);

    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    // The sync POSTs deliberately fail offline in headless (no egress);
    // those resource-load failures are the sync test working, not app errors.
    page.on('console', (msg) => { if (msg.type() === 'error' && msg.text().indexOf('Failed to load resource') === -1) errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
    const pantryPosts = [];
    page.on('request', (req) => {
      if (req.url().indexOf('freshtrack-ai/api/pantry') !== -1 && req.method() === 'POST') {
        pantryPosts.push(Date.now());
      }
    });
    await page.route('**/freshtrack-ai/api/recipe', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ recipe: { title: 'Moon Noodles', ingredients: ['Chicken'], steps: ['Fry until golden.'], timeMinutes: 15 }, source: 'ai' }) });
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    // ===== Freeze: expiry +14 days, card stays, stats untouched =====
    await page.click('[data-action="summon-demo"]');
    await page.waitForTimeout(400);
    const before = await cardMeta(page, 'Bananas');
    check('freeze: button visible on card', before.freezeVisible === true, JSON.stringify(before));
    const freezeDims = before.freezeSize.split('x').map(Number);
    check('freeze: button at least 44x44', freezeDims.length === 2 && freezeDims[0] >= 44 && freezeDims[1] >= 44, before.freezeSize);
    check('freeze: accessible label names the item', before.freezeLabel.indexOf('Freeze Bananas') !== -1, before.freezeLabel);
    check('freeze: Bananas starts at +1 day (danger)', before.badge.indexOf('1 day') !== -1, before.badge);

    await freezeByName(page, 'Bananas');
    const after = await cardMeta(page, 'Bananas');
    const st1 = await storedState(page);
    const bananas = st1.items.find((i) => i.name === 'Bananas');
    check('freeze: expiry is exactly +15 days', bananas && bananas.expiryDate === iso(15), bananas && bananas.expiryDate);
    check('freeze: badge now shows 15 days', after.badge.indexOf('15 days') !== -1, after.badge);
    check('freeze: card still in fridge (not rescued)', !!bananas, '');
    check('freeze: souls saved still 0', st1.souls === '0' || st1.souls === null, 'souls=' + st1.souls);
    check('freeze: history still empty (not rescued/wasted)', st1.history.length === 0, 'history=' + st1.history.length);
    const announcer = await page.evaluate(() => (document.getElementById('sr-announcer') || {}).textContent || '');
    check('freeze: announced to live region', announcer.indexOf('frozen') !== -1, announcer.slice(0, 80));

    // ===== Freeze persists across reload =====
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const st2 = await storedState(page);
    const bananas2 = st2.items.find((i) => i.name === 'Bananas');
    check('freeze: expiry survives reload', bananas2 && bananas2.expiryDate === iso(15), bananas2 && bananas2.expiryDate);

    // ===== Freeze syncs: join a household, then freeze and watch the POST =====
    await page.click('[data-action="create-household"]');
    await page.waitForTimeout(500);
    // Wait until the first (failing, headless-offline) push settles, so the
    // debounced freeze push is not swallowed by the in-flight guard.
    await page.waitForFunction(() => {
      const el = document.getElementById('household-status');
      return el && el.textContent.indexOf('safe on this device') !== -1;
    }, { timeout: 20000 }).catch(() => {});
    const freezeAt = Date.now();
    await freezeByName(page, 'Cheese');
    await page.waitForTimeout(3500);
    const postsAfterFreeze = pantryPosts.filter((t) => t > freezeAt);
    check('sync: freeze triggers a pantry POST (debounced)', postsAfterFreeze.length >= 1, 'posts=' + postsAfterFreeze.length);
    const st3 = await storedState(page);
    const cheese = st3.items.find((i) => i.name === 'Cheese');
    check('sync: Cheese expiry +18 days stored', cheese && cheese.expiryDate === iso(18), cheese && cheese.expiryDate);

    // ===== Codex: regular monster level text + secret progress (locked) =====
    await page.click('.bottom-nav [data-tab="codex"]');
    await page.waitForTimeout(300);
    const freshXp = await page.evaluate(() => {
      const card = document.querySelector('.codex-card[data-urgency="fresh"] .xp-text');
      return card ? card.textContent.trim() : '';
    });
    check('codex: regular monster shows level progress', /0 rescues · 3 more to Lv\. 2/.test(freshXp), freshXp);
    let prog = await secretProgress(page);
    check('codex: Triple Threat shows 0 / 3 rescued today', prog.secretDanger && prog.secretDanger.text === '0 / 3 rescued today', JSON.stringify(prog.secretDanger));
    check('codex: Triple Threat bar is 0%', prog.secretDanger && prog.secretDanger.barWidth === '0%', JSON.stringify(prog.secretDanger));
    check('codex: Void King shows both steps open', prog.secretRotten && prog.secretRotten.text === 'Step 1: Cook Tonight opened ⬜ · Step 2: Rescue after ⬜', JSON.stringify(prog.secretRotten));
    check('codex: Glimmer Sprout shows no progress bar', prog.secretFresh && prog.secretFresh.barWidth === null && prog.secretFresh.text === '', JSON.stringify(prog.secretFresh));
    check('codex: Midnight Watcher shows no progress bar', prog.secretWary && prog.secretWary.barWidth === null && prog.secretWary.text === '', JSON.stringify(prog.secretWary));

    // ===== Void King step 1: open a Cook Tonight plan =====
    await page.click('.bottom-nav [data-tab="pantry"]');
    await page.waitForTimeout(300);
    await page.click('[data-action="cook-tonight"]');
    await page.waitForSelector('.modal-tonight', { timeout: 20000 });
    await page.click('.modal-tonight [data-modal-action="close"]');
    await page.waitForTimeout(300);
    await page.click('.bottom-nav [data-tab="codex"]');
    await page.waitForTimeout(300);
    prog = await secretProgress(page);
    check('codex: Void King step 1 checked after plan', prog.secretRotten && prog.secretRotten.text.indexOf('Step 1: Cook Tonight opened ✔') !== -1, JSON.stringify(prog.secretRotten));

    // ===== Rescue 1 (Chicken): Void King captured, Triple Threat 1/3 =====
    await page.click('.bottom-nav [data-tab="pantry"]');
    await page.waitForTimeout(300);
    await rescueByName(page, 'Chicken');
    await page.click('.bottom-nav [data-tab="codex"]');
    await page.waitForTimeout(300);
    prog = await secretProgress(page);
    check('codex: Void King captured after plan + rescue', prog.secretRotten && prog.secretRotten.state === 'captured', JSON.stringify(prog.secretRotten));
    check('codex: Triple Threat shows 1 / 3 rescued today', prog.secretDanger && prog.secretDanger.text === '1 / 3 rescued today', JSON.stringify(prog.secretDanger));
    check('codex: Triple Threat bar is 33%', prog.secretDanger && prog.secretDanger.barWidth === '33%', JSON.stringify(prog.secretDanger));

    // ===== Rescue 2 (Spinach): 2/3, then rescue 3 (Bananas): captured =====
    await page.click('.bottom-nav [data-tab="pantry"]');
    await page.waitForTimeout(300);
    await rescueByName(page, 'Spinach');
    await page.click('.bottom-nav [data-tab="codex"]');
    await page.waitForTimeout(300);
    prog = await secretProgress(page);
    check('codex: Triple Threat shows 2 / 3 rescued today', prog.secretDanger && prog.secretDanger.text === '2 / 3 rescued today', JSON.stringify(prog.secretDanger));
    await page.click('.bottom-nav [data-tab="pantry"]');
    await page.waitForTimeout(300);
    await rescueByName(page, 'Bananas');
    await page.click('.bottom-nav [data-tab="codex"]');
    await page.waitForTimeout(300);
    prog = await secretProgress(page);
    check('codex: Triple Threat captured at 3 rescues', prog.secretDanger && prog.secretDanger.state === 'captured', JSON.stringify(prog.secretDanger));
    const st4 = await storedState(page);
    check('codex: unlocks still persist in storage', st4.secrets.secretDanger === true && st4.secrets.secretRotten === true, JSON.stringify(st4.secrets));

    // ===== No console errors, no overflow (mobile) =====
    check('0 console errors during Phase 24 checks', errors.length === 0, errors.slice(0, 3).join(' ; '));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('0 horizontal overflow (mobile)', overflow <= 0, 'overflow=' + overflow + 'px');
    await page.close();

    // ===== Desktop 1280px: freeze button + codex progress visible =====
    const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const deskErrors = [];
    desk.on('console', (msg) => { if (msg.type() === 'error' && msg.text().indexOf('Failed to load resource') === -1) deskErrors.push(msg.text()); });
    desk.on('pageerror', (err) => deskErrors.push('pageerror: ' + err.message));
    await desk.goto(BASE, { waitUntil: 'networkidle' });
    await desk.waitForTimeout(400);
    // Fresh desktop profile: summon the demo pantry first (no cards yet).
    await desk.click('[data-action="summon-demo"]');
    await desk.waitForTimeout(400);
    const deskFreeze = await desk.evaluate(() => {
      const btn = document.querySelector('.card .btn-freeze');
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { visible: r.width > 0 && r.height > 0, size: Math.round(r.width) + 'x' + Math.round(r.height) };
    });
    const deskDims = deskFreeze ? deskFreeze.size.split('x').map(Number) : [];
    check('desktop: freeze button visible, at least 44x44', deskFreeze && deskFreeze.visible && deskDims.length === 2 && deskDims[0] >= 44 && deskDims[1] >= 44, JSON.stringify(deskFreeze));
    await desk.click('#tab-codex');
    await desk.waitForTimeout(300);
    const deskProg = await secretProgress(desk);
    check('desktop: Triple Threat progress visible (fresh profile)', deskProg.secretDanger && deskProg.secretDanger.text === '0 / 3 rescued today', JSON.stringify(deskProg.secretDanger));
    check('desktop: Void King checklist visible', deskProg.secretRotten && deskProg.secretRotten.text === 'Step 1: Cook Tonight opened ⬜ · Step 2: Rescue after ⬜', JSON.stringify(deskProg.secretRotten));
    const deskOverflow = await desk.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('desktop: 0 horizontal overflow', deskOverflow <= 0, 'overflow=' + deskOverflow + 'px');
    check('desktop: 0 console errors', deskErrors.length === 0, deskErrors.slice(0, 3).join(' ; '));
    await desk.close();
  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n' + results.filter((r) => r.ok).length + '/' + results.length + ' passed');
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Phase 24 test crashed:', err);
  process.exit(1);
});
