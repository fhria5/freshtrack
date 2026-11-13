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

## Phase 13: Recipe Bank 25 + Category Filters (v2)

### Task 13.1 — Expand the recipe bank to 25 recipes
- [x] In `recipes.js`, add a `category` field to every recipe: one of `Breakfast`, `Lunch`, `Snack`, `Dinner`.
- [x] Assign categories to the existing 10 recipes: Banana Bread Snack, Sauteed Spinach Dinner, Veggie Scramble Breakfast, Chicken Soup Dinner, Tomato Pasta Sauce Dinner, Grilled Cheese Lunch, Fried Rice Dinner, Smoothie Bowl Breakfast, Stale Bread Croutons Snack, Milk Pancakes Breakfast.
- [x] Add 15 new recipes (name, description, ingredients, instructions, category), each targeting common expiring items (oats, potatoes, apples, mushrooms, carrots, herbs, onions, eggs, milk, bread, cheese, tomatoes, bananas, chicken, yogurt, rice): Overnight Oats (Breakfast), Cheese Omelette (Breakfast), Potato Hash (Breakfast), Apple Crumble (Snack), Tomato Bruschetta (Snack), Garlic Herb Butter Pasta (Dinner), Chicken Stir Fry (Dinner), Shakshuka (Lunch), Cheesy Baked Potatoes (Dinner), Banana Smoothie (Breakfast), Carrot Ginger Soup (Lunch), Bread Pudding (Snack), Yogurt Herb Dip (Snack), Creamy Mushroom Pasta (Dinner), French Toast (Breakfast).
- [x] Keep the existing ingredient keyword style so `matchRecipes` keeps working (item names and category keywords in ingredient strings).
- [x] Verify: `RECIPES.length` is 25; every recipe has a category in the four allowed values; `node --check recipes.js` passes.

### Task 13.2 — Category filter chips on the recipe list
- [x] Add a `recipeFilter` state variable (default `All`) in `app.js`.
- [x] In `renderRecipeSuggestions`, render filter chips above the recipe list: All, Breakfast, Lunch, Snack, Dinner. Chips are real `<button>` elements, min 44px tap target, `aria-pressed` reflects the active filter.
- [x] Clicking a chip sets `recipeFilter` and re-renders the recipe list only (no page reload, no state loss).
- [x] When the active filter matches zero recipes for that item, show: "No recipes in this category for this item. Try another filter."
- [x] Verify: with a danger item, switching chips filters the visible recipes; the active chip has `aria-pressed="true"`; 0 console errors.

## Phase 14: AI Recipes + Cook Tonight (v2)

### Task 14.1 — AI recipe client with silent fallback
- [x] Add constants in `app.js`: `AI_API_URL = 'https://grokingstore.my.id/freshtrack-ai/api/recipe'` and `AI_TIMEOUT_MS = 15000`.
- [x] Implement `fetchAiRecipe(ingredients, mode)`: POST JSON `{ ingredients: [names], mode: 'single' | 'tonight' }` with an AbortController timeout of 15 seconds.
- [x] Validate the response shape: `{ recipe: { title, ingredients[], steps[], timeMinutes } }`. Return the recipe object on success, `null` on ANY failure (network error, timeout, non-2xx status, invalid JSON, missing fields, 503 ai_unavailable).
- [x] Never surface a raw error to the user: any failure returns `null` and the caller falls back to rule-based recipes.
- [x] Verify: with the Worker secret not yet installed, `fetchAiRecipe` returns `null` (503 path) and no exception escapes; with a mocked 200 response it returns the parsed recipe.

### Task 14.2 — "AI Recipe" button on item cards
- [x] Add an "AI Recipe" button to every item card (next to the Rescue/Rescue Recipes controls), min 44px, `aria-label="Get an AI recipe for [name]"`.
- [x] On click: disable the button, show a loading state ("Summoning a recipe...") announced via `#sr-announcer`, call `fetchAiRecipe([item.name], 'single')`.
- [x] On success: render the AI recipe inline on the card with a visible "AI-generated" badge, title, ingredient list, numbered steps, and time. The badge uses the existing amber accent only (no new colors).
- [x] On failure (`null`): render the rule-based matched recipes instead, with a small note: "AI is resting. Showing pantry recipes instead." Never show a raw error, status code, or stack trace.
- [x] Cache the last AI result in memory only (keyed by item name, lowercase) so re-opening the same card does not call the API again.
- [x] Verify: Playwright with the live Worker (secret absent) shows the fallback note and rule-based recipes, zero console errors, zero raw error text on screen.

