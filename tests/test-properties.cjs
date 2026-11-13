// FreshTrack Phase 26 property-based tests (PURE - no browser, no deps):
// invariants of the shipped code, checked over hundreds of seeded random
// cases each.
//
// The properties run against the REAL functions extracted verbatim from
// app.js (brace-balanced extraction, evaluated with stubs only for their
// outside dependencies: Date, findItemById, saveItems, announce, render,
// historyLog). Nothing here re-implements app logic; a change to app.js
// changes what is tested. The recipe filter runs the exact filter
// expression from renderRecipeListInner over the real RECIPES bank.
//
// Zero dependencies beyond Node itself (only node:fs): run anywhere with
// plain `node tests/test-properties.cjs`, including the Kiro Web sandbox,
// which has no Playwright/Chromium. The browser smoke check that used to
// live here moved to tests/test-properties-browser.cjs (needs Playwright).
// Split: Phase 28 follow-up, 14 Nov 2026.
const fs = require('node:fs');

const REPO = '/home/hatch/workspace/freshtrack';
const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  if (!ok) failures++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

// Deterministic seeded RNG (mulberry32) so a failure reproduces exactly.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261113);
function randInt(min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}

// ===== Extract real functions from app.js (brace-balanced) =====
const appSrc = fs.readFileSync(REPO + '/app.js', 'utf-8');

function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('function not found in app.js: ' + name);
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced braces for ' + name);
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // matches app.js line 55

// Fixed "today" for the date properties: 2026-06-15 local time. The stub
// Date returns it for no-arg construction, so results do not depend on
// whether the sandbox clock is UTC or WITA.
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args) {
    super(...args);
    if (args.length === 0) {
      this.setFullYear(2026, 5, 15);
      this.setHours(0, 0, 0, 0);
    }
  }
}

// Sandbox: the extracted functions, with only their outside dependencies
// stubbed. historyLog is a live array the test mutates between cases.
const historyLog = [];
let currentItem = null;
const sandboxSrc =
  extractFunction(appSrc, 'getUrgency') + '\n' +
  extractFunction(appSrc, 'freezeItem') + '\n' +
  extractFunction(appSrc, 'generateHouseholdCode') + '\n' +
  extractFunction(appSrc, 'countRescuedToday') + '\n' +
  extractFunction(appSrc, 'getTodayStr') + '\n' +
  'var CODE_CHARS = ' + JSON.stringify(CODE_CHARS) + ';\n' +
  'return { getUrgency, freezeItem, generateHouseholdCode, countRescuedToday, getTodayStr };';
const sandbox = new Function(
  'Date', 'findItemById', 'saveItems', 'announce', 'render', 'historyLog', sandboxSrc,
)(
  FixedDate,
  function () { return currentItem; },
  function () {},
  function () {},
  function () {},
  historyLog,
);

// The exact recipe filter expression from renderRecipeListInner.
const filterMatch = appSrc.match(
  /var filtered = recipeFilter === 'All'\s*\?\s*recipes\s*:\s*recipes\.filter\(function \(r\) \{ return r\.category === recipeFilter; \}\);/,
);
if (!filterMatch) throw new Error('recipe filter expression not found in app.js');
const runFilter = new Function('recipes', 'recipeFilter', filterMatch[0] + '\nreturn filtered;');

// The real recipe bank.
const RECIPES = eval(fs.readFileSync(REPO + '/recipes.js', 'utf-8') + '\n; RECIPES;');

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function severity(level) {
  return { fresh: 0, wary: 1, danger: 2, rotten: 3 }[level];
}

