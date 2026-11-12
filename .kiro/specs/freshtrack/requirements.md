# FreshTrack — Requirements

## Overview

FreshTrack is a single-page web app that helps households reduce food waste. Users add food items with expiry dates; the app tracks how close each item is to expiring and warns them before items go bad. Food nearing expiry is presented as "monsters" in a horror/Halloween-themed UI, turning the mundane task of checking your fridge into a game of saving food before it rots.

Built for the Kiroween 2026 Costume Contest category.

## Problem Statement

Roughly one-third of all food produced globally is wasted, much of it at the household level. People forget what's in their fridge, lose track of expiry dates, and end up throwing away food that could have been eaten. Existing apps are utilitarian checklists that fail to build a habit. FreshTrack uses a horror theme to make checking your fridge engaging and memorable.

## Goals

- Let users quickly add food items with a name, category, and expiry date.
- Show a live countdown for every item with clear urgency levels.
- Visually frame expiring food as monsters the user must "save" before it rots.
- Suggest recipes from a built-in bank that use items nearing expiry.
- Work entirely offline with no backend, no account, and no network dependency.

## Non-Goals

- User accounts, authentication, or multi-device sync.
- Barcode scanning or image recognition for adding items.
- Nutrition tracking, calorie counting, or meal planning.
- Online recipe search or external API calls.
- Social features (sharing, leaderboards, etc.).
- Mobile-native builds or app store packaging.

## User Stories

### Food Item Management

- **US-1:** As a user, I can add a food item by entering its name, selecting a category, and choosing an expiry date so that it appears in my tracked list.
- **US-2:** As a user, I can view all my tracked food items in a single list sorted by expiry urgency (soonest first).
- **US-3:** As a user, I can delete a food item when I have consumed or discarded it.
- **US-4:** As a user, my food items persist across browser sessions so I don't lose my list when I close the tab.

### Expiry Countdown & Urgency

- **US-5:** As a user, I can see at a glance how many days remain until each item expires.
- **US-6:** As a user, items are visually grouped by urgency level so I immediately know what needs attention:
  - **Fresh** (> 5 days remaining): item is calm and harmless.
  - **Wary** (3–5 days remaining): item is starting to stir — subtle warning.
  - **Danger** (1–2 days remaining): item is a full monster — act now.
  - **Rotten** (expired): item has fully rotted — urgent disposal or use.
- **US-7:** As a user, the app updates the countdown without requiring a page refresh when the day changes.

### Recipe Suggestions

- **US-8:** As a user, when an item reaches the Danger or Rotten urgency level, the app suggests recipes from a built-in recipe bank that include that item as an ingredient.
- **US-9:** As a user, I can tap a suggested recipe to view its full ingredient list and instructions.
- **US-10:** As a user, if no recipe in the bank matches my expiring item, the app tells me so gracefully instead of showing an empty state.

### Horror Theme

- **US-11:** As a user, the app's visual design uses a horror/Halloween aesthetic (dark palette, spooky fonts, monster imagery) so the experience is fun and on-theme.
- **US-12:** As a user, the monster presentation of each item escalates with urgency — a Fresh item looks innocent, a Rotten item looks horrifying.

## Functional Requirements

### FR-1: Add Food Item

- The app provides a form with fields: item name (text, required), category (dropdown: produce, dairy, meat, pantry, bakery, other), expiry date (date picker, required, must be today or later).
- On submit, the item is saved to localStorage and the list updates immediately.
- Duplicate names are allowed; each entry is a separate item.

### FR-2: List Food Items

- All items are displayed as cards in a single scrollable list.
- Items are sorted by expiry date ascending (soonest first).
- Each card shows: item name, category, days remaining, urgency level, and a delete button.
- The list is empty-state friendly: when no items exist, show a themed prompt to add the first item.

### FR-3: Delete Food Item

- Each item card has a delete control.
- Deleting removes the item from localStorage and the list immediately.
- A brief confirmation prompt appears before deletion (prevents accidental removal).

### FR-4: Expiry Countdown & Urgency Levels

- The app computes `daysRemaining = expiryDate - today` for each item.
- Urgency levels are determined as follows:
  - `fresh`: daysRemaining > 5
  - `wary`: daysRemaining between 3 and 5 (inclusive)
  - `danger`: daysRemaining between 1 and 2 (inclusive)
  - `rotten`: daysRemaining <= 0
- Each level has a distinct visual treatment (color, monster emoji/art, label).
- The countdown re-evaluates when the app loads and on day change (checked via a lightweight interval or on visibility regain).

### FR-5: Recipe Suggestions

- A built-in recipe bank contains at least 8 recipes. Each recipe has: name, ingredients (list of food item names or category keywords), instructions, and a short description.
- When an item is at `danger` or `rotten` urgency, the app matches recipes whose ingredients include that item's name (case-insensitive) or category.
- Matching recipes appear in a "Rescue Recipes" section on or near the item card.
- Tapping a recipe expands it to show full ingredients and instructions.
- If no recipes match, display: "No rescue recipes found for this item. Time to improvise... or bid farewell."

### FR-6: Horror-Themed UI

- Dark background (deep purples, blacks, dark greens).
- Spooky display font for headings (e.g., Creepster or similar web-safe/horror font via Google Fonts or CSS fallback).
- Readable body text in a clean sans-serif for usability.
- Monster imagery for each urgency level using emoji or inline SVG (no external image dependencies):
  - fresh: 🥬 or a calm face
  - wary: 🧟 a zombie stirring
  - danger: 👹 a demon raging
  - rotten: 💀 a skull / rotten
- Subtle CSS animations: items at `danger` and `rotten` have a gentle shake or pulse to draw attention.
- Themed empty state and themed confirmation dialog.

### FR-7: Persistence

- All data is stored in `localStorage` under a single key (e.g., `freshtrack.items`).
- Data is a JSON array of item objects: `{ id, name, category, expiryDate }`.
- The app gracefully handles missing or corrupted storage (treat as empty list).

## Non-Functional Requirements

### NFR-1: Performance

- The app loads and renders the full item list in under 1 second on a mid-range laptop.
- Adding or deleting an item updates the UI in under 100ms (no network calls).

### NFR-2: Offline & Static

- The entire app is a static site: HTML, CSS, and vanilla JS. No build step is required to run it.
- No external API calls at runtime. The only optional external resource is a Google Font (with CSS fallback if it fails to load).

### NFR-3: Browser Compatibility

- Works in the latest versions of Chrome, Firefox, and Edge.
- Uses `localStorage`, `Date`, `Intl` — all broadly supported. No ES modules required; a single `<script>` tag is fine.

### NFR-4: Accessibility

- All interactive elements are keyboard accessible.
- Color contrast meets WCAG AA for body text against the dark background.
- Urgency is communicated through text labels and icons, not color alone.

### NFR-5: Language

- The UI is in English. No internationalization or localization is required for this version.

## Constraints

- No frameworks or libraries (no React, Vue, jQuery, etc.). Vanilla JS only.
- No backend, no server, no database. `localStorage` is the only persistence layer.
- The recipe bank is hardcoded in the app; no dynamic recipe loading.
- Total app should be a small number of files (index.html, styles.css, app.js, and optionally a recipes.js data file).

## Assumptions

- Users add items manually; expiry dates are user-provided and not validated against real product data.
- The app is used on a single device/browser; no sync is needed.
- The recipe bank is small and curated, not exhaustive.
