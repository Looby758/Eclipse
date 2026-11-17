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

## Where things are kept

| What | Where | Synced? |
| --- | --- | --- |
| Your library (`library.json`) | The folder you chose | Yes, if it's in Google Drive |
| Settings and the encrypted key (`settings.json`) | Windows: `%APPDATA%\Eclipse` · Mac: `~/Library/Application Support/Eclipse` | No |
| Saved TMDB answers (`tmdb-cache`) | Same app folder | No (can always be rebuilt) |

Avoid having Eclipse open on both computers at the same time, so the two copies don't overwrite each other's changes.

## For development

- `npm test` runs the tests, `npm run typecheck` checks the types.
- `src/core` holds the tracking logic (TMDB, caching, the library). It has no Electron or UI code, so it can move into Orbit later as it is.
- `src/main` is the Electron side (settings, encrypted key, files), `src/preload` the bridge, `src/renderer` the React screens.
- Every colour, font and size is in `src/renderer/src/styles/theme.css`.

Film and TV data from [TMDB](https://www.themoviedb.org). This product uses the TMDB API but is not endorsed or certified by TMDB.
