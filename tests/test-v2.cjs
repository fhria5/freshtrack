// FreshTrack v2 Playwright verification.
// Run from the repo root:
//   NODE_PATH=/home/hatch/workspace/shoppal-v2/node_modules node tests/test-v2.cjs
// Serves the repo on port 8901 itself and stops the server when done.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO = '/home/hatch/workspace/freshtrack';
const BASE = 'http://127.0.0.1:8901/';
const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  if (!ok) failures++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

async function auditViewport(page, label) {
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  check(label + ': 0 console errors', errors.length === 0, errors.slice(0, 3).join(' ; '));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(label + ': 0 horizontal overflow', overflow <= 0, 'overflow=' + overflow + 'px');
  const small = await page.evaluate(() => {
    const bad = [];
    const els = document.querySelectorAll('button, input, select, textarea, a[href]');
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 && r.height === 0) continue;
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (r.width < 44 || r.height < 44) bad.push((el.tagName + '.' + (el.className.baseVal !== undefined ? '' : el.className) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)).slice(0, 80));
    }
    return bad;
  });
  check(label + ': 0 targets under 44px', small.length === 0, small.slice(0, 5).join(' ; '));
  return errors;
}

async function main() {
  const server = spawn('python3', ['-m', 'http.server', '8901', '--directory', REPO], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  const browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
    args: ['--no-sandbox'],
  });
  try {
    // 1. Viewport audits (fresh profile, no seeded data).
    const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await auditViewport(mob, 'mobile 390px');
    await mob.close();
    const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await auditViewport(desk, 'desktop 1280px');

    // 2. Recipe bank + filter chips + AI fallback + Cook Tonight + rescue/streak/codex/night/photo.
    const page = desk;
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(400);

    const bank = await page.evaluate(() => {
      if (typeof RECIPES === 'undefined') return { length: -1, cats: [] };
      const cats = {};
      for (const r of RECIPES) cats[r.category] = (cats[r.category] || 0) + 1;
      return { length: RECIPES.length, cats };
    });
    check('recipe bank has 25 recipes', bank.length === 25, JSON.stringify(bank));

    // Mock the Worker with the real 503 response (deterministic even if the
    // sandbox browser cannot reach the live Worker).
    await page.route('**/freshtrack-ai/api/recipe', (route) => {
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'ai_unavailable' }) });
    });

    // Can the real browser reach the live Worker at all? (informational)
    const liveReach = await page.evaluate(async () => {
      try {
        const resp = await fetch('https://grokingstore.my.id/freshtrack-ai/api/health');
        return { reachable: true, status: resp.status, body: await resp.text() };
      } catch (e) { return { reachable: false, error: String(e).slice(0, 80) }; }
    });
    console.log('INFO | live Worker reachable from browser: ' + JSON.stringify(liveReach));

    // Summon demo pantry (danger Bananas + rotten Chicken per spec).
    await page.click('[data-action="summon-demo"]');
    await page.waitForTimeout(500);
    const counts = await page.evaluate(() => ({
      cards: document.querySelectorAll('.card').length,
      danger: document.querySelectorAll('.card[data-urgency="danger"]').length,
      rotten: document.querySelectorAll('.card[data-urgency="rotten"]').length,
    }));
    check('demo pantry summoned', counts.cards >= 4, JSON.stringify(counts));

    // Cook Tonight enabled with urgent items.
    const tonightDisabled = await page.evaluate(() => {
      const btn = document.querySelector('[data-action="cook-tonight"]');
      return btn ? btn.disabled : null;
    });
    check('Cook Tonight enabled with urgent items', tonightDisabled === false, 'disabled=' + tonightDisabled);

    // AI Recipe on a danger card: mocked 503 must produce the fallback note
    // and rule-based recipes, never raw error text.
    const aiBtn = page.locator('.card[data-urgency="danger"] .btn-ai').first();
    await aiBtn.click();
    await page.waitForSelector('.card[data-urgency="danger"] .ai-fallback-note', { timeout: 20000 });
    const aiSectionText = await page.locator('.card[data-urgency="danger"] .ai-section').first().innerText();
    check('AI Recipe fallback note shown', aiSectionText.includes('AI is resting. Showing pantry recipes instead.'), aiSectionText.slice(0, 120));
    const rawLeak = /ai_unavailable|ai_failed|503|500|TypeError|ReferenceError|stack trace/i.test(aiSectionText);
    check('AI fallback shows no raw error text', !rawLeak, aiSectionText.slice(0, 120));
    const fallbackEntries = await page.locator('.card[data-urgency="danger"] .ai-fallback-list .recipe-entry').count();
    check('AI fallback lists rule-based recipes', fallbackEntries >= 1, 'entries=' + fallbackEntries);

    // Re-click AI Recipe on the same card: fallback state allows retry.
    await page.locator('.card[data-urgency="danger"] .ai-toggle').first().click();
    await page.waitForTimeout(300);
    const noteStill = await page.locator('.card[data-urgency="danger"] .ai-fallback-note').count();
    check('AI Recipe retry keeps fallback (no crash)', noteStill >= 1, 'notes=' + noteStill);

    // Filter chips: open Rescue Recipes on the danger card, filter Breakfast.
    await page.locator('.card[data-urgency="danger"] .rescue-toggle').first().click();
    await page.waitForTimeout(300);
    const chips = await page.locator('.card[data-urgency="danger"] .filter-chip').count();
    check('5 filter chips rendered', chips === 5, 'chips=' + chips);
    await page.locator('.card[data-urgency="danger"] .filter-chip[data-filter="Breakfast"]').first().click();
    await page.waitForTimeout(300);
    const chipState = await page.evaluate(() => {
      const active = document.querySelector('.card[data-urgency="danger"] .filter-chip[data-filter="Breakfast"]');
      const names = [...document.querySelectorAll('.card[data-urgency="danger"] .recipe-list .recipe-name')].map((b) => b.textContent.trim());
      return { pressed: active ? active.getAttribute('aria-pressed') : null, names };
    });
    check('Breakfast chip aria-pressed true', chipState.pressed === 'true', JSON.stringify(chipState));
    const breakfastOk = await page.evaluate(() => {
      const names = [...document.querySelectorAll('.card[data-urgency="danger"] .recipe-list .recipe-name')].map((b) => b.textContent.trim());
      return names.every((n) => RECIPES.find((r) => r.name === n && r.category === 'Breakfast'));
    });
    check('Breakfast filter shows only Breakfast recipes', breakfastOk, JSON.stringify(chipState.names));
    await page.locator('.card[data-urgency="danger"] .filter-chip[data-filter="All"]').first().click();
    await page.waitForTimeout(300);

    // Cook Tonight modal (mocked 503 -> rule-based plan).
    await page.click('[data-action="cook-tonight"]');
    await page.waitForSelector('.modal-tonight', { timeout: 20000 });
    const modalText = await page.locator('.modal-tonight').innerText();
    check('Cook Tonight modal opens', modalText.includes("Tonight"), modalText.slice(0, 100));
    check('Cook Tonight fallback note in modal', modalText.includes('AI is resting. Showing pantry recipes instead.'), modalText.slice(0, 140));
    check('Cook Tonight modal lists used items', /Uses:/.test(modalText), modalText.slice(0, 140));
    await page.click('.modal-tonight [data-modal-action="close"]');
    await page.waitForTimeout(300);
    const modalGone = await page.locator('.modal-tonight').count();
    check('Cook Tonight modal closes', modalGone === 0, 'remaining=' + modalGone);

    // Rescue: souls + Codex XP + streak.
    const before = await page.evaluate(() => ({
      codex: JSON.parse(localStorage.getItem('freshtrack.codex') || '{}'),
      streak: JSON.parse(localStorage.getItem('freshtrack.streak') || '{}'),
    }));
    await page.locator('.card[data-urgency="danger"] .btn-rescue').first().click();
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({
      codex: JSON.parse(localStorage.getItem('freshtrack.codex') || '{}'),
      streak: JSON.parse(localStorage.getItem('freshtrack.streak') || '{}'),
      souls: localStorage.getItem('freshtrack.soulsSaved'),
    }));
    const dangerBefore = (before.codex.danger && before.codex.danger.count) || 0;
    const dangerAfter = (after.codex.danger && after.codex.danger.count) || 0;
    check('rescue grants Codex XP', dangerAfter === dangerBefore + 1, 'danger count ' + dangerBefore + ' -> ' + dangerAfter);
    check('rescue starts streak', (after.streak.count || 0) >= 1, JSON.stringify(after.streak));
    check('rescue increments souls saved', Number(after.souls) >= 1, 'souls=' + after.souls);

    // Night mode toggle. The sandbox browser runs on UTC, so at this hour
    // auto mode is already night; cycle twice (auto -> on -> off) to see
    // the class flip off.
    const nightBefore = await page.evaluate(() => document.body.classList.contains('night-mode'));
    await page.click('[data-action="cycle-night"]');
    await page.click('[data-action="cycle-night"]');
    await page.waitForTimeout(300);
    const nightAfter = await page.evaluate(() => document.body.classList.contains('night-mode'));
    check('night mode toggles', nightBefore !== nightAfter, 'before=' + nightBefore + ' after=' + nightAfter);

    // Photo: attach a tiny PNG to the form input, add an item, check the photo renders.
    const pngPath = path.join(REPO, 'tests', 'tiny.png');
    if (!fs.existsSync(pngPath)) {
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      fs.writeFileSync(pngPath, Buffer.from(b64, 'base64'));
    }
    await page.fill('#item-name', 'Test Milk');
    await page.fill('#item-expiry', new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    await page.setInputFiles('#item-photo', pngPath);
    await page.waitForTimeout(400);
    await page.click('.btn-submit');
    await page.waitForTimeout(600);
    const photoShown = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.card')];
      const card = cards.find((c) => c.textContent.includes('Test Milk'));
      return card ? !!card.querySelector('img.item-photo') : false;
    });
    check('photo item renders with image', photoShown, '');

    // Final console error sweep on this page.
    const finalErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') finalErrors.push(msg.text()); });
    await page.waitForTimeout(500);
    check('flow page: 0 console errors', finalErrors.length === 0, finalErrors.slice(0, 3).join(' ; '));
  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n==== SUMMARY ====');
  console.log('passed: ' + results.filter((r) => r.ok).length + '/' + results.length);
  if (failures > 0) {
    console.log('FAILED CHECKS:');
    for (const r of results.filter((r) => !r.ok)) console.log(' - ' + r.name + ' | ' + r.detail);
    process.exit(1);
  }
  console.log('ALL CHECKS PASSED');
}

main().catch((e) => { console.error('TEST RUNNER ERROR:', e); process.exit(2); });
