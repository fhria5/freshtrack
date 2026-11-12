# FreshTrack — Tasks

Implementation tasks for the FreshTrack app. Each task is self-contained and verifiable. Tasks are grouped into phases; later phases depend on earlier ones.

## Phase 1: Project Scaffold

### Task 1.1 — Create project files
- [x] Create `index.html` with the app shell: `<head>` linking Google Fonts (Creepster) and `styles.css`, `<body>` with `<div id="app">`, and `<script>` tags for `recipes.js` and `app.js` (loaded in order, with `defer`).
- [x] Create empty `styles.css`, `recipes.js`, and `app.js` files.
- [x] Verify: opening `index.html` in a browser shows a blank page with no console errors.

## Phase 2: Theme & Layout

### Task 2.1 — Define CSS design tokens and base styles
- [x] In `styles.css`, define CSS custom properties for the full color palette (bg-deep, bg-panel, accent-fresh, accent-wary, accent-danger, accent-rotten, text-primary, text-muted, border-spooky).
- [x] Set base styles: dark background, body font stack, text color, max-width container (~640px) centered.
- [x] Style headings with the Creepster font (with fallback to Impact, sans-serif).
- [x] Verify: the page background is the deep dark color and headings use the spooky font (or fallback).

### Task 2.2 — Build header and footer
- [x] In `app.js`, render a header with the app title "FreshTrack" and subtitle "Save them before they rot." using the horror font.
- [x] Render a small footer: "Kiroween 2026 — Costume Contest" with a themed flavor line.
- [x] Verify: header and footer appear with correct fonts and colors on load.

## Phase 3: Add-Item Form

### Task 3.1 — Render the add-item form
- [x] Render a form panel with: name (text input + label), category (select with options: produce, dairy, meat, pantry, bakery, other), and expiry date (date input + label).
- [x] Submit button labeled "Add to the Fridge".
- [x] Style the form panel with the panel background and spooky border.
- [x] Verify: form renders with all fields and the themed submit button.

### Task 3.2 — Implement form validation
- [x] On submit: validate that name is non-empty and expiry date is present and >= today.
- [x] If invalid, show inline error messages near the relevant fields (themed styling).
- [x] Verify: submitting with empty fields or a past date shows errors and does not add an item.

## Phase 4: State & Persistence

### Task 4.1 — Implement item state and localStorage
- [x] In `app.js`, create `let items = []`.
- [x] Implement `loadItems()`: read `localStorage` key `freshtrack.items`, parse JSON, return `[]` on error/empty.
- [x] Implement `saveItems()`: serialize `items` to JSON and write to localStorage (wrapped in try/catch for quota errors).
- [x] Call `loadItems()` on init and populate `items`.
- [x] Verify: adding a console.log of `items` after load shows `[]` on first run and previously saved items on reload.

### Task 4.2 — Implement add-item flow
- [x] Wire the form submit handler: build item object `{ id, name, category, expiryDate }`, generate a unique id (crypto.randomUUID() with Date.now() fallback), push to `items`, call `saveItems()`, and trigger a re-render.
- [x] Clear the form after successful submission.
- [x] Verify: adding an item via the form persists it; reloading the page shows the item is still present.

## Phase 5: Item List & Cards

### Task 5.1 — Implement urgency calculation
- [x] Implement `getUrgency(item)`: compute `daysRemaining = floor((expiryDate - today) / day)`.
- [x] Return `{ level, daysRemaining }` where level is one of: `fresh` (>5), `wary` (3–5), `danger` (1–2), `rotten` (<=0).
- [x] Handle malformed dates by treating as `rotten`.
- [x] Verify: unit-test the boundary values (0, 1, 2, 3, 5, 6 days) return the correct levels.

