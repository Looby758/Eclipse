// Runs in the page itself, where the player says what's playing to Chrome's media controls
// (navigator.mediaSession). Copies that onto the page for content.js to read. Reads only.
;(() => {
  const copy = () => {
    try {
      const m = navigator.mediaSession && navigator.mediaSession.metadata
      document.documentElement.dataset.eclipseMedia = m ? JSON.stringify([m.title || '', m.artist || '', m.album || '']) : ''
    } catch {
      // Nothing to copy.
    }
  }
  copy()
  setInterval(copy, 3000)
})()
