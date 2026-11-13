# FreshTrack - Product

FreshTrack is an anti food-waste tracker with a horror twist, built for the
Kiroween 2026 Costume Contest. The user adds food items with expiry dates;
each item gets an urgency level (Fresh, Wary, Danger, Rotten) with a monster
mascot, and the app suggests rescue recipes before food rots.

## What it does

- Track pantry items with expiry dates, sorted soonest first.
- Urgency levels drive the horror theme: Fresh (leafy spirit), Wary
  (zombie), Danger (ogre), Rotten (skull).
- Rule-based rescue recipes from a built-in bank of 25 recipes, filterable
  by meal (Breakfast, Lunch, Snack, Dinner).
- AI recipes: an "AI Recipe" button on every item card and a "Cook Tonight"
  mode that plans one dinner from all urgent items. AI runs through a
  Cloudflare Worker proxy to Gemini. AI is progressive enhancement only:
  the app works fully offline without it, and when the AI is unavailable
  the app silently falls back to rule-based recipes.
- Gamification: Monster Codex (rescue a monster per urgency level, level up
  to Lv.5), daily rescue streak, daily challenge, Weekly Recap, Impact
  Dashboard (kg of food and CO2 saved), Spooky Sounds (default off), Night
  Horror Mode (auto 18:00-06:00, plus manual cycle), item photos.
- Demo pantry can be summoned with one tap so anyone can try the app.

## Product rules

- UI language is English. Keep every new UI string in English.
- Never show a raw error, status code, or stack trace to the user. Any
  failure degrades to the rule-based fallback with a short friendly note.
- Horror theme is playful, never gory. Discipline on the palette: use only
  the existing tokens in `styles.css` (`--bg-deep`, `--bg-panel`,
  `--accent-fresh`, `--accent-wary`, `--accent-danger`, `--accent-rotten`,
  `--accent-rotten-text`, `--text-primary`, `--text-muted`,
  `--border-spooky`). Do not add new colors.
- All data stays in the browser (localStorage). There is no user account,
  no backend database, and no tracking.