### Task 5.2 — Render the item list
- [x] Implement `render()`: clear `#app`, render header, form, item list, footer.
- [x] Sort `items` by `expiryDate` ascending.
- [x] For each item, render an `ItemCard` with: monster emoji (🥬 fresh, 🧟 wary, 👹 danger, 💀 rotten), name, category label, days-remaining badge, urgency text label, and a delete button.
- [x] Apply urgency-based card styling: border/background color per level and a `data-urgency` attribute.
- [x] Verify: adding items with different expiry dates renders cards in sorted order with correct colors and icons.

### Task 5.3 — Render empty state
- [x] When `items` is empty, render a themed empty state: large 💀, "Your fridge is eerily empty...", and "Add something before the void stares back."
- [x] Verify: with no items, the empty state shows instead of an empty list.

### Task 5.4 — Implement delete with confirmation
- [x] Each card's delete button triggers a themed confirm modal: "Banish [name] to the void?" with "Banish" and "Keep" buttons.
- [x] "Banish" calls `deleteItem(id)`: filters the item out, saves, re-renders.
- [x] "Keep" or Escape closes the modal without deleting.
- [x] Verify: clicking delete shows the modal; confirming removes the item; cancelling keeps it.

## Phase 6: Animations

### Task 6.1 — Add urgency animations
- [x] Add `@keyframes shake` (small horizontal translate) applied to `danger` cards.
- [x] Add `@keyframes pulse` (opacity pulse) applied to `rotten` cards.
- [x] Add `prefers-reduced-motion` media query that disables all animations.
- [x] Verify: danger cards shake, rotten cards pulse, and disabling motion (browser setting) stops the animation.

## Phase 7: Recipe Suggestions

### Task 7.1 — Build the recipe bank
- [x] In `recipes.js`, define `RECIPES` with at least 8 recipes. Each has `name`, `description`, `ingredients` (array), and `instructions` (array).
- [x] Cover common expiring items across categories (bananas, spinach, eggs, chicken, tomatoes, cheese, bread, rice, milk, yogurt, etc.).
- [x] Verify: `RECIPES` loads as a global and `app.js` can read it.

### Task 7.2 — Implement recipe matching
- [x] Implement `matchRecipes(item)`: return recipes from `RECIPES` where any ingredient string contains the item's name (case-insensitive) OR the item's category keyword (case-insensitive).
- [x] Verify: a `danger`/`rotten` item named "Spinach" matches recipes containing "spinach"; an item in category "dairy" matches recipes with dairy-related ingredients.

### Task 7.3 — Render rescue recipes on item cards
- [x] For items at `danger` or `rotten` urgency, render a "Rescue Recipes" toggle on the card.
- [x] Clicking the toggle shows matched recipes as a list of names (below the card content).
- [x] Clicking a recipe name expands it inline to show its description, full ingredient list, and instructions.
- [x] If no recipes match, show: "No rescue recipes found for this item. Time to improvise... or bid farewell."
- [x] Verify: a danger-level item shows recipes that match; a fresh item does not show the rescue section; a danger item with no matches shows the fallback message.

## Phase 8: Countdown Refresh

### Task 8.1 — Keep countdown live across day changes
- [x] Store the last-computed date (day) on load.
- [x] Set up a `setInterval` (e.g., every 60 seconds) and a `visibilitychange` listener that checks whether the calendar day has changed.
- [x] If the day changed, re-render so urgency levels and day counts update.
- [x] Verify: simulate a day change (mock date or fast-forward the interval) triggers a re-render with updated urgency.

## Phase 9: Polish & Accessibility

### Task 9.1 — Accessibility pass
- [x] Ensure all form inputs have associated `<label>` elements.
- [x] Add `aria-label` to delete buttons (e.g., "Delete Spinach").
- [x] Ensure urgency is communicated via text label (not color alone) on each card.
- [x] Make the confirm modal keyboard accessible: focus trap, Escape to close, focus restoration.
- [x] Verify: tabbing through the form reaches all fields; delete buttons announce their purpose; modal closes with Escape.