### Task 14.3 — "Cook Tonight" mode
- [x] Add a "Cook Tonight" button in the controls strip. It is enabled only when at least one item is at `danger` or `rotten` urgency; otherwise it is disabled with a `title` explaining no urgent items exist.
- [x] On click: collect the names of all `danger` and `rotten` items (max 12), call `fetchAiRecipe(names, 'tonight')`, show a loading state.
- [x] On success: open a panel (reuse the modal pattern from the confirm dialog) titled "Tonight's Rescue Plan" showing the AI recipe (title, ingredients, steps, time) plus a line listing which pantry items the plan uses.
- [x] On failure (`null`): show the best rule-based matches instead: recipes matching the urgent items, ranked by how many urgent items each recipe covers, top 3, with the note "AI is resting. Showing pantry recipes instead."
- [x] Guard against double clicks: disable the button while a request is in flight.
- [x] Verify: with demo pantry summoned (danger Bananas + rotten Chicken), Cook Tonight shows a plan covering them; with no urgent items the button is disabled; zero console errors.

### Task 14.4 — AI styles
- [x] Style the AI recipe card, "AI-generated" badge, loading state, and Cook Tonight panel using only existing palette tokens and the existing modal/panel patterns.
- [x] Loading indicator is CSS-only and disabled under `prefers-reduced-motion`.
- [x] Verify: 0 targets under 44px, AA contrast kept, no new colors introduced.

## Phase 15: Gemini Proxy Worker (v2)

### Task 15.1 — Classic Cloudflare Worker `freshtrack-ai`
- [x] Create `worker/worker.js`: a classic service worker (`addEventListener('fetch', ...)`) with NO build step and NO npm dependencies.
- [x] `GET /api/health` returns `{ ok: true, ai: <GEMINI_API_KEY present>, app: 'freshtrack-ai' }` as JSON.
- [x] `POST /api/recipe` accepts `{ ingredients: [1..12 strings, each max 60 chars], mode: 'single' | 'tonight' }`. Invalid body returns 400 JSON `{ error: 'bad_request' }`.
- [x] When `GEMINI_API_KEY` is missing or empty, return 503 JSON `{ error: 'ai_unavailable' }` (never a 500, never a stack trace).
- [x] When the key exists: call Gemini REST `generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent` with `?key=`, 15 second timeout, a short strict-JSON prompt asking for exactly `{ title, ingredients[], steps[], timeMinutes }`. Parse loosely (accept a JSON block inside extra text), validate the shape, and return `{ recipe: {...}, source: 'ai' }`.
- [x] On any Gemini failure (timeout, non-2xx, bad JSON, bad shape) return 502 JSON `{ error: 'ai_failed' }`.
- [x] Rate limit: max 30 requests per IP per minute (in-memory map, best effort). Over the limit return 429 JSON `{ error: 'rate_limited', retryAfterSeconds }`.
- [x] CORS: allow only `https://fhria5.github.io` and localhost origins; answer OPTIONS with 204. All responses are JSON with `Content-Type: application/json` and no stack traces.
- [x] Create `worker/deploy_worker.py`: PUT the script only to Cloudflare account `4ee061cebe8412fcb40c43f95cc534f0`, worker name `freshtrack-ai`, using the vault surrogate `custom.cloudflare` exactly like `~/workspace/ai-church-hackathon/deploy_upload_only.py`. Never PATCH settings (that could wipe bindings). Create the Worker route `grokingstore.my.id/freshtrack-ai/*` on zone `804f88e1923492d8f0a5e402acf6a767` if it does not already exist.
- [x] Verify: `node --check worker/worker.js` passes; `curl /api/health` returns 200 JSON with `ai: false` before the secret is installed; `curl POST /api/recipe` returns 503 JSON `{ error: 'ai_unavailable' }` (not a 500, not HTML).

## Phase 16: Steering + Hooks (v2)

### Task 16.1 — Kiro steering docs
- [x] Create `.kiro/steering/product.md`: what FreshTrack is, Kiroween 2026 Costume Contest, horror theme, English UI, offline-first with AI as progressive enhancement, never show raw errors.
- [x] Create `.kiro/steering/tech.md`: vanilla JS only, no build step, no frameworks; localStorage keys (`freshtrack.items`, `freshtrack.soulsSaved`, `freshtrack.history`, `freshtrack.codex`, `freshtrack.streak`, `freshtrack.nightmode`, `freshtrack.sounds`); Codex shape `{ level: { captured, count } }` with migration from the old boolean shape; palette tokens; a11y rules (44px targets, `:focus-visible` outline kept, AA contrast); no em dash in UI strings or new comments; grep em dash + emoji check before deploy.
- [x] Create `.kiro/steering/structure.md`: file map (index.html, styles.css, recipes.js, app.js, worker/worker.js, deploy scripts), render flow (`render()` rebuilds `#app`; bottom nav lives outside `#app`), how to run tests (Playwright in `~/workspace/shoppal-v2/node_modules`, local server on port 8901), deploy via `deploy_freshtrack.py` (GitHub Contents API; Pages build status is not the source of truth, live curl is).
- [x] Verify: the three files exist under `.kiro/steering/` and describe the repo as it actually is (no invented keys, paths, or commands).

