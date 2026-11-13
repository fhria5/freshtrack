/**
 * FreshTrack — Application Logic
 *
 * Vanilla JS (no frameworks, no modules). Manages food items, persistence
 * via localStorage, urgency-based rendering with a horror theme, and
 * rule-based recipe suggestions for items nearing expiry.
 */
(function () {
  'use strict';

  // ===== State =====
  var items = [];
  var soulsSaved = 0;
  var lastRenderedDay = null;
  var modalState = null;
  var historyLog = [];              // Impact Dashboard event log
  var capturedMonsters = { fresh: false, wary: false, danger: false, rotten: false };
  var monsterCounts = { fresh: 0, wary: 0, danger: 0, rotten: 0 }; // rescues per level (drives monster level)
  var secretCaptured = { secretFresh: false, secretWary: false, secretDanger: false, secretRotten: false };
  var aiRecipeReady = {};   // itemId -> true once a real AI recipe arrived for that item
  var tonightPlanOpen = false; // true after a Cook Tonight plan is shown, spent by the next rescue
  var streakState = { count: 0, lastDate: null }; // consecutive rescue days
  var musicEnabled = true;          // Background music toggle (default ON since Phase 23: user asked for music)
  var nightPref = 'auto';           // Night Mode: 'auto' | 'on' | 'off'
  var recipeFilter = 'All';         // recipe category filter: 'All' | 'Breakfast' | 'Lunch' | 'Snack' | 'Dinner'
  var aiCache = {};                 // AI recipes in memory only, keyed by item name (lowercase)
  var aiLoading = {};               // item names with an AI request in flight
  var aiFallback = {};              // item names whose last AI attempt fell back to pantry recipes
  var aiOpen = {};                  // item names with the AI recipe expanded
  var tonightLoading = false;       // Cook Tonight request in flight
  var audioCtx = null;              // lazily-created Web Audio context
  var musicNodes = null;            // live music graph, null when music is off
  var activeTab = 'pantry';         // visible tab: 'pantry' | 'impact' | 'codex' | 'share'
  var TAB_IDS = ['pantry', 'impact', 'codex', 'share'];
  var TAB_TITLES = { pantry: 'Pantry', impact: 'Impact Dashboard', codex: 'Monster Codex', share: 'Share the Horror' };
  var syncState = { code: null, deviceId: null, updatedAt: 0, lastSyncAt: 0, status: 'off', devices: 0 };
  var syncTimer = null;             // debounce timer for cloud pushes
  var syncInFlight = false;         // a push/pull is in flight
  var applyingRemote = false;       // true while adopting a server pantry (blocks push-back)

  // ===== Constants =====
  var STORAGE_KEY = 'freshtrack.items';
  var SOULS_KEY = 'freshtrack.soulsSaved';
  var HISTORY_KEY = 'freshtrack.history';
  var CODEX_KEY = 'freshtrack.codex';
  var MUSIC_KEY = 'freshtrack.music';
  var STREAK_KEY = 'freshtrack.streak';
  var NIGHT_KEY = 'freshtrack.nightmode';
  var AI_API_URL = 'https://grokingstore.my.id/freshtrack-ai/api/recipe';
  var AI_TIMEOUT_MS = 15000;        // AI request timeout (ms)
  var SYNC_API_URL = 'https://grokingstore.my.id/freshtrack-ai/api/pantry';
  var SYNC_TIMEOUT_MS = 10000;      // cloud sync request timeout (ms)
  var SYNC_DEBOUNCE_MS = 1500;      // wait after a mutation before pushing
  var SYNC_KEY = 'freshtrack.sync'; // { code, deviceId, updatedAt, lastSyncAt, status, devices }
  var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // household codes skip 0/O/1/I/L
  var MAX_LEVEL = 5;                // monster level cap
  var RESCUES_PER_LEVEL = 3;        // rescues needed per level-up
  var MAX_PHOTOS = 20;              // cap stored item photos (localStorage budget)
  var PHOTO_MAX_DIM = 480;          // photo downscale target (px, longest side)
  var PHOTO_JPEG_QUALITY = 0.72;
  var CATEGORIES = ['produce', 'dairy', 'meat', 'pantry', 'bakery', 'other'];

  // Estimated average weight (kg) of a single food item per category.
  // Clearly an estimate — used only for approximate impact figures.
  var CATEGORY_WEIGHTS = {
    produce: 0.3,
    dairy: 0.5,
    meat: 0.7,
    pantry: 0.5,
    bakery: 0.4,
    other: 0.4
  };

  // Estimated kg of CO2 avoided per kg of food rescued (commonly cited ~2.5).
  var CO2_PER_KG = 2.5;

  var MONSTER_LORE = {
    fresh: 'A peaceful spirit, content in its leafy slumber.',
    wary: 'It stirs in the shadows, sensing its time draw near.',
    danger: 'Raging and wild, it demands immediate salvation.',
    rotten: 'Lost to the void \u2014 a skull marking what awaits the forgotten.'
  };

  var URGENCY_MONSTERS = {
    fresh: '\u{1F96C}',   // leafy green
    wary: '\u{1F9DF}',    // zombie
    danger: '\u{1F479}',  // ogre/demon
    rotten: '\u{1F480}'   // skull
  };

  // Secret monsters: hidden in the Codex until their unlock condition is met.
  // One secret per urgency tier; they have no levels, only a single capture.
  var SECRET_MONSTERS = {
    secretFresh: { emoji: '\u2728', name: 'Glimmer Sprout', lore: 'A shy sprout that only blooms when a cook asks the spirits for help.', hint: 'Ask the AI for a recipe, then rescue that item.' },
    secretWary: { emoji: '\u{1F441}\uFE0F', name: 'Midnight Watcher', lore: 'It opens its single eye only after dark, watching the fridge in silence.', hint: 'Rescue an item while Night Mode is on.' },
    secretDanger: { emoji: '\u{1F608}', name: 'Triple Threat', lore: 'Three souls in one day? It smells a feast and comes to join it.', hint: 'Rescue 3 items in a single day.' },
    secretRotten: { emoji: '\u{1F451}', name: 'Void King', lore: 'The king of leftovers bows only to a cook with a plan.', hint: 'Open a Cook Tonight plan, then rescue an item.' }
  };
  var SECRET_KEYS = ['secretFresh', 'secretWary', 'secretDanger', 'secretRotten'];

  var URGENCY_LABELS = {
    fresh: 'Fresh',
    wary: 'Wary',
    danger: 'Danger',
    rotten: 'Rotten'
  };

  // ===== Utility =====

  function getTodayStr() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function getYesterdayStr() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      try {
        return crypto.randomUUID();
      } catch (e) { /* fall through to fallback */ }
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getRecipes() {
    // recipes.js (loaded first) sets a global RECIPES const
    try {
      return (typeof RECIPES !== 'undefined') ? RECIPES : [];
    } catch (e) {
      return [];
    }
  }

  // ===== Screen-reader announcements =====

  // Writes a short message to the polite live region in index.html so
  // screen-reader users hear what just happened (add / rescue / delete).
  function announce(message) {
    var el = document.getElementById('sr-announcer');
    if (!el) return;
    el.textContent = '';
    // Clearing first, then setting on the next frame, guarantees the
    // announcement fires even when the message repeats.
    setTimeout(function () { el.textContent = message; }, 50);
  }

  // ===== Persistence =====

  function loadItems() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (e) {
      console.warn('FreshTrack: could not parse stored items, starting fresh.', e);
      return [];
    }
  }

  function saveItems() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      alert('FreshTrack: storage is full! Could not save your items.');
    }
    scheduleCloudSync();
  }

  function loadSoulsSaved() {
    try {
      var raw = localStorage.getItem(SOULS_KEY);
      if (!raw) return 0;
      var parsed = parseInt(raw, 10);
      return isNaN(parsed) ? 0 : parsed;
    } catch (e) {
      return 0;
    }
  }

  function saveSoulsSaved() {
    try {
      localStorage.setItem(SOULS_KEY, String(soulsSaved));
    } catch (e) {
      /* silent — souls counter is non-critical */
    }
    scheduleCloudSync();
  }

  function incrementSouls() {
    soulsSaved++;
    saveSoulsSaved();
  }

  // ===== Impact Dashboard Persistence =====

  function loadHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('FreshTrack: could not parse history log, starting fresh.', e);
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(historyLog));
    } catch (e) {
      /* silent — impact log is non-critical */
    }
    scheduleCloudSync();
  }

  // Records a rescued or wasted event. Rescued items count as saved; items
  // deleted while at danger or rotten urgency count as wasted.
  function logEvent(type, category, urgencyLevel) {
    historyLog.push({
      type: type,            // 'rescued' | 'wasted'
      category: category,
      urgencyLevel: urgencyLevel,
      date: getTodayStr(),
      ts: Date.now()
    });
    // Keep the log from growing without bound.
    if (historyLog.length > 500) {
      historyLog = historyLog.slice(-500);
    }
    saveHistory();
  }

  // ===== Monster Codex Persistence =====

  // Stored shape: { fresh: { captured: bool, count: n }, ..., secrets: { secretFresh: bool, ... } }.
  // Migrates the old boolean-only shape ({ fresh: true, ... }) automatically.
  // Saves without a secrets block (from before Phase 18) load with all secrets locked.
  function loadCodex() {
    var fresh = {
      fresh: { captured: false, count: 0 },
      wary: { captured: false, count: 0 },
      danger: { captured: false, count: 0 },
      rotten: { captured: false, count: 0 },
      secrets: { secretFresh: false, secretWary: false, secretDanger: false, secretRotten: false }
    };
    try {
      var raw = localStorage.getItem(CODEX_KEY);
      if (!raw) return fresh;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fresh;
      var levels = ['fresh', 'wary', 'danger', 'rotten'];
      for (var i = 0; i < levels.length; i++) {
        var lv = levels[i];
        var entry = parsed[lv];
        if (typeof entry === 'boolean') {
          // Old shape: plain true/false.
          fresh[lv] = { captured: entry, count: entry ? 1 : 0 };
        } else if (entry && typeof entry === 'object') {
          fresh[lv] = {
            captured: !!entry.captured,
            count: typeof entry.count === 'number' ? entry.count : (entry.captured ? 1 : 0)
          };
        }
      }
      if (parsed.secrets && typeof parsed.secrets === 'object') {
        for (var s = 0; s < SECRET_KEYS.length; s++) {
          var sk = SECRET_KEYS[s];
          if (typeof parsed.secrets[sk] === 'boolean') fresh.secrets[sk] = parsed.secrets[sk];
        }
      }
      return fresh;
    } catch (e) {
      return fresh;
    }
  }

  function saveCodex() {
    try {
      var out = {};
      var levels = ['fresh', 'wary', 'danger', 'rotten'];
      for (var i = 0; i < levels.length; i++) {
        var lv = levels[i];
        out[lv] = { captured: capturedMonsters[lv], count: monsterCounts[lv] };
      }
      out.secrets = {};
      for (var s = 0; s < SECRET_KEYS.length; s++) {
        out.secrets[SECRET_KEYS[s]] = !!secretCaptured[SECRET_KEYS[s]];
      }
      localStorage.setItem(CODEX_KEY, JSON.stringify(out));
    } catch (e) {
      /* silent — codex is non-critical */
    }
    scheduleCloudSync();
  }

  // ===== Cloud Sync + Haunted Household (Phase 20) =====
  // Server pantry storage lives in the freshtrack-ai Worker (PANTRY_KV).
  // A household is an anonymous 6-char code: no login, no personal
  // data. localStorage stays the offline source of truth: the app only
  // adopts a server copy when it is newer, and pushes local changes
  // (debounced) after every mutation. Photos stay local-only, they
  // would blow the 64KB server cap. Sync failures are silent: the app
  // keeps working offline and retries on the next change.

  function loadSync() {
    var fresh = { code: null, deviceId: null, updatedAt: 0, lastSyncAt: 0, status: 'off', devices: 0 };
    try {
      var raw = localStorage.getItem(SYNC_KEY);
      if (!raw) return fresh;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fresh;
      if (typeof parsed.code === 'string' && /^[A-Z0-9]{6}$/.test(parsed.code)) fresh.code = parsed.code;
      if (typeof parsed.deviceId === 'string' && parsed.deviceId) fresh.deviceId = parsed.deviceId;
      if (typeof parsed.updatedAt === 'number') fresh.updatedAt = parsed.updatedAt;
      if (typeof parsed.lastSyncAt === 'number') fresh.lastSyncAt = parsed.lastSyncAt;
      if (typeof parsed.devices === 'number') fresh.devices = parsed.devices;
      return fresh;
    } catch (e) {
      return fresh;
    }
  }

  function saveSync() {
    try {
      localStorage.setItem(SYNC_KEY, JSON.stringify(syncState));
    } catch (e) {
      /* silent - sync metadata is non-critical */
    }
  }

  function generateDeviceId() {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var out = 'd-';
    for (var i = 0; i < 20; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  function generateHouseholdCode() {
    var code = '';
    for (var i = 0; i < 6; i++) {
      code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    }
    return code;
  }

  // Small fetch helper with a timeout; resolves { status, data } where
  // data is parsed JSON or null. Rejects on network error or timeout.
  function fetchJson(url, options, timeoutMs) {
    var ctrl = null;
    var timer = null;
    if (typeof AbortController !== 'undefined') {
      ctrl = new AbortController();
      timer = setTimeout(function () { ctrl.abort(); }, timeoutMs);
      options.signal = ctrl.signal;
    }
    return fetch(url, options).then(function (resp) {
      if (timer) clearTimeout(timer);
      return resp.json().catch(function () { return null; }).then(function (data) {
        return { status: resp.status, data: data };
      });
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  // The pantry as the server sees it: plain data only, photos stripped.
  function collectPantry() {
    var cleanItems = items.map(function (it) {
      return {
        id: String(it.id || ''),
        name: String(it.name || '').slice(0, 120),
        category: String(it.category || 'other'),
        expiryDate: String(it.expiryDate || '')
      };
    });
    var codex = {};
    var levels = ['fresh', 'wary', 'danger', 'rotten'];
    for (var i = 0; i < levels.length; i++) {
      var lv = levels[i];
      codex[lv] = { captured: !!capturedMonsters[lv], count: monsterCounts[lv] || 0 };
    }
    codex.secrets = {};
    for (var s = 0; s < SECRET_KEYS.length; s++) {
      codex.secrets[SECRET_KEYS[s]] = !!secretCaptured[SECRET_KEYS[s]];
    }
    return {
      items: cleanItems,
      soulsSaved: soulsSaved,
      history: historyLog.slice(-500),
      codex: codex,
      streak: { count: streakState.count, lastDate: streakState.lastDate }
    };
  }

  // Replace local state with a server pantry (photos already on this
  // device are kept: server items never carry photos).
  function applyPantry(p, updatedAt) {
    if (!p || !Array.isArray(p.items)) return false;
    applyingRemote = true;
    try {
      var photosById = {};
      for (var i = 0; i < items.length; i++) {
        if (items[i].id && items[i].photo) photosById[items[i].id] = items[i].photo;
      }
      items = p.items.filter(function (it) {
        return it && typeof it.name === 'string' && it.name &&
          typeof it.expiryDate === 'string' && it.expiryDate;
      }).map(function (it) {
        var copy = {
          id: String(it.id || generateId()),
          name: String(it.name).slice(0, 120),
          category: String(it.category || 'other'),
          expiryDate: String(it.expiryDate)
        };
        if (photosById[copy.id]) copy.photo = photosById[copy.id];
        return copy;
      });
      soulsSaved = (typeof p.soulsSaved === 'number' && p.soulsSaved >= 0) ? Math.floor(p.soulsSaved) : 0;
      historyLog = Array.isArray(p.history) ? p.history.slice(-500) : [];
      if (p.codex && typeof p.codex === 'object') {
        var levels = ['fresh', 'wary', 'danger', 'rotten'];
        for (var l = 0; l < levels.length; l++) {
          var lv = levels[l];
          var entry = p.codex[lv];
          if (entry && typeof entry === 'object') {
            capturedMonsters[lv] = !!entry.captured;
            monsterCounts[lv] = (typeof entry.count === 'number' && entry.count >= 0) ? Math.floor(entry.count) : 0;
          }
        }
        if (p.codex.secrets && typeof p.codex.secrets === 'object') {
          for (var s = 0; s < SECRET_KEYS.length; s++) {
            var sk = SECRET_KEYS[s];
            if (typeof p.codex.secrets[sk] === 'boolean') secretCaptured[sk] = p.codex.secrets[sk];
          }
        }
      }
      if (p.streak && typeof p.streak === 'object') {
        streakState = {
          count: (typeof p.streak.count === 'number' && p.streak.count >= 0) ? Math.floor(p.streak.count) : 0,
          lastDate: (typeof p.streak.lastDate === 'string') ? p.streak.lastDate : null
        };
      }
      saveItems();
      saveSoulsSaved();
      saveHistory();
      saveCodex();
      saveStreak();
      syncState.updatedAt = (typeof updatedAt === 'number') ? updatedAt : Date.now();
      saveSync();
    } finally {
      applyingRemote = false;
    }
    render();
    return true;
  }

  // Updates only the status line in place (no full re-render, so typing
  // and focus elsewhere on the page are never disturbed).
  function updateSyncStatus() {
    var el = document.getElementById('household-status');
    if (el) el.textContent = syncStatusText();
  }

  function syncStatusText() {
    if (!syncState.code) return '';
    if (syncState.status === 'synced') {
      var dev = syncState.devices > 0
        ? ' · ' + syncState.devices + (syncState.devices === 1 ? ' device' : ' devices') + ' in this household'
        : '';
      return 'Synced' + dev + '.';
    }
    if (syncState.status === 'syncing') return 'Syncing...';
    if (syncState.status === 'offline') return 'Offline. Your pantry is safe on this device and will sync when you are back online.';
    if (syncState.status === 'not-found') return 'Household not found on the server. Your pantry is safe on this device.';
    return 'Sync failed. Your pantry is safe on this device.';
  }

  // Push local state to the server (debounced). A 409 means the server
  // copy is newer, so adopt it instead of overwriting it.
  function pushPantry() {
    if (!syncState.code || syncInFlight) return;
    syncInFlight = true;
    syncState.status = 'syncing';
    updateSyncStatus();
    var payload = {
      code: syncState.code,
      deviceId: syncState.deviceId,
      pantry: collectPantry(),
      updatedAt: Date.now()
    };
    fetchJson(SYNC_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, SYNC_TIMEOUT_MS).then(function (res) {
      if (res.status === 200 && res.data) {
        syncState.updatedAt = payload.updatedAt;
        syncState.lastSyncAt = Date.now();
        syncState.devices = (typeof res.data.devices === 'number') ? res.data.devices : syncState.devices;
        syncState.status = 'synced';
        saveSync();
      } else if (res.status === 409 && res.data && res.data.pantry) {
        syncState.devices = (typeof res.data.devices === 'number') ? res.data.devices : syncState.devices;
        syncState.status = 'synced';
        applyPantry(res.data.pantry, res.data.updatedAt);
        announce('Household pantry updated from the server.');
      } else {
        syncState.status = 'offline';
      }
    }).catch(function () {
      syncState.status = 'offline';
    }).then(function () {
      syncInFlight = false;
      saveSync();
      updateSyncStatus();
    });
  }

  function scheduleCloudSync() {
    if (applyingRemote || !syncState.code) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(pushPantry, SYNC_DEBOUNCE_MS);
  }

  // Pull the server copy once (on load). Adopts it only when newer.
  function pullPantry() {
    if (!syncState.code || syncInFlight) return;
    syncInFlight = true;
    fetchJson(SYNC_API_URL + '?code=' + encodeURIComponent(syncState.code), { method: 'GET' }, SYNC_TIMEOUT_MS).then(function (res) {
      if (res.status === 200 && res.data && res.data.pantry) {
        syncState.devices = (typeof res.data.devices === 'number') ? res.data.devices : syncState.devices;
        if (typeof res.data.updatedAt === 'number' && res.data.updatedAt > syncState.updatedAt) {
          applyPantry(res.data.pantry, res.data.updatedAt);
          announce('Household pantry updated from the server.');
        }
        syncState.status = 'synced';
        syncState.lastSyncAt = Date.now();
      } else if (res.status === 404) {
        syncState.status = 'not-found';
      } else {
        syncState.status = 'offline';
      }
    }).catch(function () {
      syncState.status = 'offline';
    }).then(function () {
      syncInFlight = false;
      saveSync();
      updateSyncStatus();
    });
  }

  function showHouseholdError(message) {
    var el = document.getElementById('household-error');
    if (el) el.textContent = message;
    announce(message);
  }

  function createHousehold() {
    var code = generateHouseholdCode();
    syncState.code = code;
    syncState.deviceId = syncState.deviceId || generateDeviceId();
    syncState.updatedAt = Date.now();
    syncState.status = 'syncing';
    saveSync();
    render();
    pushPantry();
    announce('Household created. Code ' + code.split('').join(' ') + '. Share it with your household.');
  }

  function joinHousehold(code) {
    syncState.deviceId = syncState.deviceId || generateDeviceId();
    fetchJson(SYNC_API_URL + '?code=' + encodeURIComponent(code), { method: 'GET' }, SYNC_TIMEOUT_MS).then(function (res) {
      if (res.status === 404) {
        showHouseholdError('Household not found. Check the code and try again.');
        return;
      }
      if (res.status !== 200 || !res.data || !res.data.pantry) {
        showHouseholdError('Could not reach the server. Check your connection and try again.');
        return;
      }
      syncState.code = code;
      syncState.devices = (typeof res.data.devices === 'number') ? res.data.devices : 0;
      syncState.status = 'synced';
      syncState.lastSyncAt = Date.now();
      saveSync();
      applyPantry(res.data.pantry, res.data.updatedAt);
      render();
      announce('Joined household ' + code + '. Pantry updated from the server.');
    }).catch(function () {
      showHouseholdError('Could not reach the server. Check your connection and try again.');
    });
  }

  function leaveHousehold() {
    if (syncTimer) clearTimeout(syncTimer);
    syncState.code = null;
    syncState.status = 'off';
    syncState.devices = 0;
    saveSync();
    render();
    announce('Left the household. Your pantry stays on this device.');
  }

  function copyHouseholdCode() {
    if (!syncState.code) return;
    var done = function () { announce('Household code copied.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(syncState.code).then(done, function () { announce('Household code: ' + syncState.code); });
    } else {
      announce('Household code: ' + syncState.code);
    }
  }

  // Monster level: 1 + one level per 3 rescues at that urgency, capped at 5.
  function getMonsterLevel(level) {
    var count = monsterCounts[level] || 0;
    return Math.min(MAX_LEVEL, 1 + Math.floor(count / RESCUES_PER_LEVEL));
  }

  // Progress (0..1) toward the next level-up.
  function getLevelProgress(level) {
    if (getMonsterLevel(level) >= MAX_LEVEL) return 1;
    return ((monsterCounts[level] || 0) % RESCUES_PER_LEVEL) / RESCUES_PER_LEVEL;
  }

  // Marks a monster as captured when an item at its urgency level is rescued,
  // and counts the rescue toward that monster's level.
  function captureMonster(level) {
    if (capturedMonsters.hasOwnProperty(level)) {
      monsterCounts[level] = (monsterCounts[level] || 0) + 1;
      capturedMonsters[level] = true;
      saveCodex();
    }
  }

  // Captures a secret monster once; announces it so the unlock is visible.
  function unlockSecret(key) {
    if (!secretCaptured.hasOwnProperty(key) || secretCaptured[key]) return false;
    secretCaptured[key] = true;
    saveCodex();
    announce('Secret monster captured: ' + SECRET_MONSTERS[key].name + '!');
    return true;
  }

  // Checks every secret unlock condition after a rescue. Each condition is
  // tied to a real feature, so secrets are earned by playing, never bought.
  function checkSecretUnlocks(itemId) {
    var item = findItemById(itemId);
    // Glimmer Sprout: rescued an item that had a real AI recipe, fetched
    // for this item or shown from the in-memory cache (same-named item).
    if (aiRecipeReady[itemId] || (item && aiCache[aiKey(item.name)])) unlockSecret('secretFresh');
    // Midnight Watcher: rescue while Night Mode is active.
    if (nightActive()) unlockSecret('secretWary');
    // Triple Threat: 3 rescues in a single day (history counts this rescue already).
    var today = getTodayStr();
    var n = 0;
    for (var i = 0; i < historyLog.length; i++) {
      if (historyLog[i].type === 'rescued' && historyLog[i].date === today) n++;
    }
    if (n >= 3) unlockSecret('secretDanger');
    // Void King: rescue after opening a Cook Tonight plan.
    if (tonightPlanOpen) unlockSecret('secretRotten');
    tonightPlanOpen = false;
    delete aiRecipeReady[itemId];
  }

  // ===== Rescue Streak Persistence =====

  function loadStreak() {
    try {
      var raw = localStorage.getItem(STREAK_KEY);
      if (!raw) return { count: 0, lastDate: null };
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { count: 0, lastDate: null };
      return { count: parsed.count || 0, lastDate: parsed.lastDate || null };
    } catch (e) {
      return { count: 0, lastDate: null };
    }
  }

  function saveStreak() {
    try {
      localStorage.setItem(STREAK_KEY, JSON.stringify(streakState));
    } catch (e) {
      /* silent — streak is non-critical */
    }
    scheduleCloudSync();
  }

  // Call on every rescue: same day = no change, yesterday = +1, gap = reset to 1.
  function recordRescueDay() {
    var today = getTodayStr();
    if (streakState.lastDate === today) return;
    if (streakState.lastDate === getYesterdayStr()) {
      streakState.count++;
    } else {
      streakState.count = 1;
    }
    streakState.lastDate = today;
    saveStreak();
  }

  // ===== Night Mode Persistence =====

  function loadNightPref() {
    try {
      var raw = localStorage.getItem(NIGHT_KEY);
      return (raw === 'on' || raw === 'off' || raw === 'auto') ? raw : 'auto';
    } catch (e) {
      return 'auto';
    }
  }

  function saveNightPref() {
    try {
      localStorage.setItem(NIGHT_KEY, nightPref);
    } catch (e) {
      /* silent */
    }
  }

  // Night hours: 18:00–06:00 local time.
  function isNightNow() {
    var h = new Date().getHours();
    return h >= 18 || h < 6;
  }

  function nightActive() {
    if (nightPref === 'on') return true;
    if (nightPref === 'off') return false;
    return isNightNow();
  }

  function applyNightMode() {
    document.body.classList.toggle('night-mode', nightActive());
  }

  // ===== Background Music Persistence =====

  // Default ON since Phase 23 (user asked for music). Only an explicit
  // stored 'false' (user turned music off) keeps it off.
  function loadMusicEnabled() {
    try {
      return localStorage.getItem(MUSIC_KEY) !== 'false';
    } catch (e) {
      return true;
    }
  }

  function saveMusicEnabled() {
    try {
      localStorage.setItem(MUSIC_KEY, musicEnabled ? 'true' : 'false');
    } catch (e) {
      /* silent */
    }
  }

  function getAudioCtx() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    return audioCtx;
  }

  // Test/debug hook: lets automated checks read the music state without
  // hearing anything (headless browsers have no speakers). musicLog is
  // every music event (start, stop, eerie note), in order.
  var musicLog = [];
  window.__freshTrack = {
    audioState: function () {
      var ctx = getAudioCtx();
      return ctx ? ctx.state : 'none';
    },
    musicOn: function () { return musicEnabled; },
    musicStarted: function () { return !!musicNodes; },
    musicGainValue: function () { return musicNodes ? musicNodes.master.gain.value : 0; },
    musicLog: function () { return musicLog.slice(); }
  };

  function noteMusic(name) {
    musicLog.push({ name: name, at: Date.now() });
    if (musicLog.length > 50) musicLog = musicLog.slice(-50);
  }

  // Creates the AudioContext on demand and resumes it when the browser
  // suspended it. Returns a promise for a running context, or null when
  // Web Audio is unavailable. Music nodes must wait for this promise:
  // starting them on a suspended context stays silent until it resumes.
  function ensureAudio() {
    var ctx = getAudioCtx();
    if (!ctx) return Promise.resolve(null);
    if (ctx.state === 'running') return Promise.resolve(ctx);
    try {
      return ctx.resume().then(function () { return ctx; }).catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  // ===== Background Music (Phase 23) =====
  // Horror ambient loop, Web Audio only, no audio files. A low detuned
  // drone through a slow-breathing lowpass filter, a faint wind bed, and
  // a random eerie note every few seconds. Everything runs through one
  // master gain (0.15) so the music stays audible on phone speakers.
  var EERIE_NOTES = [220, 233.08, 261.63, 311.13, 329.63, 415.30];

  // One soft music note through the music master gain. opts: freq,
  // freqEnd, delay, dur, vol, attack.
  function musicTone(ctx, opts) {
    if (!musicNodes) return;
    var start = ctx.currentTime + (opts.delay || 0);
    var dur = opts.dur || 2;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, start);
    if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, start + dur);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(opts.vol || 0.035, start + (opts.attack || 0.4));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(musicNodes.master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  // Schedules the next random eerie note a few seconds out, then chains.
  function scheduleEerieNote() {
    if (!musicNodes) return;
    musicNodes.timer = setTimeout(function () {
      if (!musicNodes || !musicEnabled) return;
      var ctx = musicNodes.ctx;
      var base = EERIE_NOTES[Math.floor(Math.random() * EERIE_NOTES.length)];
      musicTone(ctx, { freq: base, dur: 1.8 + Math.random(), vol: 0.05 + Math.random() * 0.02 });
      if (Math.random() < 0.35) {
        musicTone(ctx, { freq: base * 1.059, delay: 0.25, dur: 2.2, vol: 0.04 });
      }
      noteMusic('music-note');
      scheduleEerieNote();
    }, 4000 + Math.random() * 5000);
  }

  // Builds the music graph once and starts the loop. Safe to call twice.
  function startMusic() {
    if (!musicEnabled || musicNodes) return;
    ensureAudio().then(function (ctx) {
      if (!ctx || !musicEnabled || musicNodes) return;
      var master = ctx.createGain();
      master.gain.value = 0.15;
      master.connect(ctx.destination);

      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 240;
      filter.Q.value = 0.7;
      filter.connect(master);

      var drone1 = ctx.createOscillator();
      drone1.type = 'sine';
      drone1.frequency.value = 110;
      var drone2 = ctx.createOscillator();
      drone2.type = 'triangle';
      drone2.frequency.value = 110.5;
      var d1g = ctx.createGain(); d1g.gain.value = 0.5;
      var d2g = ctx.createGain(); d2g.gain.value = 0.4;
      drone1.connect(d1g); d1g.connect(filter);
      drone2.connect(d2g); d2g.connect(filter);

      var lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.05;
      var lfoGain = ctx.createGain();
      lfoGain.gain.value = 90;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      var len = ctx.sampleRate * 2;
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      var wind = ctx.createBufferSource();
      wind.buffer = buf;
      wind.loop = true;
      var band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 420;
      band.Q.value = 0.5;
      var windGain = ctx.createGain();
      windGain.gain.value = 0.02;
      wind.connect(band); band.connect(windGain); windGain.connect(master);
      var windLfo = ctx.createOscillator();
      windLfo.type = 'sine';
      windLfo.frequency.value = 0.07;
      var windLfoGain = ctx.createGain();
      windLfoGain.gain.value = 0.008;
      windLfo.connect(windLfoGain);
      windLfoGain.connect(windGain.gain);

      drone1.start(); drone2.start(); lfo.start(); wind.start(); windLfo.start();
      musicNodes = { ctx: ctx, master: master, timer: null,
        stoppables: [drone1, drone2, lfo, wind, windLfo] };
      noteMusic('music-start');
      scheduleEerieNote();
    });
  }

  // Stops the music graph and frees its nodes.
  function stopMusic() {
    if (!musicNodes) return;
    clearTimeout(musicNodes.timer);
    for (var i = 0; i < musicNodes.stoppables.length; i++) {
      try { musicNodes.stoppables[i].stop(); } catch (e) { /* already stopped */ }
    }
    try { musicNodes.master.disconnect(); } catch (e) { /* already gone */ }
    musicNodes = null;
    noteMusic('music-stop');
  }

  // Flips the music preference and starts or stops the loop.
  function setMusicEnabled(on) {
    musicEnabled = on;
    saveMusicEnabled();
    if (on) startMusic();
    else stopMusic();
  }

  // ===== Urgency =====

  function getUrgency(item) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var expiry = null;
    if (item.expiryDate) {
      expiry = new Date(item.expiryDate + 'T00:00:00');
    }
    if (!expiry || isNaN(expiry.getTime())) {
      return { level: 'rotten', daysRemaining: NaN, malformed: true };
    }
    expiry.setHours(0, 0, 0, 0);

    var diffMs = expiry.getTime() - today.getTime();
    var daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    var level;
    if (daysRemaining <= 0) level = 'rotten';
    else if (daysRemaining <= 2) level = 'danger';
    else if (daysRemaining <= 5) level = 'wary';
    else level = 'fresh';

    return { level: level, daysRemaining: daysRemaining };
  }

  function getDaysText(daysRemaining) {
    if (isNaN(daysRemaining)) return '\u26A0 Check expiry date';
    if (daysRemaining === 0) return 'Expires today';
    if (daysRemaining < 0) {
      var abs = Math.abs(daysRemaining);
      return 'Expired ' + abs + ' day' + (abs === 1 ? '' : 's') + ' ago';
    }
    if (daysRemaining === 1) return 'Expires in 1 day';
    return 'Expires in ' + daysRemaining + ' days';
  }

  // ===== Recipe Matching =====

  function matchRecipes(item) {
    var nameLower = (item.name || '').trim().toLowerCase();
    var catLower = (item.category || '').toLowerCase();
    if (!nameLower && !catLower) return [];

    return getRecipes().filter(function (recipe) {
      var ingredients = recipe.ingredients || [];
      return ingredients.some(function (ing) {
        var ingLower = (ing || '').toLowerCase();
        return (nameLower && ingLower.indexOf(nameLower) !== -1) ||
               (catLower && ingLower.indexOf(catLower) !== -1);
      });
    });
  }

  // ===== Rendering =====

  function render() {
    var app = document.getElementById('app');
    app.innerHTML =
      renderHeader() +
      renderTabBar() +
      renderTabPanel('pantry',
        renderStatsStrip(computeStats()) +
        renderControls() +
        renderChallenge() +
        renderTodaysHorrors() +
        renderForm() +
        renderHousehold() +
        renderItemList()) +
      renderTabPanel('impact', renderImpactDashboard()) +
      renderTabPanel('codex', renderCodex()) +
      renderTabPanel('share', renderSharePanel()) +
      renderFooter();
    lastRenderedDay = getTodayStr();
    applyNightMode();
    syncTabNavs();
  }

  // One tab panel: only the active tab is visible; the rest carry the
  // hidden attribute (the [hidden] rule in styles.css hides them).
  function renderTabPanel(id, inner) {
    var hidden = (id === activeTab) ? '' : ' hidden';
    return '<section class="tab-panel" id="panel-' + id + '" role="tabpanel" aria-labelledby="panel-' + id + '-title"' + hidden + '>' +
      '<h2 class="tab-title" id="panel-' + id + '-title" tabindex="-1">' + TAB_TITLES[id] + '</h2>' +
      inner +
    '</section>';
  }

  // Desktop tab bar (sticky under the header; hidden on mobile, where the
  // bottom nav switches tabs instead).
  function renderTabBar() {
    var icons = { pantry: '\uD83E\uDDDB', impact: '\uD83D\uDCCA', codex: '\uD83D\uDCDC', share: '\uD83D\uDCF8' };
    var tabs = TAB_IDS.map(function (id) {
      return '<button type="button" class="tab-btn" id="tab-' + id + '" role="tab" data-tab="' + id + '"' +
        ' aria-selected="' + (id === activeTab ? 'true' : 'false') + '" aria-controls="panel-' + id + '"' +
        ' aria-label="Open ' + TAB_TITLES[id] + ' tab">' +
        '<span aria-hidden="true">' + icons[id] + '</span> ' + TAB_TITLES[id] + '</button>';
    }).join('');
    return '<div class="tab-bar" role="tablist" aria-label="FreshTrack sections">' + tabs + '</div>';
  }

  // Tab switching: re-renders with the new active tab, updates the URL hash
  // (replaceState, so no history spam), moves focus to the tab title, and
  // announces the switch on the live region.
  function switchTab(id, opts) {
    if (TAB_IDS.indexOf(id) === -1) return false;
    opts = opts || {};
    activeTab = id;
    render();
    if (opts.updateHash !== false) {
      try { history.replaceState(null, '', '#' + id); } catch (e) { /* file URL or old browser */ }
    }
    if (opts.focus !== false) {
      var title = document.getElementById('panel-' + id + '-title');
      if (title) title.focus();
    }
    announce(TAB_TITLES[id] + ' tab open');
    window.scrollTo(0, 0);
    return true;
  }

  // Keeps both tab switchers (desktop tab bar + mobile bottom nav) in sync.
  function syncTabNavs() {
    var tabs = document.querySelectorAll('[data-tab]');
    for (var i = 0; i < tabs.length; i++) {
      var isActive = tabs[i].getAttribute('data-tab') === activeTab;
      tabs[i].setAttribute('aria-selected', isActive ? 'true' : 'false');
      tabs[i].classList.toggle('is-active', isActive);
      if (isActive) tabs[i].setAttribute('aria-current', 'location');
      else tabs[i].removeAttribute('aria-current');
    }
  }

  function renderHeader() {
    var musicLabel = musicEnabled ? '\uD83C\uDFB5 Music: On' : '\uD83C\uDFB5 Music: Off';
    return '' +
      '<header class="header">' +
        '<h1 class="app-title">FreshTrack</h1>' +
        '<p class="subtitle">Save them before they rot.</p>' +
        '<div class="audio-bar">' +
          '<button type="button" class="ctrl-btn audio-btn ctrl-music" data-action="toggle-music" aria-pressed="' + musicEnabled + '">' +
            musicLabel +
          '</button>' +
        '</div>' +
      '</header>';
  }

  function computeStats() {
    var total = items.length;
    var inPeril = 0;
    for (var i = 0; i < items.length; i++) {
      var u = getUrgency(items[i]);
      if (u.level === 'danger' || u.level === 'rotten') inPeril++;
    }
    return { total: total, inPeril: inPeril, soulsSaved: soulsSaved, streak: streakState.count };
  }

  function renderStatsStrip(stats) {
    return '' +
      '<div class="stats-strip" role="status" aria-live="polite">' +
        '<div class="stat">' +
          '<span class="stat-value">' + stats.total + '</span>' +
          '<span class="stat-label">Items Tracked</span>' +
        '</div>' +
        '<div class="stat stat-peril">' +
          '<span class="stat-value">' + stats.inPeril + '</span>' +
          '<span class="stat-label">In Peril</span>' +
        '</div>' +
        '<div class="stat stat-souls">' +
          '<span class="stat-value">' + stats.soulsSaved + '</span>' +
          '<span class="stat-label">Souls Saved</span>' +
        '</div>' +
        '<div class="stat stat-streak">' +
          '<span class="stat-value">\uD83D\uDD25 ' + stats.streak + '</span>' +
          '<span class="stat-label">Day Streak</span>' +
        '</div>' +
      '</div>';
  }

  function renderForm() {
    var options = CATEGORIES.map(function (cat) {
      return '<option value="' + cat + '">' + capitalize(cat) + '</option>';
    }).join('');

    return '' +
      '<section class="form-panel" aria-label="Add food item">' +
        '<h2 class="panel-title">The Haunted Pantry</h2>' +
        '<form id="add-item-form" novalidate>' +
          '<div class="form-field">' +
            '<label for="item-name">Item Name</label>' +
            '<input type="text" id="item-name" name="name" placeholder="e.g., Spinach" required autocomplete="off" aria-describedby="error-name">' +
            '<span class="error-msg" id="error-name" role="alert"></span>' +
          '</div>' +
          '<div class="form-field">' +
            '<label for="item-category">Category</label>' +
            '<select id="item-category" name="category">' +
              options +
            '</select>' +
          '</div>' +
          '<div class="form-field">' +
            '<label for="item-expiry">Expiry Date</label>' +
            '<input type="date" id="item-expiry" name="expiryDate" required aria-describedby="error-expiry">' +
            '<span class="error-msg" id="error-expiry" role="alert"></span>' +
          '</div>' +
          '<div class="form-field">' +
            '<label for="item-photo">Photo (optional)</label>' +
            '<input type="file" id="item-photo" name="photo" accept="image/*" capture="environment">' +
            '<span class="field-hint">Snap the item — the photo is shrunk before saving so it stays light.</span>' +
            '<span class="photo-preview" id="photo-preview" hidden></span>' +
          '</div>' +
          '<button type="submit" class="btn-submit">\uD83E\uDDDB Add to the Fridge</button>' +
        '</form>' +
        '<button type="button" class="btn-demo" data-action="summon-demo">\u{1F383} Summon Demo Pantry</button>' +
      '</section>';
  }

  function renderItemList() {
    if (items.length === 0) {
      return '<section id="pantry" aria-label="Pantry">' + renderEmptyState() + '</section>';
    }
    var sorted = items.slice().sort(function (a, b) {
      return (a.expiryDate || '').localeCompare(b.expiryDate || '');
    });
    var cards = sorted.map(renderItemCard).join('');
    return '<section id="pantry" aria-label="Pantry"><div class="item-list">' + cards + '</div></section>';
  }

  function renderItemCard(item) {
    var u = getUrgency(item);
    var level = u.level;
    var monster = URGENCY_MONSTERS[level];
    var label = URGENCY_LABELS[level];
    var daysText = getDaysText(u.daysRemaining);

    var html = '' +
      '<article class="card" data-urgency="' + level + '" data-id="' + escapeHtml(item.id) + '">' +
        '<div class="card-row">' +
          (item.photo && item.photo.indexOf('data:image/') === 0
            ? '<img class="item-photo" src="' + escapeHtml(item.photo) + '" alt="Photo of ' + escapeHtml(item.name) + '" loading="lazy">'
            : '<span class="monster" aria-hidden="true">' + monster + '</span>') +
          '<div class="card-info">' +
            '<h3 class="item-name">' + escapeHtml(item.name) + '</h3>' +
            '<div class="card-meta">' +
              '<span class="category">' + escapeHtml(capitalize(item.category)) + '</span>' +
              '<span class="badge badge-' + level + '">' + escapeHtml(daysText) + '</span>' +
              '<span class="urgency-label urgency-' + level + '">' + label + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="card-actions">' +
            '<button class="btn-ai" data-action="ai-recipe" data-id="' + escapeHtml(item.id) + '" data-name="' + escapeHtml(item.name) + '" title="Get an AI recipe" aria-label="Get an AI recipe for ' + escapeHtml(item.name) + '">\u2728</button>' +
            '<button class="btn-rescue" data-action="rescue" data-id="' + escapeHtml(item.id) + '" data-name="' + escapeHtml(item.name) + '" aria-label="Rescue ' + escapeHtml(item.name) + '">\u{1F6E1}\uFE0F</button>' +
            '<button class="btn-freeze" data-action="freeze" data-id="' + escapeHtml(item.id) + '" data-name="' + escapeHtml(item.name) + '" title="Freeze item, extend expiry by 14 days" aria-label="Freeze ' + escapeHtml(item.name) + ', extend expiry by 14 days">\u2744\uFE0F</button>' +
            '<button class="btn-delete" data-action="delete" data-id="' + escapeHtml(item.id) + '" data-name="' + escapeHtml(item.name) + '" aria-label="Delete ' + escapeHtml(item.name) + '">\u2715</button>' +
          '</div>' +
        '</div>';

    if (level === 'danger' || level === 'rotten') {
      html += renderRecipeSuggestions(item);
    }

    html += '<div class="ai-section" data-ai-for="' + escapeHtml(item.id) + '">' + renderAiSectionInner(item) + '</div>';

    html += '</article>';
    return html;
  }

  function recipeEntryHtml(recipe) {
    var ingredientList = (recipe.ingredients || []).map(function (ing) {
      return '<li>' + escapeHtml(ing) + '</li>';
    }).join('');
    var instructionList = (recipe.instructions || []).map(function (step) {
      return '<li>' + escapeHtml(step) + '</li>';
    }).join('');

    return '' +
      '<div class="recipe-entry">' +
        '<button class="recipe-name" data-action="expand-recipe" aria-expanded="false">' +
          escapeHtml(recipe.name) +
        '</button>' +
        '<div class="recipe-details" hidden>' +
          '<p class="recipe-desc">' + escapeHtml(recipe.description) + '</p>' +
          '<h4 class="recipe-subtitle">Ingredients</h4>' +
          '<ul class="recipe-ingredients">' + ingredientList + '</ul>' +
          '<h4 class="recipe-subtitle">Instructions</h4>' +
          '<ol class="recipe-instructions">' + instructionList + '</ol>' +
        '</div>' +
      '</div>';
  }

  function renderRecipeListInner(item) {
    var recipes = matchRecipes(item);
    var filtered = recipeFilter === 'All'
      ? recipes
      : recipes.filter(function (r) { return r.category === recipeFilter; });
    var chips = ['All', 'Breakfast', 'Lunch', 'Snack', 'Dinner'].map(function (cat) {
      return '<button type="button" class="filter-chip' + (recipeFilter === cat ? ' active' : '') +
        '" data-action="filter-recipes" data-filter="' + cat + '" aria-pressed="' + (recipeFilter === cat) + '">' + cat + '</button>';
    }).join('');

    var listHtml;
    if (recipes.length === 0) {
      listHtml = '<p class="no-recipes">No rescue recipes found for this item. Time to improvise... or bid farewell.</p>';
    } else if (filtered.length === 0) {
      listHtml = '<p class="no-recipes">No recipes in this category for this item. Try another filter.</p>';
    } else {
      listHtml = filtered.map(recipeEntryHtml).join('');
    }

    return '<div class="filter-row" role="group" aria-label="Filter recipes by meal">' + chips + '</div>' + listHtml;
  }

  function renderRecipeSuggestions(item) {
    var recipes = matchRecipes(item);
    var count = recipes.length;
    var toggleText = count > 0
      ? '\uD83C\uDF73 Rescue Recipes (' + count + ')'
      : '\uD83C\uDF73 Rescue Recipes';

    return '' +
      '<div class="rescue-section">' +
        '<button class="rescue-toggle" data-action="toggle-recipes" data-id="' + escapeHtml(item.id) + '" aria-expanded="false">' +
          toggleText +
        '</button>' +
        '<div class="recipe-list" hidden>' +
          renderRecipeListInner(item) +
        '</div>' +
      '</div>';
  }

  // ===== AI Recipes (Worker + Gemini, silent fallback) =====

  function aiKey(name) {
    return String(name || '').toLowerCase();
  }

  function findItemById(id) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i];
    }
    return null;
  }

  // POSTs ingredients to the FreshTrack AI Worker and returns the parsed
  // recipe, or null on ANY failure. Callers never see a raw error.
  function fetchAiRecipe(ingredients, mode) {
    var names = [];
    for (var i = 0; i < ingredients.length; i++) {
      if (ingredients[i]) names.push(String(ingredients[i]));
    }
    if (names.length === 0) return Promise.resolve(null);

    var ctrl = null;
    var timer = null;
    try {
      ctrl = new AbortController();
      timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, AI_TIMEOUT_MS);
    } catch (e) {
      ctrl = null;
    }

    var options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients: names.slice(0, 12), mode: mode })
    };
    if (ctrl) options.signal = ctrl.signal;

    return fetch(AI_API_URL, options).then(function (resp) {
      if (!resp || !resp.ok) return null;
      return resp.json().then(function (data) {
        if (!data || !data.recipe) return null;
        var r = data.recipe;
        if (typeof r.title !== 'string' || !r.title) return null;
        if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) return null;
        if (!Array.isArray(r.steps) || r.steps.length === 0) return null;
        if (typeof r.timeMinutes !== 'number') return null;
        return { title: r.title, ingredients: r.ingredients, steps: r.steps, timeMinutes: r.timeMinutes };
      }, function () { return null; });
    }).catch(function () { return null; }).then(function (result) {
      if (timer) clearTimeout(timer);
      return result;
    });
  }

  function renderAiRecipeHtml(recipe) {
    var ingredientList = (recipe.ingredients || []).map(function (ing) {
      return '<li>' + escapeHtml(ing) + '</li>';
    }).join('');
    var stepList = (recipe.steps || []).map(function (step) {
      return '<li>' + escapeHtml(step) + '</li>';
    }).join('');

    return '' +
      '<div class="ai-recipe">' +
        '<span class="ai-badge">AI-generated</span>' +
        '<h4 class="ai-title">' + escapeHtml(recipe.title) + '</h4>' +
        '<p class="ai-time">' + escapeHtml(String(recipe.timeMinutes)) + ' min</p>' +
        '<h5 class="recipe-subtitle">Ingredients</h5>' +
        '<ul class="recipe-ingredients">' + ingredientList + '</ul>' +
        '<h5 class="recipe-subtitle">Steps</h5>' +
        '<ol class="recipe-instructions">' + stepList + '</ol>' +
      '</div>';
  }

  function renderAiSectionInner(item) {
    var key = aiKey(item.name);
    if (aiLoading[key]) {
      return '<div class="ai-loading" role="status"><span class="ai-spinner" aria-hidden="true"></span> Summoning a recipe...</div>';
    }
    var cached = aiCache[key];
    if (cached) {
      var open = !!aiOpen[key];
      var html = '' +
        '<button class="ai-toggle" data-action="ai-recipe" data-id="' + escapeHtml(item.id) + '" data-name="' + escapeHtml(item.name) + '" aria-expanded="' + open + '">' +
          '\u2728 AI Recipe' +
        '</button>';
      if (open) html += renderAiRecipeHtml(cached);
      return html;
    }
    if (aiFallback[key]) {
      var recipes = matchRecipes(item);
      var listHtml = recipes.length === 0
        ? '<p class="no-recipes">No rescue recipes found for this item. Time to improvise... or bid farewell.</p>'
        : recipes.map(recipeEntryHtml).join('');
      return '' +
        '<button class="ai-toggle" data-action="ai-recipe" data-id="' + escapeHtml(item.id) + '" data-name="' + escapeHtml(item.name) + '" aria-expanded="false">' +
          '\u2728 AI Recipe' +
        '</button>' +
        '<p class="ai-fallback-note">AI is resting. Showing pantry recipes instead.</p>' +
        '<div class="ai-fallback-list">' + listHtml + '</div>';
    }
    return '';
  }

  function updateAiSection(itemId, itemName) {
    var item = findItemById(itemId);
    if (!item) return;
    var section = document.querySelector('.ai-section[data-ai-for="' + itemId + '"]');
    if (section) section.innerHTML = renderAiSectionInner(item);
  }

  function handleAiRecipe(itemId, itemName) {
    var key = aiKey(itemName);
    if (aiLoading[key]) return;
    var cached = aiCache[key];
    if (cached) {
      // A real AI recipe is on screen for this item, so rescuing it counts
      // toward the Glimmer Sprout secret, even for a same-named second item.
      aiRecipeReady[itemId] = true;
      aiOpen[key] = !aiOpen[key];
      updateAiSection(itemId, itemName);
      return;
    }
    var item = findItemById(itemId);
    if (!item) return;
    aiLoading[key] = true;
    aiFallback[key] = false;
    updateAiSection(itemId, itemName);
    announce('Summoning a recipe for ' + itemName + '...');
    fetchAiRecipe([itemName], 'single').then(function (recipe) {
      aiLoading[key] = false;
      if (recipe) {
        aiCache[key] = recipe;
        aiOpen[key] = true;
        aiRecipeReady[itemId] = true; // real AI recipe: arms the Glimmer Sprout secret
        announce('AI recipe ready for ' + itemName + '.');
      } else {
        aiFallback[key] = true;
        announce('AI is resting. Showing pantry recipes for ' + itemName + ' instead.');
      }
      updateAiSection(itemId, itemName);
    });
  }

  // ===== Cook Tonight =====

  function getUrgentItems() {
    var urgent = [];
    for (var i = 0; i < items.length; i++) {
      var u = getUrgency(items[i]);
      if (u.level === 'danger' || u.level === 'rotten') urgent.push(items[i]);
    }
    return urgent;
  }

  function rankTonightFallback(urgent) {
    var all = getRecipes();
    var scored = [];
    for (var i = 0; i < all.length; i++) {
      var count = 0;
      for (var j = 0; j < urgent.length; j++) {
        if (matchRecipes(urgent[j]).indexOf(all[i]) !== -1) count++;
      }
      if (count > 0) scored.push({ recipe: all[i], count: count });
    }
    scored.sort(function (a, b) { return b.count - a.count; });
    return scored.slice(0, 3).map(function (s) { return s.recipe; });
  }

  function handleCookTonight() {
    if (tonightLoading) return;
    var urgent = getUrgentItems();
    if (urgent.length === 0) return;
    var names = [];
    for (var i = 0; i < urgent.length && names.length < 12; i++) {
      names.push(urgent[i].name);
    }
    tonightLoading = true;
    render();
    announce('Cooking up tonight\'s rescue plan...');
    fetchAiRecipe(names, 'tonight').then(function (recipe) {
      tonightLoading = false;
      render();
      if (recipe) {
        openTonightModal(recipe, names, true);
      } else {
        openTonightModal(rankTonightFallback(urgent), names, false);
      }
    });
  }

  function openTonightModal(content, names, isAi) {
    closeModal();
    tonightPlanOpen = true; // a plan is on screen: the next rescue can wake the Void King

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modal-title');

    var bodyHtml;
    if (isAi) {
      bodyHtml = renderAiRecipeHtml(content);
    } else if (content.length === 0) {
      bodyHtml = '<p class="no-recipes">No pantry recipes cover tonight\'s urgent items. Time to improvise... or bid farewell.</p>';
    } else {
      bodyHtml = content.map(recipeEntryHtml).join('');
    }
    var usesLine = names.length > 0
      ? '<p class="tonight-uses">Uses: ' + escapeHtml(names.join(', ')) + '</p>'
      : '';

    overlay.innerHTML =
      '<div class="modal modal-tonight">' +
        '<p class="modal-title" id="modal-title">Tonight\u2019s Rescue Plan</p>' +
        (isAi ? '' : '<p class="ai-fallback-note">AI is resting. Showing pantry recipes instead.</p>') +
        usesLine +
        '<div class="tonight-body">' + bodyHtml + '</div>' +
        '<div class="modal-buttons">' +
          '<button class="btn-modal btn-keep" data-modal-action="close">Close</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    var closeBtn = overlay.querySelector('[data-modal-action="close"]');
    var focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');

    modalState = {
      overlay: overlay,
      triggerEl: null,
      onConfirm: null,
      focusableElements: focusable,
      firstFocusable: focusable[0],
      lastFocusable: focusable[focusable.length - 1]
    };

    closeBtn.focus();
    closeBtn.addEventListener('click', function () { closeModal(); });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
  }

  function renderEmptyState() {
    return '' +
      '<div class="empty-state">' +
        '<span class="empty-icon" aria-hidden="true">\uD83D\uDC80</span>' +
        '<span class="night-eyes" aria-hidden="true">\uD83D\uDC40</span>' +
        '<p class="empty-title">Your fridge is eerily empty...</p>' +
        '<p class="empty-subtitle">Add something before the void stares back.</p>' +
        '<button type="button" class="btn-demo" data-action="summon-demo">\u{1F383} Summon Demo Pantry</button>' +
      '</div>';
  }

  function renderFooter() {
    return '' +
      '<footer class="footer">' +
        '<p>Kiroween 2026 \u2014 Costume Contest</p>' +
        '<p class="footer-flavor">Don\u2019t let the monsters win. \uD83C\uDF83</p>' +
        '<p class="footer-version">FreshTrack v25.1 (louder music)</p>' +
      '</footer>';
  }

  // Share tab: stats recap + the two share actions (same data-action
  // handlers as the controls strip, so one code path serves both).
  function renderSharePanel() {
    return '' +
      '<section class="share-section" aria-label="Share FreshTrack">' +
        '<p class="section-sub">Brag about the souls you saved. Every share spreads the rescue.</p>' +
        '<div class="share-stats">' +
          '<div class="share-stat"><span class="share-stat-value">' + soulsSaved + '</span><span class="share-stat-label">Souls Saved</span></div>' +
          '<div class="share-stat"><span class="share-stat-value">' + countCaptured() + ' / 8</span><span class="share-stat-label">Monsters Captured</span></div>' +
          '<div class="share-stat"><span class="share-stat-value">\uD83D\uDD25 ' + streakState.count + '</span><span class="share-stat-label">Day Streak</span></div>' +
        '</div>' +
        '<div class="share-actions">' +
          '<button type="button" class="ctrl-btn share-btn" data-action="share-card">\uD83D\uDCF8 Share Card</button>' +
          '<button type="button" class="ctrl-btn share-btn" data-action="share-weekly">\uD83D\uDCC5 Weekly Recap</button>' +
        '</div>' +
        '<p class="share-note">#KiroweenHackathon26</p>' +
      '</section>';
  }

  // ===== Controls Strip (reminders / sounds / share) =====

  function renderControls() {
    var notifSupported = ('Notification' in window);
    var permission = notifSupported ? Notification.permission : 'unsupported';

    var reminderLabel;
    var reminderDisabled = false;
    if (!notifSupported) {
      reminderLabel = '\uD83D\uDD15 Reminders unavailable';
      reminderDisabled = true;
    } else if (permission === 'granted') {
      reminderLabel = '\uD83D\uDD14 Reminders On';
    } else if (permission === 'denied') {
      reminderLabel = '\uD83D\uDD15 Reminders Blocked';
      reminderDisabled = true;
    } else {
      reminderLabel = '\uD83D\uDD14 Enable Reminders';
    }

    var nightLabel = nightPref === 'on' ? '\uD83C\uDF19 Night: On'
      : nightPref === 'off' ? '\uD83C\uDF19 Night: Off' : '\uD83C\uDF19 Night: Auto';

    var urgentCount = getUrgentItems().length;
    var tonightDisabled = urgentCount === 0 || tonightLoading;

    return '' +
      '<div class="controls-strip" role="toolbar" aria-label="App controls">' +
        '<button type="button" class="ctrl-btn ctrl-tonight" data-action="cook-tonight"' + (tonightDisabled ? ' disabled aria-disabled="true"' : '') + (urgentCount === 0 ? ' title="No urgent items to cook tonight"' : '') + '>' +
          '\uD83C\uDF73 Cook Tonight' +
        '</button>' +
        '<button type="button" class="ctrl-btn ctrl-reminder' + (reminderDisabled ? ' disabled' : '') +
          '" data-action="enable-reminders"' + (reminderDisabled ? ' disabled aria-disabled="true"' : '') + '>' +
          reminderLabel +
        '</button>' +
        '<button type="button" class="ctrl-btn ctrl-night" data-action="cycle-night" aria-pressed="' + nightActive() + '">' +
          nightLabel +
        '</button>' +
        '<button type="button" class="ctrl-btn ctrl-share" data-action="share-card">' +
          '\uD83D\uDCF8 Share Card' +
        '</button>' +
        '<button type="button" class="ctrl-btn ctrl-weekly" data-action="share-weekly">' +
          '\uD83D\uDCC5 Weekly Recap' +
        '</button>' +
      '</div>';
  }

  // ===== Haunted Household (Phase 20) =====
  // One shared pantry per anonymous 6-char code. No account, no
  // personal data: the code is the only key to the pantry.

  function renderHousehold() {
    if (!syncState.code) {
      return '' +
        '<section class="household-section" aria-label="Haunted Household">' +
          '<h2 class="section-title">\uD83C\uDFE0 Haunted Household</h2>' +
          '<p class="section-sub">Share one pantry with your whole household. No account, just a secret code.</p>' +
          '<div class="household-join">' +
            '<label for="household-code-input" class="sr-only">Household code</label>' +
            '<input type="text" id="household-code-input" placeholder="ABC123" maxlength="6" autocomplete="off" aria-describedby="household-error">' +
            '<button type="button" class="btn-household" data-action="join-household">Join Household</button>' +
            '<button type="button" class="btn-household btn-household-create" data-action="create-household">Create One</button>' +
          '</div>' +
          '<p class="error-msg" id="household-error" role="alert"></p>' +
          '<p class="field-hint">Your pantry stays on this device until you join or create a household. Photos stay on this device only.</p>' +
        '</section>';
    }
    return '' +
      '<section class="household-section" aria-label="Haunted Household">' +
        '<h2 class="section-title">\uD83C\uDFE0 Haunted Household</h2>' +
        '<p class="household-code-row">Household code: <strong class="household-code">' + escapeHtml(syncState.code) + '</strong> ' +
          '<button type="button" class="btn-household btn-household-copy" data-action="copy-household-code">Copy Code</button></p>' +
        '<p class="household-status" id="household-status" role="status">' + syncStatusText() + '</p>' +
        '<p class="field-hint">Share the code with your household. Everyone sees the same pantry.</p>' +
        '<button type="button" class="btn-household btn-household-leave" data-action="leave-household">Leave Household</button>' +
      '</section>';
  }

  // ===== Today's Challenge (rescue 1 item today) =====

  function countRescuedToday() {
    var today = getTodayStr();
    var n = 0;
    for (var i = 0; i < historyLog.length; i++) {
      if (historyLog[i].type === 'rescued' && historyLog[i].date === today) n++;
    }
    return n;
  }

  function renderChallenge() {
    var done = countRescuedToday();
    var complete = done >= 1;
    return '' +
      '<section class="challenge-section" aria-label="Today\u2019s challenge">' +
        '<span class="challenge-icon" aria-hidden="true">\uD83C\uDFAF</span>' +
        '<div class="challenge-info">' +
          '<h2 class="challenge-title">Today\u2019s Challenge</h2>' +
          '<p class="challenge-text">Rescue 1 item before midnight.</p>' +
        '</div>' +
        '<span class="challenge-progress" role="status">' +
          (complete ? '\u2714 Done!' : done + ' / 1') +
        '</span>' +
      '</section>';
  }

  // ===== Today's Horrors (expiring today or tomorrow) =====

  function getExpiringSoonItems() {
    var soon = [];
    for (var i = 0; i < items.length; i++) {
      var u = getUrgency(items[i]);
      if (u.daysRemaining === 0 || u.daysRemaining === 1) {
        soon.push({ item: items[i], urgency: u });
      }
    }
    // Sort soonest first.
    soon.sort(function (a, b) {
      return a.item.expiryDate.localeCompare(b.item.expiryDate);
    });
    return soon;
  }

  function renderTodaysHorrors() {
    var soon = getExpiringSoonItems();
    if (soon.length === 0) return '';

    var rows = soon.map(function (entry) {
      var it = entry.item;
      var u = entry.urgency;
      var when = u.daysRemaining === 0 ? 'today' : 'tomorrow';
      return '' +
        '<li class="horror-row" data-urgency="' + u.level + '">' +
          '<span class="horror-monster" aria-hidden="true">' + URGENCY_MONSTERS[u.level] + '</span>' +
          '<span class="horror-name">' + escapeHtml(it.name) + '</span>' +
          '<span class="horror-when">expires ' + when + '</span>' +
        '</li>';
    }).join('');

    return '' +
      '<section class="horrors-section" aria-label="Today\u2019s Horrors">' +
        '<h2 class="section-title">\uD83D\uDC83 Today\u2019s Horrors</h2>' +
        '<p class="section-sub">Items expiring today or tomorrow \u2014 save them before they rot.</p>' +
        '<ul class="horrors-list">' + rows + '</ul>' +
      '</section>';
  }

  // ===== Impact Dashboard =====

  function computeImpact() {
    var rescuedCount = 0;
    var wastedCount = 0;
    var kgSaved = 0;
    for (var i = 0; i < historyLog.length; i++) {
      var entry = historyLog[i];
      if (entry.type === 'rescued') {
        rescuedCount++;
        kgSaved += CATEGORY_WEIGHTS[entry.category] || CATEGORY_WEIGHTS.other;
      } else if (entry.type === 'wasted') {
        wastedCount++;
      }
    }
    return {
      rescuedCount: rescuedCount,
      wastedCount: wastedCount,
      kgSaved: kgSaved,
      co2Avoided: kgSaved * CO2_PER_KG
    };
  }

  function renderImpactDashboard() {
    var imp = computeImpact();

    // Recent history (newest first), capped for display.
    var recent = historyLog.slice().reverse().slice(0, 8);
    var historyHtml = '';
    if (recent.length > 0) {
      historyHtml = recent.map(function (entry) {
        var monster = URGENCY_MONSTERS[entry.urgencyLevel] || '';
        var label = entry.type === 'rescued' ? 'Rescued' : 'Wasted';
        var cls = entry.type === 'rescued' ? 'hist-rescued' : 'hist-wasted';
        return '' +
          '<li class="hist-row ' + cls + '">' +
            '<span class="hist-monster" aria-hidden="true">' + monster + '</span>' +
            '<span class="hist-label">' + label + ' ' + escapeHtml(capitalize(entry.category)) + '</span>' +
            '<span class="hist-date">' + escapeHtml(entry.date) + '</span>' +
          '</li>';
      }).join('');
    } else {
      historyHtml = '<li class="hist-empty">No rescues or losses recorded yet. Go save a soul.</li>';
    }

    return '' +
      '<section class="dashboard-section" id="impact" aria-label="Impact Dashboard">' +
        '<h2 class="section-title">\uD83D\uDCCA Impact Dashboard</h2>' +
        '<p class="section-sub">Estimated impact of your food-rescue efforts.</p>' +
        '<div class="impact-grid">' +
          '<div class="impact-card impact-rescued">' +
            '<span class="impact-value">' + imp.rescuedCount + '</span>' +
            '<span class="impact-label">Rescued</span>' +
          '</div>' +
          '<div class="impact-card impact-wasted">' +
            '<span class="impact-value">' + imp.wastedCount + '</span>' +
            '<span class="impact-label">Wasted</span>' +
          '</div>' +
          '<div class="impact-card impact-kg">' +
            '<span class="impact-value">' + imp.kgSaved.toFixed(1) + '</span>' +
            '<span class="impact-label">kg Saved (est.)</span>' +
          '</div>' +
          '<div class="impact-card impact-co2">' +
            '<span class="impact-value">' + imp.co2Avoided.toFixed(1) + '</span>' +
            '<span class="impact-label">kg CO\u2082 Avoided (est.)</span>' +
          '</div>' +
        '</div>' +
        '<p class="impact-note">Estimates use per-category average item weights (' + CO2_PER_KG +
          ' kg CO\u2082 per kg food). Actual impact varies.</p>' +
        '<h3 class="subsection-title">Recent History</h3>' +
        '<ul class="history-list">' + historyHtml + '</ul>' +
      '</section>';
  }

  // ===== Monster Codex =====

  function countCaptured() {
    var n = 0;
    var levels = ['fresh', 'wary', 'danger', 'rotten'];
    for (var i = 0; i < levels.length; i++) {
      if (capturedMonsters[levels[i]]) n++;
    }
    for (var s = 0; s < SECRET_KEYS.length; s++) {
      if (secretCaptured[SECRET_KEYS[s]]) n++;
    }
    return n;
  }

  // Progress toward a secret monster, shown on its locked Codex card.
  // Display only: unlock conditions are unchanged (see checkSecretUnlocks).
  function secretProgressHtml(key) {
    if (key === 'secretDanger') {
      // Triple Threat: 3 rescues in a single day.
      var today = Math.min(3, countRescuedToday());
      var pct = Math.round(today / 3 * 100);
      return '' +
        '<div class="xp-bar" role="img" aria-label="Triple Threat progress, ' + today + ' of 3 rescues today">' +
          '<div class="xp-fill" style="width: ' + pct + '%"></div>' +
        '</div>' +
        '<p class="xp-text">' + today + ' / 3 rescued today</p>';
    }
    if (key === 'secretRotten') {
      // Void King: open a Cook Tonight plan, then rescue an item. Step 2
      // completes on the rescue that captures it, so it stays open here.
      var step1 = tonightPlanOpen ? '\u2714' : '\u2B1C';
      return '<p class="xp-text">Step 1: Cook Tonight opened ' + step1 + ' \u00B7 Step 2: Rescue after \u2B1C</p>';
    }
    return '';
  }

  function renderSecretCard(key) {
    var m = SECRET_MONSTERS[key];
    var captured = secretCaptured[key];
    if (captured) {
      return '' +
        '<div class="codex-card secret" data-secret="' + key + '" data-state="captured">' +
          '<span class="codex-monster" aria-hidden="true">' + m.emoji + '</span>' +
          '<div class="codex-info">' +
            '<h3 class="codex-name">' + escapeHtml(m.name) + ' <span class="level-badge">Secret</span></h3>' +
            '<p class="codex-lore">' + escapeHtml(m.lore) + '</p>' +
            '<span class="codex-badge captured">\u2714 Captured</span>' +
          '</div>' +
        '</div>';
    }
    return '' +
      '<div class="codex-card secret" data-secret="' + key + '" data-state="secret">' +
        '<span class="codex-secret-mark" aria-hidden="true">?</span>' +
        '<div class="codex-info">' +
          '<h3 class="codex-name">??? Secret Monster</h3>' +
          '<p class="codex-lore">' + escapeHtml(m.hint) + '</p>' +
          secretProgressHtml(key) +
          '<span class="codex-badge secret">Secret</span>' +
        '</div>' +
      '</div>';
  }

  function renderCodex() {
    var levels = ['fresh', 'wary', 'danger', 'rotten'];
    var cards = levels.map(function (level) {
      var captured = capturedMonsters[level];
      var monster = URGENCY_MONSTERS[level];
      var label = URGENCY_LABELS[level];
      var state = captured ? 'captured' : 'unknown';
      var lvl = getMonsterLevel(level);
      var progress = Math.round(getLevelProgress(level) * 100);
      var count = monsterCounts[level] || 0;
      var badge = captured
        ? '<span class="codex-badge captured">\u2714 Captured</span>'
        : '<span class="codex-badge locked">\u2716 Not Yet Captured</span>';
      // Higher-level monsters loom larger.
      var monsterSize = (2 + (lvl - 1) * 0.15).toFixed(2);
      return '' +
        '<div class="codex-card" data-urgency="' + level + '" data-state="' + state + '">' +
          '<span class="codex-monster" aria-hidden="true" style="font-size: ' + monsterSize + 'rem">' + monster + '</span>' +
          '<div class="codex-info">' +
            '<h3 class="codex-name">' + label + ' <span class="level-badge">Lv. ' + lvl + '</span></h3>' +
            '<p class="codex-lore">' + escapeHtml(MONSTER_LORE[level]) + '</p>' +
            '<div class="xp-bar" role="img" aria-label="' + label + ' monster level ' + lvl + ', ' + count + ' rescues">' +
              '<div class="xp-fill" style="width: ' + progress + '%"></div>' +
            '</div>' +
            '<p class="xp-text">' + count + ' rescue' + (count === 1 ? '' : 's') +
              (lvl >= MAX_LEVEL ? ' — max level!' : ' · ' + (RESCUES_PER_LEVEL - (count % RESCUES_PER_LEVEL)) + ' more to Lv. ' + (lvl + 1)) + '</p>' +
            badge +
          '</div>' +
        '</div>';
    }).join('');

    var secretCards = SECRET_KEYS.map(function (key) {
      return renderSecretCard(key);
    }).join('');

    return '' +
      '<section class="codex-section" id="codex" aria-label="Monster Codex">' +
        '<h2 class="section-title">\uD83D\uDCDC Monster Codex</h2>' +
        '<p class="section-sub">Rescue an item at each urgency level to capture its monster. ' +
          countCaptured() + ' / 8 captured. Four secret monsters hide in the dark. Find them.</p>' +
        '<div class="codex-grid">' + cards + secretCards + '</div>' +
      '</section>';
  }

  // ===== Actions =====

  function addItem(name, category, expiryDate, photo) {
    var item = {
      id: generateId(),
      name: name.trim(),
      category: category,
      expiryDate: expiryDate
    };
    if (photo) item.photo = photo;
    items.push(item);
    saveItems();
    var u = getUrgency(item);
    announce(item.name + ' added to the fridge. ' + getDaysText(u.daysRemaining) + '.');
    render();
  }

  function deleteItem(id) {
    // Log wasted if the item was already at danger or rotten urgency.
    var item = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) { item = items[i]; break; }
    }
    if (item) {
      var u = getUrgency(item);
      if (u.level === 'danger' || u.level === 'rotten') {
        logEvent('wasted', item.category, u.level);
      }
    }
    items = items.filter(function (it) {
      return it.id !== id;
    });
    saveItems();
    if (item) announce(item.name + ' banished to the void.');
    render();
  }

  function rescueItem(id) {
    var item = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) { item = items[i]; break; }
    }
    if (item) {
      var u = getUrgency(item);
      logEvent('rescued', item.category, u.level);
      captureMonster(u.level);
      checkSecretUnlocks(item.id);
    }
    items = items.filter(function (it) {
      return it.id !== id;
    });
    incrementSouls();
    recordRescueDay();
    saveItems();
    if (item) announce(item.name + ' rescued. One more soul saved.');
    render();
  }

  // Freeze: extend an item's expiry by 14 days from its current expiry.
  // Not a rescue and not waste: stats, souls and history are untouched.
  function freezeItem(id) {
    var item = findItemById(id);
    if (!item) return;
    var parts = (item.expiryDate || '').split('-');
    var d = parts.length === 3
      ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0)
      : new Date();
    d.setDate(d.getDate() + 14);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    item.expiryDate = y + '-' + m + '-' + day;
    saveItems();
    announce(item.name + ' frozen. New expiry ' + item.expiryDate + '.');
    render();
  }

  function summonDemoPantry() {
    var base = new Date();
    base.setHours(0, 0, 0, 0);

    function dateStr(offsetDays) {
      var d = new Date(base);
      d.setDate(d.getDate() + offsetDays);
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    }

    var demoItems = [
      { name: 'Spinach',  category: 'produce', expiryDate: dateStr(10) },  // fresh
      { name: 'Cheese',   category: 'dairy',   expiryDate: dateStr(4)  },  // wary
      { name: 'Bananas',  category: 'produce', expiryDate: dateStr(1)  },  // danger
      { name: 'Chicken',  category: 'meat',    expiryDate: dateStr(-2) }   // rotten
    ];

    for (var i = 0; i < demoItems.length; i++) {
      var demo = demoItems[i];
      // Idempotent: skip demo items whose name already exists (case-insensitive)
      var exists = items.some(function (existing) {
        return existing.name.toLowerCase() === demo.name.toLowerCase();
      });
      if (exists) continue;
      items.push({
        id: generateId(),
        name: demo.name,
        category: demo.category,
        expiryDate: demo.expiryDate
      });
    }

    saveItems();
    announce('Demo pantry summoned: 4 items added.');
    render();
  }

  // ===== Item Photos (downscaled before saving) =====

  // Shrinks a photo file to a small JPEG data URL so localStorage stays light.
  // Calls back with the data URL, or null when the file cannot be processed.
  function processPhoto(file, callback) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
      callback(null);
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, PHOTO_MAX_DIM / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        try {
          callback(canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY));
        } catch (e) {
          callback(null);
        }
      };
      img.onerror = function () { callback(null); };
      img.src = reader.result;
    };
    reader.onerror = function () { callback(null); };
    reader.readAsDataURL(file);
  }

  function countPhotos() {
    var n = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].photo) n++;
    }
    return n;
  }

  // Live thumbnail preview when the user picks a photo in the form.
  function handlePhotoChange(e) {
    var input = e.target;
    if (!input || input.id !== 'item-photo') return;
    var preview = document.getElementById('photo-preview');
    if (!preview) return;
    var file = input.files && input.files[0];
    if (!file) {
      preview.setAttribute('hidden', '');
      preview.innerHTML = '';
      return;
    }
    processPhoto(file, function (dataUrl) {
      if (!dataUrl) {
        preview.setAttribute('hidden', '');
        preview.innerHTML = '';
        return;
      }
      preview.innerHTML = '<img src="' + dataUrl + '" alt="Photo preview">';
      preview.removeAttribute('hidden');
    });
  }

  // ===== Modal =====

  function openConfirmDialog(itemName, onConfirm, triggerEl) {
    closeModal();

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modal-title');

    overlay.innerHTML =
      '<div class="modal">' +
        '<p class="modal-title" id="modal-title">Banish ' + escapeHtml(itemName) + ' to the void?</p>' +
        '<div class="modal-buttons">' +
          '<button class="btn-modal btn-banish" data-modal-action="confirm">\uD83D\uDD2A Banish</button>' +
          '<button class="btn-modal btn-keep" data-modal-action="cancel">Keep</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    var banishBtn = overlay.querySelector('[data-modal-action="confirm"]');
    var keepBtn = overlay.querySelector('[data-modal-action="cancel"]');
    var focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');

    modalState = {
      overlay: overlay,
      triggerEl: triggerEl,
      onConfirm: onConfirm,
      focusableElements: focusable,
      firstFocusable: focusable[0],
      lastFocusable: focusable[focusable.length - 1]
    };

    // Focus "Keep" by default to prevent accidental deletion
    keepBtn.focus();

    // Button click handlers
    banishBtn.addEventListener('click', function () {
      var cb = modalState ? modalState.onConfirm : null;
      closeModal();
      if (cb) cb();
    });

    keepBtn.addEventListener('click', function () {
      closeModal();
    });

    // Click outside modal to close
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        closeModal();
      }
    });
  }

  function closeModal() {
    if (!modalState) return;
    var state = modalState;
    modalState = null;

    if (state.overlay && state.overlay.parentNode) {
      state.overlay.parentNode.removeChild(state.overlay);
    }
    document.body.style.overflow = '';

    if (state.triggerEl && state.triggerEl.focus) {
      state.triggerEl.focus();
    }
  }

  function handleModalKeydown(e) {
    if (!modalState) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
      return;
    }

    if (e.key === 'Tab' && modalState.focusableElements.length > 0) {
      var first = modalState.firstFocusable;
      var last = modalState.lastFocusable;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  // ===== Form Validation =====

  function showFieldError(form, fieldName, message) {
    var errorId = fieldName === 'expiryDate' ? 'error-expiry' : 'error-' + fieldName;
    var errorEl = form.querySelector('#' + errorId);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
    var input = form.elements[fieldName];
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.classList.add('input-error');
    }
  }

  function clearFormErrors(form) {
    var errors = form.querySelectorAll('.error-msg');
    for (var i = 0; i < errors.length; i++) {
      errors[i].textContent = '';
      errors[i].style.display = '';
    }
    var inputs = form.querySelectorAll('.input-error');
    for (var j = 0; j < inputs.length; j++) {
      inputs[j].classList.remove('input-error');
      inputs[j].removeAttribute('aria-invalid');
    }
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    var form = e.target;
    var name = form.elements['name'].value.trim();
    var category = form.elements['category'].value;
    var expiryDate = form.elements['expiryDate'].value;

    clearFormErrors(form);

    var valid = true;

    if (!name) {
      showFieldError(form, 'name', 'A name is required to summon this item.');
      valid = false;
    }

    if (!expiryDate) {
      showFieldError(form, 'expiryDate', 'An expiry date is required.');
      valid = false;
    }

    if (!valid) return;

    var photoInput = form.elements['photo'];
    var file = photoInput && photoInput.files && photoInput.files[0];
    if (!file) {
      addItem(name, category, expiryDate);
      return;
    }
    if (countPhotos() >= MAX_PHOTOS) {
      alert('FreshTrack: photo storage is full (' + MAX_PHOTOS + ' photos). The item was added without a photo.');
      addItem(name, category, expiryDate);
      return;
    }
    processPhoto(file, function (dataUrl) {
      addItem(name, category, expiryDate, dataUrl);
    });
  }

  // ===== Click Delegation =====

  function handleClick(e) {
    // Tab switcher (the desktop tab bar lives inside #app).
    var tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      e.preventDefault();
      switchTab(tabBtn.getAttribute('data-tab'));
      return;
    }
    // Skip link: jump to the Pantry tab instead of a hidden anchor.
    var skip = e.target.closest('.skip-link');
    if (skip) {
      e.preventDefault();
      switchTab('pantry');
      return;
    }
    var target = e.target.closest('[data-action]');
    if (!target) return;

    var action = target.getAttribute('data-action');

    if (action === 'delete') {
      e.preventDefault();
      var id = target.getAttribute('data-id');
      var name = target.getAttribute('data-name');
      openConfirmDialog(name, function () { deleteItem(id); }, target);

    } else if (action === 'rescue') {
      e.preventDefault();
      var rescueId = target.getAttribute('data-id');
      rescueItem(rescueId);

    } else if (action === 'freeze') {
      e.preventDefault();
      freezeItem(target.getAttribute('data-id'));

    } else if (action === 'summon-demo') {
      e.preventDefault();
      summonDemoPantry();

    } else if (action === 'toggle-recipes') {
      e.preventDefault();
      var recipeList = target.nextElementSibling;
      if (recipeList) {
        if (recipeList.hasAttribute('hidden')) {
          recipeList.removeAttribute('hidden');
          target.setAttribute('aria-expanded', 'true');
        } else {
          recipeList.setAttribute('hidden', '');
          target.setAttribute('aria-expanded', 'false');
        }
      }

    } else if (action === 'expand-recipe') {
      e.preventDefault();
      var details = target.nextElementSibling;
      if (details) {
        if (details.hasAttribute('hidden')) {
          details.removeAttribute('hidden');
          target.setAttribute('aria-expanded', 'true');
        } else {
          details.setAttribute('hidden', '');
          target.setAttribute('aria-expanded', 'false');
        }
      }

    } else if (action === 'filter-recipes') {
      e.preventDefault();
      recipeFilter = target.getAttribute('data-filter') || 'All';
      var section = target.closest('.rescue-section');
      if (section) {
        var card = section.closest('.card');
        var itemId = card ? card.getAttribute('data-id') : null;
        var filterItem = itemId ? findItemById(itemId) : null;
        var list = section.querySelector('.recipe-list');
        if (list && filterItem) list.innerHTML = renderRecipeListInner(filterItem);
      }

    } else if (action === 'ai-recipe') {
      e.preventDefault();
      handleAiRecipe(target.getAttribute('data-id'), target.getAttribute('data-name'));

    } else if (action === 'toggle-music') {
      e.preventDefault();
      setMusicEnabled(!musicEnabled);
      render();
      announce(musicEnabled ? 'Background music on.' : 'Background music off.');

    } else if (action === 'cycle-night') {
      e.preventDefault();
      // Cycles Auto -> On -> Off -> Auto.
      nightPref = nightPref === 'auto' ? 'on' : nightPref === 'on' ? 'off' : 'auto';
      saveNightPref();
      applyNightMode();
      render();

    } else if (action === 'share-weekly') {
      e.preventDefault();
      handleWeeklyShare();

    } else if (action === 'enable-reminders') {
      e.preventDefault();
      requestReminderPermission();

    } else if (action === 'share-card') {
      e.preventDefault();
      handleShare();

    } else if (action === 'cook-tonight') {
      e.preventDefault();
      handleCookTonight();

    } else if (action === 'create-household') {
      e.preventDefault();
      createHousehold();

    } else if (action === 'join-household') {
      e.preventDefault();
      var codeInput = document.getElementById('household-code-input');
      var code = codeInput ? codeInput.value.trim().toUpperCase() : '';
      if (!/^[A-Z0-9]{6}$/.test(code)) {
        showHouseholdError('Enter the 6-character household code, like ABC123.');
      } else {
        joinHousehold(code);
      }

    } else if (action === 'leave-household') {
      e.preventDefault();
      leaveHousehold();

    } else if (action === 'copy-household-code') {
      e.preventDefault();
      copyHouseholdCode();
    }
  }

  // ===== Daily Reminder (Notifications) =====

  function requestReminderPermission() {
    if (!('Notification' in window)) return;
    var after = function (permission) {
      if (permission === 'granted') {
        maybeShowReminderNotification();
      }
      render();
    };
    var result = Notification.requestPermission(after);
    if (result && typeof result.then === 'function') {
      result.then(after);
    }
  }

  function maybeShowReminderNotification() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var soon = getExpiringSoonItems();
    if (soon.length === 0) return; // honest: no spam when nothing is expiring

    var names = soon.map(function (entry) { return entry.item.name; }).join(', ');
    var title = soon.length === 1
      ? '\uD83D\uDC80 1 item expiring soon!'
      : '\uD83D\uDC80 ' + soon.length + ' items expiring soon!';
    var body = 'Save them before they rot: ' + names;
    try {
      new Notification(title, { body: body });
    } catch (e) {
      /* notifications may be blocked at runtime; fail silently */
    }
  }

  // ===== Share Card (Canvas + Web Share) =====

  function drawShareCard(callback) {
    var doDraw = function () {
      var canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 340;
      var ctx = canvas.getContext('2d');

      // Background gradient.
      var bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bg.addColorStop(0, '#1a1424');
      bg.addColorStop(1, '#0d0a14');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Spooky border.
      ctx.strokeStyle = '#3a2d4f';
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

      // Title.
      ctx.textAlign = 'center';
      ctx.fillStyle = '#d64545';
      ctx.font = '52px Creepster, Impact, "Arial Black", sans-serif';
      ctx.fillText('FreshTrack', canvas.width / 2, 80);

      // Subtitle.
      ctx.fillStyle = '#8a7fa0';
      ctx.font = 'italic 18px sans-serif';
      ctx.fillText('Save them before they rot.', canvas.width / 2, 110);

      // Stats row.
      var captured = countCaptured();
      var stats = [
        { value: String(soulsSaved), label: 'Souls Saved' },
        { value: String(captured), label: 'Monsters Rescued' }
      ];
      var colW = canvas.width / stats.length;
      for (var i = 0; i < stats.length; i++) {
        var cx = colW * i + colW / 2;
        ctx.fillStyle = '#6abf69';
        ctx.font = 'bold 56px sans-serif';
        ctx.fillText(stats[i].value, cx, 200);
        ctx.fillStyle = '#e8e0f0';
        ctx.font = '18px sans-serif';
        ctx.fillText(stats[i].label, cx, 232);
      }

      // Divider.
      ctx.strokeStyle = '#3a2d4f';
      ctx.beginPath();
      ctx.moveTo(60, 260);
      ctx.lineTo(canvas.width - 60, 260);
      ctx.stroke();

      // Hashtag caption.
      ctx.fillStyle = '#e0a44a';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('#KiroweenHackathon26', canvas.width / 2, 300);

      // Footer line.
      ctx.fillStyle = '#8a7fa0';
      ctx.font = '13px sans-serif';
      ctx.fillText('Kiroween 2026 \u2014 Costume Contest', canvas.width / 2, 322);

      if (canvas.toBlob) {
        canvas.toBlob(callback, 'image/png');
      } else {
        // Legacy fallback: data URL.
        var dataUrl = canvas.toDataURL('image/png');
        callback(null, dataUrl);
      }
    };

    // Ensure custom font is ready before drawing, if supported.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(doDraw).catch(doDraw);
    } else {
      doDraw();
    }
  }

  function handleShare() {
    drawShareCard(function (blob, fallbackDataUrl) {
      var caption = 'I\u2019ve saved ' + soulsSaved + ' souls from the void with FreshTrack! ' +
        countCaptured() + ' monsters captured. #KiroweenHackathon26';

      // Prefer Web Share API with a real file, when available.
      if (blob && navigator.canShare && navigator.canShare({ files: [new File([blob], 'freshtrack-share.png', { type: 'image/png' })] })) {
        var file = new File([blob], 'freshtrack-share.png', { type: 'image/png' });
        navigator.share({
          title: 'FreshTrack',
          text: caption,
          files: [file]
        }).catch(function () { /* user cancelled or unsupported */ });
        return;
      }

      // Fallback: download the PNG.
      var url = blob ? URL.createObjectURL(blob) : fallbackDataUrl;
      var a = document.createElement('a');
      a.href = url;
      a.download = 'freshtrack-share.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (blob) { setTimeout(function () { URL.revokeObjectURL(url); }, 2000); }
    });
  }

  // ===== Weekly Recap Card (last 7 days) =====

  function countWeekEvents(type) {
    var cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    var n = 0;
    for (var i = 0; i < historyLog.length; i++) {
      if (historyLog[i].type === type && historyLog[i].ts >= cutoff) n++;
    }
    return n;
  }

  function drawWeeklyCard(callback) {
    var doDraw = function () {
      var canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 420;
      var ctx = canvas.getContext('2d');

      var bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bg.addColorStop(0, '#1a1424');
      bg.addColorStop(1, '#0d0a14');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#3a2d4f';
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#d64545';
      ctx.font = '48px Creepster, Impact, "Arial Black", sans-serif';
      ctx.fillText('FreshTrack', canvas.width / 2, 72);

      ctx.fillStyle = '#8a7fa0';
      ctx.font = 'italic 18px sans-serif';
      ctx.fillText('This week in the haunted fridge', canvas.width / 2, 104);

      var stats = [
        { value: String(countWeekEvents('rescued')), label: 'Souls Rescued' },
        { value: String(countWeekEvents('wasted')), label: 'Lost to the Void' },
        { value: String(streakState.count), label: 'Day Streak' }
      ];
      var colW = canvas.width / stats.length;
      for (var i = 0; i < stats.length; i++) {
        var cx = colW * i + colW / 2;
        ctx.fillStyle = '#6abf69';
        ctx.font = 'bold 52px sans-serif';
        ctx.fillText(stats[i].value, cx, 210);
        ctx.fillStyle = '#e8e0f0';
        ctx.font = '18px sans-serif';
        ctx.fillText(stats[i].label, cx, 242);
      }

      ctx.strokeStyle = '#3a2d4f';
      ctx.beginPath();
      ctx.moveTo(60, 290);
      ctx.lineTo(canvas.width - 60, 290);
      ctx.stroke();

      ctx.fillStyle = '#e0a44a';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('#KiroweenHackathon26', canvas.width / 2, 330);

      ctx.fillStyle = '#8a7fa0';
      ctx.font = '13px sans-serif';
      ctx.fillText('Kiroween 2026 \u2014 Costume Contest', canvas.width / 2, 356);

      if (canvas.toBlob) {
        canvas.toBlob(callback, 'image/png');
      } else {
        callback(null, canvas.toDataURL('image/png'));
      }
    };

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(doDraw).catch(doDraw);
    } else {
      doDraw();
    }
  }

  function handleWeeklyShare() {
    drawWeeklyCard(function (blob, fallbackDataUrl) {
      var caption = 'My FreshTrack week: ' + countWeekEvents('rescued') +
        ' souls rescued, ' + streakState.count + '-day streak. #KiroweenHackathon26';

      if (blob && navigator.canShare && navigator.canShare({ files: [new File([blob], 'freshtrack-weekly.png', { type: 'image/png' })] })) {
        var file = new File([blob], 'freshtrack-weekly.png', { type: 'image/png' });
        navigator.share({
          title: 'FreshTrack Weekly Recap',
          text: caption,
          files: [file]
        }).catch(function () { /* user cancelled or unsupported */ });
        return;
      }

      var url = blob ? URL.createObjectURL(blob) : fallbackDataUrl;
      var a = document.createElement('a');
      a.href = url;
      a.download = 'freshtrack-weekly.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (blob) { setTimeout(function () { URL.revokeObjectURL(url); }, 2000); }
    });
  }

  // ===== Bottom Navigation (mobile only) =====

  // Builds the fixed bottom nav once and appends it to <body> (outside #app,
  // so it survives the full re-render of #app on every state change).
  // The nav is a second tab switcher: tapping an item switches tabs.
  function createBottomNav() {
    if (document.getElementById('bottom-nav')) return;

    var nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.id = 'bottom-nav';
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', 'FreshTrack sections');
    nav.innerHTML =
      '<button type="button" class="nav-item" id="navtab-pantry" role="tab" data-tab="pantry" aria-selected="true" aria-controls="panel-pantry" aria-label="Open Pantry tab">' +
        '<span class="nav-icon" aria-hidden="true">\uD83E\uDDDB</span>' +
        '<span class="nav-label">Pantry</span>' +
      '</button>' +
      '<button type="button" class="nav-item" id="navtab-impact" role="tab" data-tab="impact" aria-selected="false" aria-controls="panel-impact" aria-label="Open Impact tab">' +
        '<span class="nav-icon" aria-hidden="true">\uD83D\uDCCA</span>' +
        '<span class="nav-label">Impact</span>' +
      '</button>' +
      '<button type="button" class="nav-item" id="navtab-codex" role="tab" data-tab="codex" aria-selected="false" aria-controls="panel-codex" aria-label="Open Codex tab">' +
        '<span class="nav-icon" aria-hidden="true">\uD83D\uDCDC</span>' +
        '<span class="nav-label">Codex</span>' +
      '</button>' +
      '<button type="button" class="nav-item" id="navtab-share" role="tab" data-tab="share" aria-selected="false" aria-controls="panel-share" aria-label="Open Share tab">' +
        '<span class="nav-icon" aria-hidden="true">\uD83D\uDCF8</span>' +
        '<span class="nav-label">Share</span>' +
      '</button>';

    document.body.appendChild(nav);
    nav.addEventListener('click', handleNavClick);
  }

  // Click handling for the bottom nav: every item switches tabs.
  function handleNavClick(e) {
    var btn = e.target.closest('.nav-item');
    if (!btn) return;
    switchTab(btn.getAttribute('data-tab'));
  }

  // ===== Installable App (PWA, Phase 20) =====
  // Registers the offline service worker. Best effort only: if it
  // fails (old browser, file:// URL), the app keeps working online.
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return;
    try {
      navigator.serviceWorker.register('sw.js').catch(function () { /* optional */ });
    } catch (e) { /* optional */ }
  }

  // ===== Countdown Refresh =====

  function checkDayChange() {
    applyNightMode(); // auto night mode flips at 18:00 / 06:00
    var today = getTodayStr();
    if (today !== lastRenderedDay) {
      render();
    }
  }

  // ===== Init =====

  function init() {
    items = loadItems();
    soulsSaved = loadSoulsSaved();
    historyLog = loadHistory();
    var codex = loadCodex();
    var levels = ['fresh', 'wary', 'danger', 'rotten'];
    for (var i = 0; i < levels.length; i++) {
      capturedMonsters[levels[i]] = codex[levels[i]].captured;
      monsterCounts[levels[i]] = codex[levels[i]].count;
    }
    for (var s = 0; s < SECRET_KEYS.length; s++) {
      secretCaptured[SECRET_KEYS[s]] = !!codex.secrets[SECRET_KEYS[s]];
    }
    streakState = loadStreak();
    musicEnabled = loadMusicEnabled();
    nightPref = loadNightPref();
    syncState = loadSync();
    applyNightMode();
    // Deep link: #pantry / #impact / #codex / #share opens that tab on load.
    var hashTab = (window.location.hash || '').replace('#', '');
    if (TAB_IDS.indexOf(hashTab) !== -1) activeTab = hashTab;
    createBottomNav();
    render();
    registerServiceWorker();
    // If this device already belongs to a household, pull the server
    // copy once (adopts it only when it is newer than local data).
    if (syncState.code) pullPantry();

    var app = document.getElementById('app');
    app.addEventListener('submit', handleFormSubmit);
    app.addEventListener('click', handleClick);
    app.addEventListener('change', handlePhotoChange);

    // Global keyboard handling for modal (Escape + focus trap)
    document.addEventListener('keydown', handleModalKeydown);

    // Prime the audio engine on the first user gesture: browsers block
    // sound before any interaction, so the music starts here instead.
    var primedAudio = false;
    function primeAudio() {
      if (primedAudio) return;
      primedAudio = true;
      if (musicEnabled) startMusic();
    }
    document.addEventListener('pointerdown', primeAudio, { once: true });
    document.addEventListener('keydown', primeAudio, { once: true });

    // Countdown refresh: check every minute for day change
    setInterval(checkDayChange, 60000);

    // Also re-check when tab regains visibility; pause the music while
    // the tab is hidden to save battery, resume it on return.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        checkDayChange();
      }
      var ctx = getAudioCtx();
      if (!ctx) return;
      try {
        if (document.hidden) ctx.suspend();
        else ctx.resume();
      } catch (e) { /* audio unavailable */ }
    });

    // Deep-link hash changes (back/forward, pasted links) switch tabs.
    window.addEventListener('hashchange', function () {
      var h = (window.location.hash || '').replace('#', '');
      if (TAB_IDS.indexOf(h) !== -1 && h !== activeTab) {
        switchTab(h, { focus: false, updateHash: false });
      }
    });

    // Daily Reminder: if permission already granted, notify on open.
    maybeShowReminderNotification();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
