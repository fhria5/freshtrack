/* FreshTrack AI Worker (classic Worker, no modules).
   POST /api/recipe { ingredients: [names], mode: 'single' | 'tonight' }
   calls Gemini (gemini-3.5-flash-lite) and returns one recipe as JSON.
   The Gemini key lives in the Worker secret GEMINI_API_KEY and is never
   exposed to the browser. When the secret is absent the Worker answers
   503 { error: 'ai_unavailable' } so the app can fall back silently.
   GET /api/health reports { ok, ai, app } without revealing key state
   beyond whether AI is configured.
   Abuse hardening (no new bindings or secrets): requests with an Origin
   header outside ALLOWED_ORIGINS are rejected 403; per-IP limit is
   10/min; a per-isolate daily budget of 500 recipe calls (UTC day)
   answers 503 { error: 'daily_limit' }; ingredient names are sanitized
   (control chars, quotes, braces/brackets, angle brackets stripped,
   40 chars max) before they reach the prompt. Requests with no Origin
   header (curl, server-side) are NOT blocked by the origin gate. */

var ALLOWED_ORIGINS = [
  'https://fhria5.github.io',
  'http://localhost:8901',
  'http://127.0.0.1:8901'
];
var RATE_LIMIT = 10;            // requests per IP per minute
var RATE_WINDOW_MS = 60 * 1000;
var DAILY_LIMIT = 500;          // recipe calls per day per isolate (UTC day)
var dailyDay = '';              // UTC date (YYYY-MM-DD) of the current budget
var dailyCount = 0;
var GEMINI_TIMEOUT_MS = 15000;
var GEMINI_MODEL = 'gemini-3.5-flash-lite';
var hits = new Map();

function jsonResponse(obj, status, origin) {
  var headers = { 'Content-Type': 'application/json' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  headers['Vary'] = 'Origin';
  return new Response(JSON.stringify(obj), { status: status, headers: headers });
}

function corsPreflight(origin) {
  var headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(null, { status: 204, headers: headers });
}

function allowedOrigin(request) {
  var origin = request.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS.indexOf(origin) !== -1) return origin;
  return null;
}

function rateLimited(ip) {
  var now = Date.now();
  var list = hits.get(ip) || [];
  list = list.filter(function (t) { return now - t < RATE_WINDOW_MS; });
  if (list.length >= RATE_LIMIT) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  return false;
}

// Per-isolate daily budget for recipe calls. Resets at UTC midnight.
// Counts only calls that passed the per-IP check and are about to use
// Gemini. Approximate by design: each isolate tracks its own budget,
// so the true total across isolates can exceed DAILY_LIMIT.
function dailyLimitReached() {
  var today = new Date().toISOString().slice(0, 10);
  if (today !== dailyDay) {
    dailyDay = today;
    dailyCount = 0;
  }
  if (dailyCount >= DAILY_LIMIT) return true;
  dailyCount++;
  return false;
}

// Strip anything that could break out of the ingredient list in the
// prompt: control characters (incl. newlines), quotes, braces/brackets
// and angle brackets. Caps the name at 40 chars.
var STRIP_CHARS = /[\u0000-\u001F\u007F"'`{}\[\]<>\\]/g;
function sanitizeIngredient(value) {
  return String(value || '').replace(STRIP_CHARS, '').trim().slice(0, 40);
}

function getKey(env) {
  if (env && typeof env.GEMINI_API_KEY === 'string' && env.GEMINI_API_KEY) return env.GEMINI_API_KEY;
  if (typeof GEMINI_API_KEY !== 'undefined' && GEMINI_API_KEY) return GEMINI_API_KEY;
  return '';
}

function buildPrompt(ingredients, mode) {
  var list = ingredients.join(', ');
  var task = mode === 'tonight'
    ? 'Create ONE dinner recipe that uses as many of these ingredients as possible: ' + list + '.'
    : 'Create ONE simple recipe that uses this ingredient: ' + list + '.';
  return task + ' The recipe must rescue expiring food, use common pantry staples, and be cookable in a home kitchen. ' +
    'Reply with JSON ONLY, no markdown, no extra text: ' +
    '{"title": "Recipe name", "ingredients": ["item with amount", "..."], "steps": ["step 1", "step 2"], "timeMinutes": 30}. ' +
    'Keep ingredients to at most 10 items and steps to at most 8 short steps. timeMinutes is a whole number.';
}

function parseRecipe(text) {
  if (!text || typeof text !== 'string') return null;
  var start = text.indexOf('{');
  var end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  var obj;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return null;
  }
  if (!obj || typeof obj.title !== 'string' || !obj.title) return null;
  if (!Array.isArray(obj.ingredients) || obj.ingredients.length === 0) return null;
  if (!Array.isArray(obj.steps) || obj.steps.length === 0) return null;
  if (typeof obj.timeMinutes !== 'number') return null;
  return {
    title: obj.title,
    ingredients: obj.ingredients.map(function (s) { return String(s); }),
    steps: obj.steps.map(function (s) { return String(s); }),
    timeMinutes: Math.round(obj.timeMinutes)
  };
}

