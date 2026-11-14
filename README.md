# FreshTrack — Save Them Before They Rot

**Kiroween 2026 · Costume Contest**

FreshTrack fights global food waste with a horror twist: track your food's expiry
dates, and rescue ingredients before they turn into monsters. Food nearing expiry
appears as a monster you must "save" — the spookier it gets, the more urgent the rescue.

## Live demo

https://fhria5.github.io/freshtrack/

## Features

- **4-level urgency system** — Fresh 🥬, Wary 🧟, Danger 👹, Rotten 💀, with
  distinct colors, monsters, and animations
- **Rescue recipes** - rule-based suggestions from a built-in bank of 25
  recipes, filterable by meal (Breakfast, Lunch, Snack, Dinner), so
  expiring ingredients get used, not wasted
- **AI Recipe** - tap the sparkle button on any item card to summon a
  recipe from Gemini through a Cloudflare Worker proxy. When the AI is
  unavailable the app silently falls back to rule-based recipes; a raw
  error is never shown
- **Cook Tonight** - one tap turns all Danger and Rotten items into a
  single dinner plan (AI recipe, or the best rule-based matches when the
  AI is resting)
- **Impact Dashboard** — rescued vs wasted counts, estimated kg of food saved
  and CO₂ avoided (clearly labeled estimates), with history
- **Monster Codex** - collect 8 monsters by rescuing items at each
  urgency level; each rescue earns XP and monsters level up to Lv.5.
  Four of the eight are secret monsters, hidden as ??? until their
  unlock condition is met: Glimmer Sprout (rescue with an AI recipe),
  Midnight Watcher (rescue at night), Triple Threat (3 rescues in one
  day), Void King (open a Cook Tonight plan, then rescue)
- **Daily rescue streak** - consecutive rescue days, plus a daily
  challenge ("Rescue 1 item") and a Weekly Recap card
- **Night Horror Mode** - automatic after dark (18:00-06:00) with a
  manual Auto/On/Off cycle; fog, blinking title, and glowing eyes in an
  empty pantry
- **Item photos** - snap a photo per item from the phone camera
  (downscaled before saving, max 20 photos)
- **Daily Reminder** — browser notification + in-app "Today's Horrors" list of
  items expiring today or tomorrow
- **Background Music** — horror ambient loop (Web Audio only: low drone + wind + eerie notes, on by default since Phase 23; Music toggle in the header, visible on every tab). Sound effects were removed in Phase 23 on user order.
- **Freeze** — ❄️ Freeze button on every item card extends its expiry by 14 days (Phase 24); not a rescue, not waste, stats untouched, syncs to the household pantry like any other change.
- **Codex progress** — secret monsters now show their progress on locked cards (Phase 24): Triple Threat "n / 3 rescued today" with a progress bar, Void King a 2-step checklist; unlock conditions unchanged.
- **Louder music** — the horror background music is louder again and the drone gained a 220 Hz harmonic, the part phone speakers can actually play (Phase 29, after the user still heard nothing on the phone in Phase 25); eerie notes and wind raised too, and the header toggle now shows a pulsing note while the music runs.
- **Share Card** — canvas-generated image with your rescue stats for
  #KiroweenHackathon26
- **Haunted Household** - share one pantry with your whole household
  through an anonymous 6-character code (no account, no personal data).
  The pantry syncs through the Cloudflare Worker (Workers KV); the app
  keeps working offline with localStorage and adopts the server copy
  only when it is newer. Photos stay on the device
- **Installable (PWA)** - manifest + offline service worker; install it
  from the browser and it opens full-screen, with the app shell cached
  for offline use
- **Bottom navigation** (mobile) — Pantry / Impact / Codex / Share
- **Demo Pantry** — one tap seeds sample items across all urgency levels
- **Offline-first** — everything persists in localStorage; the server
  pantry is an optional sync layer, never a requirement

## Tech

Vanilla HTML/CSS/JS. No build step, no dependencies. Self-hosted
Creepster font. Works as a static site, installable as a PWA
(manifest + service worker `sw.js`, app shell cached offline). Behind
it is a real backend: one classic Cloudflare Worker
(`worker/worker.js`) on `grokingstore.my.id/freshtrack-ai/*` with
three endpoints — `POST /api/recipe`, `GET/POST /api/pantry`, and
`GET /api/health`.

**AI recipes.** The Worker proxies the Verboo router
(OpenAI-compatible, model `glm-5.3-flash`); the key lives in the
Worker secret `VERBOO_API_KEY` and is never shipped to the browser.
The prompt contract demands JSON only (temperature 0.7, max 800
tokens, 15 s abort timeout) and the reply is validated
(`parseRecipe`: title, non-empty ingredients and steps, numeric
`timeMinutes`) before it reaches the UI. Until a working key is
installed the Worker answers 503 `ai_unavailable` and the app uses
its rule-based recipes instead. (The Worker originally proxied
Gemini; `GEMINI_API_KEY` is still stored, unused, for rollback.)

