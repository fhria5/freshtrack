# FreshTrack — Design

## Architecture Overview

FreshTrack is a static single-page web app with no backend and no build step. The architecture is deliberately simple: a single HTML page that loads a stylesheet and JavaScript, with all state persisted in `localStorage`.

```
freshtrack/
├── index.html        # Single-page app shell, loads CSS and JS
├── styles.css        # Horror-themed styling, animations, responsive layout
├── recipes.js        # Built-in recipe bank data (loaded as a global)
└── app.js            # Application logic: state, rendering, events, persistence
```

No module system is used. `recipes.js` and `app.js` are loaded via `<script>` tags in order. `recipes.js` sets a global `RECIPES` array; `app.js` consumes it. This keeps the app runnable by simply opening `index.html` in a browser, with no server or bundler.

### Data Flow

```
User input ──► app.js (event handler)
                    │
                    ├─► update items array
                    ├─► persist to localStorage
                    └─► re-render DOM
```

All state lives in a single in-memory array (`items`) that is the source of truth. On every mutation (add/delete), the array is persisted to `localStorage` and the DOM is re-rendered from scratch. This is simple, reliable, and fast enough for a small list.

## Data Model

### Food Item

```json
{
  "id": "string (unique, generated via crypto.randomUUID() or Date.now()+random)",
  "name": "string (e.g., 'Spinach')",
  "category": "string (one of: produce, dairy, meat, pantry, bakery, other)",
  "expiryDate": "string (ISO date: 'YYYY-MM-DD')"
}
```

### Recipe (built-in bank)

```json
{
  "name": "string (e.g., 'Banana Bread')",
  "description": "string (short tagline)",
  "ingredients": ["string", ...],
  "instructions": ["string", ...]
}
```

Ingredients are plain strings. Matching is done by checking whether an item's name (case-insensitive) or category keyword appears in any recipe ingredient string (case-insensitive substring match).

### Recipe Bank

Hardcoded in `recipes.js` as a global `RECIPES` array. At least 8 recipes covering common expiring items across categories:

| # | Recipe | Targets |
|---|--------|---------|
| 1 | Banana Bread | bananas, overripe fruit |
| 2 | Sautéed Spinach | spinach, produce |
| 3 | Veggie Scramble | eggs, dairy, vegetables |
| 4 | Chicken Soup | chicken, meat |
| 5 | Tomato Pasta Sauce | tomatoes, pantry |
| 6 | Grilled Cheese | cheese, bread, dairy, bakery |
| 7 | Fried Rice | rice, eggs, leftover veg |
| 8 | Smoothie Bowl | yogurt, fruit, dairy |
| 9 | Stale Bread Croutons | bread, bakery |
| 10 | Milk Pancakes | milk, dairy, pantry |

## Component Breakdown

The app is organized into logical "components" (plain functions that render or manage DOM sections — no framework). All rendering happens into a single `#app` root.

### 1. Add-Item Form (`AddItemForm`)

- Fields: name (text input), category (select), expiry date (date input).
- Submit button ("Add to the Fridge").
- Validation: name and date required; date must be >= today.
- On submit: creates item object, adds to `items`, persists, re-renders, clears form.
- Horror flourish: the submit button has a themed label and the form panel is styled like a haunted pantry shelf.

### 2. Item List (`ItemList`)

- Renders all items sorted by `expiryDate` ascending.
- Each item is rendered as an `ItemCard`.
- Empty state: a themed message ("Your fridge is eerily empty... add something before the void stares back.") with a pointer to the form.
- Re-rendered entirely on add/delete. A lightweight diff is unnecessary given the small expected list size.

### 3. Item Card (`ItemCard`)

- Displays: monster icon/emoji (based on urgency), item name, category label, days-remaining badge, urgency label, delete button.
- If urgency is `danger` or `rotten`: a "Rescue Recipes" toggle appears on the card.
- Delete button: opens a themed confirm dialog before deleting.
- Visual treatment varies by urgency level (see Theme Design).

### 4. Rescue Recipes (`RecipeSuggestions`)

- Rendered inside (or below) an `ItemCard` when the item is at `danger` or `rotten`.
- Shows matched recipes as a compact list of recipe names.
- Clicking a recipe name expands it inline to show ingredients and instructions.
- If no recipes match: shows the "no rescue recipes" message.

### 5. Confirm Dialog (`ConfirmDialog`)

- A simple modal overlay (styled) for delete confirmation.
- Themed message: "Banish [item name] to the void?" with "Banish" (confirm) and "Keep" (cancel) buttons.
- Closes on button click or Escape key.

### 6. Header (`Header`)

- App title "FreshTrack" with a spooky subtitle ("Save them before they rot.").
- Horror font for the title.

### 7. Footer (`Footer`)

- A small line: "Kiroween 2026 — Costume Contest" with a themed flavor line.

