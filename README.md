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
- **Rescue recipes** — rule-based suggestions from a built-in recipe bank so
  expiring ingredients get used, not wasted
- **Impact Dashboard** — rescued vs wasted counts, estimated kg of food saved
  and CO₂ avoided (clearly labeled estimates), with history
- **Monster Codex** — collect the 4 monsters by rescuing items at each urgency level
- **Daily Reminder** — browser notification + in-app "Today's Horrors" list of
  items expiring today or tomorrow
- **Spooky Sounds** — synthesized Web Audio effects (off by default)
- **Share Card** — canvas-generated image with your rescue stats for
  #KiroweenHackathon26
- **Bottom navigation** (mobile) — Pantry / Impact / Codex / Share
- **Demo Pantry** — one tap seeds sample items across all urgency levels
- **Offline-first** — everything persists in localStorage; no backend, no account

## Tech

Vanilla HTML/CSS/JS. No build step, no dependencies, no backend. Self-hosted
Creepster font. Works as a static site.

## Built with Kiro

FreshTrack was built end-to-end with **Kiro CLI** using spec-driven development:

1. **Spec first** — requirements, design, and tasks were written as a Kiro spec
   in `.kiro/specs/freshtrack/` (`requirements.md`, `design.md`, `tasks.md`).
2. **Implementation** — Kiro CLI executed the spec's 18 tasks, then a polishing
   pass (Phase 10), 5 extra features (Phase 11), and mobile bottom navigation
   (Phase 12), verifying each task as it went.
3. **Verification** — urgency boundaries (11/11), recipe matching, and
   integration tests (34/34) were run during the build; the finished app was
   checked in a real browser on desktop and mobile viewports.

The `.kiro` directory in this repo is the evidence of that workflow.

## License

MIT — see `LICENSE`.
