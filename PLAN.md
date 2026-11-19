# Watch Tracker – Build Plan

Nov 17, 2026 · @Looby

## Overview

A personal desktop app for tracking films and TV shows. It replaces Sequel and focuses on features that save time or help decide what to watch, not on star ratings.

**Who it's for:** me, on a Windows PC and a Mac, plus a small phone version for looking things up and ticking (phase 45).

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

Ideas agreed in the brainstorm on 17 Nov 2026. They aren't scheduled yet. Everything here follows the same rules: free, local data, TMDB only, UK first.

They're ordered by what they need. Group A ideas stand on their own (they only use what Phases 1 to 11 build), so they can be done in any order and earlier ones are the quickest wins. Group B ideas are a chain about noticing what I watch: they build on each other, so they come after Group A and in this order. Group C waits until I have a TV. Each one says what it needs.

### Group A: stand on their own

12. **Two-computer guard.** While Eclipse is open, it leaves a small marker file in the data folder (with the computer's name and the time, refreshed every minute). If I open Eclipse on the Mac while the PC copy is still running, it says so and opens read-only, with a "take over" button if the other one was left open by mistake. Enforces the plan's "don't have it open on both computers" rule instead of relying on me remembering. *Needs:* nothing new.
13. **Watching with someone.** Tag a show with a person ("with Sam") and Eclipse keeps that watch's episode progress separately from my own, with its own dates. Home shows "Next with Sam: S3 E2", and ticking ahead on my own never moves it. Rewatching The Walking Dead with a friend who hasn't seen it is a rewatch tagged with them. A show can have more than one of these at once. *Needs:* Phase 10 (rewatches), which already gives a show more than one set of episode progress.
14. **Stay for the credits?** TMDB tags films that have a scene during or after the credits. Show it on every film page ("A scene mid-credits and one at the very end") and in watch orders, so the Marvel order says when to stay put. *Needs:* nothing new.
15. **Who recommended it.** When adding something, an optional "from" ("Sam", "a podcast", "the trailer before Dune"). Lists can then show "Sam's picks: you've watched 3 of 7", and a filter shows everything from one person or place. *Needs:* nothing new.
16. **Clear out the watchlist.** A full-screen mode that goes through the watchlist one title at a time, playing its trailer (TMDB lists YouTube trailers) with Keep and Drop buttons (keyboard shortcuts too). Options to start with the oldest additions or ones not on my services. Dropped titles go to a short "recently dropped" list so nothing is lost by accident. *Needs:* nothing new.
17. **"Where do I know them from?"** On a title page, list the cast I've already seen in other titles in my library: "You know Rhea Seehorn from Better Call Saul." Uses the credits Eclipse already downloads for Lists; only titles I've watched (or partly watched) count. *Needs:* nothing new.
18. **Free UK TV as its own group.** JustWatch's GB data includes free services (BBC iPlayer, ITVX, Channel 4, My5 and others). Show them as their own group after my services and before rent or buy, and add an "On my services or free" filter wherever the availability filters are. *Needs:* nothing new.
19. **Your services: arriving and leaving.** Eclipse already refreshes where-to-watch daily. Save a small snapshot each day for titles in the library and compare it with the previous one: "3 things on your watchlist just arrived on Disney+", "Succession is no longer on NOW TV". TMDB doesn't give leaving dates in advance, so departures show up once they've happened, not before. Shown on Home and as a short history on each title page. *Needs:* nothing new.
20. **Your services: "Do I still need NOW TV this month?"** A card for each of my services: hours of my watchlist and Watch soon on it, what I watched on it in the last 30 days, and its renewal day. If nothing I want is queued on it, suggest pausing before it renews. *Needs:* Phase 9 (Watch soon); best built straight after 19 as one "Your services" phase.
21. **Stalled shows.** Anything in Watching that I haven't ticked an episode of for a while (default 60 days, adjustable) gets a gentle "Keep going or stop?" on Home, with one-click Stopped or "remind me later". Keeps Watching and watchlist hours honest. *Needs:* nothing new.
22. **Back after a long gap.** When a show I've finished a season of comes back after a long break (say, 6 months or more), Home says "Season 4 is out. You finished season 3 in March 2024" and shows the last couple of episode summaries from TMDB so I remember where things stood. *Needs:* nothing new.
23. **Your phone as a remote.** Eclipse runs a tiny web page on the home Wi-Fi and shows a QR code. Scanning it on my iPhone opens a simple remote: tick the next episode, see how many fit before bed, check Watch soon. No app to install, nothing goes online, and it only works while Eclipse is open on the same network. Becomes the main way to tick things once I watch on a TV. *Needs:* nothing new.
24. **Repair old dates.** Spot the signs of late ticking in my history, like 40 episodes all "watched" on the same day (common in the Sequel import). For each batch, offer to spread the episodes back over my usual watching evenings, mark them "seen, no date", or leave them. If 27 is built later, it can check them against browser history for the real days. Nothing changes without my say-so, and `library.json` is copied aside first. *Needs:* Phase 10 (seen with no date).
25. **Your year in Eclipse.** A year-in-review screen built from watch dates: hours watched, busiest month, most-watched director and actor, longest binge, lists and watch orders finished. Works for earlier years too, thanks to the Sequel dates. Shows up on Home in December, and any year can be opened from Lists. *Needs:* nothing new, but comes after 24 so the stats use repaired dates.
26. **Eclipse in the menu bar or tray.** A small always-there menu in the Mac menu bar and the Windows system tray: my next episode for each show I'm watching with a one-click tick, and tonight's "start by" time. Eclipse keeps running there when the main window is closed, so I don't need the full app open while watching on the same computer. *Needs:* nothing new.

33. **Catch up before the sequel** (added later, numbered after the others so nothing else moves). When the next film in a series or a new season of a show I've seen is coming out, Eclipse works backwards from the UK release date and finds a time to rewatch what comes before it: "Dune: Part Three is in cinemas on 18 Dec. Part Two is 2h46 on NOW TV. It fits this Saturday." For a show it suggests the previous season, or just its last few episodes if a full rewatch won't fit. Shown on Home a few weeks ahead, with one click to add it to Watch soon. Skips anything I watched recently enough not to need it (adjustable, say within the last year). *Needs:* nothing new (uses Phase 8's release dates, Phase 7's watch orders and Phase 9's evenings).

### Look refresh (chosen 17 Nov 2026)

34. **New Home screen ("Spotlight") and new logo.** *(Built.)* Only Home changes; Library, Soon, Lists, Settings, Search and title pages keep the current Drift look. *Needs:* nothing new (it reuses Tonight's evening maths from Phase 3).
    - **Home:** the poster wall fills the whole screen, flat rather than tilted, in rows that drift slowly sideways (alternate rows in opposite directions). A soft pool of shadow in the middle holds a **Tonight dial**: an arc from my evening start (20:00) to bedtime (23:00) with tick marks, one segment per planned episode or film, a dot for "now", and the spare time as an empty track. The poster of tonight's pick sits inside the dial. Underneath, very little text: "Pick up Andor?", one line ("S2 E4 · start by 20:10 · 3 episodes fit before bed") and two buttons (Tick it, Something else). Navigation becomes small glass pills in the top right. Dark and light modes.
    - **Logo:** "Play eclipse" in **Halo blue**: a crescent of light fading from deep blue (#3F5BFF) to ice blue (#8FE3FF) around a dark moon, with a white play button inside, on a deep navy tile (#151A3D to #0B0D1F). Used for the app icon (Windows and Mac installers), the title bar and the welcome screen.
    - Drafts: Spotlight is "D" in `designs/eclipse-redraw-2.html` in the project files; the logo is "1 · Halo blue" on the same page.

### Evenings, more flexible (agreed 17 Nov 2026)

35. **Evenings that fit my real week.** *(Built.)* Before this, "Your evenings" is one start time and bedtime for every watching night. Replace it with: *Needs:* nothing new (everything that uses evenings, the Tonight dial, "fits before bed", Finish it by, Catch up, Repair old dates and the phone remote, reads the new schedule instead).
    - **A schedule per day:** each day of the week has its own start and bedtime, or is off (weeknights 20:00 to 23:00, Friday and Saturday until 00:30, Sunday 19:00 to 22:30).
    - **More than one slot a day:** a day can have a second slot, e.g. Saturday 14:00 to 17:00 as well as 20:00 to 00:30, so weekend afternoons count.
    - **Just for tonight:** from Home (and the phone remote), "Not watching tonight", "Starting late" or "Later bedtime tonight". It changes that one evening only, then goes back to the usual schedule.
    - **Gaps and wind-down:** a few minutes between episodes, and a stretch before bed with nothing on, so "3 episodes fit" is realistic. Both adjustable, both 0 by default.
    - **A weekly budget (optional):** "about 10 hours a week" on top of the schedule. Plans spread to stay under it, and Home says how much of this week is left.
    - Turned down: date ranges for holidays, and reading busy evenings from Google Calendar (so the old "Maybe" calendar idea is gone).

### Group B: noticing what I watch (in this order)

I mostly watch on the computer, so this chain is where Eclipse ticks things for me and the dates stay right (the Sequel problem: forgetting to tick, so dates were wrong).

27. **Eclipse notices what I watched.** Chrome and Edge keep their history in a file on my computer. Eclipse reads it (read-only) and when it spots that I watched a NOW TV or Disney+ episode, asks "Tick Andor S2 E4?". Needs checking first: how much the streaming sites' web addresses reveal about which episode it was. Never ticks anything without asking. *Needs:* nothing new; it's the first link in the chain and the fallback for 28.
28. **Eclipse knows what's playing.** Windows and macOS keep track of what's currently playing (it's how the keyboard media keys and the volume pop-up know). Browsers and some streaming apps pass the title through. Eclipse reads that and shows "Andor S2 E4, 31 minutes in", and when it finishes asks once to tick it, with the day it actually played. Needs a test first: what Disney+ and NOW TV report (in the browser and in their apps), and whether it's enough to tell which episode it is. *Needs:* 27 as the fallback for anything missed.
29. **Bedtime guard.** When an episode ends and the next one starts (autoplay), a quiet notification if finishing it would take me past bedtime: "This one ends at 00:12, 72 minutes past bedtime." Off by default, uses the bedtime in Your evenings. *Needs:* 28.
30. **Bookmark a moment.** While something is playing, a keyboard shortcut saves the exact timestamp with an optional note ("S5 E14, 38:12, Sam's reaction"). Each show's page gets a timeline of saved moments, which stay hidden past my current position to avoid spoilers. *Needs:* 28.
31. **Play next episode.** A button that opens the exact next episode on Disney+ or NOW TV, not just the show's page. TMDB doesn't have these links, so Eclipse learns them from what 27 and 28 see as I watch (each service's episode addresses). Falls back to the show's page when it hasn't learnt one yet. *Needs:* 27 or 28.

### Group C: later, once I have the TV

Not important yet, and I can't test it until I have the Apple TV.

32. **Read what the Apple TV is playing.** An Apple TV tells other devices on the home Wi-Fi what's playing (it's how the iPhone's remote shows the title). Eclipse pairs with it once and reads that too, so automatic ticking carries on when I move from the computer to the TV. Open-source tools already do this, so it's realistic. *Needs:* 28 (it feeds the same "finished, tick it?" step).

### Safety and everyday comfort (chosen 17 Nov 2026)

From a review of what the app still needs now that most of the plan is built. These fix holes rather than add new tricks, so they're worth doing before more features. Numbered after the others (35 is Evenings) so nothing else moves.

36. **Undo, and a check before removing.** *(Built.)* The ✕ beside the status buttons removes a title completely (every episode tick, rewatch, note and date) in one click, with no question and no way back. Before removing anything with history, ask: "Remove Breaking Bad? This forgets 62 watched episodes and 1 rewatch." After any change, especially big ones like *Watched up to here* or *Mark all of Season N watched*, show a short "Done · Undo" bar for a few seconds. *Needs:* nothing new.
37. **Automatic backups.** *(Built.)* Today `library.json` is only copied aside before an import or a repair. Keep a copy every day in a `backups` folder inside the data folder: the last 14 days plus one a month, older ones tidied away. **Settings → Restore a backup** lists them by date with what's in each (titles, watched episodes), and restoring copies the current file aside first. *Needs:* nothing new.
38. **Start Eclipse when the computer starts (only if I say yes).** *(Built.)* Noticing what I watch, What's playing, the phone remote and the tray only work while Eclipse is running. Add a *Start with Windows* (*Start when I log in* on the Mac) switch that opens Eclipse quietly in the tray. It's off by default and Eclipse never turns it on by itself: the first time I turn on a background feature, it asks once ("Start Eclipse when your computer starts, so it can notice what you watch?") and only switches it on if I say yes. When it starts this way it waits for the Google Drive folder to appear instead of showing the setup screen. Per computer. *Needs:* 26 (the tray).
39. **"Is everything working?"** *(Built.)* A panel in Settings that lists the background jobs (browser history check, What's playing, the daily services check, TMDB refreshes, update checks, last save) with when each last ran and whether it worked, in plain words ("History: checked 14 minutes ago, found 2 episodes"). Problems go into a small log file in the app's own folder, with a *Copy details* button so I can send it to Claude when something looks off. *Needs:* nothing new.
40. **Find things in my own library.** *(Built.)* Library can only sort by *Recent* and *Quickest to finish*, and has no way to type a name. Add a filter box (as you type, only matching titles stay) and more sorts: A to Z, last watched, date added and release year. Remember the last sort used. *Needs:* nothing new.
41. **Calmer screens and keyboard use.** *(Built.)* An in-app *Keep the poster wall still* switch in Settings → Appearance (today it only stops if the computer's own "reduce animations" setting is on), also covering the glowing dots and other moving touches. Make every button and card show clearly where you are when moving around with Tab, and check that Escape, Enter and the arrow keys behave the same on every screen. *Needs:* nothing new; 34 (Spotlight) should follow the same switch.
42. **A quick welcome for someone new.** *(Built.)* The first launch currently assumes it's me: Disney+ and NOW TV are ticked for you, and the setup screen expects you to know what a data folder is and why it might be in Google Drive. Replace it with a short welcome of a few steps: what Eclipse is, then your country and your streaming services (nothing ticked in advance), then where to keep your data (a simple "on this computer" default, with Google Drive explained as an option for using two computers), then the TMDB key with plain steps and a link. Offer *Import from Sequel* at the end for anyone who used it. Everything can be changed later in Settings. This is the first step towards giving Eclipse to a friend. *Needs:* nothing new.

Turned down in this review: refreshing shows that are airing every day, with a "new episode is out" notification.

### From talking it through (agreed 18 Nov 2026)

From a conversation about how I actually use Eclipse day to day: mostly ticking episodes and looking for something new, and I talk about shows with friends on Discord all the time. Numbered after the others so nothing else moves.

43. **Recommendations that learn from my no's.** The current *Recommended for you* goes by genre, so The Walking Dead brings up apocalypse films and shows that are nothing like it. What I like about a show (The Walking Dead, Shadowhunters) isn't its genre or its topic, and tags don't capture it either: plenty of monster-hunting shows would be nothing like Shadowhunters. So instead of guessing up front, it learns:
    - Candidates come from TMDB's "similar" and "recommended" lists for what I've watched, rated highly or finished, as now.
    - A full-screen mode shows them one at a time with the trailer, like *Clear out the watchlist*, with **Interested** (adds it to Want to watch), **Not for me** and **Skip**, plus keyboard shortcuts.
    - Each *Not for me* lowers the score of anything sharing its creators, network, main cast or TMDB keywords; each *Interested* raises them. It starts out fairly generic and gets sharper after a couple of sessions.
    - Every pick says why it's there ("Because of The Walking Dead and Shadowhunters"), so I can tell when it's guessing.
    - What I've said no to, and the learnt weights, are saved in the library so both computers agree. Free, local, no AI.
    *Needs:* nothing new (replaces the recommendations already in Search and on the poster wall).
44. **Discord status while I watch.** *(Built.)* While something of mine is playing, Discord shows "Watching The Walking Dead · S9 E4" on my profile, like it does for games, and clears it when I stop. It talks to the Discord app on the same computer, so it's free and nothing goes online from Eclipse. Sometimes I don't want people to know what I'm watching, so it must be quick to switch on and off: a toggle in the tray / menu bar menu and on Home, as well as in Settings. Off by default, per computer. *Needs:* 28 (what's playing).
45. **Eclipse on my phone, anywhere.** I reach for my phone out of habit just to look at my stuff, and the phone remote (23) only works on the home Wi-Fi with a computer on. Instead, a small Eclipse page saved to my iPhone home screen that reads my library straight from the Google Drive folder, wherever I am, with no computer needed.
    - **What's on it:** my library (Watching, Want to watch, Watched) with posters and where things stream, a show's episodes with ticking, search with adding to my lists, and recommendations (43 suits the phone well: Interested or Not for me, one at a time). Not on it: the heatmap, plans and evenings, settings and the poster wall.
    - **No clashes:** the phone never rewrites `library.json`. Its ticks and additions go into a separate file in the same Drive folder (e.g. `from-phone.json`). When Eclipse on the PC or Mac next opens, or sees that file sync in, it folds them into the library and empties it. If something conflicts (an episode ticked on both with different days, a title removed on the computer but ticked on the phone), it asks me rather than guessing.
    - **Google sign-in:** reuses the Google Cloud project Orbit already uses, with a second sign-in client added for the web page (a desktop app's client secret can't go in a web page, since anyone could read it). Only the Drive data folder is needed. I sign in once on the phone; Google may ask again now and then.
    - **Hosting:** the page itself (no data) on GitHub Pages, free. My library goes straight from Drive to the phone. The TMDB key is entered once on the phone and kept there.
    *(Built.)* *Needs:* nothing new; 43 for recommendations on the phone. Replaces 23 for looking things up away from home; 23 stays for the sofa.
46. **Finishing a show is an event** *(liked, to discuss further before it's scheduled).* When I tick the last episode of a show, the screen goes dark and my own credits roll: when I started and finished, hours spent, who I watched it with, my highest-rated episode and anything else worth remembering. It ends with *Share to Discord*, which puts it in the group chat as an image. The end of The Walking Dead deserves a proper send-off. Still to decide: what goes in the credits, whether finishing a season gets a smaller version, how sharing works (copy an image to paste, or a Discord webhook), and what it looks like (drafts). *Needs:* nothing new.
47. **My own heatmap.** After ticking an episode, one optional tap for how it hit me (😭 🔥 😂 😴 🤯). The heatmap on a show's page gets a *Mine* view beside TMDB's ratings, so I can see where I and everyone else disagree. Reactions are saved with the tick (both computers see them, and they're in the export) and feed the learning recommendations (43). *Needs:* nothing new; 43 uses it if built.
48. **Theme tunes** *(possible, to discuss further).* Opening a show's page softly plays its opening theme, like a DVD menu, using the theme or opening-credits video TMDB lists on YouTube when there is one. Off by default, with a mute in the corner. Still to decide: where the tune comes from when TMDB has none, how long it plays, and whether it plays on Home for tonight's pick too. *Needs:* nothing new.
49. **Franchises as a star map** *(possible, to discuss further).* The Walking Dead, Marvel, Star Wars and the other watch orders drawn as constellations: each series, season or film a star, linked by story, lit once I've seen it, with the next one glowing. A more fun way to see a watch order, and fits the Eclipse name. Still to decide: where it lives (a view on Lists, or on each watch order), how big universes like Marvel stay readable, and what it looks like (drafts). *Needs:* 7 (watch orders).
50. **Premiere night.** On the day a season I've been waiting for comes out, Home turns into that show: the poster wall fills with its posters and artwork (never anything from inside an episode), and a countdown runs to the UK release time, then "It's out" with one click to start. *Needs:* 34 (Spotlight).
51. **An opening for Eclipse.** A couple of seconds of intro when the app launches: the Halo-blue eclipse rises and my posters fly into the wall, like a studio logo before a film. Any key or click skips it, it's skipped when Eclipse starts quietly in the tray, and *Keep the poster wall still* (41) turns it off. *Needs:* 34.
52. **A shelf of everything I've finished.** A room with box sets on shelves, one for every show and film I've completed. Pull one out and it opens to my dates, hours, who I watched it with and its credits (46). Like a DVD collection, but it's my history. *Needs:* nothing new; shares the credits with 46.
53. **Milestones.** Quiet moments, not badges or points: "That was your 1,000th episode" with a soft flare in the halo, or "100 hours of The Walking Dead". Shown once, as a small note. *Needs:* nothing new.
54. **Sound design.** A soft click when I tick an episode, a richer chime for finishing a season, a low swell when the credits roll (46). Off by default, with one switch in Settings → Appearance. *Needs:* nothing new.
55. **Choose my own posters (only when I want to).** Most titles have many alternative posters on TMDB. Eclipse keeps using the default poster on its own and never asks; on a title's page, a small *Change poster* opens a grid of the alternatives, and the one I pick is used everywhere (the wall, the shelf, Home, lists). *Reset* goes back to the default. Saved in the library so both computers agree. *Needs:* nothing new.
56. **Opening a poster zooms into it.** Clicking a poster (on the wall, the shelf, a list) grows it smoothly into that title's page, so it feels like stepping into it rather than a page loading; closing shrinks it back. *Keep the poster wall still* (41) swaps it for a simple fade. *Needs:* nothing new.
57. **My journey with a show.** On a long show's page, a ribbon of its seasons showing when I watched each one, who with (13), rewatches, and the gaps in between. The Walking Dead would show the whole year with it at a glance. Nothing past where I am. *Needs:* nothing new.
58. **Favourites wall.** I pick my all-time top shows and films and they hang as framed posters in a gallery, my hall of fame, separate from the shelf (52). Reorder by dragging. *Needs:* nothing new; sits beside 52.
59. **Coming soon on the shelf.** Announced seasons and films I'm waiting for sit on the shelf (52) as shrink-wrapped box sets with their date. On release day the wrap comes off, tied into premiere night (50). *Needs:* 52, and 50 for the release day.
60. **Ticking feels good.** A small, satisfying animation when I tick an episode: the dot fills like ink and the progress ring jumps. Pairs with the sound design (54), and *Keep the poster wall still* (41) tones it down. *Needs:* nothing new.

Turned down in this round: predictions before a premiere, a note to future me, mystery night, episode stills on Home (any picture from an episode is a spoiler), announcing watches on Discord, opening the episode's Reddit discussion, and trailers playing in the poster wall. Also turned down later that evening: season title cards, seasonal looks, Home that follows the evening, ticket stubs for films, and a living app icon. And in the round after: real show logos, the wall as a scrollable library, favourite characters, and showing my first-watch reactions on a rewatch.

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

**Phase 52: the shelf of everything you've finished (built, waiting for you to try it)**

- **A shelf for each year:** the *Finished* part of the Shelf page is now a room of shelves, one per year you finished things in (newest first, each with a plate: "2026 · 14 box sets"), and a last shelf for what you saw before Eclipse.
- **Pull one out:** clicking a box set lifts it off the shelf (leaving a gap) and opens it: the front cover big on the left, the back of the box on the right. The back has when you started and finished, the hours you've spent on it (every watch, rewatches and watches with someone included, at each episode's own length when TMDB knows it), episodes and seasons, how many days it took, how many times you've been all the way through, the most episodes in one day, the best-rated episode you saw (TMDB's rating, at least 20 votes), who you watched it with, who recommended it, your rating and note, a line for each watch ("First time: 1 June 2025 to 28 August 2025, 177 episodes"; "With Sam: since 1 September 2026"), and the credits small and centred like a DVD box ("Directed by", "Starring").
- **Open its page** (or click the cover, which zooms in like any poster) goes to the title; **Put it back**, Escape or clicking outside closes it. *Keep the poster wall still* turns the pulling-out animation off.
- Decisions: the card works from your library straight away (dates, who with, note) and fills in the hours, cast and best episode from TMDB, so it still opens offline. "Credits" here means the title's own cast and directors plus your history; the full end-credits moment when you finish a show is phase 46, still to discuss, and can reuse this card's numbers (`boxSetCard` in `src/core/shelf.ts`). No new packages.

**Phases 55 to 60 (built, waiting for you to try them)**

- **55, choose your own posters:** on a title page, **Change poster** (a pill on the Spotlight page, and under the poster on the Classic page when you hover it) opens every poster TMDB has in English or with no text, the usual one first and marked *Usual*. The one you pick is used everywhere: the wall, the shelf, the favourites wall, Home, Library, lists, search and the phone page. **Reset to the usual poster** goes back. Eclipse never asks about posters on its own. Saved in the library (`posters`), so both computers agree.
  - **Change background** (asked for on 19 Nov), beside it on the Spotlight page: the same kind of grid for the big picture behind the page, pictures with no text first. The one you pick is also used on that title's card in its universe strip. **Reset to the usual background** goes back. Saved in the library (`backdrops`). The Classic page has no background picture, so it's Spotlight only.
- **56, opening a poster zooms into it:** clicking a poster anywhere (the wall, the shelf, a list, Library, search, Home) lifts it off the page while everything else dims, holds a beat, glides it to the middle as a big poster (never bigger than the window), then the show's own picture fades in behind it and the poster melts away as the page comes up (about a second and a half; reworked twice on 19 Nov: the first was a blink, the second showed the page too early and blew the poster up past the screen). Back shrinks it into the same place. *Keep the poster wall still* (or the computer's reduce-animations setting) makes it a quick fade instead.
- **57, your journey with a show:** **Your journey** on a show's page (a pill on Spotlight, a card on Classic) once you've reached two seasons. Each watch gets its own ribbon (*First time*, *Rewatch*, *With Sam*), each season a block placed on the calendar from your first tick in it to your last, with breaks of six weeks or more labelled ("8 months"), a line for today while it's going, and a list underneath ("Season 3: 10 to 25 September 2024 (16 days), 16 of 16 episodes"). Seasons seen before Eclipse sit at the start under *Before*. Seasons you haven't reached aren't shown. Clicking a season opens its episodes.
- **58, favourites wall:** **Add to favourites** (a heart) on any title page. The new **Shelf** page (in the dock and the top pills) has a *Favourites wall* tab, a *Hall of fame* (redone on 19 Nov to look more important): always a dark gallery, a beam of light over each frame, the poster's own colour glowing on the wall behind it, polished Halo-blue frames that lean towards the mouse with light on the glass, engraved plaques ("No. 2 · Interstellar · 2014"), and your No. 1 hung twice the size with a medal. Drag to reorder, or use the arrows on hover; ✕ takes one down. Up to 30. Saved in the library (`favourites`).
- **59, coming soon on the shelf:** the Shelf tab starts with *Coming soon*: the next season of every show you're watching or have watched (not stopped, not ended) that hasn't started, and films on your watchlist not out yet (UK cinema date first), shrink-wrapped with a date sticker (or *Date TBA*), soonest first. On release day the wrap peels off and the sticker says *Out today*; a week later it leaves. Under it, *Finished*: a box set for everything you've finished, most recent first.
- **60, ticking feels good:** ticking an episode fills its dot like ink with a ripple and a pop, its bar in *Every episode, by rating* fills up from the bottom, the new progress ring beside "61 / 171 episodes watched" jumps and flashes, and Home's **Tick it** check pops. *Keep the poster wall still* turns all of that down to just the change of colour.
- Decisions: phase 52 (the shelf) isn't built, so 59 came with a simple shelf: box sets that open the title page, without 52's dates, hours and credits card. Release day unwraps on the shelf itself; tying it into premiere night (50) waits for 50. No new packages.


**Phase 1: Foundation (done, merged)**

- Done: Electron + React + TypeScript project set up like Orbit (electron-vite, Vitest, `area:action` IPC names, settings.json written safely, single-instance lock, Orbit-style title bar).
- Done: TMDB key in Settings, checked with TMDB then stored encrypted with Electron safeStorage, like Orbit's keys. Accepts the API Key or the Read Access Token.
- Done: data folder picker; library saved as `library.json` there, reloaded automatically when Google Drive syncs a change in. A file that can't be read is backed up before anything replaces it.
- Done: TMDB cache as JSON files in the app's own folder (details weekly, searches daily, "Refresh from TMDB" on demand); shows saved copies when offline.
- Done: search (films and shows; people added later), title pages (poster, backdrop, runtime, genres, seasons, next episode, collection) and the four statuses. Marking something Watched records the date.
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

**Phases 4 to 7 (done, merged)**

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

**Phase 8: Release calendar (done, merged)**

- Done: **Settings → Release calendar.** It shows what's coming up from your library and saves it as an .ics file to import into Google Calendar or Outlook. Films on your Want to watch list appear on their release day. Shows you're watching, want to watch or have finished (for new seasons) appear when a new season starts and on its finale; shows you've stopped are left out. Switch to *Every new episode* to get each episode instead. Dates are all-day events that don't mark you as busy, each with a link to the title on TMDB. It looks up to two years ahead.
- Decisions: films use TMDB's main release date, which is usually the first release worldwide (often the US cinema date), not the UK or streaming date. A finale is only added once every episode of the season has a date. Each date has a fixed ID, so importing a newer file describes the same events. The tip in the app is to import into a separate "Eclipse" calendar, so it's easy to clear and re-import.
- Done (asked during this phase): the Walking Dead order has two sections, **Main story** (The Walking Dead, Daryl Dixon, The Ones Who Live, Dead City) and **Spin-offs** (Fear, World Beyond, Tales).
- To decide after you've tried it: whether re-exporting now and then is fine, or worth a self-updating calendar link (that needs the feed hosted online somewhere free with a private link).

**Phase 9: Watch soon (done, merged)**

- Done: a **Watch soon** button on every film and show page, and a **Soon** button in the dock. Watch soon is a short list in your own order (drag or use the arrows), separate from your watchlist and saved in `library.json`, so both computers share it.
- Done: the Soon page adds it all up ("19 hours"), says how many evenings it takes and when you'd finish on your usual nights, and shows **Tonight**: what from your list fits before bed ("Dune, then Breaking Bad S4 E12"), plus other things that would fit on their own ("Or instead: 3 episodes of Breaking Bad"). Below that is the list with what's left of each, and **Your evenings**: night by night, what you'd watch.
- Done: Home's "Pick up …?" suggests what you're already watching first, then Watch soon (in your order), then the rest of your watchlist (changed after your try-out: carrying on comes before starting something new).
- Decisions: evenings are filled strictly in your order. A film only goes on a night it fits whole (or gets a whole evening to itself if it's longer than one); a show carries on across nights. Tonight counts only if it's one of your watching nights, using the time left before bed. Shows count the episodes after the furthest one you've ticked that are already out. Films with no runtime on TMDB count as 2 hours, and episodes as 45 minutes, shown as "about". Finished things stay on the list marked Done until you take them off.

**Phase 10: Seen before and rewatches (done, merged)**

- Done: **Seen it before.** Any film or show not yet marked watched has *Seen it before? Mark it watched with no date* under the status buttons. It's marked Watched with no date, so it counts everywhere (watch orders, lists, completion) but On this day leaves it out. Give it a date later in *Watched on* if you remember, and the "no date" goes away. Shows also get *Seen season N before (no date)* above the episodes, to tick a whole season without dates; a later normal tick or a Sequel import replaces the "no date" with a real day.
- Done: **Rewatches.** A watched film has *Watched it again today*, which counts straight away. A watched show has *Start a rewatch*: from then on, ticking episodes goes to the rewatch, not your first watch, which is kept as it was. While it's going, the page shows *Rewatching since …* with its own progress, and the show counts as Watching (Library tab, Home's *Pick up*, time left, Watch soon and the heatmap all follow the rewatch). *Finish rewatch* counts it; *Give up* drops it.
- Done: every title you've seen shows **Watched once / twice / 3 times**, and each finished rewatch is listed with its dates (× takes one off if added by mistake). Rewatch episode ticks show up in On this day.
- Done (after your first look): **one-click ticks in lists and watch orders.** Every row you haven't seen has a round tick on the right. Click it and that film or show is marked seen before (no date); on a season row it ticks that season's episodes with no date. Click *Seen* on a row ticked this way to take it off again (rows with a real watch date can't be undone from the list, so a misclick never loses one). A show whose seasons you tick all the way through becomes Watched (seen before); one with only some seasons ticked stays Watching. Shows already ticked through before this fix move to Watched the next time the app opens.
- Decisions: one rewatch at a time per title. A rewatch is never finished automatically, even when every episode is ticked (the button changes to *Finished it: count this rewatch*). Each rewatch is stored on its own with its dates and ticks, so a "watched with someone" tag can be added later (that's Phase 13, Watching with someone, in the future ideas).

**Phase 11: Polish (done, merged)**

- Done: **Export your data** in Settings. It makes a new folder ("Eclipse export 2026-11-17") with `library.json` exactly as Eclipse saves it (Eclipse can open it again) and four spreadsheets: `titles.csv` (status, dates, seen before, times watched, rating, note), `episodes.csv` (every tick, first watch and rewatches), `rewatches.csv` and `lists.csv` (Watch soon, your own lists with their titles, and the lists you follow). They open in Excel, Numbers or Google Sheets, with accents and quotes intact; a note starting with "=" can't run as a formula.
- Done: **credits.** TMDB's credit was already on every page, and JustWatch's on every page that shows where to watch. Home now has a small "Data from TMDB and JustWatch" in the corner too, since its posters and "On Netflix" come from them.
- Done: **installers, as in Orbit.** `electron-builder.yml` makes a Windows installer (Eclipse-Setup-1.0.0.exe) and Mac .dmg files for Apple Silicon and Intel, with the new Eclipse icon. Macs get an "ad hoc" signature (no paid Apple certificate), like Orbit. A GitHub Actions workflow (`.github/workflows/release.yml`) builds both on GitHub's computers and publishes them as a GitHub Release.
- Done: **updates.** Settings → *Version and updates* (copied from Orbit's): the installed app checks GitHub Releases every few hours. On Windows the update downloads in the background and installs when you restart; on a Mac it says a new version is out and opens the download page.
- Decisions: the version is now **1.0.0**, the first installable one. Your settings and key are kept if you uninstall, and the library is never touched.

**Phase 12: Two-computer guard (done, merged)**

- Done: while Eclipse is open it keeps a small file, `eclipse-open.json`, in the data folder, with the computer's name and the time, refreshed every minute. Quitting removes it.
- Done: open Eclipse on the other computer while that file is fresh and it opens **read-only**, with a banner: "Eclipse is open on DESKTOP-4F2K9 (Windows) since 19:02". You can look around, but nothing is saved, so the two copies can't overwrite each other. When the other one closes, this copy notices within a minute and carries on normally by itself.
- Done: **Take over** on the banner, for when the other one was left open by mistake. The other copy then turns read-only within a minute and says it was taken over.
- Decisions: a file not refreshed for 5 minutes counts as left behind (a crash, a laptop asleep, Drive offline) and is ignored, as is one from an earlier run on the same computer. Read-only copies still show changes arriving from the other computer. Trying to change something while read-only gives the banner a little shake instead of an error.


**Phases 13 to 22 (done, merged)**

- Phase 13, **watching with someone**: on a show's page, *Watch with someone* starts a watch tagged with a name ("Sam"), with its own episode ticks and dates, kept apart from yours. A show can have several at once. Home shows *Next with Sam: Breaking Bad S1 E3* with a *Watched it with Sam* button. Ticking ahead on your own never moves it. The export has a With column.
- Phase 14, **stay for the credits**: film pages say *Stay for the credits: there's a scene at the very end* (or mid-credits, or both) from TMDB's tags, and watch orders show a small chip on each film that has one. Details are fetched again once so this and the trailer show up.
- Phase 15, **who recommended it**: every title has a *From* box next to the note (with names you've used before offered). Lists → *Recommended by* has a list per person or place ("Sam: you've watched 3 of 7"). The export has a From column.
- Phase 16, **clear out the watchlist**: Library → Want to watch → *Clear out the watchlist*. Go through it one title at a time with its trailer, and press Keep, Drop or Skip (or →/K, ←/D, S). Start with the oldest, the newest, or ones not on your services. Dropped titles go to *Recently dropped* (the last 30), with *Put back*.
- Phase 17, **where do I know them from**: title pages list cast you've seen in other things you've watched or are watching: "You know Rhea Seehorn from Better Call Saul."
- Phase 18, **free UK TV**: Where to watch has a *Free* group (BBC iPlayer, ITVX, Channel 4, My5) after yours, the verdict says "Free on BBC iPlayer", list chips and Up next say so too, and the filters have *On my services or free*.
- Phase 19, **arriving and leaving**: once a day (checked when Eclipse opens and every six hours) it notes where your watchlist, Watching shows and Watch soon titles stream, and compares with the day before. Home's *Your services* card says "Just arrived on Disney+: Andor, Loki" and "Gone from NOW TV: …" for the last two weeks, and each title's Where to watch lists its own arrivals and departures. Kept in the app's own folder (`services-history.json`), not the synced data folder.
- Phase 20, **do I still need it**: *Your services* (from Home's card, or Settings → Your services) has a card per service: hours waiting for you on it, what you watched on it in the last 30 days, its renewal day, and a verdict. Nothing you want on it and it renews within a week: "Pause it before it renews on Thu 19 Nov." Home also mentions any service renewing in the next three days.
- Phase 21, **keep going or stop**: a Watching show you haven't ticked in 60 days gets a Home card with *Keep going* (opens it and stops asking for a while), *Stop watching* and *Remind me later* (two weeks). Shows you're caught up on (waiting for the next season) aren't counted. The number of days is in Settings → Your evenings (30 days to a year).
- Phase 22, **back after a long gap**: when a new season came out in the last six weeks, and you finished the one before it at least six months before that, Home says "The Last of Us: season 3 is out. You finished season 2 in May 2025" with the summaries of that season's last two episodes, *Start season 3* and *Not now*.
- Decisions: "Remind me later" and "Not now" are saved on the title (`snoozedUntil`), so both computers agree. Arrivals only count titles that were already being watched for, so adding something new isn't "news". If a title can't be checked one day, yesterday's answer is kept rather than calling it gone.


**Phases 23 to 26 (built, waiting for you to try them)**

- Phase 23, **your phone as a remote**: Settings → *Your phone as a remote* → On shows a QR code. Scan it with the iPhone camera and a small page opens: how long is left before bed and when to start an episode, the next episode of each show you're watching with a **Watched** button, and Watch soon. It refreshes every 30 seconds and whenever you come back to it. It only works on the home Wi-Fi while Eclipse is open, and the address carries a random pairing code, so nobody else on the network can use it (*New code* changes it). Windows asks once whether Eclipse can use the network: allow private networks.
- Phase 24, **repair old dates**: Settings → *Your history* → *Repair old dates* lists days where 8 or more episodes of one show were ticked at once. For each: *Spread them out* (over your watching nights before that day, as many a night as fit in your evening, never earlier than your previous tick of that show), *Seen, no date*, or *Leave them* (not offered again). `library.json` is copied aside before the first change (`library.before-repair-….json`).
- Phase 25, **your year in Eclipse**: from Lists (top right), Settings → *Your history*, or Home in December and the first week of January. Hours watched, films, episodes, days with something on, hours by month with the busiest highlighted, longest binge and longest run of days, your most-watched director (films) and actor (films and shows), shows and lists finished, and your top five. Any earlier year with dates can be picked at the top. Undated watches don't count.
- Phase 26, **menu bar and tray**: Settings → *Eclipse in the system tray* (*menu bar* on the Mac) → On. The icon's menu has the next episode of each show you're watching (click to tick it, with a small notification), how long is left before bed and the time to start by, *Open Eclipse* and *Quit Eclipse*. While it's on, closing the window keeps Eclipse running there (so the phone remote keeps working); opening Eclipse again brings the window back.
- Decisions: the remote and tray settings are kept per computer (not in the synced library). The remote uses port 47823. Ticks from the phone or the tray go on your rewatch if you're on one, and are refused while this copy is read-only (the phone says why).

- Look refresh (17 Nov 2026): from two rounds of design drafts you picked **Spotlight** for Home only (the rest of the app keeps Drift) and the **Play eclipse** logo in **Halo blue**. Added as candidate phase 34 (33 is Catch up). Later the same day you asked for the menus without flat colour and picked **Frosted glass** from four drafts. Turned down: Marquee (font, red, too busy), Observatory's layout and flat blue-black (its dial is kept in Spotlight), Sticker deck, Mosaic and Horizon.

- Evenings (17 Nov 2026): you picked a schedule per day, more than one slot a day, just-for-tonight changes, gaps and wind-down, and a weekly budget. Added as candidate phase 35. Not wanted: date ranges for holidays, and Google Calendar.

**Phase 43: Recommendations that learn from my no's (built, waiting for you to try it)**

- **One at a time:** Search → *Recommended for you* → **One at a time** opens a full-screen round of up to 25 picks (Both, Films or Shows), each with its trailer, and **Interested** (adds it to Want to watch), **Not for me** and **Skip**. Keys: → or I interested, ← or N not for me, S skip. *More about it* opens the title's page. **Another round** at the end fetches fresh picks that take your answers into account.
- **Where the picks come from:** TMDB's "recommended" lists for what you've watched or are watching (rated highly and watched lately counting most, as before), now with TMDB's "similar" lists added at a bit over half the weight.
- **How it learns:** each answer looks at the pick's creators (a film's directors and writers), network (a film's first two studios), main cast (top 6) and TMDB keywords. *Not for me* lowers all of them and *Interested* raises them. Creators move the most, then cast, then network, and keywords the least (and together they can only count for so much), so saying no to a grim monster-hunting show pushes down other shows by the same people far more than every show with demons in it. Nothing is guessed up front; it starts general and sharpens as you answer.
- **Every pick says why:** "Because of The Walking Dead and Shadowhunters", plus "you were interested in others with Jensen Ackles" once it has learnt something. A pick that shares people with your no's says so, and sits further down.
- **The ✕ on Search's grid** is the same *Not for me* and teaches it too. The poster wall uses the same picks.
- **From the phone:** *Not for me* and adding something new to Want to watch on the phone teach it too, once the computer folds the phone's changes in.
- **Saved in the library:** your no's (`recsHidden`, as before) and the learnt weights (`recsTaste`, the strongest 800) are in `library.json`, so both computers agree. Undo works on an answer. Free, local, no AI.

**Phases 36 to 42: Safety and everyday comfort (built, waiting for you to try them)**

- Phase 36, **undo and a check before removing**: the ✕ beside the statuses asks first when a title has history ("Remove Breaking Bad? This forgets 62 watched episodes and 1 rewatch.") with *Keep it* and *Remove*. After a status change, ticking or unticking episodes (including *Watched up to here* and whole seasons), removing a rewatch or a watch with someone, removing a list, a date repair or a restore, a "Done · Undo" bar shows for seven seconds; **Undo** or Ctrl+Z puts the library back. If something else changed it in the meantime (e.g. the other computer), it says so instead of undoing. Undo is kept in memory only.
- Phase 37, **automatic backups**: once a day (on opening and every three hours) `library.json` is copied to `backups/library-YYYY-MM-DD.json` in the data folder; the last 14 days are kept, plus the first of each month before that. **Settings → Backups → Restore a backup** lists them by date with titles, watched episodes and films watched; restoring copies the current file aside first (`library.before-restore-….json`) and can be undone.
- Phase 38, **start with the computer**: **Settings → Start with Windows** (*Start when I log in* on the Mac), off by default, per computer. When on, Eclipse opens with no window and lives in the tray (turned on with it); if the data folder isn't there yet (Google Drive still starting) it checks every 20 seconds instead of showing the setup screen. The first time you switch on noticing, What's playing, the phone remote or the tray, it asks once ("Start Eclipse when your computer starts, so it can notice what you watch?"), and never again after Yes or Not now. Not available on Linux.
- Phase 39, **is everything working?**: **Settings → Is everything working?** lists saving, the daily backup, changes from the other computer, TMDB, the daily services check, the browser history check, What's playing and the update check, each with when it last ran and how it went in plain words. Problems are logged to `eclipse.log` in the app's own folder (trimmed so it stays small); **Copy details** copies the list, the version and the recent log.
- Phase 40, **find things in my library**: Library has *Find in your library* (ignores case, accents and punctuation, so "spiderman" finds Spider-Man) and a **Sort** menu: Recently changed, Quickest to finish (Want to watch and Watching), A to Z, Last watched, Date added and Release year. The last sort is remembered on this computer. When nothing in the tab matches, it offers the other tabs that do.
- Phase 41, **calmer screens and keyboard use**: Settings → Appearance → *Keep the poster wall still* stops the drifting wall, glowing dots, pages sliding in and other movement (this computer only; the system's reduce-animations setting now covers the same things). Every button, card and field shows a clear outline when reached with Tab. Arrow keys move along rows of choices (and pick, except the status buttons, where Enter picks) and between posters in a grid; Escape closes the open question or goes back, the same everywhere.
- Phase 42, **a welcome for someone new**: a fresh copy opens on a short welcome: what Eclipse is, where to keep your library (*On this computer*, an Eclipse folder in Documents, or *In Google Drive* for two computers), the TMDB key with plain steps and links, your country and services (nothing ticked for you any more), then *Import from Sequel*. The key comes before services because the list of services comes from TMDB. A copy whose data folder can't be found now gets its own "Can't find your library" screen with *Try again*.

**Phase 35: Evenings that fit my real week (built, waiting for you to try it)**

- **Your week:** Settings → *Your evenings* now has a row for each day, Monday first. Each day has its own start and bedtime, or is off. **Add a time** gives a day a second (or third) slot, like Saturday 14:00 to 17:00 as well as the evening. **Copy Monday to every weeknight** saves typing. Your old start time, bedtime and nights were turned into the same times for each of those days, so nothing changes until you edit it.
- **Just for tonight:** under the buttons on Home (Spotlight and Classic), a small "Tonight 20:00–23:00" line opens **Not watching tonight**, **Starting late**, **Bedtime tonight** and **Back to usual**. It only changes that evening. The phone remote has **Not watching tonight**, **Bed 30 min later** and **Back to usual**, and the tray says "Not watching tonight".
- **Gaps and wind-down:** *Between episodes* (0 to 15 minutes) and *Wind down before bed* (0 to 60 minutes), both off by default. "3 episodes fit" and "start by" count them.
- **Weekly budget (optional):** "About 10 hours a week". Finish it by, Watch soon and Catch up split it evenly over your watching nights; the first thing of a night always goes on, even if it's longer than that night's share. Home shows "6h left of your 10 hours this week", counted from your ticks this week (Monday to Sunday), rewatches included.
- Everything that used the old single evening now reads your week: the Tonight dial (a break between two slots shows as a gap in the track), "fits before bed", Finish it by, Watch soon, Catch up, the bedtime guard, Repair old dates and the phone remote.
- **Watching together on Home:** a show you're watching with someone ("with Jack") is one of Home's picks around the time you've arranged (below), with that watch's own next episode, what fits before bed and the Tonight dial. **Tick it** ticks it on the watch with Jack, never your own progress. The one you watched most recently comes first, and the *Watching together* card says how many fit tonight.
- **Best services for your watchlist** (asked for on 17 Nov): Settings → *Your services* → **Which services are best for my watchlist?** opens Your services with a new card at the top. From everything you still want to watch (watchlist, part-way through and Watch soon, counting only what's left), it lists the fewest services that cover the most (up to three; each adds what the ones before it don't have), marks the ones you already have, says how much is free on BBC iPlayer and the like, and what's only to rent or buy. *Every service with something you want* lists them all by hours. No prices: TMDB doesn't have them. Ad tiers count as the service itself.
- **Recommendations in Search** (asked for on 17 Nov): open Search with nothing typed and *Recommended for you* lists films and shows picked from TMDB's "if you liked this" lists for up to 15 of your titles (watched or watching; the ones you rated 9 or 10 and watched lately count most, and ones you rated 5 or under are left out). A title recommended by several of yours ranks higher, and each says *Because you watched …*. Anything in your library or dropped is left out. Films / Shows / Both, the where-to-watch filters, and a **Not for me** cross (on hover) that hides one for good (saved in the library). Each title's list is saved for a week.
- **Watching together at an arranged time** (changed on 17 Nov, your idea): a watch with someone no longer sits on Home all the time. On the show's page, each *With Jack* row has **Next time** (a date and time) and **Every week**. Home's pick only becomes "Pick up … with Jack?" from 90 minutes before that time until 4 hours after it starts, counting what fits from when it starts (an arranged time on a night you don't usually watch counts as a watching night). *Watching together* in the Home column lists them soonest first ("Tomorrow at 21:00 with Jack: The Walking Dead S4 E12", or "no time set" with **Set a time**), with the tick button only around the time. Eclipse sends a reminder 15 minutes before. A weekly time rolls on to next week by itself.
- Decisions: the old start time, bedtime and nights are still saved, as "your usual evening" (the times most days have), so an older copy of Eclipse on the other computer keeps working; if it changes them, the week is rebuilt from them. A day can have up to three slots. No new packages.

**Phase 34: Spotlight Home and the Halo blue logo (built, waiting for you to try it)**

- **Spotlight Home** is the new default. The poster wall becomes flat rows drifting sideways (alternate rows the other way), with a soft pool of shadow in the middle. There sits the **Tonight dial**: an arc from your evening start to bedtime with a tick every 15 minutes, a glowing segment for each episode that fits from now (or the film, if it fits), a dot for now that moves with the clock, and the spare time as empty track. Tonight's pick sits inside it (click the poster to open it).
- Underneath: "Pick up Breaking Bad?", one line ("S2 E1 · start by 22:13 · 3 episodes fit before bed") and **Tick it** (ticks the next episode) and **Something else**. Films and things not started get **Open it** instead of Tick it, so a misclick never marks a film watched.
- Navigation is small glass pills in the top right (Tonight, Library, Soon, Lists, search, Settings). Ctrl+K and Ctrl+, still work. The dock comes back on every other page, which keep the Drift look.
- **The Home column** (changed on 18 Nov, your pick from the side menu drafts, replacing the *For you tonight* pill and panel; its *Waiting for you* title was dropped later that day, so it has no name): the Home cards (Did you watch these?, Catch up, Watching together, Back after a break, your services, Keep going or stop, On this day) sit in a column on the right that is always open, so nothing needs a click to find. The dial moves left to make room. When every card is empty the column hides itself and the dial slides back to the middle.
- **Classic (legacy) Home**: Settings → *Appearance* → *Home* → **Classic (legacy)** brings back the Home from before. Remembered per computer.
- With Spotlight on, the flat drifting rows stay behind every page (blurred), so leaving Home doesn't swap the wall back to the tilted one. Classic keeps the tilted wall everywhere.
- **Logo**: "Play eclipse" in Halo blue, on the app icon (Windows and Mac installers and the Windows title bar), the tray / menu bar icon, and the corner of the app and welcome screen.
- Decisions: the Spotlight colours, sizes and logo colours are all tokens in theme.css. No new packages; the display font stays Sora rather than the draft's Outfit, so nothing new is downloaded.
- **Frosted glass pages** (picked from four drafts on 17 Nov: Poster wash, Frosted glass, Halo edges, Lit from above): with Spotlight on, every page's sheet is see-through frosted glass over the drifting posters, cards are a lighter pane of the same glass with a lit top edge, and whatever is switched on (tabs, chips, your services, the dock) is a solid white pill (ink in light mode) instead of the flat purple. Chips and toggles are rounder. Classic keeps the old look. All tokens (`--frost-*`) are in theme.css.
- **Livelier poster wall** (picked on 18 Nov from four rounds of drafts: "S · Brighter" and "X · Pointer" in `designs/eclipse-poster-wall-4.html`): on Spotlight Home the dark veil over the drifting posters is gone, so they show their real colours, and each poster has a soft shadow. A soft light follows the mouse over the wall, and the poster under it lifts and brightens; clicking it opens that title's page. The wall also mixes in recommendations for you (the same ones as Search's "Recommended for you", about one poster in three, up to 16), so clicking one is a quick way to look at something new. Nothing happens over the dial, buttons or panels, and it's off with *Keep the poster wall still* or the computer's reduce-animations setting. Tokens: `--spot-veil`, `--spot-pool-*`, `--row-tile-*shadow`, `--torch*`. Turned down: the other 24 drafts (depth layers, colour glow, collage, projector, columns, wraparound, backdrop, orbit, warp, fluted glass, mosaic, floating few, searchlight, cover flow, triptych, ambilight, lobby, corridor, varied pace, glow, glints, tilt).

**Phase 33: Catch up before the sequel (built, waiting for you to try it)**

- Home shows *Catch up before it's out* up to six weeks before a film or new season arrives:
  - **Films:** the next film in a TMDB series (collection) where you've seen an earlier one. It uses the UK release date (*in cinemas* when TMDB has a UK cinema date) and suggests one of your watching nights before then (the second-to-last, so there's a night spare), with the runtime and which of your services has it. It says when the film runs past your usual bedtime.
  - **Shows:** a new season of a show where you've ticked every episode of the season before. It plans that season over your last watching nights before the premiere, as many a night as fit your evening. If it won't all fit, it suggests just the last few episodes. Tonight counts only for the time left in it.
- **Add to Watch soon** adds the film or show. **Not now** stops suggesting that one (saved in the library, so both computers agree).
- Settings → *Your evenings* → *Catch up before a sequel*: it isn't suggested if you watched the one before in the last year (3 months, 6 months, 2 years or "always suggest it").
- Decisions: watch orders like Marvel's aren't used yet, only TMDB's film series, because a guide's "previous" entry is often a show or a side story. Film details are fetched again once, to pick up the UK release dates.

**Phases 27 to 31 (built, waiting for you to try them on Windows)**

- Shortcut: **Ctrl+,** (**⌘,** on the Mac) opens Settings from anywhere.
- Phase 27, **noticing from browser history**: Settings → *Noticing what you watch* → *From your browser history* → On. Every half hour (and with *Check now*) Eclipse copies the Chrome, Edge and Opera (including Opera GX) history files and reads only visits to streaming sites (Disney+, NOW, Netflix, Prime Video, iPlayer, ITVX, Channel 4, Apple TV+, Paramount+). Each player address counts as one episode: if the page title names it ("S1 E8") that's used, otherwise it's the next unticked one, marked "Eclipse guessed the episode". Home's *Did you watch these?* card has **Tick it** (ticked on the day it was watched) and **Not this** (never asked again). The first time it looks back two weeks.
- Phase 28, **what's playing**: *What's playing* → On. On Windows, a small PowerShell script asks Windows every 5 seconds what's playing (the same thing the volume pop-up shows, with the position) and reads the Chrome, Edge and Opera window titles. On the Mac it reads the front tab of Chrome, Edge and Safari every 10 seconds (the Mac asks permission once). Home shows *Playing now: Andor S2 E4, 31 min in*. When an episode reaches its last few minutes, or you move on after watching most of it, a notification asks you to tick it and it joins *Did you watch these?*, dated the evening it played (after midnight still counts as that night). *What Eclipse sees right now* in Settings lists exactly what the computer reports, to check what Disney+ and NOW give away.
- Phase 29, **bedtime guard**: *Bedtime guard* → On (needs What's playing). In the first two minutes of an episode, if it would end past your bedtime, a notification says "This one ends at 00:14, 14 minutes past bedtime." Once per episode.
- Phase 30, **bookmark a moment**: while something of yours is playing, **Ctrl+Alt+B** (⌘⌥B on the Mac) saves the episode and time. The show's page lists *Saved moments* with a note box and a delete button; moments in episodes you haven't reached yet stay hidden. On the Mac the time isn't known (browsers don't say), so only the episode is saved.
- Phase 31, **play next**: from history and Mac tab addresses Eclipse learns each show's page on its service and the last episode address. Up next and the title page get **Continue on NOW** (or Disney+ …). It opens the show's page (or the last episode if that's all it knows): the services' addresses for the *next* episode can't be worked out in advance, so this is as close as it gets.
- Decisions: all three switches are off until you turn them on, and are per computer. Suggestions and what you said no to live in the app's own folder (`noticing.json`); moments and learnt links are in the library so both computers see them. Nothing is ever ticked without you pressing Tick it. No new npm packages: history is read with the database reader built into Electron.


**Phase 45: Eclipse on your phone (built, waiting for the Google setup and for you to try it)**

- A small page at **https://looby758.github.io/Eclipse/**, saved to the iPhone home screen. Three tabs: **Library** (Watching, Want to watch, Watched, a box to find things by name, which of your services has each one, and a one-tap tick of the next episode), **Search** (TMDB, with **+** to add to Want to watch) and **For you** (recommendations one at a time: **Not for me**, **Skip**, **Interested**). Tapping anything opens its page: status, *Up next* with **Tick it**, where to watch, the trailer, and every season's episodes to tick (ticking one further on offers to tick the ones before it too).
- **No clashes:** the phone only reads `library.json`. Its changes go into `from-phone.json` in the same Drive folder. Eclipse on the computer adds them when it opens and whenever that file syncs in, and marks them as done in the library (`phoneApplied`); the phone then tidies them out of its own file. So each file has only one writer. Clashes wait for you on the computer: "Your phone and this computer disagree", with the two choices (an episode ticked on both on different days, a title removed here but ticked or changed on the phone, or a status changed on both). Read-only copies (the two-computer guard) leave it for the other computer. *Is everything working?* has a "Changes from your phone" line.
- **Google sign-in:** a second sign-in client (*Web application*) in Orbit's Google Cloud project, with only the `drive.file` permission: the page can see just the folder and `library.json` you pick with Google's file picker, and the file it makes itself. No client secret anywhere. It goes back to Google quietly when the hour-long sign-in runs out.
- **Hosting:** GitHub Pages, built by *Actions → Phone page* whenever main changes. Only the page is online. Your library, your changes and the TMDB key stay on the phone (and the page keeps a copy of your library so it opens with no signal).
- Decisions: the phone can't remove titles (only change their status), so nothing is lost by a slip of the thumb. Recommendations use today's scoring; when phase 43 lands, its learning should read *Not for me* and *Interested* from the phone too. Setup steps (Google Cloud, GitHub Pages, the iPhone) are in `phone/README.md`.

**Actor pages and finding people (built, waiting for you to try it)**

- Talked through 18 Nov 2026: when I open an actor it's mostly "what else have I seen them in", and I want to know who they played. In big shows like The Walking Dead the person I'm after is too far down the cast to find.
- Done: an actor's page shows who they played on every row ("Show · 2015 · as Enid"). Next to *Everything* and *What's left* there's a new **Seen** button, which shows only what you've watched (or are part-way through) with them in it.
- Done: *Where you know them from* now shows posters of the things you've seen them in, with the part they played printed under each one ("as Kim Wexler"). Click the poster to open that title, or the person to open their page. It also says who they play in the title you're on.
- Done: search finds people too. A **People** section sits above the films and shows, with each person's photo and what they're known for. Click to open their page (a director opens their films).
- Done: **Full cast** on every title page lists everyone who was ever in it, with who they played and, for shows, how many episodes. It has a box to find someone by name or part.
- Done (after you tried it): a show's part says how many episodes ("5 episodes"), on the actor's page and in the full cast. Click it for which ones: season, episode, title and year, ticked if you've seen it. TMDB usually lists them on the part; when it doesn't, Eclipse looks for them as a guest star season by season. For some main cast TMDB only knows the seasons, and it says so.
- Decisions: cast, filmographies and seasons saved before this are fetched again once, so the parts and episodes show up straight away.

**Spotlight title pages (built, waiting for you to try it)**

- Talked through 18 Nov 2026 over four rounds of drafts (in the project's designs folder); you picked *All on one screen* and said build it.
- Done: with the Spotlight look, a film or show's page is now the show's own picture filling the window, with its logo, "Pick up The Walking Dead?" and the next episode, **Tick it**, and a status drop-down (Want to watch, Watching, Watched, Stopped, Remove). Top right: "169 / 177 episodes watched, about 6 hours to go" and the service it's on.
- Done: every episode as a bar, as tall as its TMDB rating, lit once watched, with the seasons under them and "You are here". Hovering shows the episode, but its picture only once you've seen it and its name only up to where you've got to. Click a bar or a season to open it in Episodes.
- Done: the cast along the bottom (each opens their page), ringed with "Also in …" when you know them from something you've watched or started.
- Done: the same universe (The Walking Dead and its spin-offs, a film series, Star Wars, Marvel and so on) as cards with your progress, in release order. Only titles already in your library ever show, so a spin-off is never given away, and the row hides when there's nothing else.
- Done: everything else (episodes, note, watch with someone, finish it by, moments, rewatches, where to watch, full details) opens in a frosted panel from the small pills. The Classic look keeps the old page.
- Decisions: TMDB details saved before this are fetched again once, to get each title's logo and keywords.

**Future ideas**

- Added to the plan (17 Nov 2026): future ideas from a brainstorm, listed under Future ideas as candidate phases 12 to 32. Group A (12 to 26) stand on their own; Group B (27 to 31) is the chain about noticing what I watch, in order; Group C (32, Apple TV) waits until I have a TV. Calendar-aware planning is a maybe. I mostly watch on the computer for now (an Apple TV and iPhone later).
- Added to the plan (17 Nov 2026): from a review of what the app still needs, candidate phases 36 to 41 under *Safety and everyday comfort*: undo and a check before removing, daily backups, starting with the computer (only after asking), an "Is everything working?" panel, finding things in the library, and calmer screens and keyboard use; then 42, a quick welcome for someone new (for sharing with a friend). Turned down: daily refresh of airing shows with new-episode notifications.
- Added to the plan (18 Nov 2026): candidate phases 43 (recommendations that learn from my no's, replacing the genre-based ones), 44 (Discord status while I watch, quick to switch on and off), 45 (Eclipse on my phone anywhere, reading the library from Google Drive) 46 (finishing a show is an event, still to discuss), 47 (my own heatmap), 48 and 49 (theme tunes and franchises as a star map, both possible and still to discuss), 50 to 54 (premiere night, an opening for Eclipse, a shelf of everything I've finished, milestones and sound design), and 55 to 60 (choosing my own posters, zooming into a poster, my journey with a show, a favourites wall, coming soon on the shelf, and ticking feels good), from a conversation about how I use Eclipse day to day.
