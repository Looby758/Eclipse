# Eclipse: what's playing (Chrome extension)

Disney+ and NOW don't put the episode in the page title, so browser history and the window title
can't tell Eclipse which episode you watched. This extension reads it from the player itself
("S5:E3"), along with how far in you are, and sends it to the Eclipse app on the same computer
(`http://127.0.0.1:47615`). Nothing is sent anywhere else, and it never clicks or changes anything.

## Install

1. In Eclipse, switch on Settings → Noticing what you watch → What's playing.
2. In Chrome, open `chrome://extensions` and switch on Developer mode.
3. Press **Load unpacked** and choose this folder (Settings → Show the extension folder opens it).
4. Play an episode. Within 10 seconds it shows under "What Eclipse sees right now", and the
   extension's popup says what it last sent.

## How it reads the episode

- `content.js` checks each service's player title lines first (see `SITES`), then what the page
  tells Chrome's media controls (`page.js` copies `navigator.mediaSession`), then the tab title,
  and only then other title-ish text in the player that names an episode (skipping "Up next" rows).
- When a service changes its player and the episode stops showing up, add the new selector to
  `SITES` in `content.js` and reload the extension.