## Urgency System

```
daysRemaining = floor((expiryDate - today) / day)
```

| Level | Condition | Color Accent | Monster | Behavior |
|-------|-----------|-------------|---------|----------|
| Fresh | > 5 days | Calm green | 🥬 | Static, no animation |
| Wary | 3–5 days | Amber | 🧟 | Subtle hover glow |
| Danger | 1–2 days | Red | 👹 | Gentle shake animation |
| Rotten | <= 0 days | Dark red/decay | 💀 | Stronger shake + pulse |

### Countdown Refresh

- On app load: compute urgency for all items.
- A `setInterval` runs every minute (or on `visibilitychange`) and recomputes `daysRemaining`. If the day has changed since the last compute, re-render. This keeps the countdown accurate if the app stays open overnight.
- Lightweight: only re-renders if a level boundary has actually been crossed for any item.

## Theme Design

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-deep` | #0d0a14 | Page background |
| `--bg-panel` | #1a1424 | Form/card backgrounds |
| `--accent-fresh` | #6abf69 | Fresh items, success |
| `--accent-wary` | #e0a44a | Wary items, warning |
| `--accent-danger` | #d64545 | Danger items |
| `--accent-rotten` | #8b1a1a | Rotten items |
| `--text-primary` | #e8e0f0 | Body text |
| `--text-muted` | #8a7fa0 | Secondary text |
| `--border-spooky` | #3a2d4f | Card/panel borders |

### Typography

- Headings: "Creepster" (Google Fonts) with fallback to 'Impact, sans-serif'.
- Body: system sans-serif stack (`-apple-system, Segoe UI, Roboto, sans-serif`).
- Google Fonts loaded via `<link>` with `display=swap` and CSS fallback so the app still works offline if the font fails.

### Animations

- `@keyframes shake`: a small horizontal translate applied to `danger` and `rotten` cards.
- `@keyframes pulse`: opacity pulse for `rotten` cards.
- `@keyframes float`: subtle vertical bob for monster icons (optional, light).
- All animations respect `prefers-reduced-motion` — disabled when the user prefers reduced motion.

### Empty State

A centered block: large skull emoji 💀, the line "Your fridge is eerily empty...", and "Add something before the void stares back." Styled to be inviting, not broken.

## File-by-File Responsibilities

### `index.html`

- App shell: `<head>` with font link and stylesheet, `<body>` with `<div id="app">`, and script tags loading `recipes.js` then `app.js` (deferred).
- No inline styles or scripts (keeps files clean and debuggable).

### `styles.css`

- CSS custom properties (variables) for the color palette.
- Layout: single-column, max-width ~640px, centered. Responsive down to mobile widths (320px).
- Card styling, form styling, modal styling, empty-state styling.
- Animation keyframes + `prefers-reduced-motion` guard.

### `recipes.js`

- Defines `const RECIPES = [ ... ]` (or `window.RECIPES`) with at least 8–10 recipes.
- Pure data file; no logic.

### `app.js`

- State: `let items = []`.
- `loadItems()`: read from localStorage, parse JSON, handle errors → return `[]`.
- `saveItems()`: write `JSON.stringify(items)` to localStorage.
- `addItem(name, category, expiryDate)`: push + save + render.
- `deleteItem(id)`: filter + save + render.
- `getUrgency(item)`: returns `{ level, daysRemaining }`.
- `matchRecipes(item)`: returns recipes from `RECIPES` matching the item.
- `render()`: clears `#app`, renders header, add-form, item list, footer.
- `renderItemCard(item)`: returns an element string or DOM node for one card.
- `renderRecipeSuggestions(item)`: returns recipe list for an item.
- Event delegation: a single click listener on `#app` handles delete, recipe toggle, recipe expand, form submit.
- `init()`: load, render, set up the interval for countdown refresh.
- Runs on `DOMContentLoaded`.

## Error Handling

- `localStorage` read: wrapped in try/catch. If parse fails or storage is empty, start with `[]` and optionally log a console warning.
- `localStorage` write: wrapped in try/catch. If quota exceeded (unlikely), alert the user that storage is full.
- Date parsing: if `expiryDate` is malformed, treat as `rotten` and show a "check date" note.

## Accessibility

- Form inputs have `<label>` elements associated via `for`/`id`.
- Delete buttons have `aria-label="Delete [item name]"`.
- Urgency level is shown as text (e.g., "Danger: expires in 1 day") in addition to color/icon.
- Modal: traps focus, closes on Escape, restores focus to trigger on close.
- `prefers-reduced-motion` disables shake/pulse animations.
- Contrast ratios: body text `--text-primary` on `--bg-deep` passes WCAG AA.

## Out of Scope (for this design)

- No data export/import.
- No dark/light theme toggle (the app is always dark/horror-themed).
- No item editing (delete and re-add instead).
- No quantity or notes fields on items.
