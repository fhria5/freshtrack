/* FreshTrack AI Worker (classic Worker, no modules).
   POST /api/recipe { ingredients: [names], mode: 'single' | 'tonight' }
   calls Gemini (gemini-3.5-flash-lite) and returns one recipe as JSON.
   The Gemini key lives in the Worker secret GEMINI_API_KEY and is never
   exposed to the browser. When the secret is absent the Worker answers
   503 { error: 'ai_unavailable' } so the app can fall back silently.
   GET /api/health reports { ok, ai, sync, app } without revealing key
   state beyond whether AI is configured.
   GET /api/pantry?code=XXXXXX and POST /api/pantry store one shared
   household pantry in the PANTRY_KV namespace (key household:<CODE>).
   No login, no personal data: a household is just an anonymous 6-char
   code, and last-write-wins by updatedAt. localStorage stays the
   offline source of truth in the app. */

var ALLOWED_ORIGINS = [
  'https://fhria5.github.io',
  'http://localhost:8901',
  'http://127.0.0.1:8901'
];
var RATE_LIMIT = 30;            // requests per IP per minute
var RATE_WINDOW_MS = 60 * 1000;
var GEMINI_TIMEOUT_MS = 15000;
var GEMINI_MODEL = 'gemini-3.5-flash-lite';
var hits = new Map();

// Server pantry (Haunted Household): one KV record per household code.
// KV is eventually consistent; the app treats localStorage as the
// offline truth and only adopts a server copy when it is newer.
var PANTRY_MAX_BYTES = 64 * 1024;   // max pantry JSON per household
var PANTRY_MAX_ITEMS = 200;
var PANTRY_MAX_DEVICES = 10;
var CODE_RE = /^[A-Z0-9]{6}$/;
var DEVICE_RE = /^[A-Za-z0-9-]{8,64}$/;

function getKv() {
  if (typeof PANTRY_KV !== 'undefined' && PANTRY_KV) return PANTRY_KV;
  return null;
}

function validPantry(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  if (!Array.isArray(p.items) || p.items.length > PANTRY_MAX_ITEMS) return false;
  for (var i = 0; i < p.items.length; i++) {
    var it = p.items[i];
    if (!it || typeof it !== 'object') return false;
    if (typeof it.name !== 'string' || !it.name || it.name.length > 120) return false;
    if (typeof it.expiryDate !== 'string' || it.expiryDate.length > 20) return false;
    if (it.id !== undefined && typeof it.id !== 'string') return false;
    if (it.photo !== undefined && typeof it.photo !== 'string') return false;
  }
  if (p.soulsSaved !== undefined && typeof p.soulsSaved !== 'number') return false;
  if (p.history !== undefined && !Array.isArray(p.history)) return false;
  if (p.codex !== undefined && (typeof p.codex !== 'object' || p.codex === null)) return false;
  if (p.streak !== undefined && (typeof p.streak !== 'object' || p.streak === null)) return false;
  return true;
}

async function handlePantryGet(request, env, origin, ip) {
  var kv = getKv();
  if (!kv) return jsonResponse({ error: 'sync_unavailable' }, 503, origin);
  if (rateLimited(ip)) {
    return jsonResponse({ error: 'rate_limited', retryAfterSeconds: 60 }, 429, origin);
  }
  var url = new URL(request.url);
  var code = (url.searchParams.get('code') || '').toUpperCase();
  if (!CODE_RE.test(code)) {
    return jsonResponse({ error: 'bad_request' }, 400, origin);
  }
  var stored = null;
  try {
    stored = await kv.get('household:' + code, 'json');
  } catch (e) {
    return jsonResponse({ error: 'sync_failed' }, 502, origin);
  }
  if (!stored) return jsonResponse({ error: 'not_found' }, 404, origin);
  return jsonResponse({
    pantry: stored.pantry || {},
    devices: (stored.devices || []).length,
    updatedAt: stored.updatedAt || 0
  }, 200, origin);
}

async function handlePantryPost(request, env, origin, ip) {
  var kv = getKv();
  if (!kv) return jsonResponse({ error: 'sync_unavailable' }, 503, origin);
  if (rateLimited(ip)) {
    return jsonResponse({ error: 'rate_limited', retryAfterSeconds: 60 }, 429, origin);
  }
  var body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'bad_request' }, 400, origin);
  }
  var code = String((body && body.code) || '').toUpperCase();
  var deviceId = String((body && body.deviceId) || '');
  var pantry = body && body.pantry;
  var updatedAt = body && body.updatedAt;
  if (!CODE_RE.test(code) || !DEVICE_RE.test(deviceId) ||
      typeof updatedAt !== 'number' || !validPantry(pantry)) {
    return jsonResponse({ error: 'bad_request' }, 400, origin);
  }
  var raw = JSON.stringify(pantry);
  if (raw.length > PANTRY_MAX_BYTES) {
    return jsonResponse({ error: 'too_large' }, 413, origin);
  }
  var stored = null;
  try {
    stored = await kv.get('household:' + code, 'json');
  } catch (e) {
    return jsonResponse({ error: 'sync_failed' }, 502, origin);
  }
  if (stored && typeof stored.updatedAt === 'number' &&
      stored.updatedAt > updatedAt + 5000) {
    // The server copy is newer: refuse the stale write and hand the
    // fresh copy back so the client can adopt it.
    return jsonResponse({
      error: 'stale',
      pantry: stored.pantry || {},
      devices: (stored.devices || []).length,
      updatedAt: stored.updatedAt || 0
    }, 409, origin);
  }
  var devices = (stored && Array.isArray(stored.devices)) ? stored.devices.slice() : [];
  if (devices.indexOf(deviceId) === -1) {
    devices.push(deviceId);
    if (devices.length > PANTRY_MAX_DEVICES) devices = devices.slice(-PANTRY_MAX_DEVICES);
  }
  try {
    await kv.put('household:' + code, JSON.stringify({
      pantry: pantry, devices: devices, updatedAt: updatedAt
    }));
  } catch (e) {
    return jsonResponse({ error: 'sync_failed' }, 502, origin);
  }
  return jsonResponse({ ok: true, devices: devices.length, updatedAt: updatedAt }, 200, origin);
}

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
    var name = String(ingredients[i] || '').trim().slice(0, 60);
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

  if (request.method === 'OPTIONS') {
    return corsPreflight(origin);
  }

  if (path === '/api/health' || path === '/api/health/') {
    var key = getKey(env);
    return jsonResponse({ ok: true, ai: !!key, sync: !!getKv(), app: 'freshtrack-ai' }, 200, origin);
  }

  if (path === '/api/recipe' || path === '/api/recipe/') {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405, origin);
    }
    return handleRecipe(request, env, origin);
  }

  if (path === '/api/pantry' || path === '/api/pantry/') {
    var ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (request.method === 'GET') {
      return handlePantryGet(request, env, origin, ip);
    }
    if (request.method === 'POST') {
      return handlePantryPost(request, env, origin, ip);
    }
    return jsonResponse({ error: 'method_not_allowed' }, 405, origin);
  }

  return jsonResponse({ error: 'not_found' }, 404, origin);
}

addEventListener('fetch', function (event) {
  event.respondWith(handleRequest(event.request, event.env || {}));
});
