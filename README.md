# Eclipse

A personal film and TV tracker for Windows and Mac. Search anything on TMDB, see its details, and keep track of what you want to watch, are watching, have watched or stopped. Your library is a plain `library.json` file in a folder you choose (put it in Google Drive to use it on both computers).

See [PLAN.md](PLAN.md) for the full plan and the progress log.

## Installing it

Download the newest installer from [Releases](https://github.com/Looby758/Eclipse/releases):

- **Windows:** `Eclipse-Setup-….exe`. Windows may say it "protected your PC" because the installer isn't signed with a paid certificate: press **More info → Run anyway**.
- **Mac:** `Eclipse-…-arm64.dmg` for Apple Silicon (M1 and later) or `Eclipse-…-x64.dmg` for Intel. Drag Eclipse into Applications. The first time, right-click it and choose **Open** (it isn't signed with a paid Apple certificate), or allow it in *System Settings → Privacy & Security*.

Your data folder and key carry on as before. The installed app checks for updates itself (Settings → *Version and updates*).

## Making a release

1. Put the new version number in `package.json` (e.g. `1.0.1`) and push it to main.
2. On GitHub, open **Actions → Release → Run workflow** (on main). It builds the Windows and Mac installers on GitHub's computers (about 15 minutes) and publishes them as a release tagged `v1.0.1`. Pushing a tag like `v1.0.1` does the same.

To build an installer on your own computer instead: `npm run build:win` (on Windows) or `npm run build:mac` (on a Mac). It lands in `dist/`.

## Running it from the code

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

A short welcome walks you through it: what Eclipse is, then:

1. **Where to keep your library:** *On this computer* (an Eclipse folder in Documents), or *In Google Drive* to pick a folder there, e.g. `G:\My Drive\Eclipse` on Windows and the same folder in Google Drive on your Mac.
2. **TMDB key:** sign in at [themoviedb.org](https://www.themoviedb.org), open *Settings → API*, request a free key for personal use if you haven't, and copy either the **API Key** or the **API Read Access Token**. Paste it in and press **Save key**. Eclipse checks it with TMDB, then stores it encrypted with your computer's own protection (Windows' data protection or the Mac Keychain). It is never written to your data folder or the code.

3. **Your country and services**, then **Import from Sequel** if you used it. Both can be skipped and changed later in Settings.

Each computer needs the key pasted once.

## Phase 2: what to try

1. **Your services:** Settings → *Your services*. Disney+ and NOW TV should already be ticked. Click a service to add or remove it.
2. **Import from Sequel:** in Sequel, export your library. In Eclipse, Settings → *Import from Sequel* → **Choose export file** and pick the `.zip` (or **Choose unzipped folder**). Check the numbers it shows, then press **Import**. Your old `library.json` is copied aside first (as `library.before-sequel-….json`), so nothing is lost. Importing again later only fills gaps, it never duplicates.
3. **Tick episodes:** open a show. Click a dot to see that episode, then **Mark watched** or **Watched up to here**. Double-click a dot to tick it straight away. The glowing dot is your next episode.
4. **Notes and dates:** under the status buttons, type a note and press Enter. For something Watched, change the *Watched on* date if it's wrong.
5. **Where to watch:** scroll down a title page. Your services are highlighted.
6. **Filters:** in Library or Search, pick **On my services**, **Rent or buy only** or **Not streaming anywhere**. The first time it checks every title, which takes a few seconds.
7. **Home:** the suggestion shows the next episode and a button to tick it.

## Phases 36 to 42: what to try

No new packages, so just pull and `npm run dev`.

1. **Asking before removing, and Undo:** open a show you've ticked episodes of and press the ✕ beside the statuses. It asks first ("This forgets 7 watched episodes…"); press **Keep it**. Now change its status, or tick a few episodes: a "Done · Undo" bar shows for a few seconds at the bottom. Press **Undo** (or Ctrl+Z) and it's back as it was.
2. **Backups:** Settings → *Backups*. Today's backup is already there (in a *backups* folder inside your data folder). **Restore a backup** lists them with what's in each; restoring copies your current library aside first, and the Undo bar works for it too.
3. **Start with Windows:** Settings → *Start with Windows* → On, then restart the computer. Eclipse should appear in the tray by the clock with no window. If your data folder is in Google Drive, it waits for Drive. The first time you switch on noticing, the phone remote or the tray, Eclipse asks once whether to do this.
4. **Is everything working?:** Settings → *Is everything working?* lists the background jobs with when each last ran. **Copy details** puts it and the log on the clipboard to paste to Claude.
5. **Find in your library:** Library → type in *Find in your library* (try a few letters). The **Sort** menu has A to Z, Last watched, Date added and Release year, and remembers your choice. Typing a name that's in another tab offers a button to jump there.
6. **Calmer and keyboard:** Settings → Appearance → *Keep the poster wall still* → **Still**. Then press Tab to move around: everything you land on gets a clear outline. Arrow keys move between posters in a grid and along rows of choices; Escape closes or goes back.
7. **Welcome for someone new:** to see it without touching your setup, rename `%APPDATA%\Eclipse\settings.json` to `settings.old.json`, start Eclipse, go through the steps (choose your existing data folder at *In Google Drive*), then close Eclipse and rename it back. Your TMDB key lives in that file, so renaming it back restores everything.

## Phase 35: what to try

No new packages, so just pull and `npm run dev`.

1. **Your week:** Settings → *Your evenings*. Give Friday and Saturday a later bedtime, turn a night off, and press **Add a time** on Saturday for an afternoon slot. The total for each day and the week updates as you go.
2. **Just for tonight:** on Home, press the small "Tonight …" line under the buttons. Try **Not watching tonight**, then **Back to usual**, then a later **Bedtime tonight**. The dial and "episodes fit" change; tomorrow is back to normal.
3. **Gaps and wind-down:** set *Between episodes* to 10 minutes and *Wind down* to 30, then look at "start by" and how many episodes fit on Home.
4. **Weekly budget:** pick "About 10 hours a week". Home shows how much of this week is left, and Watch soon spreads your list out to stay under it.
5. **Phone remote:** if it's on, the phone page has **Not watching tonight** and **Bed 30 min later**.
6. **Best services for your watchlist:** Settings → *Your services* → **Which services are best for my watchlist?** The card at the top lists the fewest services that cover the most of what you want to watch.
7. **Recommendations:** open Search (the magnifier, or Ctrl+K) without typing. *Recommended for you* lists picks from what you've watched, each with *Because you watched …*. Try **Shows**, **On my services**, and the cross on a poster (Not for me).
8. **Watching together at a set time:** open a show you watch with someone. In its *With …* row, set **Next time** (and **Every week** if it's a regular slot). It shows on Home only around that time, and a reminder pops up 15 minutes before.

## Phase 34: what to try

1. **Spotlight Home:** open Eclipse. Home is now the Tonight dial with your pick inside it. Try **Tick it**, **Something else**, and clicking the poster.
2. **Waiting for you** (the column on the right) holds the Home cards, always open. It hides itself, and the dial moves back to the middle, when nothing is waiting.
3. **Classic Home:** Settings → *Appearance* → *Home* → **Classic (legacy)** for the Home from before. Switch back with **Spotlight**.
4. **New logo:** in the corner of the app, and (once you build an installer) as the app icon and the tray icon.
5. **Frosted glass:** open Settings, Library or any title. The page is now see-through glass over the drifting posters, and anything switched on is a white pill. Try Dark and Light. Pick **Classic (legacy)** Home to get the old flat look back.

## Phase 33: what to try

1. **Catch up before the sequel:** open Tonight. If a film in a series you've seen, or a new season of a show you've finished a season of, comes out in the next six weeks, a *Catch up before it's out* card says what to rewatch and which nights it fits. Try **Add to Watch soon** and **Not now**.
2. Settings → *Your evenings* → change *Catch up before a sequel* to "any time" to see suggestions even for things you watched recently.

## Phases 27 to 31: what to try

No new packages this time, so no `npm install` needed (just pull and `npm run dev`). These need Windows or a Mac, so try them on your computer.

1. **Settings shortcut:** press **Ctrl+,** anywhere in Eclipse.
2. **History:** Settings → *Noticing what you watch* → *From your browser history* → **On**, then **Check now**. Go to Tonight: a *Did you watch these?* card lists episodes you watched in Opera GX, Chrome or Edge in the last two weeks. Press **Tick it** on one and **Not this** on another.
3. **What's playing:** turn **What's playing** on, then play an episode of a show in your library on Disney+ or NOW in Opera GX, Chrome or Edge. Back in Settings, *What Eclipse sees right now* should list it within a few seconds. Screenshot that box for me, whether or not it recognises the show: it tells us what the services give away. The first time, Windows may briefly show a PowerShell window or ask about it: that's Eclipse asking what's playing.
4. **Bookmark a moment:** while it plays, press **Ctrl+Alt+B**. A notification says it's saved; the show's page has it under *Saved moments*, where you can add a note.
5. **Bedtime guard:** turn it on, set your bedtime a few minutes from now (Settings → Your evenings), and start an episode.
6. **Continue on:** after a history check, a show you watched on NOW or Disney+ gets a **Continue on …** button on its page and in Up next.

## Where things are kept

| What | Where | Synced? |
| --- | --- | --- |
| Your library (`library.json`) | The folder you chose | Yes, if it's in Google Drive |
| Settings and the encrypted key (`settings.json`) | Windows: `%APPDATA%\Eclipse` · Mac: `~/Library/Application Support/Eclipse` | No |
| Saved TMDB answers (`tmdb-cache`) | Same app folder | No (can always be rebuilt) |
| Suggestions from noticing what you watch (`noticing.json`) | Same app folder | No |
| Daily backups (`backups/library-YYYY-MM-DD.json`) | Inside the folder you chose | Yes, if it's in Google Drive |
| The problem log (`eclipse.log`) | The app folder | No |

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
6. **Watch orders (Phase 7):** on the Lists page, open *Marvel Cinematic Universe* or *Star Wars*. It shows how far through you are and what's next, in release order; press *Story order* to switch. Open a film like *Interstellar* and click *Part of …* to see its film series. Please tell me anything in the Marvel or Star Wars order you'd change.
7. **Search a franchise:** search *walking dead* or *better call saul*. A *watch order* card appears above the results. **Copy to your lists** makes your own version you can rearrange.

## Phase 8: what to try

1. **See what's coming:** Settings → *Release calendar*. It lists the next dates from your library: films on your watchlist, new seasons and finales of shows you follow.
2. **Every episode (optional):** press *Every new episode* to list each episode instead.
3. **Save it:** press **Save calendar file** and save it (it opens the folder for you).
4. **Add it to Google Calendar:** on calendar.google.com, make a new calendar called "Eclipse" (Settings → Add calendar → Create new calendar). Then Settings → *Import & export* → pick the file and choose the Eclipse calendar. To update later, delete the Eclipse calendar, make it again and import a fresh file.
5. **Walking Dead sections:** search *walking dead*, open the order and try *Main story* and *Spin-offs*.

## Phase 9: what to try

1. **Add a few:** open a film or show and press **Watch soon** (under the status buttons). Add three or four.
2. **See the plan:** press **Soon** in the dock. The top says how long it all takes and when you'd finish. *Tonight* says what fits before bed, and *Your evenings* lays it out night by night.
3. **Reorder:** drag the rows (or use the arrows) and watch the plan change. Press × to take something off.
4. **Change your evenings:** in Settings → *Your evenings*, change your bedtime or nights and look at Soon again.
5. **Home:** *Pick up …?* suggests what you're watching first, then the next thing on Watch soon.

## Phase 10: what to try

1. **Seen it before:** open something you watched years ago (say *El Camino*) and press **Seen it before? Mark it watched with no date** under the status buttons. It's now Watched, with *the first time before Eclipse, no date*.
2. **A whole season, no dates:** on a show you've seen, press **Seen season 1 before (no date)** above the episodes. The ticks say *Seen before*.
3. **Watch a film again:** on a watched film, press **Watched it again today**. It now says *Watched twice* and lists the rewatch. Press × on it to take it off.
4. **Tick off a watch order:** open the MCU order (search *mcu*) and click the round tick on the right of anything you've seen. One click each, no dates. Click *Seen* on a row to undo it.
5. **Rewatch a show:** on a watched show, press **Start a rewatch**. Tick a few episodes: they count towards the rewatch, and the show moves to the *Watching* tab in the Library and to *Pick up* on Home. Press **Finish rewatch** to count it, or **Give up** to drop it.

## Phase 11: what to try

1. **Export:** Settings → *Export your data* → **Export everything**, and pick a folder (e.g. Documents). Open `titles.csv` in Excel or Google Sheets.
2. **Credits:** Home now has *Data from TMDB and JustWatch* in the bottom corner.
3. **Make the first release:** after merging, on GitHub open **Actions → Release → Run workflow**. When it finishes, download the installer from **Releases** and install it (see *Installing it* above).
4. **Updates:** in the installed app, Settings → *Version and updates* → **Check now** says you have the latest version.

## Phase 12: what to try

You need both computers and the shared Google Drive folder.

1. **Open on both:** open Eclipse on the PC, wait a minute for Drive to sync, then open it on the Mac. The Mac shows a *Read-only* banner saying Eclipse is open on the PC. Try ticking something: the banner shakes and nothing changes.
2. **Close the first:** quit Eclipse on the PC. Within a minute or two (once Drive has synced) the banner on the Mac goes away and it works normally.
3. **Take over:** with both open again, press **Take over** on the read-only one. Within a minute or two the other one turns read-only and says it was taken over.

## Phases 13 to 22: what to try

1. **Watch with someone:** open a show, press **Watch with someone** and type a name. Tick an episode there: Home now says *Next with …* with a button to tick the next one.
2. **Credits scene:** open a Marvel film. Under the tagline it says whether to stay for the credits. The MCU watch order shows a small chip on those films.
3. **Who recommended it:** on any title, type a name in **From**. Lists → *Recommended by* now has a list for that person.
4. **Clear out:** Library → *Want to watch* → **Clear out the watchlist** → Start. Use the buttons or the arrow keys. Anything dropped is under *Recently dropped* with **Put back**.
5. **Where do I know them from:** open a film, scroll to *Where you know them from*.
6. **Free TV:** open something on BBC iPlayer: Where to watch has a *Free* group. The Library filter has *On my services or free*.
7. **Your services:** Settings → *Your services* → **Do I still need them?** Set a renewal day for each service to get the "pause it" advice. After a day or two of use, Home starts saying what arrived on your services and what left.
8. **Keep going or stop:** a show you haven't ticked in 60 days shows on Home. Try **Remind me later**. Change the 60 days in Settings → *Your evenings*.
9. **Back after a break:** when a show you finished a season of long ago gets a new season, Home reminds you how the last one ended. (This only shows when it happens, so you may not see it straight away.)

## Phases 23 to 26: what to try

1. **Phone remote:** Settings → *Your phone as a remote* → **On**. If Windows asks about the network, allow **private networks**. Point your iPhone camera at the QR code and tap the link (it must be on the same Wi-Fi). Press **Watched** on a show: the app on the computer ticks it too.
2. **Repair old dates:** Settings → *Your history* → **Repair old dates**. Try **Spread them out** on one batch and look at that show's episodes. A copy of `library.json` is saved beside it first.
3. **Your year:** Lists → **Your year in Eclipse** (top right). Pick 2025 at the top to see last year.
4. **Tray:** Settings → *Eclipse in the system tray* → **On**. Find the Eclipse icon by the clock (it may be behind the ^ arrow) and open its menu. Tick an episode from there. Close the window: Eclipse keeps running in the tray until you choose **Quit Eclipse**.

## For development

- `npm test` runs the tests, `npm run typecheck` checks the types.
- `src/core` holds the tracking logic (TMDB, caching, the library, where-to-watch, the Sequel import, the runtime maths). It has no Electron or UI code, so it can move into Orbit later as it is.
- `src/main` is the Electron side (settings, encrypted key, files), `src/preload` the bridge, `src/renderer` the React screens.
- Every colour, font and size is in `src/renderer/src/styles/theme.css`.

Film and TV data from [TMDB](https://www.themoviedb.org). This product uses the TMDB API but is not endorsed or certified by TMDB. Where-to-watch data from [JustWatch](https://www.justwatch.com).
