// FreshTrack Phase 26 property-based tests - BROWSER SMOKE ONLY.
// The two checks that need a real browser: the shipped app loads and
// shows the current footer, with zero non-network console errors.
// Split out of tests/test-properties.cjs (Phase 28 follow-up, 14 Nov 2026)
// so the 10 pure property checks can run with plain node anywhere,
// including the Kiro Web sandbox, which has no Playwright/Chromium.
// Run from the repo root:
//   NODE_PATH=/home/hatch/workspace/shoppal-v2/node_modules node tests/test-properties-browser.cjs
// Serves the repo on port 8906 itself and stops the server when done.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');

const REPO = require('node:path').join(__dirname, '..');
const BASE = 'http://127.0.0.1:8906/';
const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  if (!ok) failures++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
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
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().indexOf('ERR_TUNNEL_CONNECTION_FAILED') === -1) errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const footer = await page.evaluate(() => document.body.innerText.indexOf('FreshTrack v27.3') !== -1);
    check('prop: app loads, footer v27.3 (browser smoke)', footer);
    check('prop: 0 non-network console errors on load', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
    server.kill();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(passed + '/' + results.length + ' passed');
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('SUITE CRASH: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
