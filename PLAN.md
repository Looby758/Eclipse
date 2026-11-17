# Watch Tracker – Build Plan

Nov 17, 2026 · @Looby

## Overview

A personal desktop app for tracking films and TV shows. It replaces Sequel and focuses on features that save time or help decide what to watch, not on star ratings.

**Who it's for:** me, on a Windows PC and a Mac. No phone app needed.

**Guiding principles**

- **Free to run.** No paid APIs and no AI calls. Data comes from TMDB's free API and is stored locally.
- **Useful, not just a log.** Every feature should answer a real question: where can I watch this, how long will it take, does it get good, what's coming out.
- **My data is mine.** It works without an account, stores everything locally and can export it all.
- **UK first.** Streaming availability uses the GB region. My services are Disney+ and NOW TV.

**Features in scope:** where to watch, episode-rating heatmap, "Finish it by Friday", watchlist hours, watch-order guides, completion tracking, "On this day" and release calendar sync.

## Tech approach

The app is built the same way as my notes app, Orbit ([github.com/Looby758/notes-app](https://github.com/Looby758/notes-app)): **Electron + React + TypeScript**, with electron-vite, Vitest, electron-builder and GitHub Actions releases. It's a separate app, but built so the two could be combined later.

**Why this stack**

- I already know this setup from Orbit, so building, running and releasing it will feel familiar.
- Claude Code can reuse Orbit's patterns: settings storage, encrypted keys, installers, the update check and the dark theme.
- Matching stacks keep a later merge simple. Either the tracker becomes a tab or panel inside Orbit, or the two share code.

**Built to combine later**

- Keep the tracking logic (TMDB calls, runtime maths, heatmap data, completion lists) in its own folder, e.g. `src/core`, with no Electron or UI code in it. That folder could then drop into Orbit as it is.
- Use the same conventions as Orbit: settings layout, IPC naming, theme colours and fonts, folder structure.
- Store data as plain files, like Orbit, so either app can read them.

**Data source: TMDB API** (free for personal, non-commercial use; I'll need a free API key)

| Need | TMDB endpoint |
| --- | --- |
| Search films and shows | `/search/multi` |
| Film or show details, runtime, poster | `/movie/{id}`, `/tv/{id}` |
| Episodes with ratings, runtimes, air dates | `/tv/{id}/season/{n}` |
| Where to watch (UK) | `/movie/{id}/watch/providers`, `/tv/{id}/watch/providers` (use `results.GB`) |
| Next episode or season date | `/tv/{id}` (`next_episode_to_air`) |
| Film franchises | `/collection/{id}` |
| Director or actor filmographies | `/person/{id}/combined_credits` |

**Caching:** store TMDB responses locally so the app is fast and works offline. Refresh streaming availability daily and episode data weekly, or on demand.

**Attribution:** TMDB's terms require a credit to TMDB, and the streaming data needs a credit to JustWatch. A small footer is enough.

**Storage and two computers:** follow Orbit's approach.

- **My data** (watchlist, watch history, notes, custom lists and orders) lives as JSON files in a folder I choose, synced with Google Drive. That makes it work across the PC and the Mac and keeps it readable by Orbit later.
- **TMDB cache** lives in the app's own local data folder (SQLite or JSON) and isn't synced. It can always be rebuilt.
- Avoid having the app open on both computers at once, so the files don't conflict.

## Features

### Core basics (everything else builds on these)

- Search any film or show and see its poster, year, runtime and overview.
- Statuses: Want to watch, Watching, Watched, Stopped.
- For shows: tick off episodes, with the date watched saved automatically.
- A watch date and an optional one-line note on anything ("watched with Dad at Christmas").
- Settings: my region (GB), my services (Disney+, NOW TV), my bedtime and NOW TV renewal date.

### Where to watch

Every title shows which UK services stream, rent or sell it, with my services highlighted. Filters across the app: "on my services", "rent or buy only", "not streaming anywhere".

### Episode rating heatmap: "Does it get good?"

A grid for each show: one row per season, one cell per episode, coloured by its TMDB rating. It shows at a glance where a show peaks or falls off.

- Show each season's average at the end of its row.
- Grey out episodes with too few votes to trust (e.g. under 20).
- Mark my current position in the grid. Hide episode titles past that point to avoid spoilers; show ratings only.

### "Finish it by Friday"

Pick a show and a deadline (a date, the next season's premiere or my NOW TV renewal). The app works out the remaining episodes and runtime, then tells me:

- Episodes needed per night to finish on time, based on how many nights a week I watch.
- Whether the deadline is realistic, and the earliest finish date if it isn't.
- Tonight: how many episodes fit before my bedtime, from the current time.

### Watchlist hours

Show my watchlist as time, not just titles: "Your watchlist is 214 hours long."

- Films count their runtime. Shows count only the episodes I haven't watched.
- Break the total down by service (e.g. 80 hours on NOW TV, 40 on Disney+).
- Sort by "quickest to finish" so I can see what fits in a weekend.

### Watch-order guides

Show a franchise as an ordered list of films and shows, with my progress and where each one streams.

- **Release order:** automatic for film series using TMDB collections.
- **Story order and franchises that mix films and shows** (Marvel, Star Wars): TMDB doesn't have this, so ship a small hand-curated file for a few big franchises. Claude Code can draft these for me to check.
- **My own orders:** let me build and reorder a guide myself by dragging titles in.
- Highlight the next unwatched title and whether it's on my services.

### Completion tracking

Progress bars for collections of titles: "You've seen 7 of 12 Nolan films."

- **Directors and actors:** built from TMDB filmographies (directing credits only for directors).
- **Franchises:** from TMDB collections or the watch-order guides.
- **Custom lists:** my own, such as "every Best Picture winner". Allow importing a public TMDB list by its ID.
- Show what's left in each list, with where to watch.

### On this day

A panel on the home screen: "One year ago today you watched Interstellar." It shows the note I left if there is one, and every match from previous years on today's date. Titles without a watch date are skipped.

### Release calendar sync

Put premiere dates for shows I follow, and release dates for films on my watchlist, into my calendar.

- **Version 1:** export an .ics file that I import into Google Calendar or Outlook. Simple, but it doesn't update itself.
- **Later (optional):** a calendar feed that updates automatically. Google Calendar can only subscribe to a link on the internet, so this needs the feed hosted somewhere free with a private link. Only do this if version 1 feels like a chore.

## Look and feel

This is a personal hobby app, so it should look unique and feel like mine, not corporate or templated. I haven't decided on a layout, and I'd rather react to options than describe one up front.

**How Claude Code should handle design**

- Before building any screen, ask me questions about my taste: colours, moods, films or games whose look I like, how busy or minimal it should feel, and so on.
- Then make 2–3 genuinely different layout drafts for that screen as quick mock-ups, not small variations of one idea, and let me pick or mix them.
- Start with the home screen and a show's page, which is the busiest screen. Other screens follow the style I've picked.
- Keep trying bold ideas: unusual navigation, poster-heavy layouts, playful touches. I can always rein it in.
- Keep the visual style (colours, fonts, spacing) in one theme file so it's easy to change, or to line up with Orbit later.

## Build phases

Build in this order, and finish each phase so the app is usable before moving on. Each phase ends with me trying it out.

1. **Foundation.** Electron project set up like Orbit, TMDB key in settings, the data folder and cache, search, title pages and the core statuses.
2. **Tracking and where to watch.** Episode ticking with watch dates, notes, my services and the "on my services" filters. Import my Sequel export from \`import/sequel/\`: look through its files first, show me what data it holds, then map it in (statuses, watch dates, episode progress, ratings or notes).
3. **Time features.** Watchlist hours and "Finish it by Friday". They share the same runtime maths.
4. **Episode heatmap.** The season-by-episode grid on each show's page.
5. **On this day.** Home-screen panel using watch dates and notes.
6. **Completion tracking.** Directors, actors, collections and custom lists.
7. **Watch-order guides.** TMDB collections first, then curated franchise files and custom orders.
8. **Release calendar.** .ics export, then decide whether an auto-updating feed is worth it.
9. **Polish.** Export all data (JSON and CSV), the TMDB and JustWatch credits, and Windows and Mac installers with electron-builder and GitHub Actions releases, as in Orbit.

## Open questions

- [ ] **Combining with Orbit:** what would joining them look like? A tab inside Orbit, Orbit's daily notes showing what I watched that day, or just a shared look? This doesn't need answering now, but it affects how strictly `src/core` stays separate.
- [ ] **Sequel history:** done. The export is in \`import/sequel/\`, which is git-ignored because it's personal data.
- [ ] **Watch orders:** which franchises should get curated guides first (Marvel, Star Wars, others)?
- [ ] **Look and feel:** decided through layout drafts and questions (see Look and feel), not up front.
- [ ] **Selling it later:** a paid version would need TMDB's commercial terms and a JustWatch agreement. Not planned. Only worth revisiting if the app turns out really good, so nothing needs designing around it now.

## Using this plan in the project

Export this doc as Markdown and save it in the project as `PLAN.md`. Then start with this message:

> Read PLAN.md. Before writing any code, go through the Open questions with me and recommend an answer for each. Then build Phase 1 only, explain how to run it, and stop so I can try it.

**Working rules for Claude Code**

- One phase at a time. Don't start the next phase until I've tried the current one.
- Keep a short progress log at the bottom of PLAN.md: what's done, what's next, any decisions made.
- Look at the Orbit repo for patterns before inventing new ones, so the two apps stay alike.
- Keep the TMDB API key out of the code. Store it encrypted in settings, the same way Orbit stores keys.
- I've built one app with Claude Code before but I'm not a professional developer, so explain how to run and test each phase in plain steps.

## Progress log

**Phase 1: Foundation (built, waiting for you to try it)**

- Done: Electron + React + TypeScript project set up like Orbit (electron-vite, Vitest, `area:action` IPC names, settings.json written safely, single-instance lock, Orbit-style title bar).
- Done: TMDB key in Settings, checked with TMDB then stored encrypted with Electron safeStorage, like Orbit's keys. Accepts the API Key or the Read Access Token.
- Done: data folder picker; library saved as `library.json` there, reloaded automatically when Google Drive syncs a change in. A file that can't be read is backed up before anything replaces it.
- Done: TMDB cache as JSON files in the app's own folder (details weekly, searches daily, "Refresh from TMDB" on demand); shows saved copies when offline.
- Done: search (films and shows), title pages (poster, backdrop, runtime, genres, seasons, next episode, collection) and the four statuses. Marking something Watched records the date.
- Done: TMDB credit footer; dark and light mode (Settings → Appearance).
- Decisions: Eclipse is standalone for now; `src/core` has no Electron or UI code so it could move into Orbit. Curated watch orders: Marvel and Star Wars first. No plans to sell. Posters aren't saved for offline use yet (details are).
- Design: you asked for sleek and futuristic, alive rather than flat, poster-heavy, dark and light, no browns, dark greens or oranges, and its own look (not Orbit's). From six drafts you picked **C · Drift** for both screens: a slowly moving, tilted wall of your posters behind everything, a "Pick up …?" home, a floating dock (Tonight, Library, Settings, search), and pages as sheets that slide up, lit in each poster's colour. Fonts: Sora for headings, Inter for everything else (bundled, so they work offline). All of it lives in `src/renderer/src/styles/theme.css`.
- Next: you try Phase 1; then Phase 2 (tracking and where to watch, Sequel import).
