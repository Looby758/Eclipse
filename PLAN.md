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

### Watch soon (added later, your idea)

Select a few films and shows I want to watch soon, as a short list separate from the full watchlist. Eclipse then shows:

- The total time for the list (films in full, shows only the episodes I haven't watched).
- How much of it fits tonight and on each of my watching evenings, and roughly when I'd get through it all.
- What to put on tonight to fill the evening (e.g. "a film, or three episodes of X").

It reuses the Phase 3 runtime maths and my evening settings (start time, bedtime, watching nights).

### Seen before and rewatches (added later, your idea)

- **Seen it, no date:** mark a film, show or season as watched without saying when (things watched years ago, before Sequel, like Breaking Bad, Better Call Saul and El Camino). It counts everywhere as watched (completion, watch orders, watchlist hours) but On this day skips it, since there's no day to remember.
- **Rewatching:** say you're rewatching something. It tracks this rewatch's episode progress separately from the first watch, keeps each finished rewatch's dates, and shows how many times you've watched it ("Watched 3 times").

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
9. **Watch soon.** Pick a few films and shows to watch soon; see the total time and how much fits each evening (see Watch soon above).
10. **Seen before and rewatches.** Mark things watched without a date, and track rewatches with a count and their own episode progress (see Seen before and rewatches above).
11. **Polish.** Export all data (JSON and CSV), the TMDB and JustWatch credits, and Windows and Mac installers with electron-builder and GitHub Actions releases, as in Orbit.

## Future ideas (candidate phases, after Polish)

Ideas agreed in the brainstorm on 17 Nov 2026. They aren't scheduled yet. When one is picked up, it becomes a numbered phase after Polish. Everything here follows the same rules: free, local data, TMDB only, UK first.

12. **Your services: arriving and leaving.** Eclipse already refreshes where-to-watch daily. Save a small snapshot each day for titles in the library and compare it with the previous one: "3 things on your watchlist just arrived on Disney+", "Succession is no longer on NOW TV". TMDB doesn't give leaving dates in advance, so departures show up once they've happened, not before. Shown on Home and as a short history on each title page.
13. **Your services: "Do I still need NOW TV this month?"** A card for each of my services: hours of my watchlist and Watch soon on it, what I watched on it in the last 30 days, and its renewal day. If nothing I want is queued on it, suggest pausing before it renews. Pairs well with 12 as one "Your services" phase.
14. **Free UK TV as its own group.** JustWatch's GB data includes free services (BBC iPlayer, ITVX, Channel 4, My5 and others). Show them as their own group after my services and before rent or buy, and add an "On my services or free" filter wherever the availability filters are.
15. **"Where do I know them from?"** On a title page, list the cast I've already seen in other titles in my library: "You know Rhea Seehorn from Better Call Saul." Uses the credits Eclipse already downloads for Lists; only titles I've watched (or partly watched) count.
16. **Stalled shows.** Anything in Watching that I haven't ticked an episode of for a while (default 60 days, adjustable) gets a gentle "Keep going or stop?" on Home, with one-click Stopped or "remind me later". Keeps Watching and watchlist hours honest.
17. **Back after a long gap.** When a show I've finished a season of comes back after a long break (say, 6 months or more), Home says "Season 4 is out. You finished season 3 in March 2024" and shows the last couple of episode summaries from TMDB so I remember where things stood.
18. **Your year in Eclipse.** A year-in-review screen built from watch dates: hours watched, busiest month, most-watched director and actor, longest binge, lists and watch orders finished. Works for earlier years too, thanks to the Sequel dates. Shows up on Home in December, and any year can be opened from Lists.

## Open questions

- [ ] **Combining with Orbit:** what would joining them look like? A tab inside Orbit, Orbit's daily notes showing what I watched that day, or just a shared look? This doesn't need answering now, but it affects how strictly `src/core` stays separate.
- [ ] **Sequel history:** done. The export is in \`import/sequel/\`, which is git-ignored because it's personal data.
- [x] **Watch orders:** Marvel and Star Wars first (drafted in Phase 7, please check them).
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

**Phase 1: Foundation (done, merged)**

- Done: Electron + React + TypeScript project set up like Orbit (electron-vite, Vitest, `area:action` IPC names, settings.json written safely, single-instance lock, Orbit-style title bar).
- Done: TMDB key in Settings, checked with TMDB then stored encrypted with Electron safeStorage, like Orbit's keys. Accepts the API Key or the Read Access Token.
- Done: data folder picker; library saved as `library.json` there, reloaded automatically when Google Drive syncs a change in. A file that can't be read is backed up before anything replaces it.
- Done: TMDB cache as JSON files in the app's own folder (details weekly, searches daily, "Refresh from TMDB" on demand); shows saved copies when offline.
- Done: search (films and shows), title pages (poster, backdrop, runtime, genres, seasons, next episode, collection) and the four statuses. Marking something Watched records the date.
- Done: TMDB credit footer; dark and light mode (Settings → Appearance).
- Decisions: Eclipse is standalone for now; `src/core` has no Electron or UI code so it could move into Orbit. Curated watch orders: Marvel and Star Wars first. No plans to sell. Posters aren't saved for offline use yet (details are).
- Design: you asked for sleek and futuristic, alive rather than flat, poster-heavy, dark and light, no browns, dark greens or oranges, and its own look (not Orbit's). From six drafts you picked **C · Drift** for both screens: a slowly moving, tilted wall of your posters behind everything, a "Pick up …?" home, a floating dock (Tonight, Library, Settings, search), and pages as sheets that slide up, lit in each poster's colour. Fonts: Sora for headings, Inter for everything else (bundled, so they work offline). All of it lives in `src/renderer/src/styles/theme.css`.
- Done (after your try-out): the poster wall is never empty. Until your library has 24 posters it's topped up with this week's trending titles from TMDB (saved for a day, so it works offline too); your own posters come first and gradually replace them.

**Phase 2: Tracking, your services and the Sequel import (done, merged)**

- Done: episode ticking on show pages. Each season is a row of dots; the next episode glows. Click a dot for the episode (title, date, runtime, rating), then **Mark watched**, **Watched up to here** (ticks everything before it too) or **Mark all of Season N watched**. Double-click a dot to tick it quickly. Each tick saves the day you watched it; ticking a show you haven't added makes it Watching. Episodes you haven't reached keep their title and summary hidden until you ask.
- Done: a note on anything in your library, and the "Watched on" date (editable). Ratings brought over from Sequel show as "Your rating".
- Done: where to watch on every title page (stream, rent, buy), with your services lit up, and a link to every option. Data from JustWatch via TMDB, credited.
- Done: your services in Settings, with your country (stored in `library.json`, so both computers share it). The first time, Disney+ and NOW TV are picked for you.
- Done: filters in Library and Search: Anywhere, On my services, Rent or buy only, Not streaming anywhere. Home shows a watching show's next episode, whether it's on your services, and a button to tick it.
- Done: **Settings → Import from Sequel**. Pick Sequel's export (.zip, the unzipped folder or Library.csv), see what's in it, then Import. Wishlist → Want to watch (Watching if you'd started it), Completed → Watched, Abandoned → Stopped. Ratings are doubled to be out of 10, dates become your local day, episodes keep the day you watched them, Sequel collections are kept as lists on each title (for watch orders later). Anything already in Eclipse wins, episodes from both are combined, and `library.json` is copied aside before importing. Books and games are skipped.
- Your export (17 Nov 2026): 47 films and 36 shows, 681 watched episodes, 14 film and show ratings, no notes, one "Marvel" collection (21 of its films and shows). 6 books and 11 games are skipped. It stays out of git (`import/sequel/` is ignored).

**Phase 3: Time features (done, merged)**

- Done: one set of runtime maths in `src/core/time.ts`, shared by everything below. Films count their length; shows count only the regular episodes you haven't ticked that are already out (specials and unaired episodes don't count). Anything marked Watched counts as nothing left. When TMDB has no episode length, 45 minutes is assumed and shown as "about".
- Done: **Your evenings** in Settings: when you start watching (default 20:00), bedtime (default 23:00, after midnight is fine) and which nights you usually watch (default Monday to Friday). You can change all three; they're saved in `library.json`, so both computers share them.
- Done: **Watchlist hours** at the top of Library's Want to watch tab ("Your watchlist is 214 hours long") and Watching tab ("… left of what you're watching"), split by your services first, then streaming elsewhere, rent or buy, and not streaming. A title on two of your services counts once. Each poster shows its time left, and **Quickest to finish** sorts by it. It follows the Films/Shows and availability filters.
- Done: **Finish it by…** on show pages: pick this Friday, the day before the next season starts (when announced), the day before one of your services renews (set the renewal day under Your services), or any date. It shows episodes a night over your watching nights, whether that fits in your evenings, and if not, the earliest you could finish. The deadline is saved with the show, and Home shows it ("3 episodes a night to finish by Fri 20 Nov") along with how many episodes fit before bed tonight.
- Done: films show **Tonight** on their page and on Home: "Start by 20:14 to be in bed by 23:00", or that it's too long for what's left of tonight.
- Decisions: you didn't pick evening times, so they're settings with the defaults above. "Before it renews" uses a monthly renewal day.

**Phases 4 to 7 (built overnight in one go, waiting for you to try them)**

You asked for Phases 4, 5, 6 and 7 together while you slept, so I made the calls below myself. Change any you don't like.

- Done, Phase 4: **episode heatmap** on every show's page, under the time card. One row per season, one square per episode, coloured by TMDB's rating from pink (weakest) to cyan (best). The colours are scaled to each show, so a show rated 7.5 to 8.5 still shows its highs and lows; the scale is never squeezed below 1.5 points so a very even show doesn't look wildly up and down. Episodes with fewer than 20 votes are greyed (too few to trust), unaired ones are empty, ones you've watched get a tick and your next one glows. Each season has its average. Ratings on episodes you haven't reached are hidden until you hover (spoiler-free, like the timeline). Click a square to jump to that episode in the timeline. Specials are left out.
- Done, Phase 5: **On this day** on Home, a panel beside "Pick up". It shows what you watched on today's date in earlier years (films you finished and episodes you ticked), with your note and rating if you left one. If nothing matches the exact day it falls back to the same week ("One year ago this week"). Episodes of one show watched on one day are grouped ("S2 E3 to E6"). 29 February shows on 28 February in other years. It hides on narrow windows.
- Done, Phase 6: **Lists and completion.** A new **Lists** button in the dock. Every title page now shows its directors and main cast; click one to see all their films with how many you've seen ("You've seen 4 of 12 Christopher Nolan films"), then **Add to your lists** to keep following them. Film series ("Part of …" on a film page) and public TMDB lists (paste the number or link) work the same way. **Your lists**: make your own from the Lists page, add titles from any title page, and drag to reorder. Each list shows progress, highlights what's next, shows where it's streaming, and has *What's left* and availability filters.
- Done, Phase 7: **Watch orders.** A Marvel Cinematic Universe order (54 films and series) and a Star Wars order (26), both in release order with a switch to story order. Film series from TMDB count as watch orders too, and your own lists are your own custom orders.
- Decisions: only titles already out count towards "seen X of Y"; upcoming ones are listed under *Coming up*. "Seen" means marked Watched (a show you're partway through doesn't count yet). An actor's list counts their films plus TV where they were in 3 or more episodes, and leaves out cameos as themselves, talk shows and reality TV. A director's list is films only. The two curated orders are always on the Lists page; people, series and TMDB lists appear once you add them. Your Sequel "Marvel" collection is now one of your own lists (it moved over automatically; nothing is lost).
- **Please check:** the Marvel and Star Wars orders are my drafts in `src/core/guides/marvel.ts` and `starWars.ts`. Every title is checked against TMDB, but the order is a judgement call, especially after Endgame, where the series overlap. Tell me anything you'd move, add or drop. It includes announced titles (Avengers: Doomsday and Secret Wars, Spider-Man: Brand New Day, The Mandalorian and Grogu, Maul: Shadow Lord), which sit under *Coming up* until they're out.
- Done (after your first look): **release order is the default** for watch orders, with story order a click away.
- Done (after your first look): **watch orders go season by season.** Each season of a show is its own row with its own air date, so in release order The Walking Dead and Fear the Walking Dead interleave as they aired, and story order puts each season where its story fits. A season counts as seen once all its episodes are ticked (or the show is marked Watched). This applies to every watch order, Marvel and Star Wars included.
- Tried and dropped: automatic watch orders worked out from TMDB by name. They missed spin-offs with other names (Better Call Saul) and pulled in unrelated old films, so you chose hand-made orders instead.
- Done (after your first look): two more hand-made orders, **The Walking Dead** (all seven series) and **Breaking Bad** (with Better Call Saul and El Camino). Searching a franchise ("walking dead", "better call saul", "MCU", "star wars") shows its watch order above the results, and any guide can be copied to your lists to make your own version. Ask for any other franchise and it gets added by hand.
- Done (after your first look): more hand-made orders: **X-Men (Fox)** from First Class and the original trilogy up to Dark Phoenix, with the Wolverine and Deadpool films; **Harry Potter** with Fantastic Beasts; and **The Boys** with Gen V, Diabolical and Vought Rising. The Walking Dead story order follows your notes (The Ones Who Live and Daryl Dixon straight after season 11, Dead City later, World Beyond and Tales at the end).
- Done (after your first look): **sections** within an order. The MCU has The Infinity Saga, The Multiverse Saga and The Defenders (Netflix's Daredevil, Jessica Jones, Luke Cage, Iron Fist, The Defenders and The Punisher, plus Daredevil: Born Again); Harry Potter has Harry Potter and Fantastic Beasts. Pick one to see just that part, with its own progress.
- Added to the plan: Phase 10, seen-before and rewatches (your idea; Polish moves to 11).
- Next: you try Phases 4 to 7. Then Phase 8 (release calendar).
- Added to the plan (17 Nov 2026): seven future ideas from a brainstorm, listed under Future ideas as candidate phases 12 to 18 (arriving and leaving, "Do I still need NOW TV", free UK TV, where do I know them from, stalled shows, back after a long gap, your year in Eclipse).
