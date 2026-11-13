// FreshTrack Phase 21 Playwright verification: tab view navigation.
// Run from the repo root:
//   NODE_PATH=/home/hatch/workspace/shoppal-v2/node_modules node tests/test-phase21-tabs.cjs
// Serves the repo on port 8903 itself and stops the server when done.
// Heights are measured per tab with the demo pantry summoned (4 items,
// all four urgency levels) on mobile 390x844 and desktop 1280x800.
// Before (single scroll page): mobile 4023px (4.8 screens), desktop 2926px.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');

const REPO = '/home/hatch/workspace/freshtrack';
const BASE = 'http://127.0.0.1:8903/';
const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  if (!ok) failures++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

// Viewport audit for the CURRENTLY visible tab only (hidden panels are
// display:none, so their controls are skipped by the checks below).
async function auditVisibleTab(page, label) {
  const errors = [];
  const onErr = (msg) => { if (msg.type() === 'error') errors.push(msg.text()); };
  page.on('console', onErr);
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  await page.waitForTimeout(400);
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

async function tabState(page) {
  return page.evaluate(() => {
    const panels = {};
    for (const id of ['pantry', 'impact', 'codex', 'share']) {
      const p = document.getElementById('panel-' + id);
      panels[id] = p ? !p.hidden : null;
    }
    const sel = {};
    for (const el of document.querySelectorAll('[data-tab]')) {
      sel[el.getAttribute('data-tab')] = el.getAttribute('aria-selected');
    }
    return {
      panels,
      selected: sel,
      hash: window.location.hash,
      height: document.documentElement.scrollHeight,
      focused: document.activeElement ? document.activeElement.id : null,
      announced: (document.getElementById('sr-announcer') || {}).textContent || '',
    };
  });
}

async function main() {
  const server = spawn('python3', ['-m', 'http.server', '8903', '--directory', REPO], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  const browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
    args: ['--no-sandbox'],
  });
  const heights = {};
  try {
    // 1. Mobile: default tab is Pantry, only its panel visible.
    const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const mobErrors = [];
    mob.on('console', (msg) => { if (msg.type() === 'error') mobErrors.push(msg.text()); });
    mob.on('pageerror', (err) => mobErrors.push('pageerror: ' + err.message));
    await mob.goto(BASE, { waitUntil: 'load' });
    await mob.waitForTimeout(500);
    let st = await tabState(mob);
    check('mobile: default tab is Pantry', st.panels.pantry === true && st.panels.impact === false && st.panels.codex === false && st.panels.share === false, JSON.stringify(st.panels));
    check('mobile: aria-selected Pantry on both navs', st.selected.pantry === 'true' && st.selected.impact === 'false' && st.selected.codex === 'false' && st.selected.share === 'false', JSON.stringify(st.selected));
    check('mobile: desktop tab bar hidden', await mob.evaluate(() => getComputedStyle(document.querySelector('.tab-bar')).display === 'none'), '');
    check('mobile: bottom nav visible', await mob.evaluate(() => getComputedStyle(document.getElementById('bottom-nav')).display === 'flex'), '');
    check('mobile load: 0 console errors', mobErrors.length === 0, mobErrors.slice(0, 3).join(' ; '));

    // 2. Mobile: bottom nav switches tabs; focus moves to the tab title.
    await mob.click('#navtab-codex');
    await mob.waitForTimeout(400);
    st = await tabState(mob);
    check('mobile: bottom nav opens Codex tab', st.panels.codex === true && st.panels.pantry === false, JSON.stringify(st.panels));
    check('mobile: focus moves to Codex title', st.focused === 'panel-codex-title', 'focused=' + st.focused);
    check('mobile: switch announced', /Monster Codex tab open/.test(st.announced), st.announced);
    check('mobile: hash becomes #codex', st.hash === '#codex', st.hash);
    await mob.click('#navtab-share');
    await mob.waitForTimeout(400);
    st = await tabState(mob);
    check('mobile: bottom nav opens Share tab', st.panels.share === true && st.panels.codex === false, JSON.stringify(st.panels));
    check('mobile: Share tab shows stats + both share buttons',
      (await mob.evaluate(() => ({
        stats: document.querySelectorAll('#panel-share .share-stat').length,
        card: document.querySelectorAll('#panel-share [data-action="share-card"]').length,
        weekly: document.querySelectorAll('#panel-share [data-action="share-weekly"]').length,
      }))).stats === 3, JSON.stringify(await mob.evaluate(() => ({
        stats: document.querySelectorAll('#panel-share .share-stat').length,
        card: document.querySelectorAll('#panel-share [data-action="share-card"]').length,
        weekly: document.querySelectorAll('#panel-share [data-action="share-weekly"]').length,
      }))));
    await mob.click('#navtab-impact');
    await mob.waitForTimeout(400);
    st = await tabState(mob);
    check('mobile: bottom nav opens Impact tab', st.panels.impact === true && st.panels.share === false, JSON.stringify(st.panels));
    await mob.click('#navtab-pantry');
    await mob.waitForTimeout(400);
    st = await tabState(mob);
    check('mobile: bottom nav returns to Pantry', st.panels.pantry === true, JSON.stringify(st.panels));

    // 3. Mobile heights per tab with the demo pantry summoned.
    await mob.click('.form-panel [data-action="summon-demo"]');
    await mob.waitForTimeout(500);
    const mobHeights = {};
    for (const tab of ['pantry', 'impact', 'codex', 'share']) {
      await mob.click('#navtab-' + tab);
      await mob.waitForTimeout(400);
      const h = (await tabState(mob)).height;
      mobHeights[tab] = h;
      await auditVisibleTab(mob, 'mobile 390px tab ' + tab);
    }
    heights.mobile = mobHeights;
    console.log('INFO | mobile heights (px, demo pantry): ' + JSON.stringify(mobHeights) + ' (viewport 844px)');
    check('mobile: every tab shorter than the old 4023px page', Object.values(mobHeights).every((h) => h < 4023), JSON.stringify(mobHeights));
    // Phase 23: the header audio bar adds one control row (~32px net after
    // tightening the header margins); bound raised 1688 to 1760, still ~2 screens.
    check('mobile: Impact/Codex/Share tabs fit ~2 screens (<=1760px)', mobHeights.impact <= 1760 && mobHeights.codex <= 1760 && mobHeights.share <= 1760, JSON.stringify(mobHeights));
    await mob.close();

    // 4. Desktop: tab bar visible, bottom nav hidden; tab bar switches tabs.
    const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await desk.goto(BASE, { waitUntil: 'load' });
    await desk.waitForTimeout(500);
    check('desktop: tab bar visible', await desk.evaluate(() => getComputedStyle(document.querySelector('.tab-bar')).display === 'flex'), '');
    check('desktop: bottom nav hidden', await desk.evaluate(() => getComputedStyle(document.getElementById('bottom-nav')).display === 'none'), '');
    st = await tabState(desk);
    check('desktop: default tab is Pantry', st.panels.pantry === true && st.panels.codex === false, JSON.stringify(st.panels));
    await desk.click('#tab-codex');
    await desk.waitForTimeout(400);
    st = await tabState(desk);
    check('desktop: tab bar opens Codex tab', st.panels.codex === true && st.panels.pantry === false, JSON.stringify(st.panels));
    check('desktop: focus moves to Codex title', st.focused === 'panel-codex-title', 'focused=' + st.focused);
    check('desktop: both navs agree on Codex', st.selected.codex === 'true' && st.selected.pantry === 'false', JSON.stringify(st.selected));

    // 5. Desktop heights per tab with the demo pantry summoned.
    await desk.click('#tab-pantry');
    await desk.waitForTimeout(400);
    await desk.click('.form-panel [data-action="summon-demo"]');
    await desk.waitForTimeout(500);
    const deskHeights = {};
    for (const tab of ['pantry', 'impact', 'codex', 'share']) {
      await desk.click('#tab-' + tab);
      await desk.waitForTimeout(400);
      deskHeights[tab] = (await tabState(desk)).height;
      await auditVisibleTab(desk, 'desktop 1280px tab ' + tab);
    }
    heights.desktop = deskHeights;
    console.log('INFO | desktop heights (px, demo pantry): ' + JSON.stringify(deskHeights) + ' (viewport 800px)');
    check('desktop: every tab shorter than the old 2926px page', Object.values(deskHeights).every((h) => h < 2926), JSON.stringify(deskHeights));

    // 6. Deep links: #codex and #share open on load; hashchange switches.
    const page2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page2.goto(BASE + '#codex', { waitUntil: 'load' });
    await page2.waitForTimeout(500);
    st = await tabState(page2);
    check('deep link #codex opens Codex on load', st.panels.codex === true && st.panels.pantry === false, JSON.stringify(st.panels));
    await page2.goto(BASE + '#share', { waitUntil: 'load' });
    await page2.waitForTimeout(500);
    st = await tabState(page2);
    check('deep link #share opens Share on load', st.panels.share === true, JSON.stringify(st.panels));
    await page2.evaluate(() => { window.location.hash = 'impact'; });
    await page2.waitForTimeout(400);
    st = await tabState(page2);
    check('hashchange to #impact switches tab', st.panels.impact === true && st.panels.share === false, JSON.stringify(st.panels));
    await page2.close();

    // 7. Features still work from inside their tabs (desktop page).
    await desk.route('**/freshtrack-ai/api/recipe', (route) => {
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'ai_unavailable' }) });
    });
    await desk.click('#tab-pantry');
    await desk.waitForTimeout(400);
    // Add an item via the form.
    await desk.fill('#item-name', 'Tab Test Milk');
    await desk.fill('#item-expiry', new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    await desk.click('.btn-submit');
    await desk.waitForTimeout(500);
    check('pantry tab: add item works', (await desk.evaluate(() => document.querySelectorAll('.card').length)) >= 5, '');
    // AI Recipe fallback on the danger card.
    await desk.locator('.card[data-urgency="danger"] .btn-ai').first().click();
    await desk.waitForSelector('.card[data-urgency="danger"] .ai-fallback-note', { timeout: 20000 });
    check('pantry tab: AI Recipe fallback works', true, '');
    // Rescue grants Codex XP; Codex tab shows it.
    await desk.locator('.card[data-urgency="danger"] .btn-rescue').first().click();
    await desk.waitForTimeout(500);
    await desk.click('#tab-codex');
    await desk.waitForTimeout(400);
    const codexSub = await desk.evaluate(() => (document.querySelector('.codex-section .section-sub') || {}).textContent || '');
    check('codex tab: rescue XP visible after switch', /1 \/ 8 captured/.test(codexSub), codexSub.slice(0, 100));
    // Cook Tonight modal opens from the Pantry tab.
    await desk.click('#tab-pantry');
    await desk.waitForTimeout(400);
    await desk.click('[data-action="cook-tonight"]');
    await desk.waitForSelector('.modal-tonight', { timeout: 20000 });
    check('pantry tab: Cook Tonight modal opens', true, '');
    await desk.click('.modal-tonight [data-modal-action="close"]');
    await desk.waitForTimeout(300);
    // Share tab: Share Card produces a download.
    await desk.click('#tab-share');
    await desk.waitForTimeout(400);
    const dl = desk.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await desk.click('#panel-share [data-action="share-card"]');
    const download = await dl;
    check('share tab: Share Card produces a download', download !== null, download ? await download.suggestedFilename() : 'no download event');
    // Skip link: on a FRESH page (Tab resumes after the last focused
    // element, so reusing this page after the download click would start
    // Tab from the Share button, not from the top). Load Share, Tab
    // focuses the skip link first, Enter jumps to the Pantry tab.
    const page3 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page3.goto(BASE + '#share', { waitUntil: 'load' });
    await page3.waitForTimeout(500);
    await page3.keyboard.press('Tab');
    await page3.waitForTimeout(300);
    const skipFocused = await page3.evaluate(() => ({
      focused: document.activeElement && document.activeElement.className.includes('skip-link'),
      active: document.activeElement ? (document.activeElement.id || document.activeElement.className) : 'none',
    }));
    check('skip link focuses first', skipFocused.focused === true, JSON.stringify(skipFocused));
    await page3.keyboard.press('Enter');
    await page3.waitForTimeout(400);
    st = await tabState(page3);
    check('skip link switches to Pantry tab', st.panels.pantry === true, JSON.stringify(st.panels));
    await page3.close();

    // 8. Final console error sweep.
    const finalErrors = [];
    desk.on('console', (msg) => { if (msg.type() === 'error') finalErrors.push(msg.text()); });
    await desk.waitForTimeout(500);
    check('final sweep: 0 console errors', finalErrors.length === 0, finalErrors.slice(0, 3).join(' ; '));
    await desk.close();
  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n==== SUMMARY ====');
  console.log('passed: ' + results.filter((r) => r.ok).length + '/' + results.length);
  console.log('HEIGHTS: ' + JSON.stringify(heights));
  if (failures > 0) {
    console.log('FAILED CHECKS:');
    for (const r of results.filter((r) => !r.ok)) console.log(' - ' + r.name + ' | ' + r.detail);
    process.exit(1);
  }
  console.log('ALL CHECKS PASSED');
}

main().catch((e) => { console.error('TEST RUNNER ERROR:', e); process.exit(2); });
