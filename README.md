# Eclipse

A personal film and TV tracker for Windows and Mac. Search anything on TMDB, see its details, and keep track of what you want to watch, are watching, have watched or stopped. Your library is a plain `library.json` file in a folder you choose (put it in Google Drive to use it on both computers).

See [PLAN.md](PLAN.md) for the full plan and the progress log.

## Running it (while it's being built)

You need [Node.js](https://nodejs.org) (the LTS version) and [Git](https://git-scm.com), the same as for Orbit.

1. Open a terminal (PowerShell on Windows, Terminal on Mac).
2. Get the code the first time:
   ```
   git clone https://github.com/Looby758/Eclipse.git
   cd Eclipse
   ```
   Later, to get the newest version: `cd Eclipse` then `git pull`.
3. Install the parts it needs (first time, and whenever `package.json` changes): `npm install`
4. Start it: `npm run dev`

The app window opens. Close it (or press Ctrl+C in the terminal) to stop.

## First launch

1. **Choose folder:** pick (or create) a folder for your data, e.g. `G:\My Drive\Eclipse` on Windows or the same folder in Google Drive on your Mac.
2. **TMDB key:** sign in at [themoviedb.org](https://www.themoviedb.org), open *Settings → API*, request a free key for personal use if you haven't, and copy either the **API Key** or the **API Read Access Token**. Paste it in and press **Save key**. Eclipse checks it with TMDB, then stores it encrypted with your computer's own protection (Windows' data protection or the Mac Keychain). It is never written to your data folder or the code.

Each computer needs the key pasted once.

## Phase 2: what to try

1. **Your services:** Settings → *Your services*. Disney+ and NOW TV should already be ticked. Click a service to add or remove it.
2. **Import from Sequel:** in Sequel, export your library. In Eclipse, Settings → *Import from Sequel* → **Choose export file** and pick the `.zip` (or **Choose unzipped folder**). Check the numbers it shows, then press **Import**. Your old `library.json` is copied aside first (as `library.before-sequel-….json`), so nothing is lost. Importing again later only fills gaps, it never duplicates.
3. **Tick episodes:** open a show. Click a dot to see that episode, then **Mark watched** or **Watched up to here**. Double-click a dot to tick it straight away. The glowing dot is your next episode.
4. **Notes and dates:** under the status buttons, type a note and press Enter. For something Watched, change the *Watched on* date if it's wrong.
5. **Where to watch:** scroll down a title page. Your services are highlighted.
6. **Filters:** in Library or Search, pick **On my services**, **Rent or buy only** or **Not streaming anywhere**. The first time it checks every title, which takes a few seconds.
7. **Home:** the suggestion shows the next episode and a button to tick it.

## Where things are kept

| What | Where | Synced? |
| --- | --- | --- |
| Your library (`library.json`) | The folder you chose | Yes, if it's in Google Drive |
| Settings and the encrypted key (`settings.json`) | Windows: `%APPDATA%\Eclipse` · Mac: `~/Library/Application Support/Eclipse` | No |
| Saved TMDB answers (`tmdb-cache`) | Same app folder | No (can always be rebuilt) |

Avoid having Eclipse open on both computers at the same time, so the two copies don't overwrite each other's changes.

## Phase 3: what to try

1. **Your evenings:** Settings → *Your evenings*. Set when you usually start watching, your bedtime, and the nights you watch (it starts at 20:00 to 23:00, Monday to Friday).
2. **Renewal days (optional):** Settings → *Your services*. Under your ticked services, pick the day of the month NOW TV (or any of them) renews.
3. **Watchlist hours:** open Library → *Want to watch*. The top shows how long your watchlist is, split by service. Each poster shows how long it has left. Press **Quickest to finish** to sort by that. Try the *Watching* tab too.
4. **Finish it by Friday:** open a show you haven't finished. In *Finish it by…*, pick **Friday**, a renewal, the next season, or any date. It tells you how many episodes a night that takes, or the earliest you could finish if it won't fit. Press the × to clear it.
5. **Home:** for a show with a deadline, the *Up next* box says how many a night you need and how many fit before bed tonight. A film says when to start it to be in bed on time.

## Phases 4 to 7: what to try

1. **Heatmap (Phase 4):** open a show you've started, for example one from your Sequel import. Under the time card is a grid of coloured squares, one per episode. Cyan is the best-rated, pink the weakest, grey means too few votes. Hover a square for its rating, click it to jump to that episode below.
2. **On this day (Phase 5):** go Home with the window fairly wide. On the right, *On this day* shows what you watched on this date (or this week) in earlier years. If it says nothing, you haven't got a watch on a matching date yet.
3. **People (Phase 6):** open any film. Under *Where to watch*, click a director or actor. You'll see all their films with how many you've seen. Press **Add to your lists**.
4. **Lists (Phase 6):** press **Lists** in the dock. Try *What's left* and *On my services* on a list. Make your own list with *New list*, then add films to it from their pages (under *Your lists*) and drag them into your own order. Your Sequel "Marvel" collection is already there.
5. **TMDB lists (Phase 6):** on the Lists page, paste a public list's link from themoviedb.org (for example a "Best Picture winners" list) into *TMDB lists*.
6. **Watch orders (Phase 7):** on the Lists page, open *Marvel Cinematic Universe* or *Star Wars*. It shows how far through you are and what's next. Switch between *Story order* and *Release order*. Open a film like *Interstellar* and click *Part of …* to see its film series. Please tell me anything in the Marvel or Star Wars order you'd change.

## For development

- `npm test` runs the tests, `npm run typecheck` checks the types.
- `src/core` holds the tracking logic (TMDB, caching, the library, where-to-watch, the Sequel import, the runtime maths). It has no Electron or UI code, so it can move into Orbit later as it is.
- `src/main` is the Electron side (settings, encrypted key, files), `src/preload` the bridge, `src/renderer` the React screens.
- Every colour, font and size is in `src/renderer/src/styles/theme.css`.

Film and TV data from [TMDB](https://www.themoviedb.org). This product uses the TMDB API but is not endorsed or certified by TMDB. Where-to-watch data from [JustWatch](https://www.justwatch.com).