### Task 9.2 — Responsive layout
- [x] Ensure the single-column layout works down to 320px width.
- [x] Adjust card padding, font sizes, and button sizes for small screens via a media query.
- [x] Verify: at 320px width, all content is readable and all controls are tappable.

### Task 9.3 — Final integration check
- [x] Add items across all urgency levels and confirm colors, icons, labels, and animations are correct.
- [x] Add a danger item, confirm rescue recipes appear and expand correctly.
- [x] Delete an item via the modal.
- [x] Reload the page and confirm items persist.
- [x] Confirm no console errors and no network requests (except the optional font load).
- [x] Verify the app runs by opening `index.html` directly with no server.

## Phase 10: Perfection Pass

### Task 10.1 — Allow past expiry dates (unlock Rotten state)
- [x] Remove the `min` attribute from the expiry date input so the browser date picker permits past dates.
- [x] Remove the past-date validation block from `handleFormSubmit` (keep empty-name and empty-date validation).
- [x] Verify: adding an item with a past expiry date succeeds and the card renders as Rotten (skull 💀) with correct animations.

### Task 10.2 — Summon Demo Pantry button
- [x] Add a "Summon Demo Pantry" button (🎃) in the form panel below the submit button.
- [x] Add the same button to the empty state for first-time user discoverability.
- [x] Implement `summonDemoPantry()`: seeds 4 items covering all four urgency levels — Fresh (Spinach, +10d), Wary (Cheese, +4d), Danger (Bananas, +1d), Rotten (Chicken, −2d).
- [x] Wire the `summon-demo` click handler in `handleClick`.
- [x] Verify: clicking the button adds exactly 4 items with all four urgency levels and their corresponding monsters/colors.
- [x] Fix: make `summonDemoPantry()` idempotent — skip any demo item whose name already exists in the list (case-insensitive), so repeated clicks add nothing new. Verified via Node check that seeding twice yields exactly 4 items (Spinach, Cheese, Bananas, Chicken).

### Task 10.3 — Header stats strip
- [x] Add a souls saved state variable (`soulsSaved`) persisted in `localStorage` under key `freshtrack.soulsSaved`.
- [x] Implement `loadSoulsSaved()`, `saveSoulsSaved()`, and `incrementSouls()` functions.
- [x] Implement `computeStats()`: returns total items, items in danger or rotten, and souls saved.
- [x] Implement `renderStatsStrip()`: renders a three-stat strip (Items Tracked, In Peril, Souls Saved) below the subtitle in the header.
- [x] Style the stats strip with per-stat accent colors (danger for In Peril, fresh for Souls Saved).
- [x] Verify: stats strip renders with correct counts; counts update on add/delete/rescue.

### Task 10.4 — Rescued action on item cards
- [x] Add a "Rescue" button (🛡️) to each item card alongside the delete button, wrapped in a `.card-actions` container.
- [x] Implement `rescueItem(id)`: removes the item from the list, increments souls saved counter, saves both items and souls to localStorage, and re-renders.
- [x] Wire the `rescue` click handler in `handleClick`.
- [x] Verify: clicking the rescue button removes the item and increments the Souls Saved counter, which persists across reloads.

### Task 10.5 — Self-host the Creepster font
- [x] Download the Creepster woff2 font file into `fonts/creepster.woff2`.
- [x] Add an `@font-face` declaration in `styles.css` pointing to the local font file with `font-display: swap`.
- [x] Remove the three Google Fonts CDN `<link>` tags from `index.html`.
- [x] Strengthen the fallback stack in `--font-heading` to include `Arial Black`.
- [x] Verify: no Google Fonts CDN references remain in HTML; the `@font-face` rule loads the local woff2; headings render in Creepster.

## Phase 11: Engagement Features

