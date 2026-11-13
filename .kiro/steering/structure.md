# FreshTrack — Structure

## File map

- `index.html` — page shell (20 lines): `#app` container, `#sr-announcer`
  live region, skip link, bottom nav placeholder, script tags
  (`recipes.js`, then `app.js`).
- `styles.css` — all styling, design tokens in `:root`, mobile-first,
  max-width 640px.
- `recipes.js` — `RECIPES` array, 25 recipes. Each recipe has `name`,
  `category` (Breakfast | Lunch | Snack | Dinner), `description`,
  `ingredients` (lowercase keywords; item names and category words must
  appear in ingredient strings so `matchRecipes` finds them), and
  `instructions`.
- `app.js` — all application logic (one IIFE). State at the top, then
  utilities, persistence, urgency, rendering, modals, form handling,
  AI client (`fetchAiRecipe`, `handleAiRecipe`, `handleCookTonight`),
  and `init()` on `DOMContentLoaded`.
- `worker/worker.js` — classic Cloudflare Worker (Gemini proxy).
- `worker/deploy_worker.py` — deploys the Worker (PUT script only) and
  creates the route if missing. Credentials come from the vault surrogate
  `custom.cloudflare`.
- `deploy_freshtrack.py` — pushes app files and `.kiro` files to the
  GitHub repo `fhria5/freshtrack` via the Contents API (vault surrogate
  `custom.github`). Each PUT triggers a GitHub Pages build.
- `README.md`, `LICENSE` (MIT), `.nojekyll`, `fonts/creepster.woff2`,
  `video/` (demo video, not deployed to Pages).
- `.kiro/specs/freshtrack/` — requirements.md, design.md, tasks.md
  (spec-driven development, Phases 1-17).
- `.kiro/steering/` — product.md, tech.md, structure.md (this file).
- `.kiro/hooks/` — `check-js-on-save.json` (runs `node --check` on
  `app.js` / `recipes.js` after Kiro saves them).
- `scripts/check-saved-js.mjs` — the script the hook runs.

## Render flow

- `render()` rebuilds `#app` innerHTML from the render functions
  (header, controls strip, form, challenge, today's horrors, item list,
  impact dashboard, codex, footer), then re-applies night mode and
  re-observes sections for the bottom nav.
- The bottom nav lives outside `#app` and is created once by
  `createBottomNav()` in `init()`.
- Clicks are delegated: one `handleClick` listener on `#app` switches on
  `data-action`. New actions must be added there, never as inline
  handlers.
- The AI section of a card updates in place (`updateAiSection`) without
  a full `render()`, so an open AI recipe survives other interactions.
- The confirm dialog and the Cook Tonight panel share the modal pattern
  (`.modal-overlay` / `.modal`, `modalState`, `closeModal()`,
  `handleModalKeydown` for Escape and focus trap).

## Tests

- Syntax: `node --check app.js && node --check recipes.js && node --check worker/worker.js`.
- Browser tests: Playwright lives in `~/workspace/shoppal-v2/node_modules/playwright`.
  Run test scripts (`.mjs`) from that folder. Serve the app locally with
  `python3 -m http.server 8901` in the repo folder, test mobile 390px and
  desktop 1280px, and stop the server afterwards. Targets: 0 console
  errors, 0 tap targets under 44px, 0 horizontal overflow.
- Flow to cover: add item, AI Recipe (fallback path while the Worker
  secret is absent), rescue, Codex XP, streak, night mode, photo.

## Deploy

- App: `python3 deploy_freshtrack.py`. A Pages build that gets overtaken
  by the next push may show "errored"; that is normal. The source of
  truth is a live check: `curl` the Pages URLs and compare blob SHAs
  with the GitHub API.
- Worker: `python3 worker/deploy_worker.py`. Verify with
  `curl https://grokingstore.my.id/freshtrack-ai/api/health`
  (expect `{ ok: true, ai: false }` until `GEMINI_API_KEY` is installed)
  and `curl -X POST .../api/recipe` (expect 503 `ai_unavailable` until
  the secret is installed).
- There is no `.gitignore` in the repo; never create one that excludes
  `.kiro` (Kiroween requires `/.kiro` in the public repo).
