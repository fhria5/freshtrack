// FreshTrack Phase 18 Playwright verification: Monster Codex expanded to 8
// (4 regular + 4 secret monsters with hidden unlock conditions).
// Run from the repo root:
//   NODE_PATH=/home/hatch/workspace/shoppal-v2/node_modules node tests/test-codex-secrets.cjs
// Serves the repo on port 8901 itself and stops the server when done.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');

const REPO = '/home/hatch/workspace/freshtrack';
const BASE = 'http://127.0.0.1:8901/';
const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  if (!ok) failures++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

function iso(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

async function addItem(page, name, offsetDays) {
  if ((await page.getAttribute('#add-item-toggle', 'aria-expanded')) === 'false') await page.click('#add-item-toggle');
  await page.fill('#item-name', name);
  await page.fill('#item-expiry', iso(offsetDays));
  await page.click('.btn-submit');
  await page.waitForSelector('.card:has-text("' + name + '")', { timeout: 5000 });
}

async function rescueByName(page, name) {
  await page.locator('.card:has-text("' + name + '") .btn-rescue').first().click();
  await page.waitForTimeout(400);
}

async function codexSecrets(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('freshtrack.codex') || '{}';
    const codex = JSON.parse(raw);
    return codex.secrets || {};
  });
}

async function main() {
  const server = spawn('python3', ['-m', 'http.server', '8901', '--directory', REPO], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  const browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
    args: ['--no-sandbox'],
  });
  try {
    // 0. Mobile audit on a fresh profile.
    const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    mob.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    mob.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
    await mob.goto(BASE, { waitUntil: 'load' });
    await mob.waitForTimeout(600);
    check('mobile 390px: 0 console errors', errors.length === 0, errors.slice(0, 3).join(' ; '));
    const overflow = await mob.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('mobile 390px: 0 horizontal overflow', overflow <= 0, 'overflow=' + overflow + 'px');
    await mob.close();

    // 1. Fresh desktop page, mock the Worker with a real AI recipe.
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
    await page.route('**/freshtrack-ai/api/recipe', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ recipe: { title: 'Moon Noodles', ingredients: ['Bananas'], steps: ['Mash the bananas.', 'Fry until golden.'], timeMinutes: 15 }, source: 'ai' }) });
    });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(400);

    // 2. Codex renders 8 cards; the 4 secrets start hidden as ???.
    const codexState = await page.evaluate(() => ({
      cards: document.querySelectorAll('.codex-card').length,
      secrets: document.querySelectorAll('.codex-card.secret').length,
      hidden: [...document.querySelectorAll('.codex-card.secret .codex-name')].map((e) => e.textContent.trim()),
      sub: (document.querySelector('.codex-section .section-sub') || {}).textContent || '',
    }));
    check('codex has 8 cards', codexState.cards === 8, 'cards=' + codexState.cards);
    check('codex has 4 secret cards', codexState.secrets === 4, 'secrets=' + codexState.secrets);
    check('secrets hidden as ???', codexState.hidden.every((t) => t === '??? Secret Monster'), JSON.stringify(codexState.hidden));
    check('codex sub shows 0 / 8 captured', codexState.sub.includes('0 / 8 captured'), codexState.sub.slice(0, 120));

    // 3. Midnight Watcher: rescue while Night Mode is active.
    let nightOn = await page.evaluate(() => document.body.classList.contains('night-mode'));
    for (let i = 0; i < 3 && !nightOn; i++) {
      await page.click('[data-action="cycle-night"]');
      await page.waitForTimeout(300);
      nightOn = await page.evaluate(() => document.body.classList.contains('night-mode'));
    }
    check('night mode active for Watcher test', nightOn, 'nightOn=' + nightOn);
    await addItem(page, 'Night Milk', 4);
    await rescueByName(page, 'Night Milk');
    check('Midnight Watcher unlocked by night rescue', (await codexSecrets(page)).secretWary === true, JSON.stringify(await codexSecrets(page)));

    // 4. Triple Threat: 3 rescues in one day (Milk was #1).
    await addItem(page, 'Day Bread', 4);
    await rescueByName(page, 'Day Bread');
    check('Triple Threat still locked at 2 rescues today', (await codexSecrets(page)).secretDanger !== true, JSON.stringify(await codexSecrets(page)));
    await addItem(page, 'Day Eggs', 4);
    await rescueByName(page, 'Day Eggs');
    check('Triple Threat unlocked at 3 rescues today', (await codexSecrets(page)).secretDanger === true, JSON.stringify(await codexSecrets(page)));

    // 5. Void King: open a Cook Tonight plan, then rescue an item.
    await addItem(page, 'Tonight Chicken', 1);
    await page.click('[data-action="cook-tonight"]');
    await page.waitForSelector('.modal-tonight', { timeout: 20000 });
    await page.click('.modal-tonight [data-modal-action="close"]');
    await page.waitForTimeout(300);
    await rescueByName(page, 'Tonight Chicken');
    check('Void King unlocked after Cook Tonight plan + rescue', (await codexSecrets(page)).secretRotten === true, JSON.stringify(await codexSecrets(page)));

    // 6. Glimmer Sprout: real AI recipe, then rescue that item.
    await addItem(page, 'AI Bananas', 7);
    await page.locator('.card:has-text("AI Bananas") .btn-ai').first().click();
    await page.waitForSelector('.card:has-text("AI Bananas") .ai-recipe', { timeout: 20000 });
    const aiText = await page.locator('.card:has-text("AI Bananas") .ai-recipe').first().innerText();
    check('mocked AI recipe renders', aiText.includes('Moon Noodles'), aiText.slice(0, 100));
    await rescueByName(page, 'AI Bananas');
    check('Glimmer Sprout unlocked by AI recipe rescue', (await codexSecrets(page)).secretFresh === true, JSON.stringify(await codexSecrets(page)));

    // 7. Rotten regular monster: rescue an already-expired item.
    await addItem(page, 'Old Fish', -1);
    await rescueByName(page, 'Old Fish');
    const finalSub = await page.evaluate(() => (document.querySelector('.codex-section .section-sub') || {}).textContent || '');
    check('codex sub shows 8 / 8 captured', finalSub.includes('8 / 8 captured'), finalSub.slice(0, 120));
    const names = await page.evaluate(() => [...document.querySelectorAll('.codex-card.secret .codex-name')].map((e) => e.textContent.trim()));
    check('all 4 secret names revealed', names.join('|') === 'Glimmer Sprout Secret|Midnight Watcher Secret|Triple Threat Secret|Void King Secret', JSON.stringify(names));

    // 8. Persistence across reload (old saves without secrets still load).
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    const afterReload = await page.evaluate(() => ({
      secrets: JSON.parse(localStorage.getItem('freshtrack.codex') || '{}').secrets || {},
      sub: (document.querySelector('.codex-section .section-sub') || {}).textContent || '',
    }));
    const allKept = ['secretFresh', 'secretWary', 'secretDanger', 'secretRotten'].every((k) => afterReload.secrets[k] === true);
    check('secrets persist after reload', allKept, JSON.stringify(afterReload.secrets));
    check('codex still 8 / 8 after reload', afterReload.sub.includes('8 / 8 captured'), afterReload.sub.slice(0, 120));
    check('desktop: 0 console errors across flow', errors.length === 0, errors.slice(0, 3).join(' ; '));
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