### Task 11.1 — Impact Dashboard
- [x] Add a `historyLog` state array and persist it in localStorage under `freshtrack.history`.
- [x] Implement `logEvent(type, category, urgencyLevel)`: records rescued/wasted events with a date and timestamp; caps the log at 500 entries.
- [x] In `rescueItem`, log a `rescued` event (rescued items count as saved). In `deleteItem`, log a `wasted` event only when the item is currently at `danger` or `rotten` urgency.
- [x] Implement `computeImpact()`: sums rescued count, wasted count, estimated kg saved (per-category average weights), and CO2 avoided (kg × 2.5).
- [x] Implement `renderImpactDashboard()`: shows rescued vs wasted counts, estimated kg of food saved, estimated kg CO2 avoided, an "estimates" disclaimer, and a recent history list with dates.
- [x] Define `CATEGORY_WEIGHTS` (produce 0.3, dairy 0.5, meat 0.7, pantry 0.5, bakery 0.4, other 0.4) and `CO2_PER_KG` (2.5), clearly labeled as estimates.
- [x] Verify: rescuing items increments rescued count and kg/CO2 estimates; deleting a danger/rotten item increments wasted count; deleting a fresh/wary item does not; figures persist across reloads.

### Task 11.2 — Monster Codex
- [x] Add a `capturedMonsters` state object and persist it in localStorage under `freshtrack.codex`.
- [x] Implement `captureMonster(level)`: marks a monster captured when an item at that urgency is rescued (idempotent); `loadCodex`/`saveCodex` handle persistence.
- [x] In `rescueItem`, call `captureMonster` with the rescued item's urgency level.
- [x] Define `MONSTER_LORE` with a short lore line for each of the 4 monsters (fresh/wary/danger/rotten).
- [x] Implement `renderCodex()`: lists all 4 monsters with emoji, name, lore line, and a Captured/Not Yet Captured badge; shows `N / 4 captured` progress.
- [x] Style the codex grid (2 columns desktop, 1 column mobile) with per-urgency accent borders; unknown monsters are desaturated/dimmed.
- [x] Verify: rescuing a danger item captures the danger monster (badge flips to Captured, persisted across reload); rescuing it again stays idempotent.

### Task 11.3 — Daily Reminder
- [x] Add an "Enable Reminders" button in a controls strip that calls `Notification.requestPermission()`.
- [x] Implement `maybeShowReminderNotification()`: when permission is granted and the app opens, fire a browser `Notification` summarizing items expiring today or tomorrow; skips when nothing is expiring (no spam, honest).
- [x] Implement `renderTodaysHorrors()` / `getExpiringSoonItems()`: an in-app "Today's Horrors" list showing items with `daysRemaining` of 0 (today) or 1 (tomorrow), sorted soonest first.
- [x] Call `maybeShowReminderNotification()` in `init()` so it runs on load when permission is already granted.
- [x] Button state reflects Notification.permission: "Enable Reminders" (default), "Reminders On" (granted), "Reminders Blocked"/disabled (denied), "Reminders unavailable" (unsupported).
- [x] No service worker used; notifications created directly via the Notification API.
- [x] Verify: Today's Horrors lists only items expiring today/tomorrow; button label reflects permission state; notification logic is gated on granted permission and a non-empty soon list.

### Task 11.4 — Spooky Sounds
- [x] Add a `soundsEnabled` state (default OFF) persisted in localStorage under `freshtrack.sounds`.
- [x] Add a Sounds toggle button in the controls strip with `aria-pressed` reflecting state; toggling also creates/resumes the AudioContext from the user gesture.
- [x] Implement `getAudioCtx()` (lazy Web Audio context), `playCreak()` (sawtooth descending tone, short decay), and `playChime()` (two sine tones), all gated on `soundsEnabled` and using Web Audio only — no audio files.
- [x] In `addItem`, play a creak when the added item is at `danger` urgency. In `rescueItem`, play a chime on rescue.
- [x] Verify: sounds default off; enabling the toggle then adding a danger item produces a creak; rescuing produces a chime; no audio files are referenced.

