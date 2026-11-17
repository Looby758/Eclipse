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

## For development

- `npm test` runs the tests, `npm run typecheck` checks the types.
- `src/core` holds the tracking logic (TMDB, caching, the library, where-to-watch, the Sequel import). It has no Electron or UI code, so it can move into Orbit later as it is.
- `src/main` is the Electron side (settings, encrypted key, files), `src/preload` the bridge, `src/renderer` the React screens.
- Every colour, font and size is in `src/renderer/src/styles/theme.css`.

Film and TV data from [TMDB](https://www.themoviedb.org). This product uses the TMDB API but is not endorsed or certified by TMDB. Where-to-watch data from [JustWatch](https://www.justwatch.com).
