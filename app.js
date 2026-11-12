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
  var soundsEnabled = false;        // Spooky Sounds toggle (default OFF)
  var audioCtx = null;              // lazily-created Web Audio context
  var navObserver = null;           // IntersectionObserver for bottom-nav active state

  // ===== Constants =====
  var STORAGE_KEY = 'freshtrack.items';
  var SOULS_KEY = 'freshtrack.soulsSaved';
  var HISTORY_KEY = 'freshtrack.history';
  var CODEX_KEY = 'freshtrack.codex';
  var SOUNDS_KEY = 'freshtrack.sounds';
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

  function loadCodex() {
    var fresh = { fresh: false, wary: false, danger: false, rotten: false };
    try {
      var raw = localStorage.getItem(CODEX_KEY);
      if (!raw) return fresh;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fresh;
      fresh.fresh = !!parsed.fresh;
      fresh.wary = !!parsed.wary;
      fresh.danger = !!parsed.danger;
      fresh.rotten = !!parsed.rotten;
      return fresh;
    } catch (e) {
      return fresh;
    }
  }

  function saveCodex() {
    try {
      localStorage.setItem(CODEX_KEY, JSON.stringify(capturedMonsters));
    } catch (e) {
      /* silent — codex is non-critical */
    }
  }

  // Marks a monster as captured when an item at its urgency level is rescued.
  function captureMonster(level) {
    if (capturedMonsters.hasOwnProperty(level) && !capturedMonsters[level]) {
      capturedMonsters[level] = true;
      saveCodex();
    }
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
      renderControls() +
      renderForm() +
      renderTodaysHorrors() +
      renderItemList() +
      renderImpactDashboard() +
      renderCodex() +
      renderFooter();
    lastRenderedDay = getTodayStr();
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
    return { total: total, inPeril: inPeril, soulsSaved: soulsSaved };
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
            '<input type="text" id="item-name" name="name" placeholder="e.g., Spinach" required autocomplete="off">' +
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
            '<input type="date" id="item-expiry" name="expiryDate" required>' +
            '<span class="error-msg" id="error-expiry" role="alert"></span>' +
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
    return '<section id="pantry" aria-label="Pantry"><main class="item-list">' + cards + '</main></section>';
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
          '<span class="monster" aria-hidden="true">' + monster + '</span>' +
          '<div class="card-info">' +
            '<h3 class="item-name">' + escapeHtml(item.name) + '</h3>' +
            '<div class="card-meta">' +
              '<span class="category">' + escapeHtml(capitalize(item.category)) + '</span>' +
              '<span class="badge badge-' + level + '" role="status">' + escapeHtml(daysText) + '</span>' +
              '<span class="urgency-label urgency-' + level + '">' + label + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="card-actions">' +
            '<button class="btn-rescue" data-action="rescue" data-id="' + escapeHtml(item.id) + '" data-name="' + escapeHtml(item.name) + '" aria-label="Rescue ' + escapeHtml(item.name) + '">\u{1F6E1}\uFE0F</button>' +
            '<button class="btn-delete" data-action="delete" data-id="' + escapeHtml(item.id) + '" data-name="' + escapeHtml(item.name) + '" aria-label="Delete ' + escapeHtml(item.name) + '">\u2715</button>' +
          '</div>' +
        '</div>';

    if (level === 'danger' || level === 'rotten') {
      html += renderRecipeSuggestions(item);
    }

    html += '</article>';
    return html;
  }

  function renderRecipeSuggestions(item) {
    var recipes = matchRecipes(item);
    var count = recipes.length;
    var toggleText = count > 0
      ? '\uD83C\uDF73 Rescue Recipes (' + count + ')'
      : '\uD83C\uDF73 Rescue Recipes';

    var content;
    if (recipes.length === 0) {
      content = '<p class="no-recipes">No rescue recipes found for this item. Time to improvise... or bid farewell.</p>';
    } else {
      content = recipes.map(function (recipe) {
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
      }).join('');
    }

    return '' +
      '<div class="rescue-section">' +
        '<button class="rescue-toggle" data-action="toggle-recipes" data-id="' + escapeHtml(item.id) + '" aria-expanded="false">' +
          toggleText +
        '</button>' +
        '<div class="recipe-list" hidden>' +
          content +
        '</div>' +
      '</div>';
  }

  function renderEmptyState() {
    return '' +
      '<div class="empty-state">' +
        '<span class="empty-icon" aria-hidden="true">\uD83D\uDC80</span>' +
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

    var soundsLabel = soundsEnabled ? '\uD83D\uDD0A Sounds: On' : '\uD83D\uDD0A Sounds: Off';
    var soundsState = soundsEnabled ? 'on' : 'off';

    return '' +
      '<div class="controls-strip" role="toolbar" aria-label="App controls">' +
        '<button type="button" class="ctrl-btn ctrl-reminder' + (reminderDisabled ? ' disabled' : '') +
          '" data-action="enable-reminders"' + (reminderDisabled ? ' disabled aria-disabled="true"' : '') + '>' +
          reminderLabel +
        '</button>' +
        '<button type="button" class="ctrl-btn ctrl-sounds" data-action="toggle-sounds" aria-pressed="' + soundsEnabled + '">' +
          soundsLabel +
        '</button>' +
        '<button type="button" class="ctrl-btn ctrl-share" data-action="share-card">' +
          '\uD83D\uDCF8 Share Card' +
        '</button>' +
      '</div>';
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
    return n;
  }

  function renderCodex() {
    var levels = ['fresh', 'wary', 'danger', 'rotten'];
    var cards = levels.map(function (level) {
      var captured = capturedMonsters[level];
      var monster = URGENCY_MONSTERS[level];
      var label = URGENCY_LABELS[level];
      var state = captured ? 'captured' : 'unknown';
      var badge = captured
        ? '<span class="codex-badge captured">\u2714 Captured</span>'
        : '<span class="codex-badge locked">\u2716 Not Yet Captured</span>';
      return '' +
        '<div class="codex-card" data-urgency="' + level + '" data-state="' + state + '">' +
          '<span class="codex-monster" aria-hidden="true">' + monster + '</span>' +
          '<div class="codex-info">' +
            '<h3 class="codex-name">' + label + '</h3>' +
            '<p class="codex-lore">' + escapeHtml(MONSTER_LORE[level]) + '</p>' +
            badge +
          '</div>' +
        '</div>';
    }).join('');

    return '' +
      '<section class="codex-section" id="codex" aria-label="Monster Codex">' +
        '<h2 class="section-title">\uD83D\uDCDC Monster Codex</h2>' +
        '<p class="section-sub">Rescue an item at each urgency level to capture its monster. ' +
          countCaptured() + ' / 4 captured.</p>' +
        '<div class="codex-grid">' + cards + '</div>' +
      '</section>';
  }

  // ===== Actions =====

  function addItem(name, category, expiryDate) {
    var item = {
      id: generateId(),
      name: name.trim(),
      category: category,
      expiryDate: expiryDate
    };
    items.push(item);
    saveItems();
    // Spooky Sounds: creak when a danger item joins the fridge.
    var u = getUrgency(item);
    if (u.level === 'danger') {
      playCreak();
    }
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
    }
    items = items.filter(function (it) {
      return it.id !== id;
    });
    incrementSouls();
    saveItems();
    playChime();   // Spooky Sounds: chime on rescue
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
    render();
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

    addItem(name, category, expiryDate);
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

    } else if (action === 'enable-reminders') {
      e.preventDefault();
      requestReminderPermission();

    } else if (action === 'share-card') {
      e.preventDefault();
      handleShare();
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
    capturedMonsters = loadCodex();
    soundsEnabled = loadSoundsEnabled();
    createBottomNav();
    render();

    var app = document.getElementById('app');
    app.addEventListener('submit', handleFormSubmit);
    app.addEventListener('click', handleClick);

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