### Task 11.5 — Share Card
- [x] Add a "Share Card" button in the controls strip that calls `handleShare()`.
- [x] Implement `drawShareCard()`: draws a 600×340 canvas image (dark gradient bg, FreshTrack title in Creepster/Impact, "Save them before they rot." subtitle, Souls Saved and Monsters Rescued stats, #KiroweenHackathon26 caption, Kiroween footer). Waits for `document.fonts.ready` before drawing.
- [x] Implement `handleShare()`: if Web Share API supports file sharing, share the PNG with a caption including `#KiroweenHackathon26`; otherwise fall back to downloading the PNG via an anchor click.
- [x] "Monsters rescued" on the card uses the captured-codex count (`countCaptured()`); "souls saved" uses `soulsSaved`.
- [x] Verify: clicking Share draws the canvas and either invokes `navigator.share` (with file) or triggers a PNG download; caption contains #KiroweenHackathon26.

### Task 11.6 — Phase 11 verification & integration
- [x] Update `render()` to compose the new sections in order: header, controls, form, today's horrors, item list, impact dashboard, codex, footer.
- [x] Wire all new actions (`toggle-sounds`, `enable-reminders`, `share-card`) into `handleClick` via `data-action` delegation.
- [x] Load new state in `init()` (history, codex, sounds) before the first render.
- [x] `node --check app.js` passes; CSS braces balanced (181/181).
- [x] Logic tests pass: impact computation, codex capture idempotency, expiring-soon filter, waste-logging decision, history cap.
- [x] DOM-shim smoke test passes: app loads persisted items/history/codex and renders all 5 features (dashboard counts, CO2, codex badges, Today's Horrors, controls) with no runtime errors.
- [x] No new dependencies, no backend, no service worker, no external audio files; remains vanilla JS in the existing IIFE style.

## Phase 12: Mobile Bottom Navigation

### Task 12.1 — Mobile-only bottom navigation bar
- [x] Add a fixed bottom navigation bar with 4 items: **Pantry** (scrolls to the items list), **Impact** (scrolls to the Impact Dashboard), **Codex** (scrolls to the Monster Codex), and **Share** (triggers the existing share-card action).
- [x] Show the bar only on screens up to 768px wide via a `@media (max-width: 768px)` rule; keep it hidden on desktop (default `display: none`) so nothing changes for wider screens.
- [x] Use the horror theme: dark panel background, spooky top border, Creepster font (`--font-heading`) for the labels, and emoji icons (🧛 Pantry, 📊 Impact, 📜 Codex, 📸 Share).
- [x] Highlight the active item when its section is in view using an `IntersectionObserver` (active = amber `--accent-wary` with a glowing top indicator); `Share` is an action item and never becomes active.
- [x] Respect `safe-area-inset-bottom` for notched phones: the nav height includes the inset and the nav has bottom padding for the home indicator.
- [x] Add enough bottom padding to the page on mobile (`body { padding-bottom: calc(nav-height + safe-area-inset + 0.5rem) }`) so content is never hidden behind the bar.
- [x] Add the section anchor ids (`id="pantry"` on the item list section, `id="impact"` on the dashboard section, `id="codex"` on the codex section) where they did not exist yet.
- [x] Build the nav once in `init()` and append it to `<body>` (outside `#app`) so it survives the full `#app` re-render on every state change; re-observe the recreated section elements from `render()` via `refreshNavTargets()`.
- [x] Keep everything vanilla JS, no new dependencies.
- [x] Verify: `node --check app.js` passes; CSS braces balanced (195/195); DOM-shim smoke test passes (29/29) — nav renders with 4 items + labels, section anchors exist, Pantry click smooth-scrolls and highlights, Share (nav) and the existing Share Card control both invoke `handleShare()`, and the `IntersectionObserver` flips the active highlight to Impact and clears Pantry.