**Shared pantry (Haunted Household).** The same Worker stores
household pantries in Workers KV (`PANTRY_KV`, namespace
`freshtrack-pantry`). A household is an anonymous 6-character code
(no 0/O/1/I/L) plus a per-device id — no account, no personal data.
Writes are debounced 1.5 s, last-write-wins by `updatedAt` with a
5-second grace window, and a stale write gets HTTP 409 with the fresh
server copy attached so the client adopts it instead of overwriting
it. Caps: 64 KB JSON and 200 items per pantry, 10 devices per
household; every write is shape-validated (400 otherwise). Photos are
stripped from the sync payload and never leave the device.
localStorage stays the offline source of truth, so the app works with
no connection. D1 is not usable with the stored Cloudflare
credential (auth error 10000), so KV is the server store; see
`worker/bind_kv.py`.

**Guardrails.** CORS is an allowlist (`fhria5.github.io` plus local
dev origins), never `*`. Recipe and pantry endpoints share an
in-memory sliding-window rate limit of 30 requests per IP per minute
(429 with a 60 s retry hint). Health reports capability as booleans
only.

**MCP.** `mcp-server/` is a Node MCP server (SDK 1.32.2, stdio) that
exposes the same live Worker through four read-only tools
(`get_health`, `get_recipe`, `get_pantry`,
`list_household_status`); registered in `.kiro/settings/mcp.json`
and verified live with an SDK client.

Tests: 398 Playwright checks (v2 + Codex + Phases 19–25 + 29) plus a
property suite of 12 checks over 1,511 seeded random cases: 10 pure
checks in `tests/test-properties.cjs` (plain `node`, no Playwright —
runs in the Kiro Web sandbox) and 2 browser smoke checks in
`tests/test-properties-browser.cjs`.

## Built with Kiro

FreshTrack was built end-to-end with **Kiro CLI** using spec-driven development:

1. **Spec first** — requirements, design, and tasks were written as a Kiro spec
   in `.kiro/specs/freshtrack/` (`requirements.md`, `design.md`, `tasks.md`),
   Phases 1-17.
2. **Implementation** — Kiro CLI executed the spec, then a polishing pass
   (Phase 10), 5 extra features (Phase 11), and mobile bottom navigation
   (Phase 12). Version 2 (Phases 13-17) added the 25-recipe bank with
   category filters, AI recipes plus Cook Tonight via the Gemini proxy
   Worker, Kiro steering docs, and a working Kiro hook; the final v2
   implementation was completed directly against the same spec when the
   Kiro CLI hit its monthly plan limit mid-build. Phase 18 (4 secret
   Codex monsters) and Phase 19 (polish audit: AA contrast fixes, a
   stored-XSS fix for item photos, small-screen layout fixes) were
   likewise completed directly against the spec, since the Kiro plan
   credits stayed exhausted. Phase 20 (score plan: server pantry sync
   via Workers KV, Haunted Household shared pantry, PWA installable,
   Kiro bonus/hook investigation, video v2) was also completed directly
   against the spec for the same reason. Phase 21 (tab view navigation:
   one tab visible at a time, desktop sticky tab bar + mobile bottom
   nav as tab switchers, deep-link hashes, Share tab) was also completed
   directly against the spec for the same reason. Phase 22 (deeper horror
   design: blood-red accents, drifting mist, flickering title, glowing
   danger cards; Spooky Sounds on by default with a Test Sound button and
   sounds on tab switch, add, rescue, and secret unlock) was also
   completed directly against the spec for the same reason. Phase 23
   (horror background music: Web Audio drone + wind + eerie notes,
   Music toggle moved into the header so it is visible on every tab;
   sound effects removed entirely on user order) was also completed
   directly against the spec for the same reason. Phase 24
   (Freeze button: +14 days expiry per item; Codex secret progress:
   Triple Threat n/3 bar and Void King 2-step checklist, unlock
   conditions unchanged; merged from the user's uploaded file, whose
   fake OCR / fake sync link / Tailwind rewrite was not used) was also
   completed directly against the spec for the same reason. Phase 25
   (louder music for phone speakers: master gain 0.15, drone 110 Hz)
   and Phase 26 (MCP server over the live Worker, a custom QA agent
   definition, and property-based tests) were also completed directly
   against the spec for the same reason — by then a probe had proven
   the 4,000 bonus credits do not work in Kiro CLI
   (`MONTHLY_REQUEST_COUNT`), so no Kiro session was available at all.
