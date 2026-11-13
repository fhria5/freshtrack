// Hook helper: syntax-check the JS file Kiro just saved.
// Kiro passes the saved file path and session context as JSON on STDIN.
// The payload shape is not guaranteed, so this script scans every string
// value for a path ending in .js; if none is found it checks app.js and
// recipes.js. Exits non-zero when any check fails.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const FALLBACK_FILES = ['app.js', 'recipes.js'];

function collectStrings(value, out) {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
}

function findJsFiles(payload) {
  const strings = [];
  collectStrings(payload, strings);
  const found = [];
  for (const s of strings) {
    if (/\.js$/.test(s)) {
      const base = s.split(/[\\/]/).pop();
      if (base === 'app.js' || base === 'recipes.js') found.push(base);
    }
  }
  return [...new Set(found)];
}

function check(file) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) {
    console.log(`check-js: ${file} not found, skipped`);
    return true;
  }
  try {
    execFileSync('node', ['--check', path], { stdio: 'pipe' });
    console.log(`check-js: ${file} OK`);
    return true;
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '') || String(err.message || err);
    console.error(`check-js: ${file} FAILED\n${output}`);
    return false;
  }
}

async function main() {
  let stdin = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) stdin += chunk;
  let payload = null;
  try {
    payload = JSON.parse(stdin);
  } catch {
    payload = null;
  }
  const files = payload ? findJsFiles(payload) : [];
  const targets = files.length > 0 ? files : FALLBACK_FILES;
  const results = targets.map(check);
  if (results.includes(false)) process.exit(1);
}

main();