### Task 16.2 — One working Kiro hook
- [x] Determine the hook format that the installed Kiro CLI actually supports (check `kiro-cli --help`, `kiro-cli hooks` if present, and the CLI docs). Do NOT invent a format.
- [x] Add exactly one hook that runs on a real event and does real work: after `app.js` or `recipes.js` is edited, run `node --check` on the edited file and report a syntax failure (so a broken file is caught immediately). If the CLI hook system cannot run a command on file edit, implement the closest hook the CLI truly supports and document what it does.
- [x] Verify the hook is registered by the CLI (list/show hooks, or trigger it by editing a file and observing it run). Record the verification evidence in the task result.
- [x] If the installed CLI genuinely has no working hook mechanism, say so plainly in the result and in the README (do not fake it).

### Task 16.3 — Ship steering and hooks in the repo
- [x] Add `.kiro/steering/*.md` and the hook file(s) to the `FILES` list in `deploy_freshtrack.py`, plus `worker/worker.js`, so the Kiro evidence ships in the public repo.
- [x] Verify: after deploy, the steering files and hook file are reachable in the GitHub repo.

## Phase 17: README + Final Verification (v2)

### Task 17.1 — README update
- [x] Expand the "Built with Kiro" section: spec-driven development (Phases 1-17), steering docs, the working hook, AI recipes via the Gemini proxy Worker (with rule-based fallback), and the 25-recipe bank with category filters.
- [x] Document the new features: AI Recipe button, Cook Tonight mode, recipe category filters, and the Worker endpoint (noting the Worker returns a tidy 503 until `GEMINI_API_KEY` is installed).
- [x] Keep the MIT license unchanged.
- [x] Verify: README renders correctly; no em dash in new text.

### Task 17.2 — Final verification
- [x] `node --check app.js`, `node --check recipes.js`, `node --check worker/worker.js` all pass.
- [x] Grep for em dash in all changed files returns nothing; emoji check on changed files passes.
- [x] Playwright mobile 390px + desktop 1280px: 0 console errors, 0 targets under 44px, 0 horizontal overflow.
- [x] Playwright flow: add item, AI Recipe (falls back cleanly while the secret is absent), rescue, Codex XP gain, streak, night mode, photo upload.
- [x] Deploy via `deploy_freshtrack.py`; verify live from GitHub Pages (curl fresh styles.css/app.js content + repo blob SHA equals local).
- [x] Report credit usage before vs after (from `kiro-cli chat /usage`).

## Phase 18: Monster Codex Expansion — 4 Secret Monsters

### Task 18.1 — Secret monsters in app.js
- [x] Add `SECRET_MONSTERS` (Glimmer Sprout, Midnight Watcher, Triple Threat, Void King) with emoji, name, lore, and hint; one secret per urgency tier, no levels, single capture.
- [x] Add state `secretCaptured`, `aiRecipeReady`, `tonightPlanOpen`; persist secrets in the same `freshtrack.codex` key (`secrets` block) with migration: old saves without secrets load with all secrets locked.
- [x] Add `unlockSecret()` + `checkSecretUnlocks()` called from `rescueItem()`: Glimmer Sprout = rescue an item with a real AI recipe; Midnight Watcher = rescue while `nightActive()`; Triple Threat = 3 rescues in one day (counted from historyLog); Void King = rescue after `openTonightModal()` set the flag.
- [x] `countCaptured()` counts all 8 monsters; `renderCodex()` renders 4 secret cards (locked: "??? Secret Monster" + hint + Secret badge; captured: emoji + name + lore) and sub text "X / 8 captured. Four secret monsters hide in the dark. Find them."
- [x] Verify: `node --check app.js` passes; no em dash in new strings or comments.

### Task 18.2 — Secret card styles
- [x] Add `.codex-card.secret` (dashed border, amber left edge), `.codex-secret-mark` ("?" in Creepster), `.codex-badge.secret` to styles.css, reusing existing palette tokens.
- [x] Verify: no em dash in new CSS; mobile 390px 0 overflow, 0 console errors.

### Task 18.3 — Playwright verification
- [x] Add `tests/test-codex-secrets.cjs`: 8 codex cards, 4 secrets hidden as ???, sub "0 / 8 captured"; Midnight Watcher via night rescue; Triple Threat locked at 2 rescues, unlocked at 3; Void King via Cook Tonight modal + rescue; Glimmer Sprout via mocked Worker 200 AI recipe + rescue; 8 / 8 captured; secrets persist after reload; 0 console errors.
- [x] Verify: 18/18 checks pass (`ALL PASS`).

