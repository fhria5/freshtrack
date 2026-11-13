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
  var soundsEnabled = false;        // Spooky Sounds toggle (default OFF)
  var nightPref = 'auto';           // Night Mode: 'auto' | 'on' | 'off'
  var recipeFilter = 'All';         // recipe category filter: 'All' | 'Breakfast' | 'Lunch' | 'Snack' | 'Dinner'
  var recipeFilterItem = null;      // id of the item the recipe filter belongs to; other items always start at 'All'
  var aiCache = {};                 // AI recipes in memory only, keyed by item name (lowercase)
  var aiLoading = {};               // item names with an AI request in flight
  var aiFallback = {};              // item names whose last AI attempt fell back to pantry recipes
  var aiOpen = {};                  // item names with the AI recipe expanded
  var tonightLoading = false;       // Cook Tonight request in flight
  var audioCtx = null;              // lazily-created Web Audio context
  var navObserver = null;           // IntersectionObserver for bottom-nav active state

  // ===== Constants =====
  var STORAGE_KEY = 'freshtrack.items';
  var SOULS_KEY = 'freshtrack.soulsSaved';
  var HISTORY_KEY = 'freshtrack.history';
  var CODEX_KEY = 'freshtrack.codex';
  var SOUNDS_KEY = 'freshtrack.sounds';
  var STREAK_KEY = 'freshtrack.streak';
  var NIGHT_KEY = 'freshtrack.nightmode';
  var AI_API_URL = 'https://grokingstore.my.id/freshtrack-ai/api/recipe';
  var AI_TIMEOUT_MS = 15000;        // AI request timeout (ms)
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
    // Glimmer Sprout: rescued an item that had a real AI recipe.
    if (aiRecipeReady[itemId]) unlockSecret('secretFresh');
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

  // ===== Spooky Sounds Persistence =====

  function loadSoundsEnabled() {
    try {
      return localStorage.getItem(SOUNDS_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  function saveSoundsEnabled() {
    try {
      localStorage.setItem(SOUNDS_KEY, soundsEnabled ? 'true' : 'false');
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

  // Short creak — played when a danger item is added.
  function playCreak() {
    if (!soundsEnabled) return;
    var ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }

    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.3);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  // Bright chime — played when an item is rescued.
  function playChime() {
    if (!soundsEnabled) return;
    var ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }

    var freqs = [880, 1320];
    for (var i = 0; i < freqs.length; i++) {
      var start = ctx.currentTime + i * 0.08;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[i], start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    }
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

  // Category keywords used as matching metadata inside RECIPES ingredient
  // lists. They are NOT real ingredients and are never shown to the user
  // (recipeEntryHtml filters them out of the displayed list).
  var CATEGORY_KEYWORDS = {
    produce: 'fresh produce',
    dairy: 'dairy products',
    meat: 'meat',
    pantry: 'pantry staples',
    bakery: 'bakery item'
  };

  // Generic words that read as nonsense when shown as an ingredient.
  var GENERIC_INGREDIENTS = [
    'fresh produce', 'dairy products', 'pantry staples', 'bakery item',
    'meat', 'vegetables', 'fruit', 'herbs'
  ];

  // "Bananas" -> "banana", "Tomatoes" -> "tomato", "Oats" -> "oat".
  function singularize(word) {
    var w = String(word || '').trim().toLowerCase();
    if (w.length > 4 && w.slice(-3) === 'oes') return w.slice(0, -2);
    if (w.length > 4 && (w.slice(-4) === 'ches' || w.slice(-4) === 'shes' ||
        w.slice(-4) === 'sses' || w.slice(-3) === 'xes' || w.slice(-3) === 'zes')) {
      return w.slice(0, -2);
    }
    if (w.length > 3 && w.slice(-1) === 's') return w.slice(0, -1);
    return w;
  }

  function itemKey(item) {
    return singularize(item.name);
  }

  // Returns { primary: [...], secondary: [...] }.
  // Primary: the recipe's `main` field names this item — a real main
  // ingredient, so the recipe genuinely uses the item being rescued.
  // Secondary: the recipe only matches the item's category keyword
  // (e.g. "fresh produce") — shown separately under "Also try", capped at 4.
  // The old matcher treated a category-keyword hit as a full match, which is
  // why Bananas listed 19 mostly-irrelevant recipes.
  function matchRecipesGrouped(item) {
    var key = itemKey(item);
    var catKeyword = CATEGORY_KEYWORDS[(item.category || '').toLowerCase()] || null;
    var primary = [];
    var secondary = [];
    var all = getRecipes();
    for (var i = 0; i < all.length; i++) {
      var r = all[i];
      var mains = r.main || [];
      var isPrimary = false;
      for (var m = 0; m < mains.length; m++) {
        if (singularize(mains[m]) === key) { isPrimary = true; break; }
      }
      if (isPrimary) { primary.push(r); continue; }
      if (catKeyword) {
        var ings = r.ingredients || [];
        for (var j = 0; j < ings.length; j++) {
          if (String(ings[j]).toLowerCase() === catKeyword) { secondary.push(r); break; }
        }
      }
    }
    return { primary: primary, secondary: secondary.slice(0, 4) };
  }

  // Backwards-compatible flat list: primary matches first, then "also try".
  function matchRecipes(item) {
    var g = matchRecipesGrouped(item);
    return g.primary.concat(g.secondary);
  }

  // ===== Rendering =====

  function render() {
    var app = document.getElementById('app');
    app.innerHTML =
      renderHeader() +
      renderControls() +
      renderForm() +
      renderChallenge() +
      renderTodaysHorrors() +
      renderItemList() +
      renderImpactDashboard() +
      renderCodex() +
      renderFooter();
    lastRenderedDay = getTodayStr();
    applyNightMode();
    // Sections are recreated on each render — re-observe them so the
    // bottom-nav active state keeps tracking the on-screen section.
    refreshNavTargets();
  }

  function renderHeader() {
    var stats = computeStats();
    return '' +
      '<header class="header">' +
        '<h1 class="app-title">FreshTrack</h1>' +
        '<p class="subtitle">Save them before they rot.</p>' +
        renderStatsStrip(stats) +
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
          (item.photo
            ? '<img class="item-photo" src="' + item.photo + '" alt="Photo of ' + escapeHtml(item.name) + '" loading="lazy">'
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
            '<button class="btn-ai" data-action="ai-recipe" data-id="' + escapeHtml(item.id) + '" data-name="' + escapeHtml(item.name) + '" aria-label="Get an AI recipe for ' + escapeHtml(item.name) + '">\u2728</button>' +
            '<button class="btn-rescue" data-action="rescue" data-id="' + escapeHtml(item.id) + '" data-name="' + escapeHtml(item.name) + '" aria-label="Rescue ' + escapeHtml(item.name) + '">\u{1F6E1}\uFE0F</button>' +
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
    // Category keywords are matching metadata, not food — never show them
    // as ingredients (no more "dairy products" in an ingredient list).
    var ingredientList = (recipe.ingredients || []).filter(function (ing) {
      return GENERIC_INGREDIENTS.indexOf(String(ing || '').toLowerCase()) === -1;
    }).map(function (ing) {
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
    var grouped = matchRecipesGrouped(item);
    // The meal filter belongs to one item only. Opening another item's list
    // always starts at 'All' — the old global filter stuck across items and
    // showed "No recipes in this category" for items that have recipes.
    var effectiveFilter = (recipeFilterItem && recipeFilterItem !== item.id) ? 'All' : recipeFilter;
    var chips = ['All', 'Breakfast', 'Lunch', 'Snack', 'Dinner'].map(function (cat) {
      return '<button type="button" class="filter-chip' + (effectiveFilter === cat ? ' active' : '') +
        '" data-action="filter-recipes" data-filter="' + cat + '" aria-pressed="' + (effectiveFilter === cat) + '">' + cat + '</button>';
    }).join('');

    var renderGroup = function (list, heading) {
      var filtered = effectiveFilter === 'All'
        ? list
        : list.filter(function (r) { return r.category === effectiveFilter; });
      if (filtered.length === 0) return '';
      return (heading ? '<p class="also-try-heading">' + escapeHtml(heading) + '</p>' : '') +
        filtered.map(recipeEntryHtml).join('');
    };

    var primaryHtml = renderGroup(grouped.primary, '');
    var secondaryHtml = renderGroup(grouped.secondary, 'Also try \u2014 uses other items from your fridge');
    var listHtml;
    if (grouped.primary.length === 0 && grouped.secondary.length === 0) {
      listHtml = '<p class="no-recipes">No rescue recipes found for this item. Time to improvise... or bid farewell.</p>';
    } else if (!primaryHtml && !secondaryHtml) {
      listHtml = '<p class="no-recipes">No recipes in this category for this item. Try another filter.</p>';
    } else {
      listHtml = primaryHtml + secondaryHtml;
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
      '</footer>';
  }

  // ===== Controls Strip (reminders / sounds / share) =====

  function renderControls() {
    var notifSupported = ('Notification' in window);
    var permission = notifSupported ? Notification.permission : 'unsupported';

    // The button is NEVER disabled: every state is clickable and explains
    // itself. A disabled button is a dead button — in headless browsers and
    // after a previous denial, permission is 'denied' from the start, which
    // used to render this button unclickable with no way back.
    var reminderLabel;
    if (!notifSupported) {
      reminderLabel = '\uD83D\uDD15 Reminders unavailable';
    } else if (permission === 'granted') {
      reminderLabel = '\uD83D\uDD14 Reminders On';
    } else if (permission === 'denied') {
      reminderLabel = '\uD83D\uDD15 Reminders Blocked';
    } else {
      reminderLabel = '\uD83D\uDD14 Enable Reminders';
    }

    var soundsLabel = soundsEnabled ? '\uD83D\uDD0A Sounds: On' : '\uD83D\uDD0A Sounds: Off';
    var soundsState = soundsEnabled ? 'on' : 'off';

    var nightLabel = nightPref === 'on' ? '\uD83C\uDF19 Night: On'
      : nightPref === 'off' ? '\uD83C\uDF19 Night: Off' : '\uD83C\uDF19 Night: Auto';

    var urgentCount = getUrgentItems().length;
    var tonightDisabled = urgentCount === 0 || tonightLoading;

    return '' +
      '<div class="controls-strip" role="toolbar" aria-label="App controls">' +
        '<button type="button" class="ctrl-btn ctrl-tonight" data-action="cook-tonight"' + (tonightDisabled ? ' disabled aria-disabled="true"' : '') + (urgentCount === 0 ? ' title="No urgent items to cook tonight"' : '') + '>' +
          '\uD83C\uDF73 Cook Tonight' +
        '</button>' +
        '<button type="button" class="ctrl-btn ctrl-reminder" data-action="enable-reminders">' +
          reminderLabel +
        '</button>' +
        '<button type="button" class="ctrl-btn ctrl-sounds" data-action="toggle-sounds" aria-pressed="' + soundsEnabled + '">' +
          soundsLabel +
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
    // Spooky Sounds: creak when a danger item joins the fridge.
    var u = getUrgency(item);
    if (u.level === 'danger') {
      playCreak();
    }
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
    playChime();   // Spooky Sounds: chime on rescue
    if (item) announce(item.name + ' rescued. One more soul saved.');
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
        recipeFilterItem = itemId; // the filter belongs to this item only
        var filterItem = itemId ? findItemById(itemId) : null;
        var list = section.querySelector('.recipe-list');
        if (list && filterItem) list.innerHTML = renderRecipeListInner(filterItem);
      }

    } else if (action === 'ai-recipe') {
      e.preventDefault();
      handleAiRecipe(target.getAttribute('data-id'), target.getAttribute('data-name'));

    } else if (action === 'toggle-sounds') {
      e.preventDefault();
      soundsEnabled = !soundsEnabled;
      saveSoundsEnabled();
      // Audio context must be created/resumed from a user gesture.
      if (soundsEnabled) {
        var ctx = getAudioCtx();
        if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (err) {} }
      }
      render();

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
    }
  }

  // ===== Generic info modal =====

  // Small modal for messages that must be SEEN (reminders status, errors).
  // Same overlay / focus-trap pattern as the other modals; closes on Close,
  // Escape, or clicking the overlay. Returns the overlay so callers can wire
  // extra buttons inside it. The body may include a hidden
  // `.modal-info-note` line that callers reveal with a follow-up message.
  function openInfoModal(title, bodyHtml, extraButtonsHtml) {
    closeModal();

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modal-title');

    overlay.innerHTML =
      '<div class="modal modal-info">' +
        '<p class="modal-title" id="modal-title">' + escapeHtml(title) + '</p>' +
        '<div class="modal-info-body">' + bodyHtml + '</div>' +
        '<p class="modal-info-note" hidden></p>' +
        '<div class="modal-buttons">' + (extraButtonsHtml || '') +
          '<button class="btn-modal btn-keep" data-modal-action="close">Close</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    var focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    modalState = {
      overlay: overlay,
      triggerEl: null,
      onConfirm: null,
      focusableElements: focusable,
      firstFocusable: focusable[0],
      lastFocusable: focusable[focusable.length - 1]
    };

    var closeBtn = overlay.querySelector('[data-modal-action="close"]');
    if (closeBtn) closeBtn.focus();
    if (closeBtn) closeBtn.addEventListener('click', function () { closeModal(); });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
    return overlay;
  }

  // ===== Daily Reminder (Notifications) =====

  var REMINDERS_BLOCKED_HTML =
    '<p>Notifications are blocked for this site, so FreshTrack can\'t remind you.</p>' +
    '<p>To turn them on, allow notifications in your browser\'s site settings ' +
    '(the lock or tune icon in the address bar), then reload this page.</p>';

  // Every outcome shows something visible. The old version returned silently
  // when notifications were unsupported or denied — and the button itself
  // used to render disabled in those states, so the click did nothing at all.
  function requestReminderPermission() {
    if (!('Notification' in window)) {
      openInfoModal('Reminders unavailable',
        '<p>Notifications aren\'t supported in this browser, so FreshTrack can\'t send reminders here.</p>' +
        '<p>Your pantry still works — check back before things rot.</p>');
      announce('Reminders are not supported in this browser.');
      return;
    }

    var permission = Notification.permission;

    if (permission === 'granted') {
      var soon = getExpiringSoonItems();
      var body = '<p>Reminders are <strong>on</strong>. FreshTrack will warn you when items are about to rot.</p>' +
        (soon.length > 0
          ? '<p>Expiring soon: ' + escapeHtml(soon.map(function (entry) { return entry.item.name; }).join(', ')) + '.</p>'
          : '<p>Nothing is expiring soon right now.</p>');
      var onOverlay = openInfoModal('Reminders are on', body,
        '<button class="btn-modal btn-keep" data-modal-action="test">Send a test reminder</button>');
      var testBtn = onOverlay.querySelector('[data-modal-action="test"]');
      if (testBtn) testBtn.addEventListener('click', function () {
        var note = onOverlay.querySelector('.modal-info-note');
        if (soon.length === 0) {
          if (note) {
            note.textContent = 'Nothing is expiring soon, so there was nothing to send — the reminder will fire when something is about to rot.';
            note.removeAttribute('hidden');
          }
        } else {
          maybeShowReminderNotification();
          if (note) {
            note.textContent = 'Test reminder sent — check your notifications.';
            note.removeAttribute('hidden');
          }
        }
      });
      announce('Reminders are on.');
      return;
    }

    if (permission === 'denied') {
      var blockedOverlay = openInfoModal('Reminders are blocked', REMINDERS_BLOCKED_HTML,
        '<button class="btn-modal btn-keep" data-modal-action="recheck">Check again</button>');
      var recheckBtn = blockedOverlay.querySelector('[data-modal-action="recheck"]');
      if (recheckBtn) recheckBtn.addEventListener('click', function () {
        closeModal();
        requestReminderPermission();
      });
      announce('Reminders are blocked. Notifications are disabled for this site.');
      return;
    }

    // 'default' — ask the browser for permission.
    var settled = false;
    var after = function (perm) {
      if (settled) return;
      settled = true;
      afterReminderPermission(perm);
    };
    try {
      var result = Notification.requestPermission(after);
      if (result && typeof result.then === 'function') result.then(after);
    } catch (e) {
      after('denied');
    }
  }

  function afterReminderPermission(permission) {
    if (permission === 'granted') {
      maybeShowReminderNotification();
      openInfoModal('Reminders on',
        '<p>Done — reminders are on. FreshTrack will warn you before things rot.</p>');
      announce('Reminders turned on.');
    } else if (permission === 'denied') {
      openInfoModal('Reminders are blocked', REMINDERS_BLOCKED_HTML);
      announce('Reminders are blocked. Notifications are disabled for this site.');
    } else {
      openInfoModal('Reminders off',
        '<p>No problem — reminders stay off. You can enable them anytime from the Reminders button.</p>');
      announce('Reminders stay off.');
    }
    render();
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

  // ===== Share Card (Canvas + Web Share) =====

  // The rendered card for the currently open share modal.
  var shareState = null; // { blob, url, filename, caption }

  // Opens the share modal IMMEDIATELY (with a loading line) so the click
  // always gives visible feedback, then fills in the rendered card image.
  // The old code showed nothing at all: it either opened the native share
  // sheet (which fails silently when the gesture expires or the OS has no
  // share targets) or silently downloaded a PNG nobody saw happening.
  function openShareModal(title, filename, caption) {
    closeModal();
    if (shareState && shareState.url && shareState.url.indexOf('blob:') === 0) {
      try { URL.revokeObjectURL(shareState.url); } catch (e) {}
    }
    shareState = { blob: null, url: null, filename: filename, caption: caption };

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modal-title');

    overlay.innerHTML =
      '<div class="modal modal-share">' +
        '<p class="modal-title" id="modal-title">' + escapeHtml(title) + '</p>' +
        '<p class="share-loading">Drawing your card...</p>' +
        '<img class="share-img" hidden alt="Your FreshTrack share card">' +
        '<p class="share-note" hidden></p>' +
        '<div class="modal-buttons">' +
          '<button class="btn-modal btn-share" data-modal-action="share" disabled>Share</button>' +
          '<button class="btn-modal btn-download" data-modal-action="download" disabled>Download PNG</button>' +
          '<button class="btn-modal btn-keep" data-modal-action="close">Close</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    var focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    modalState = {
      overlay: overlay,
      triggerEl: null,
      onConfirm: null,
      focusableElements: focusable,
      firstFocusable: focusable[0],
      lastFocusable: focusable[focusable.length - 1]
    };

    var closeBtn = overlay.querySelector('[data-modal-action="close"]');
    if (closeBtn) closeBtn.focus();
    if (closeBtn) closeBtn.addEventListener('click', function () { closeModal(); });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    var noteEl = overlay.querySelector('.share-note');
    var showNote = function (msg) {
      if (noteEl) { noteEl.textContent = msg; noteEl.removeAttribute('hidden'); }
    };

    var downloadBtn = overlay.querySelector('[data-modal-action="download"]');
    if (downloadBtn) downloadBtn.addEventListener('click', function () {
      if (!shareState || !shareState.url) return;
      var a = document.createElement('a');
      a.href = shareState.url;
      a.download = shareState.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      announce('Card downloaded.');
    });

    var shareBtn = overlay.querySelector('[data-modal-action="share"]');
    if (shareBtn) shareBtn.addEventListener('click', function () {
      if (!shareState || !shareState.blob) return;
      var file = new File([shareState.blob], shareState.filename, { type: 'image/png' });
      if (!(navigator.canShare && navigator.canShare({ files: [file] }))) {
        showNote('Sharing is not available in this browser — use Download instead.');
        return;
      }
      // Called synchronously inside this click handler, so the user gesture
      // is still valid. The old code called share() after async canvas
      // rendering, which can lose the gesture and fail silently.
      navigator.share({ title: 'FreshTrack', text: shareState.caption, files: [file] }).then(function () {
        announce('Card shared.');
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return; // user closed the share sheet
        showNote('Sharing failed here — use Download instead.');
      });
    });

    return overlay;
  }

  // Fills the open share modal with the rendered card image and enables
  // the Download / Share buttons.
  function fillShareModal(overlay, blob, fallbackDataUrl) {
    var url = blob ? URL.createObjectURL(blob) : fallbackDataUrl;
    if (shareState) { shareState.blob = blob; shareState.url = url; }
    var img = overlay.querySelector('.share-img');
    if (img) { img.src = url; img.removeAttribute('hidden'); }
    var loading = overlay.querySelector('.share-loading');
    if (loading) loading.setAttribute('hidden', '');
    var downloadBtn = overlay.querySelector('[data-modal-action="download"]');
    if (downloadBtn) downloadBtn.removeAttribute('disabled');
    var shareBtn = overlay.querySelector('[data-modal-action="share"]');
    if (shareBtn) {
      var canShareFiles = !!(blob && navigator.canShare &&
        navigator.canShare({ files: [new File([blob], shareState.filename, { type: 'image/png' })] }));
      if (canShareFiles) {
        shareBtn.removeAttribute('disabled');
      } else {
        shareBtn.setAttribute('disabled', '');
        var note = overlay.querySelector('.share-note');
        if (note) {
          note.textContent = 'Sharing is not available in this browser — use Download instead.';
          note.removeAttribute('hidden');
        }
      }
    }
  }

  function handleShare() {
    var caption = 'I\u2019ve saved ' + soulsSaved + ' souls from the void with FreshTrack! ' +
      countCaptured() + ' monsters captured. #KiroweenHackathon26';
    var overlay = openShareModal('Your FreshTrack Card', 'freshtrack-share.png', caption);
    announce('Drawing your FreshTrack card...');
    drawShareCard(function (blob, fallbackDataUrl) {
      fillShareModal(overlay, blob, fallbackDataUrl);
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
    var caption = 'My FreshTrack week: ' + countWeekEvents('rescued') +
      ' souls rescued, ' + streakState.count + '-day streak. #KiroweenHackathon26';
    var overlay = openShareModal('Your Weekly Recap', 'freshtrack-weekly.png', caption);
    announce('Drawing your weekly recap...');
    drawWeeklyCard(function (blob, fallbackDataUrl) {
      fillShareModal(overlay, blob, fallbackDataUrl);
    });
  }

  // ===== Bottom Navigation (mobile only) =====

  // Builds the fixed bottom nav once and appends it to <body> (outside #app,
  // so it survives the full re-render of #app on every state change).
  function createBottomNav() {
    if (document.getElementById('bottom-nav')) return;

    var nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.id = 'bottom-nav';
    nav.setAttribute('aria-label', 'Primary navigation');
    nav.innerHTML =
      '<button type="button" class="nav-item" data-nav="pantry" aria-label="Scroll to Pantry">' +
        '<span class="nav-icon" aria-hidden="true">\uD83E\uDDDB</span>' +
        '<span class="nav-label">Pantry</span>' +
      '</button>' +
      '<button type="button" class="nav-item" data-nav="impact" aria-label="Scroll to Impact Dashboard">' +
        '<span class="nav-icon" aria-hidden="true">\uD83D\uDCCA</span>' +
        '<span class="nav-label">Impact</span>' +
      '</button>' +
      '<button type="button" class="nav-item" data-nav="codex" aria-label="Scroll to Monster Codex">' +
        '<span class="nav-icon" aria-hidden="true">\uD83D\uDCDC</span>' +
        '<span class="nav-label">Codex</span>' +
      '</button>' +
      '<button type="button" class="nav-item" data-nav="share" aria-label="Share FreshTrack card">' +
        '<span class="nav-icon" aria-hidden="true">\uD83D\uDCF8</span>' +
        '<span class="nav-label">Share</span>' +
      '</button>';

    document.body.appendChild(nav);
    nav.addEventListener('click', handleNavClick);
  }

  // Click handling for the bottom nav. Pantry/Impact/Codex smooth-scroll to
  // their section anchor; Share reuses the existing share-card action.
  function handleNavClick(e) {
    var btn = e.target.closest('.nav-item');
    if (!btn) return;

    var target = btn.getAttribute('data-nav');
    if (target === 'share') {
      handleShare();
      return;
    }

    var el = document.getElementById(target);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveNav(target);
    }
  }

  // Toggles the .is-active highlight (and aria-current) on the matching item.
  function setActiveNav(id) {
    var navItems = document.querySelectorAll('#bottom-nav .nav-item');
    for (var i = 0; i < navItems.length; i++) {
      var isActive = navItems[i].getAttribute('data-nav') === id;
      navItems[i].classList.toggle('is-active', isActive);
      if (isActive) {
        navItems[i].setAttribute('aria-current', 'location');
      } else {
        navItems[i].removeAttribute('aria-current');
      }
    }
  }

  // Lazily creates the IntersectionObserver used to highlight whichever
  // section currently sits in the middle band of the viewport.
  function getNavObserver() {
    if (navObserver || !('IntersectionObserver' in window)) return navObserver;
    navObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          setActiveNav(entry.target.id);
        }
      });
    }, { rootMargin: '-40% 0px -45% 0px', threshold: 0 });
    return navObserver;
  }

  // Re-observes the current section elements (they are recreated each render).
  function refreshNavTargets() {
    var obs = getNavObserver();
    if (!obs) return;
    obs.disconnect();
    var ids = ['pantry', 'impact', 'codex'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el) obs.observe(el);
    }
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
    soundsEnabled = loadSoundsEnabled();
    nightPref = loadNightPref();
    applyNightMode();
    createBottomNav();
    render();

    var app = document.getElementById('app');
    app.addEventListener('submit', handleFormSubmit);
    app.addEventListener('click', handleClick);
    app.addEventListener('change', handlePhotoChange);

    // Global keyboard handling for modal (Escape + focus trap)
    document.addEventListener('keydown', handleModalKeydown);

    // Countdown refresh: check every minute for day change
    setInterval(checkDayChange, 60000);

    // Also re-check when tab regains visibility
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        checkDayChange();
      }
    });

    // Daily Reminder: if permission already granted, notify on open.
    maybeShowReminderNotification();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
