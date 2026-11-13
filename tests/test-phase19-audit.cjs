// FreshTrack Phase 19 - polish audit.
// Run from the repo root:
//   NODE_PATH=/home/hatch/workspace/shoppal-v2/node_modules node tests/test-phase19-audit.cjs
// Serves the repo on port 8902 itself and stops the server when done.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');

const REPO = '/home/hatch/workspace/freshtrack';
const BASE = 'http://127.0.0.1:8902/';
const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  if (!ok) failures++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function auditViewport(page, label) {
  const errors = [];
  const onErr = (msg) => { if (msg.type() === 'error') errors.push(msg.text()); };
  page.on('console', onErr);
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
      if (r.width < 44 || r.height < 44) bad.push((el.tagName + '.' + (typeof el.className === 'string' ? el.className : '') + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)).slice(0, 90));
    }
    return bad;
  });
  check(label + ': 0 targets under 44px', small.length === 0, small.slice(0, 5).join(' ; '));
  page.off('console', onErr);
  return errors;
}

// WCAG contrast of the listed text elements against their effective background.
async function contrastAudit(page) {
  const rows = await page.evaluate(() => {
    function lum(r, g, b) {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    }
    function parseRGB(s) {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((x) => parseFloat(x));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    function effBg(el) {
      let node = el;
      while (node) {
        const bg = parseRGB(getComputedStyle(node).backgroundColor);
        if (bg && bg.a > 0) {
          // composite translucent bg over the page background
          const base = { r: 13, g: 10, b: 20 };
          const r = Math.round(bg.r * bg.a + base.r * (1 - bg.a));
          const g = Math.round(bg.g * bg.a + base.g * (1 - bg.a));
          const b = Math.round(bg.b * bg.a + base.b * (1 - bg.a));
          return { r, g, b };
        }
        node = node.parentElement;
      }
      return { r: 13, g: 10, b: 20 };
    }
    const targets = [
      ['.badge-danger', 'badge Danger text'],
      ['.urgency-danger', 'urgency Danger label'],
      ['.badge-rotten', 'badge Rotten text'],
      ['.urgency-rotten', 'urgency Rotten label'],
      ['.category', 'category label'],
      ['.field-hint', 'photo field hint'],
      ['.section-sub', 'section subtitle'],
      ['.xp-text', 'codex XP text'],
      ['.codex-lore', 'codex lore'],
      ['.impact-label', 'impact label'],
      ['.footer', 'footer text'],
      ['.no-recipes', 'no-recipes text'],
      ['.stat-label', 'stat label'],
    ];
    // The no-recipes line only renders inside an opened rescue list; if no
    // card shows one right now, probe the class inside a recipe list so its
    // real colors are still measured (removed by the next page load).
    if (!document.querySelector('.no-recipes')) {
      const list = document.querySelector('.recipe-list');
      if (list) list.insertAdjacentHTML('beforeend', '<p class="no-recipes" data-probe="1">probe</p>');
    }
    const out = [];
    for (const [sel, label] of targets) {
      const el = document.querySelector(sel);
      if (!el) { out.push({ label, ratio: null, note: 'missing' }); continue; }
      const cs = getComputedStyle(el);
      const fg = parseRGB(cs.color);
      const bg = effBg(el);
      const l1 = lum(fg.r, fg.g, fg.b);
      const l2 = lum(bg.r, bg.g, bg.b);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      out.push({ label, ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5, size, bold });
    }
    return out;
  });
  for (const r of rows) {
    if (r.ratio === null) { check('contrast ' + r.label, false, r.note || ''); continue; }
    check('contrast ' + r.label + ' >= ' + r.need + ':1', r.ratio >= r.need, r.ratio + ':1 (need ' + r.need + ':1, ' + r.size + 'px' + (r.bold ? ' bold' : '') + ')');
  }
}

async function main() {
  const server = spawn('python3', ['-m', 'http.server', '8902', '--directory', REPO], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  const browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
    args: ['--no-sandbox'],
  });
  try {
    // 1. Viewport audits on a fresh profile.
    const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await auditViewport(mob, 'mobile 390px');
    await mob.close();
    const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await auditViewport(desk, 'desktop 1280px');
    const tiny = await browser.newPage({ viewport: { width: 320, height: 700 } });
    await auditViewport(tiny, 'tiny 320px');
    await tiny.close();

    const page = desk;
    const errors = [];
    const pageErrs = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => { errors.push('pageerror: ' + err.message); pageErrs.push(err.message); });

    // 2. Contrast audit with demo pantry loaded (badges/labels visible).
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.click('[data-action="summon-demo"]');
    await page.waitForTimeout(500);
    // Open a rescue list so the .no-recipes probe inside contrastAudit has a home.
    await page.locator('.card[data-urgency="danger"] .rescue-toggle').first().click();
    await page.waitForTimeout(300);
    await contrastAudit(page);

    // 3. Form validation: empty submit shows errors, adds nothing.
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.click('.btn-submit');
    await page.waitForTimeout(300);
    const val = await page.evaluate(() => ({
      nameErr: (document.getElementById('error-name') || {}).textContent || '',
      dateErr: (document.getElementById('error-expiry') || {}).textContent || '',
      cards: document.querySelectorAll('.card').length,
      nameInvalid: document.getElementById('item-name').getAttribute('aria-invalid'),
    }));
    check('empty submit shows name+date errors', val.nameErr.length > 0 && val.dateErr.length > 0, JSON.stringify(val));
    check('empty submit adds no item', val.cards === 0, 'cards=' + val.cards);
    check('invalid input flagged aria-invalid', val.nameInvalid === 'true', 'aria-invalid=' + val.nameInvalid);
    // Fix the errors: fill and submit, errors clear.
    await page.fill('#item-name', 'Milk');
    await page.fill('#item-expiry', daysFromNow(3));
    await page.click('.btn-submit');
    await page.waitForTimeout(400);
    const afterValid = await page.evaluate(() => ({
      cards: document.querySelectorAll('.card').length,
      nameErr: (document.getElementById('error-name') || {}).textContent || '',
    }));
    check('valid submit adds item and clears errors', afterValid.cards === 1 && afterValid.nameErr === '', JSON.stringify(afterValid));

    // 4. Delete modal: Escape closes, focus returns to the delete button.
    await page.locator('.card .btn-delete').first().click();
    await page.waitForTimeout(300);
    check('delete modal opens', (await page.locator('.modal-overlay').count()) === 1, '');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const modalGone = await page.evaluate(() => ({
      overlay: document.querySelectorAll('.modal-overlay').length,
      focused: document.activeElement && document.activeElement.className,
      cards: document.querySelectorAll('.card').length,
    }));
    check('Escape closes delete modal, item kept', modalGone.overlay === 0 && modalGone.cards === 1, JSON.stringify(modalGone));
    check('focus returns to delete button', typeof modalGone.focused === 'string' && modalGone.focused.includes('btn-delete'), 'focused=' + modalGone.focused);

    // 5. Malformed localStorage: garbage items/history/codex, old boolean codex, codex without secrets.
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('freshtrack.items', 'not-json{{{');
      localStorage.setItem('freshtrack.history', '{"bad":');
      localStorage.setItem('freshtrack.codex', JSON.stringify({ fresh: true, wary: false, danger: true, rotten: false }));
      localStorage.setItem('freshtrack.soulsSaved', 'abc');
      localStorage.setItem('freshtrack.streak', 'oops');
    });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const malformed = await page.evaluate(() => ({
      cards: document.querySelectorAll('.card').length,
      emptyState: document.querySelectorAll('.empty-state').length,
      codexText: (document.querySelector('.codex-section') || {}).textContent || '',
      secrets: document.querySelectorAll('.codex-card.secret').length,
    }));
    check('garbage items JSON loads to empty state', malformed.cards === 0 && malformed.emptyState === 1, JSON.stringify(malformed));
    check('old boolean codex migrates (2 captured)', /2 \/ 8 captured/.test(malformed.codexText), malformed.codexText.slice(0, 120));
    check('codex without secrets loads 4 locked secrets', malformed.secrets === 4, 'secrets=' + malformed.secrets);
    check('malformed storage: 0 new console errors', errors.length === 0, errors.slice(0, 3).join(' ; '));

    // 6. Malformed date item + very long name: no crash, no overflow.
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('freshtrack.items', JSON.stringify([
        { id: 'x1', name: 'Mystery Item', category: 'other', expiryDate: 'not-a-date' },
        { id: 'x2', name: 'A'.repeat(120) + ' Very Long Item Name That Keeps Going And Going And Going', category: 'produce', expiryDate: '2026-11-14' },
        { id: 'x3', name: '', category: 'dairy', expiryDate: '2026-11-20' },
      ]));
    });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const edge = await page.evaluate(() => ({
      cards: document.querySelectorAll('.card').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      warnText: [...document.querySelectorAll('.badge')].map((b) => b.textContent).join('|'),
      bodyText: document.body.innerText.slice(0, 400),
    }));
    check('malformed + long-name items render (3 cards)', edge.cards === 3, 'cards=' + edge.cards);
    check('long name causes no horizontal overflow', edge.overflow <= 0, 'overflow=' + edge.overflow + 'px');
    check('malformed date shows warning badge', /Check expiry date/.test(edge.warnText), edge.warnText.slice(0, 120));
    check('malformed items: 0 console errors', errors.length === 0, errors.slice(0, 3).join(' ; '));

    // 7. Stored photo XSS: crafted photo string must not inject attributes/handlers.
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('freshtrack.items', JSON.stringify([
        { id: 'p1', name: 'Evil Milk', category: 'dairy', expiryDate: '2026-11-20', photo: 'x" onerror="window.__xss=1' },
      ]));
    });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const xss = await page.evaluate(() => ({
      xssFlag: window.__xss === 1,
      onerrorAttrs: document.querySelectorAll('[onerror]').length,
      imgSrc: (document.querySelector('img.item-photo') || {}).getAttribute ? document.querySelector('img.item-photo').getAttribute('src') : null,
      monsterShown: document.querySelectorAll('.card .monster').length,
    }));
    check('crafted photo string does not execute', xss.xssFlag === false, JSON.stringify(xss));
    check('crafted photo string injects no onerror attr', xss.onerrorAttrs === 0, 'onerror=' + xss.onerrorAttrs);
    check('rejected photo falls back to monster icon', xss.imgSrc === null && xss.monsterShown >= 1, JSON.stringify(xss));

    // 8. AI failure modes: 500 + timeout both fall back silently.
    await page.route('**/freshtrack-ai/api/recipe', (route) => {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
    });
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('freshtrack.items', JSON.stringify([
        { id: 'a1', name: 'Bananas', category: 'produce', expiryDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
      ]));
    });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.locator('.card .btn-ai').first().click();
    await page.waitForSelector('.ai-fallback-note', { timeout: 20000 });
    const ai500 = await page.locator('.ai-section').first().innerText();
    check('AI 500 falls back cleanly', ai500.includes('AI is resting'), ai500.slice(0, 100));
    check('AI 500 leaks no raw error', !/boom|500|TypeError|ReferenceError/.test(ai500), ai500.slice(0, 100));
    await page.unroute('**/freshtrack-ai/api/recipe');
    await page.route('**/freshtrack-ai/api/recipe', (route) => {
      // Answer after 25s, past the app's 15s timeout. The request is aborted
      // by then and the route may be unrouted, so swallow fulfill errors.
      setTimeout(() => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }).catch(() => {}), 25000);
    });
    await page.evaluate(() => {
      // reset fallback state by reloading with a fresh item name
      localStorage.setItem('freshtrack.items', JSON.stringify([
        { id: 'a2', name: 'Spinach', category: 'produce', expiryDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
      ]));
    });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.locator('.card .btn-ai').first().click();
    await page.waitForSelector('.ai-fallback-note', { timeout: 25000 });
    const aiTimeout = await page.locator('.ai-section').first().innerText();
    check('AI timeout (15s) falls back cleanly', aiTimeout.includes('AI is resting'), aiTimeout.slice(0, 100));
    await page.unroute('**/freshtrack-ai/api/recipe');
    // The browser itself logs a failed fetch as a console error when the
    // mocked Worker answers 500 or never answers; that is Chrome's network
    // log, not an app fault. What must stay clean is uncaught JS errors.
    check('AI failure phases: 0 uncaught page errors', pageErrs.length === 0, pageErrs.slice(0, 3).join(' ; '));
    errors.length = 0; // re-scope the console sweep to the phases below

    // 9. Cook Tonight disabled with no urgent items.
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('freshtrack.items', JSON.stringify([
        { id: 'f1', name: 'Rice', category: 'pantry', expiryDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10) },
      ]));
    });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const tonightState = await page.evaluate(() => {
      const btn = document.querySelector('[data-action="cook-tonight"]');
      return { disabled: btn.disabled, title: btn.getAttribute('title') };
    });
    check('Cook Tonight disabled with no urgent items', tonightState.disabled === true, JSON.stringify(tonightState));

    // 10. Streak gap resets to 1; same-day rescue does not inflate.
    await page.evaluate(() => {
      localStorage.clear();
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
      localStorage.setItem('freshtrack.streak', JSON.stringify({ count: 5, lastDate: threeDaysAgo }));
      localStorage.setItem('freshtrack.items', JSON.stringify([
        { id: 's1', name: 'Bananas', category: 'produce', expiryDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
      ]));
    });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.locator('.card .btn-rescue').first().click();
    await page.waitForTimeout(400);
    const streak = await page.evaluate(() => JSON.parse(localStorage.getItem('freshtrack.streak') || '{}'));
    check('streak gap resets to 1 (was 5)', streak.count === 1, JSON.stringify(streak));

    // 11. Filter empty state: danger item whose recipes are all Dinner, filter Breakfast.
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('freshtrack.items', JSON.stringify([
        { id: 'd1', name: 'Chicken', category: 'meat', expiryDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
      ]));
    });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.locator('.card .rescue-toggle').first().click();
    await page.waitForTimeout(300);
    await page.locator('.card .filter-chip[data-filter="Breakfast"]').first().click();
    await page.waitForTimeout(300);
    const filterEmpty = await page.locator('.card .recipe-list').first().innerText();
    check('empty filter shows guidance text', filterEmpty.includes('No recipes in this category for this item. Try another filter.'), filterEmpty.slice(0, 120));

    // 12. Share card + weekly recap draw without console errors (download fallback in headless).
    // Scoped to the controls strip: the Share tab has a second pair of the
    // same buttons, so the bare selector would match twice (Phase 21).
    const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await page.click('.controls-strip [data-action="share-card"]');
    const download = await dl;
    check('Share Card produces a download', download !== null, download ? await download.suggestedFilename() : 'no download event');
    const dl2 = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await page.click('.controls-strip [data-action="share-weekly"]');
    const download2 = await dl2;
    check('Weekly Recap produces a download', download2 !== null, download2 ? await download2.suggestedFilename() : 'no download event');
    check('share flows: 0 console errors', errors.length === 0, errors.slice(0, 3).join(' ; '));

    // 13. AI cache hit still arms the Glimmer Sprout secret: a second item
    // with the same name shows the cached AI recipe, and rescuing it must
    // capture the secret just like a fresh AI fetch would.
    await page.route('**/freshtrack-ai/api/recipe', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ recipe: { title: 'Banana Rescue Bread', ingredients: ['bananas', 'flour'], steps: ['Mash.', 'Bake.'], timeMinutes: 30 }, source: 'ai' }) });
    });
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('freshtrack.items', JSON.stringify([
        { id: 'g1', name: 'Bananas', category: 'produce', expiryDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
      ]));
    });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.locator('.card .btn-ai').first().click();
    await page.waitForSelector('.card .ai-recipe', { timeout: 20000 });
    // Add a second same-named item via the form, in the SAME page session:
    // the AI cache lives in memory only, so a reload would wipe it.
    await page.fill('#item-name', 'Bananas');
    await page.fill('#item-expiry', new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    await page.click('.btn-submit');
    await page.waitForTimeout(500);
    const secondCardAi = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.card')];
      return cards.filter((c) => c.querySelector('.ai-toggle')).length;
    });
    check('second same-named item shows cached AI recipe', secondCardAi >= 2, 'cards with AI toggle=' + secondCardAi);
    // The cached recipe is already open on both cards (aiOpen stayed true
    // from the fetch). Rescue the SECOND card: the secret must unlock even
    // though this item never fetched the AI recipe itself.
    const secondHasRecipe = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.card')];
      return cards[1] ? !!cards[1].querySelector('.ai-recipe') : false;
    });
    check('cached recipe opens on second card', secondHasRecipe === true, '');
    await page.locator('.card .btn-rescue').nth(1).click();
    await page.waitForTimeout(400);
    const secret = await page.evaluate(() => {
      const codex = JSON.parse(localStorage.getItem('freshtrack.codex') || '{}');
      return codex.secrets || {};
    });
    check('rescuing cached-AI item captures Glimmer Sprout', secret.secretFresh === true, JSON.stringify(secret));
    await page.unroute('**/freshtrack-ai/api/recipe');
    errors.length = 0; // mock 200 leaves no errors, but keep sweeps scoped

    // 14. Skip link becomes visible on focus and jumps to pantry.
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300); // let the 0.15s slide-in transition finish
    const skip = await page.evaluate(() => {
      const el = document.querySelector('.skip-link');
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), focused: document.activeElement === el };
    });
    check('skip link focuses first and becomes visible', skip.focused === true && skip.top >= 0, JSON.stringify(skip));

    // 15. Final console error sweep.
    await page.waitForTimeout(500);
    check('final sweep: 0 console errors', errors.length === 0, errors.slice(0, 3).join(' ; '));
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
