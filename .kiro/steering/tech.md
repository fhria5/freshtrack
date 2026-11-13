# FreshTrack - Tech

## Stack

- Vanilla JS only, no frameworks, no modules, no build step, no npm
  dependencies. `index.html` loads `recipes.js` first (global `RECIPES`),
  then `app.js` (one IIFE, `'use strict'`, `var` style, string-built HTML).
- Self-hosted Creepster font (`fonts/creepster.woff2`).
- AI backend: classic Cloudflare Worker `freshtrack-ai`
  (`worker/worker.js`, deployed by `worker/deploy_worker.py` with PUT only,
  never PATCH settings). Route: `grokingstore.my.id/freshtrack-ai/*`.
  The Worker calls Gemini `gemini-3.5-flash-lite` via REST with the key
  from the Worker secret `GEMINI_API_KEY`. Without the secret it answers
  503 `{ error: 'ai_unavailable' }`; the app treats any failure as `null`
  and falls back silently.
- The app calls the Worker at
  `https://grokingstore.my.id/freshtrack-ai/api/recipe` with a 15 second
  AbortController timeout. Never use a `workers.dev` URL for a new Worker:
  new workers.dev routes return 404 (error 1042).

## localStorage keys (do not rename, do not add new ones in v2)

- `freshtrack.items` - item list
- `freshtrack.soulsSaved` - rescue counter
- `freshtrack.history` - Impact Dashboard event log
- `freshtrack.codex` - Monster Codex, shape
  `{ level: { captured: bool, count: number } }` for levels
  `fresh | wary | danger | rotten`. Old data stored plain booleans;
  the loader migrates boolean values into this shape. Keep the migration.
- `freshtrack.streak` - daily rescue streak `{ count, lastDate }`
- `freshtrack.nightmode` - Night Mode preference `auto | on | off`
- `freshtrack.sounds` - Spooky Sounds on/off (default off)

AI results are cached in memory only (`aiCache`, keyed by lowercase item
name). Never persist AI output or API keys in localStorage.

## Design tokens (`styles.css` `:root`)

- `--bg-deep: #0d0a14`, `--bg-panel: #1a1424`
- `--accent-fresh: #6abf69`, `--accent-wary: #e0a44a`,
  `--accent-danger: #d64545`, `--accent-rotten: #8b1a1a`,
  `--accent-rotten-text: #e06565` (use for rotten text, the base rotten
  color is too dark to read)
- `--text-primary: #e8e0f0`, `--text-muted: #8a7fa0`,
  `--border-spooky: #3a2d4f`
- `--tap-target: 44px`, `--max-width: 640px`
- Fonts: `--font-heading` (Creepster), `--font-body` (system stack)

## Accessibility rules (must keep passing)

- Every button, input, and select is at least 44x44px.
- Keep the `:focus-visible` outline; never remove it.
- Text contrast must stay AA (rotten text 5.32:1, muted text 4.81:1).
- Interactive state changes are announced through `#sr-announcer`.
- Animations are neutralized under `prefers-reduced-motion` (existing
  block in `styles.css`); the AI spinner is CSS-only and covered by it.

## Hard style rules

- No em dash characters in new UI strings or new comments. Before any
  deploy, run `grep` for em dash on every changed file and check emoji
  usage on changed files. Pre-existing em dashes in `recipes.js` (2) and
  `app.js` (11) are legacy; do not add more.