async function handleRecipe(request, env, origin) {
  var body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'bad_request' }, 400, origin);
  }
  var ingredients = (body && body.ingredients) || [];
  var mode = (body && body.mode === 'tonight') ? 'tonight' : 'single';
  if (!Array.isArray(ingredients) || ingredients.length === 0 || ingredients.length > 12) {
    return jsonResponse({ error: 'bad_request' }, 400, origin);
  }
  var clean = [];
  for (var i = 0; i < ingredients.length; i++) {
    var name = sanitizeIngredient(ingredients[i]);
    if (name) clean.push(name);
  }
  if (clean.length === 0) {
    return jsonResponse({ error: 'bad_request' }, 400, origin);
  }

  var key = getKey(env);
  if (!key) {
    return jsonResponse({ error: 'ai_unavailable' }, 503, origin);
  }

  var ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (rateLimited(ip)) {
    return jsonResponse({ error: 'rate_limited', retryAfterSeconds: 60 }, 429, origin);
  }

  if (dailyLimitReached()) {
    return jsonResponse({ error: 'daily_limit', message: 'Daily AI recipe budget reached. Try again tomorrow.' }, 503, origin);
  }

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL +
    ':generateContent?key=' + encodeURIComponent(key);
  var payload = {
    contents: [{ parts: [{ text: buildPrompt(clean, mode) }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 800 }
  };

  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, GEMINI_TIMEOUT_MS);
  var geminiResp;
  try {
    geminiResp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
  } catch (e) {
    clearTimeout(timer);
    return jsonResponse({ error: 'ai_failed' }, 502, origin);
  }
  clearTimeout(timer);

  if (!geminiResp || !geminiResp.ok) {
    return jsonResponse({ error: 'ai_failed' }, 502, origin);
  }
  var data;
  try {
    data = await geminiResp.json();
  } catch (e) {
    return jsonResponse({ error: 'ai_failed' }, 502, origin);
  }
  var text = '';
  try {
    text = data.candidates[0].content.parts[0].text || '';
  } catch (e) {
    text = '';
  }
  var recipe = parseRecipe(text);
  if (!recipe) {
    return jsonResponse({ error: 'ai_failed' }, 502, origin);
  }
  return jsonResponse({ recipe: recipe, source: 'ai' }, 200, origin);
}

async function handleRequest(request, env) {
  var url = new URL(request.url);
  var path = url.pathname;
  // The Worker route is grokingstore.my.id/freshtrack-ai/*, so the
  // route prefix is part of the path. Strip it before routing.
  if (path === '/freshtrack-ai') {
    path = '/';
  } else if (path.indexOf('/freshtrack-ai/') === 0) {
    path = path.slice('/freshtrack-ai'.length);
  }
  var origin = allowedOrigin(request);

  // Real origin gate: a request that carries an Origin header outside the
  // allowlist is rejected outright. Requests with no Origin header (curl,
  // server-side) are NOT blocked by this check and continue below.
  var rawOrigin = request.headers.get('Origin') || '';
  if (rawOrigin && !origin) {
    return jsonResponse({ error: 'forbidden_origin' }, 403, null);
  }

  if (request.method === 'OPTIONS') {
    return corsPreflight(origin);
  }

  if (path === '/api/health' || path === '/api/health/') {
    var key = getKey(env);
    return jsonResponse({ ok: true, ai: !!key, app: 'freshtrack-ai' }, 200, origin);
  }

  if (path === '/api/recipe' || path === '/api/recipe/') {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405, origin);
    }
    return handleRecipe(request, env, origin);
  }

  return jsonResponse({ error: 'not_found' }, 404, origin);
}

addEventListener('fetch', function (event) {
  event.respondWith(handleRequest(event.request, event.env || {}));
});
