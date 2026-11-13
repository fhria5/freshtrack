// FreshTrack Phase 20 Playwright verification: cloud sync + Haunted
// Household (KV-backed Worker) + PWA installability.
// Run from the repo root:
//   NODE_PATH=/home/hatch/workspace/shoppal-v2/node_modules node tests/test-phase20.cjs
// Serves the repo on port 8901 itself and stops the server when done.
// The Worker pantry API is mocked with the real response shapes
// (200/404/409/400), because the sandbox browser cannot reach the live
// Worker; the live Worker endpoints were verified separately with curl.
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
      if (r.width < 44 || r.height < 44) bad.push((el.tagName + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)).slice(0, 80));
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

  // Mock pantry server: in-memory KV with the real API shapes.
  const serverStore = {};
  let lastPost = null;
  let force409 = null; // { pantry, updatedAt } to answer the next POST with
  let postCount = 0;
  async function pantryRoute(route) {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'GET') {
      const code = (url.searchParams.get('code') || '').toUpperCase();
      const rec = serverStore[code];
      if (!rec) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pantry: rec.pantry, devices: rec.devices.length, updatedAt: rec.updatedAt }) });
    }
    if (req.method() === 'POST') {
      postCount++;
      let body;
      try { body = JSON.parse(req.postData() || '{}'); } catch (e) { body = null; }
      lastPost = body;
      if (!body || !/^[A-Z0-9]{6}$/.test(String(body.code || '')) || !body.pantry || !Array.isArray(body.pantry.items)) {
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'bad_request' }) });
      }
      if (force409) {
        const f = force409;
        force409 = null;
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'stale', pantry: f.pantry, devices: 1, updatedAt: f.updatedAt }) });
      }
      const rec = serverStore[body.code] || { pantry: null, devices: [], updatedAt: 0 };
      if (rec.updatedAt > body.updatedAt + 5000) {
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'stale', pantry: rec.pantry, devices: rec.devices.length, updatedAt: rec.updatedAt }) });
      }
      if (!rec.devices.includes(body.deviceId)) rec.devices.push(body.deviceId);
      rec.pantry = body.pantry;
      rec.updatedAt = body.updatedAt;
      serverStore[body.code] = rec;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, devices: rec.devices.length, updatedAt: rec.updatedAt }) });
    }
    return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'method_not_allowed' }) });
  }

  try {
    // 1. Viewport audits (fresh profile, no seeded data).
    const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await auditViewport(mob, 'mobile 390px');
    await mob.close();
    const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await auditViewport(desk, 'desktop 1280px');

    const page = desk;
    await page.route('**/freshtrack-ai/api/pantry*', pantryRoute);
    await page.route('**/freshtrack-ai/api/recipe', (route) => {
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'ai_unavailable' }) });
    });
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(400);

    // 2. Household section renders unjoined.
    const section = await page.evaluate(() => {
      const s = document.querySelector('.household-section');
      return s ? s.innerText : null;
    });
    check('household section renders', !!section && section.includes('Haunted Household'), (section || '').slice(0, 100));
    check('household join + create buttons present',
      (await page.locator('[data-action="join-household"]').count()) === 1 &&
      (await page.locator('[data-action="create-household"]').count()) === 1, '');

    // 3. Create household: code shown, push happens, status Synced.
    await page.click('[data-action="summon-demo"]');
    await page.waitForTimeout(500);
    await page.click('[data-action="create-household"]');
    await page.waitForTimeout(2600); // debounce 1500ms + mock round trip
    const created = await page.evaluate(() => ({
      code: (document.querySelector('.household-code') || {}).textContent || '',
      status: (document.getElementById('household-status') || {}).textContent || '',
      sync: JSON.parse(localStorage.getItem('freshtrack.sync') || '{}'),
    }));
    check('create shows a 6-char code', /^[A-Z0-9]{6}$/.test(created.code), 'code=' + created.code);
    check('create code uses no confusing chars', !/[01IL]/.test(created.code), 'code=' + created.code);
    check('create stores sync state', created.sync.code === created.code && created.sync.deviceId, JSON.stringify(created.sync));
    check('create pushes pantry to server', postCount >= 1 && lastPost && lastPost.code === created.code, 'posts=' + postCount);
    check('push carries demo items', lastPost && lastPost.pantry.items.some((i) => i.name === 'Bananas'), JSON.stringify((lastPost || {}).pantry || {}).slice(0, 120));
    check('status becomes Synced', created.status.startsWith('Synced'), 'status=' + created.status);

    // 4. Mutation pushes: add an item with a photo; the photo must NOT
    //    be sent to the server (64KB cap), but must render locally.
    const pngPath = path.join(REPO, 'tests', 'tiny.png');
    if (!fs.existsSync(pngPath)) {
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      fs.writeFileSync(pngPath, Buffer.from(b64, 'base64'));
    }
    const postsBefore = postCount;
    await page.fill('#item-name', 'Photo Milk');
    await page.fill('#item-expiry', new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    await page.setInputFiles('#item-photo', pngPath);
    await page.waitForTimeout(400);
    await page.click('.btn-submit');
    await page.waitForTimeout(2600);
    check('mutation triggers a push', postCount > postsBefore, 'posts ' + postsBefore + ' -> ' + postCount);
    const pushed = lastPost && lastPost.pantry.items.find((i) => i.name === 'Photo Milk');
    check('pushed item has no photo (stays local-only)', !!pushed && !('photo' in pushed), JSON.stringify(pushed || {}).slice(0, 140));
    const photoLocal = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.card')];
      const card = cards.find((c) => c.textContent.includes('Photo Milk'));
      return card ? !!card.querySelector('img.item-photo') : false;
    });
    check('photo still renders locally', photoLocal, '');

    // 5. Join from a second device: server pantry is adopted.
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page2 = await ctx2.newPage();
    await page2.route('**/freshtrack-ai/api/pantry*', pantryRoute);
    await page2.goto(BASE, { waitUntil: 'load' });
    await page2.waitForTimeout(400);
    await page2.fill('#household-code-input', created.code);
    await page2.click('[data-action="join-household"]');
    await page2.waitForSelector('.household-code', { timeout: 15000 });
    const joined = await page2.evaluate(() => ({
      code: (document.querySelector('.household-code') || {}).textContent || '',
      names: [...document.querySelectorAll('.card')].map((c) => c.textContent).join(' | '),
      sync: JSON.parse(localStorage.getItem('freshtrack.sync') || '{}'),
    }));
    check('join shows the same code', joined.code === created.code, 'code=' + joined.code);
    check('join adopts server pantry', joined.names.includes('Bananas') && joined.names.includes('Photo Milk'), joined.names.slice(0, 160));
    check('join stores sync state', joined.sync.code === created.code, JSON.stringify(joined.sync));

    // 6. Join with a bad code format: inline error, nothing stored.
    const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page3 = await ctx3.newPage();
    await page3.route('**/freshtrack-ai/api/pantry*', pantryRoute);
    await page3.goto(BASE, { waitUntil: 'load' });
    await page3.waitForTimeout(400);
    await page3.fill('#household-code-input', 'ab');
    await page3.click('[data-action="join-household"]');
    await page3.waitForTimeout(400);
    const badCode = await page3.evaluate(() => ({
      err: (document.getElementById('household-error') || {}).textContent || '',
      sync: localStorage.getItem('freshtrack.sync'),
    }));
    check('bad code shows inline error', /6-character/.test(badCode.err), 'err=' + badCode.err);
    check('bad code stores nothing', !badCode.sync || JSON.parse(badCode.sync).code === null, 'sync=' + badCode.sync);

    // 7. Join with an unknown code: server 404, inline error.
    await page3.fill('#household-code-input', 'ZZZZ99');
    await page3.click('[data-action="join-household"]');
    await page3.waitForTimeout(1200);
    const notFound = await page3.evaluate(() => ({
      err: (document.getElementById('household-error') || {}).textContent || '',
      joined: !!document.querySelector('.household-code'),
    }));
    check('unknown code shows not-found error', /not found/i.test(notFound.err), 'err=' + notFound.err);
    check('unknown code does not join', !notFound.joined, '');

    // 8. Stale push (409): server copy is adopted instead of overwritten.
    force409 = {
      pantry: {
        items: [{ id: 'srv1', name: 'Server Milk', category: 'dairy', expiryDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10) }],
        soulsSaved: 9, history: [], codex: {}, streak: { count: 3, lastDate: new Date().toISOString().slice(0, 10) },
      },
      updatedAt: Date.now() + 60000,
    };
    const before409 = await page.evaluate(() => document.querySelectorAll('.card').length);
    await page.fill('#item-name', 'Local Only Item');
    await page.fill('#item-expiry', new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    await page.click('.btn-submit');
    await page.waitForTimeout(2600);
    const after409 = await page.evaluate(() => ({
      names: [...document.querySelectorAll('.card')].map((c) => c.textContent).join(' | '),
      souls: localStorage.getItem('freshtrack.soulsSaved'),
    }));
    check('409 adopts the newer server pantry', after409.names.includes('Server Milk'), after409.names.slice(0, 160));
    check('409 drops the stale local item', !after409.names.includes('Local Only Item'), after409.names.slice(0, 160));
    check('409 adopts server souls count', after409.souls === '9', 'souls=' + after409.souls);

    // 9. Leave household: panel returns to join form, local items stay.
    await page.click('[data-action="leave-household"]');
    await page.waitForTimeout(400);
    const left = await page.evaluate(() => ({
      joinVisible: !!document.querySelector('[data-action="join-household"]'),
      codeGone: !document.querySelector('.household-code'),
      cards: document.querySelectorAll('.card').length,
      sync: JSON.parse(localStorage.getItem('freshtrack.sync') || '{}'),
    }));
    check('leave returns to join form', left.joinVisible && left.codeGone, JSON.stringify(left));
    check('leave keeps local pantry', left.cards >= 1, 'cards=' + left.cards);
    check('leave clears stored code', left.sync.code === null, JSON.stringify(left.sync));

    // 10. Offline: server unreachable, app keeps working, status Offline.
    const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page4 = await ctx4.newPage();
    await page4.route('**/freshtrack-ai/api/pantry*', (route) => route.abort());
    const offErrors = [];
    page4.on('pageerror', (err) => offErrors.push(err.message));
    await page4.goto(BASE, { waitUntil: 'load' });
    await page4.waitForTimeout(400);
    await page4.click('[data-action="create-household"]');
    await page4.waitForTimeout(2600);
    const offState = await page4.evaluate(() => ({
      status: (document.getElementById('household-status') || {}).textContent || '',
      code: (document.querySelector('.household-code') || {}).textContent || '',
    }));
    await page4.fill('#item-name', 'Offline Item');
    await page4.fill('#item-expiry', new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    await page4.click('.btn-submit');
    await page4.waitForTimeout(600);
    const offItem = await page4.evaluate(() => [...document.querySelectorAll('.card')].some((c) => c.textContent.includes('Offline Item')));
    check('offline create still shows a code', /^[A-Z0-9]{6}$/.test(offState.code), 'code=' + offState.code);
    check('offline status says Offline', /Offline/.test(offState.status), 'status=' + offState.status);
    check('offline app still adds items', offItem, '');
    check('offline causes no page errors', offErrors.length === 0, offErrors.slice(0, 2).join(' ; '));
    await ctx4.close();

    // 11. PWA: manifest + icons + service worker registration.
    const pwa = await page.evaluate(async () => {
      const out = {};
      out.manifestLink = !!document.querySelector('link[rel="manifest"]');
      try {
        const m = await fetch('manifest.json');
        out.manifestStatus = m.status;
        const j = await m.json();
        out.manifestName = j.name;
        out.manifestIcons = (j.icons || []).map((i) => i.sizes).join(',');
      } catch (e) { out.manifestStatus = 'fetch-failed'; }
      try {
        const s = await fetch('sw.js');
        out.swStatus = s.status;
        out.swBody = (await s.text()).slice(0, 600);
      } catch (e) { out.swStatus = 'fetch-failed'; }
      try {
        const i192 = await fetch('icons/icon-192.png');
        const i512 = await fetch('icons/icon-512.png');
        out.iconsStatus = i192.status + '/' + i512.status;
      } catch (e) { out.iconsStatus = 'fetch-failed'; }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        out.swRegistered = !!reg;
        out.swScope = reg ? reg.scope : '';
      } catch (e) { out.swRegistered = false; }
      return out;
    });
    check('manifest link present', pwa.manifestLink, '');
    check('manifest serves valid JSON', pwa.manifestStatus === 200 && pwa.manifestName === 'FreshTrack: Fridge Horror', JSON.stringify(pwa));
    check('manifest lists 192 + 512 icons', pwa.manifestIcons === '192x192,512x512', pwa.manifestIcons);
    // Cache name was bumped v1 to v2 in Phase 22.1 (stale app.js served from the old cache).
    check('sw.js serves', pwa.swStatus === 200 && pwa.swBody.includes('freshtrack-v5'), pwa.swBody);
    check('icons serve', pwa.iconsStatus === '200/200', pwa.iconsStatus);
    check('service worker registered', pwa.swRegistered === true, 'registered=' + pwa.swRegistered + ' scope=' + pwa.swScope);

    // 12. Final console error sweep on the main page.
    const finalErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') finalErrors.push(msg.text()); });
    await page.waitForTimeout(500);
    check('flow page: 0 console errors', finalErrors.length === 0, finalErrors.slice(0, 3).join(' ; '));

    await ctx2.close();
    await ctx3.close();
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
