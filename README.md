# GymLog — personal workout tracker (PWA)

Offline web app. No backend, no account, no App Store. All data is stored in your iPhone's browser storage.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell + all styling |
| `data.js` | 80 seeded exercises (EN/RU), muscle groups, Day A/B templates, translations |
| `store.js` | Data model, localStorage persistence, all stats math |
| `views.js` | Screens, charts, rest timer, plate calculator |
| `sw.js` | Service worker — makes the app work offline |
| `manifest.webmanifest` | PWA metadata (icon, name, standalone mode) |
| `icon-*.png` | App icons |

All 10 files must sit in the **same folder**. Nothing to build, nothing to install.

---

## Deploy to GitHub Pages

**One-time, ~5 minutes. Easiest from a desktop browser.**

1. Sign in at [github.com](https://github.com) (create a free account if you don't have one).
2. Click **+** → **New repository**.
   - Name: `gymlog`
   - Visibility: **Public** (GitHub Pages requires public on free accounts)
   - Don't add a README
   - → **Create repository**
3. On the empty repo page click **uploading an existing file**.
4. Drag in **all files** from the `gymlog` folder (all `.html`, `.js`, `.webmanifest`, `.png`, and this `.md`). Do not upload the folder itself — upload its contents.
5. Click **Commit changes**.
6. Go to **Settings** (repo top bar) → **Pages** (left sidebar).
   - Source: **Deploy from a branch**
   - Branch: **main**, folder: **/ (root)** → **Save**
7. Wait 1–2 minutes, reload that page. Your URL appears:
   `https://<your-username>.github.io/gymlog/`

### Add to iPhone Home Screen

1. Open the URL in **Safari** (must be Safari — Chrome on iOS can't install PWAs).
2. Tap the **Share** button (square with arrow).
3. Scroll down → **Add to Home Screen** → **Add**.
4. Launch it from the icon. It opens full-screen with no browser chrome and works offline.

### Updating the app later

Upload the changed file(s) to the repo (GitHub: open file → pencil icon → paste → commit), **and** bump the cache version in `sw.js`:

```js
const CACHE = 'gymlog-v2';   // was v1
```

Without the bump, the service worker keeps serving the old cached version. After the bump, close and reopen the app twice for the new version to take effect.

---

## Data safety — read this once

- Data lives **only** in this app's storage on this iPhone. It is not synced anywhere.
- Deleting the Home Screen icon, or "Clear website data" in Safari settings, **erases everything**.
- iOS may evict storage for sites not opened in ~7 days. Installed (Home Screen) apps are far more resistant, but not immune.
- → **Use Settings → Export backup regularly.** It saves a `.json` file you can put in iCloud Drive / Files. Settings → Import backup restores it on any device.
- The app reminds you if there's been no backup for 14+ days.

---

## Features

| Screen | What it does |
|---|---|
| **Today** | Start an empty workout or launch a template. Week/total counters, current body weight, streak. |
| **Log** (active workout) | Add exercises, log sets (weight × reps, reps-only, or duration). Previous session's numbers shown per set row. Rest timer auto-starts when you tick a set. Reorder, per-exercise notes, plate calculator on barbell lifts. |
| **History** | All past workouts. Tap → detail → Repeat / Save as template / Edit / Delete. |
| **Exercises** | 80 preloaded exercises by muscle group with search and filter. Add your own (name EN/RU, group, equipment, tracking type, description). Tap any exercise for PRs and its full history. |
| **Stats** | Workouts, avg/week, week streak, total tonnage. 12-week volume chart. 30-day muscle-group split. Per-exercise estimated-1RM progression chart (Epley). |
| **Body** | Weight log with **7-day rolling average** (not single readings), weekly rate vs your 0.18–0.20 kg/wk target, progress bar toward 75 kg, optional waist/chest/arm/thigh/neck. |
| **Settings** | EN/RU, dark/light, all optional features on/off, rest duration, bar weight, start/goal weight, template management, export/import/wipe. |

### Program-specific behaviour

- **Day A / Day B templates** are preloaded exactly as written in your mass-gain program, with target sets and rep ranges.
- **Progression hints** — when you hit the top of the rep range on every set of an exercise, the app tells you to add weight next session (your double-progression rule). Toggle in Settings.
- **Program warnings** — exercises your program flags (barbell back squat, deadlift, heavy barbell bench/OHP, etc.) show a warning with the recommended substitution when you add them. Toggle in Settings.

### Known limitations

- **No vibration on iPhone.** iOS Safari doesn't support the Vibration API. The rest timer plays a short beep instead (silent switch off), plus the visual countdown. On Android both work.
- No push notification when the rest timer ends if you leave the app — the countdown only runs while the app is open.
- No cloud sync between devices; move data with export/import.
- Weights are in **kg** only.