3. **Steering** - `.kiro/steering/` holds `product.md`, `tech.md`, and
   `structure.md`, describing the app as it actually is: vanilla JS, the
   localStorage keys, the Codex migration, the palette tokens, the 44px
   accessibility rules, and the no-em-dash rule.
4. **Hook** - `.kiro/hooks/check-js-on-save.json` (Kiro hook schema v1,
   `PostFileSave`) runs `scripts/check-saved-js.mjs`, which runs
   `node --check` on `app.js` or `recipes.js` whenever Kiro saves one, so
   a syntax break is caught immediately. The hook file follows the
   documented Kiro v1 schema and its command was verified by direct
   simulation (passes on good files, exits non-zero on a broken file).
5. **MCP server, custom agent, property tests (Phase 26)** -
   `mcp-server/` is a Node MCP server (`@modelcontextprotocol/sdk`,
   stdio) exposing the live Worker: `get_health`, `get_recipe`,
   `get_pantry`, `list_household_status`. `.kiro/settings/mcp.json`
   registers it for Kiro IDE/Web, and
   `.kiro/agents/freshtrack-qa.md` defines a QA agent that runs the
   Playwright suites and reports failures with file and line.
   `tests/test-properties.cjs` checks app invariants over 1,511 seeded
   random cases (freeze +14 days, urgency monotonicity and boundaries,
   recipe filter, household-code charset, Triple Threat cap); its 10 pure
   checks need only plain `node`, and the 2 browser smoke checks live in
   `tests/test-properties-browser.cjs`. All three
   were built directly from the Kiro spec after the plan credits ran
   out — Kiro did not execute them, and the Devpost write-up says so.
6. **Verification** — urgency boundaries (11/11), recipe matching, and
   integration tests (34/34) were run during the build; the finished app
   was checked in a real browser on desktop and mobile viewports, including
   the v2 flows: add item, AI Recipe fallback, rescue, Codex XP, streak,
   night mode, and photo. Phase 19 added a 55-check polish audit
   (contrast, tap targets, overflow, malformed storage, AI failure modes,
   share flows) and the v2 (27 checks) and Codex secret (18 checks)
   suites pass alongside it. Phase 20 added a 41-check suite (cloud sync
   create/join/409/offline/leave, photo stripped from server pushes,
   PWA manifest + service worker registration) and all four suites pass
   together (141 checks). Phase 21 added a 57-check tab-view suite
   (tab switching by click/hash/deep link, one visible panel, focus +
   aria, per-tab heights, feature flows inside tabs, skip link) and all
   five suites pass together (198 checks). Phase 22 added a 39-check
   suite (horror design tokens and effects, AA contrast re-audit,
   sounds default on, AudioContext running after a gesture, Test Sound
   button, sounds on tab/add/rescue/secret events, pref persistence)
   and all six suites pass together (237 checks). Phase 23 replaced the
   sound effects with a background-music suite (49 checks: music default
   on, start after gesture, eerie notes, header toggle visible on every
   tab, pause on hidden tab, pref persistence, effects fully removed)
   and rewrote the Phase 22 suite to 48 checks (design kept,
   effects-removal verified); all seven suites pass together
   (295 checks). Phase 24 added a 52-check suite (Freeze +14 days
   exact, stats untouched, survives reload, debounced pantry sync
   POST; Codex Triple Threat 0/3-1/3-2/3-captured and Void King
   2-step checklist, unlocks unchanged) and all eight suites pass
   together (347 checks). Phase 25 added a 21-check suite (louder
   music: master gain 0.15, drone 110/110.5 Hz, eerie notes and wind
   raised, old 55 Hz / 0.05 values gone, footer v25.1, cache v5) and
   all nine suites pass together (368 checks). Phase 29 added a
   16-check music-fix suite (audible mix: master gain 0.25, 220 Hz
   drone harmonic, eerie notes 0.12 every 3-6 s, wind 0.04, pulsing
   note on the toggle while the graph runs; footer v27.2, cache v7)
   and updated the old mix assertions in the Phase 23/25 suites
   (test-only). v27.3 (14 Nov) replaced the drone-led mix with a creepy
   A-minor music-box melody loop (440-880 Hz) as the lead voice and the
   drone turned down to a quiet bed (footer v27.3, cache v8); the suite
   grew to 18 checks. Phase 26 added a
   12-check property suite (freeze +14 days over 250 random dates,
   urgency monotonicity over 250 offset pairs + 11 exact boundaries,
   recipe filter over 250 random picks, 500 household codes, Triple
   Threat cap over 250 random histories — 1,511 random cases) and all
   eleven suites pass together (398 checks).

The `.kiro` directory in this repo is the evidence of that workflow.

## License

MIT — see `LICENSE`.