async function main() {
  // ===== Static: the extracted pieces really are the shipped code =====
  check('prop: getUrgency extracted from app.js', appSrc.indexOf('function getUrgency(item)') !== -1);
  check('prop: freezeItem extracted from app.js', appSrc.indexOf('function freezeItem(id)') !== -1);
  check('prop: CODE_CHARS skips 0/O/1/I/L in app.js', appSrc.indexOf("var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'") !== -1);
  check('prop: Triple Threat bar caps at 3 in app.js', appSrc.indexOf('Math.min(3, countRescuedToday())') !== -1);

  // ===== P1: freeze always extends expiry by exactly 14 days =====
  // 250 random dates, 2025-01-01 .. 2027-12-31. Expected value computed
  // independently (millisecond arithmetic from the same local-noon date),
  // not with setDate, so both paths must agree across month/year ends.
  let freezeBad = null;
  for (let i = 0; i < 250; i++) {
    const base = new RealDate(2025, 0, 1);
    base.setDate(base.getDate() + randInt(0, 1095));
    const iso = fmtDate(base);
    currentItem = { expiryDate: iso };
    sandbox.freezeItem('x');
    const noon = new RealDate(base.getFullYear(), base.getMonth(), base.getDate(), 12, 0, 0);
    const expected = fmtDate(new RealDate(noon.getTime() + 14 * 24 * 60 * 60 * 1000));
    if (currentItem.expiryDate !== expected) {
      freezeBad = iso + ' -> ' + currentItem.expiryDate + ' (expected ' + expected + ')';
      break;
    }
  }
  check('prop: freeze extends expiry by exactly 14 days (250 random dates 2025-2027)', freezeBad === null, freezeBad || 'all 250 agree');

  // ===== P2: urgency is monotonic in days-to-expiry =====
  // 250 random offsets; severity must never rise as days remaining grow.
  // Boundaries from the shipped code: rotten <= 0, danger 1-2, wary 3-5,
  // fresh >= 6.
  const today = new RealDate(2026, 5, 15);
  function levelForOffset(off) {
    const d = new RealDate(today.getFullYear(), today.getMonth(), today.getDate() + off);
    return sandbox.getUrgency({ expiryDate: fmtDate(d) }).level;
  }
  let monoBad = null;
  for (let i = 0; i < 250; i++) {
    const a = randInt(-30, 30);
    const b = randInt(-30, 30);
    if (a === b) continue;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (severity(levelForOffset(lo)) < severity(levelForOffset(hi))) {
      monoBad = 'offset ' + lo + ' (' + levelForOffset(lo) + ') less severe than offset ' + hi + ' (' + levelForOffset(hi) + ')';
      break;
    }
  }
  check('prop: urgency monotonic over days-to-expiry (250 random offset pairs)', monoBad === null, monoBad || 'ordering holds');
  const boundaries = [
    [-10, 'rotten'], [-1, 'rotten'], [0, 'rotten'],
    [1, 'danger'], [2, 'danger'],
    [3, 'wary'], [4, 'wary'], [5, 'wary'],
    [6, 'fresh'], [10, 'fresh'], [30, 'fresh'],
  ];
  let boundBad = null;
  for (const [off, want] of boundaries) {
    const got = levelForOffset(off);
    if (got !== want) { boundBad = 'offset ' + off + ' -> ' + got + ' (expected ' + want + ')'; break; }
  }
  check('prop: urgency boundaries exact (rotten<=0, danger 1-2, wary 3-5, fresh>=6)', boundBad === null, boundBad || '11/11 boundaries');

  // ===== P3: recipe filter never returns a recipe outside the category =====
  // 250 random category picks over the real RECIPES bank, using the exact
  // filter expression from app.js.
  const cats = ['Breakfast', 'Lunch', 'Snack', 'Dinner', 'All'];
  let filterBad = null;
  for (let i = 0; i < 250; i++) {
    const cat = cats[randInt(0, cats.length - 1)];
    const out = runFilter(RECIPES, cat);
    if (cat === 'All') {
      if (out.length !== RECIPES.length) { filterBad = 'All returned ' + out.length + ' of ' + RECIPES.length; break; }
    } else {
      for (const r of out) {
        if (r.category !== cat) { filterBad = 'filter ' + cat + ' returned ' + r.name + ' (' + r.category + ')'; break; }
      }
      if (filterBad) break;
      let want = 0;
      for (const r of RECIPES) if (r.category === cat) want++;
      if (out.length !== want) { filterBad = 'filter ' + cat + ' returned ' + out.length + ', bank has ' + want; break; }
    }
  }
  check('prop: recipe filter never returns a recipe outside the category (250 random picks)', filterBad === null, filterBad || 'all 250 agree');

  // ===== P4: household codes never use ambiguous chars =====
  // 500 generated codes; charset is the shipped CODE_CHARS.
  let codeBad = null;
  for (let i = 0; i < 500; i++) {
    const code = sandbox.generateHouseholdCode();
    if (code.length !== 6) { codeBad = 'length ' + code.length + ': ' + code; break; }
    for (const ch of code) {
      if ('01OIL'.indexOf(ch) !== -1) { codeBad = 'ambiguous char ' + ch + ' in ' + code; break; }
      if (CODE_CHARS.indexOf(ch) === -1) { codeBad = 'char outside CODE_CHARS: ' + ch + ' in ' + code; break; }
    }
    if (codeBad) break;
  }
  check('prop: household codes never emit 0/O/1/I/L (500 generated codes)', codeBad === null, codeBad || 'all 500 clean');

  // ===== P5: Triple Threat bar never exceeds 3 =====
  // 250 random histories: N rescued-today entries (0-10) plus noise
  // (other types, other dates). The counter must report N exactly and the
  // shipped cap expression must clamp the bar at 3.
  let threatBad = null;
  for (let i = 0; i < 250; i++) {
    const nToday = randInt(0, 10);
    historyLog.length = 0;
    for (let j = 0; j < nToday; j++) historyLog.push({ type: 'rescued', date: '2026-06-15' });
    const noise = randInt(0, 5);
    for (let j = 0; j < noise; j++) {
      historyLog.push({ type: rand() < 0.5 ? 'wasted' : 'rescued', date: rand() < 0.5 ? '2026-06-14' : '2026-06-16' });
    }
    const counted = sandbox.countRescuedToday();
    if (counted !== nToday) { threatBad = 'counted ' + counted + ', history has ' + nToday + ' rescued today'; break; }
    const bar = Math.min(3, sandbox.countRescuedToday());
    if (bar > 3 || bar !== Math.min(3, nToday)) { threatBad = 'bar ' + bar + ' for ' + nToday + ' rescued today'; break; }
  }
  check('prop: Triple Threat bar never exceeds 3 (250 random histories)', threatBad === null, threatBad || 'counter exact, bar clamped');

  const passed = results.filter((r) => r.ok).length;
  console.log(passed + '/' + results.length + ' passed');
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('SUITE CRASH: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
