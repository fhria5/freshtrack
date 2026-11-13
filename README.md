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
- **Spooky Sounds** — synthesized Web Audio effects (off by default)
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
(manifest + service worker `sw.js`, app shell cached offline). AI
recipes run through a classic Cloudflare Worker (`worker/worker.js`)
that proxies Gemini (`gemini-3.5-flash-lite`); the key lives in the
Worker secret `GEMINI_API_KEY` and is never shipped to the browser.
Until that secret is installed the Worker answers 503 `ai_unavailable`
and the app uses its rule-based recipes instead. The same Worker also
stores shared household pantries in Workers KV (`PANTRY_KV`,
namespace `freshtrack-pantry`): `GET/POST /api/pantry`. D1 is not
usable with the stored Cloudflare credential (auth error 10000), so
KV is the server store; see `worker/bind_kv.py`.

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
   directly against the spec for the same reason.
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
5. **Verification** — urgency boundaries (11/11), recipe matching, and
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
   five suites pass together (198 checks).

The `.kiro` directory in this repo is the evidence of that workflow.

## License

MIT — see `LICENSE`.