### Task 18.4 — Docs + deploy
- [x] Update README Monster Codex line (8 monsters, 4 secret, unlock conditions named).
- [x] Deploy via `deploy_freshtrack.py`; verify live from GitHub Pages (curl fresh app.js content + repo blob SHA equals local).

## Phase 19: Polish Audit (pre-video, pre-submit)

### Task 19.1 — Audit (Playwright, mobile 390px + desktop 1280px + tiny 320px)
- [x] Add `tests/test-phase19-audit.cjs`: viewport audits (0 console errors, 0 targets under 44px, 0 horizontal overflow), computed WCAG contrast for 13 text elements, form validation + error clearing, delete modal Escape + focus return, malformed localStorage (garbage items/history/codex, old boolean codex, codex without secrets), malformed date + 120-char unbroken name, stored-photo XSS probe, AI 500 + AI 15s timeout fallback, Cook Tonight disabled state, streak gap reset, empty filter state, Share Card + Weekly Recap downloads, skip link, AI cache-hit secret unlock.
- [x] Audit findings (first run, 39/50): contrast failures on Danger badge (3.73:1), Danger label (4.10:1), Rotten badge (3.93:1); stats strip overflow at 320px (4 x 80px + gaps > 320px); 120-char unbroken item name overflowed 591px; stored XSS via crafted `photo` string executed (`onerror` fired); skip-link check was a test artifact (missing transition wait); 500/404 console errors were Chrome's own failed-fetch log (AI 500 mock) and the XSS img's own request, not app faults.
- [x] Verify: audit rerun after fixes passes 55/55.

### Task 19.2 — Contrast fixes (AA 4.5:1 for normal text)
- [x] Add `--accent-danger-text: #ef7a7a` token; use it for `.badge-danger` (was #d64545, 3.73:1, now 6.02:1), `.urgency-danger` (now 6.61:1), and `.horror-when` danger rows.
- [x] `.badge-rotten` now uses `--accent-rotten-text` #e06565 (was #d64545, 3.93:1, now 5.09:1).
- [x] Submit button gradient start darkened to #c93a3a so white text reaches 5.06:1 (was 4.38:1 on #d64545). Borders and non-text accents keep #d64545.
- [x] Verify: all 13 measured text elements pass AA in the audit.

### Task 19.3 — Stored-XSS fix for item photos
- [x] In `renderItemCard`, render `<img>` only when `item.photo` starts with `data:image/`, and escape the URL with `escapeHtml`. A crafted photo string no longer injects attributes or handlers; it falls back to the monster icon.
- [x] Verify: audit XSS probe passes (no execution, no `onerror` attribute, monster shown). Valid data-URL photos still render (covered by the v2 photo test).

### Task 19.4 — Small-screen and long-name layout fixes
- [x] Stats strip wraps at 480px and below (`.stat { flex: 1 1 40%; min-width: 0 }`), forming a 2x2 grid on 320px screens instead of overflowing.
- [x] `.item-name` and `.horror-name` get `overflow-wrap: anywhere` so unbroken long names wrap instead of overflowing the page.
- [x] Verify: 320px overflow 0px; 120-char name overflow 0px; mobile 390px and desktop 1280px still 0 overflow.

### Task 19.5 — AI cache-hit secret consistency
- [x] `checkSecretUnlocks` now also unlocks Glimmer Sprout when the rescued item shows a cached AI recipe (`aiCache` by item name), and `handleAiRecipe` arms `aiRecipeReady` on a cache hit. Rescuing a second same-named item earns the secret just like a fresh AI fetch.
- [x] Verify: audit section 13 passes (cached recipe opens on second card, secret captured on rescue).

### Task 19.6 — Minor polish
- [x] `.btn-ai` (icon-only) gains `title="Get an AI recipe"` for sighted users (aria-label already existed).
- [x] Fixed the v2 suite's night-mode check to be time-independent (one click flips, three clicks return); the old version assumed UTC night and failed during UTC daytime. Suite now 27/27.
- [x] Verify: v2 suite 27/27, Codex secrets suite 18/18, Phase 19 audit 55/55; `node --check` passes on app.js, recipes.js, worker.js; 0 new em dashes.

### Task 19.7 — Docs + deploy
- [x] Add `tests/test-phase19-audit.cjs` to the `FILES` list in `deploy_freshtrack.py`.
- [x] README: note Phase 18 + Phase 19 were completed directly against the spec (Kiro plan credits exhausted), and record the Phase 19 audit counts.
- [x] Update `rencana-submit-kiroween.md`: AI recipes done, Phase 18 done, Phase 19 done; video v1 is stale, re-record from v2; submit target 30 Nov-2 Des.
- [x] Deploy via `deploy_freshtrack.py`; verify live from GitHub Pages (curl fresh app.js/styles.css content + repo blob SHA equals local).
