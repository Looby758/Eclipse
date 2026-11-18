// Passes what page.js sees on this page to background.js (and on to Eclipse): every 10 seconds
// while a video plays, and straight away when it pauses, ends or starts again.
;(() => {
  if (window.__eclipseContent) return
  window.__eclipseContent = true

  let lastSent = 0
  let lastState = ''
  const read = () => {
    try {
      return JSON.parse(document.documentElement.dataset.eclipse || 'null')
    } catch {
      return null
    }
  }
  const report = () => (read() || {}).report || null

  setInterval(() => {
    const r = report()
    if (!r) return
    const state = `${r.paused}|${r.ended}`
    const changed = state !== lastState
    lastState = state
    if (!changed && (r.paused || Date.now() - lastSent < 9500)) return
    lastSent = Date.now()
    try {
      chrome.runtime.sendMessage({ type: 'playing', report: r })
    } catch {
      // The extension was reloaded: this page needs a refresh to talk to it again.
    }
  }, 2000)

  // The popup asks what this page can see.
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg && msg.type === 'what') {
      // Every frame of the tab is asked and the first answer wins: a frame with the player answers
      // straight away, the page itself a moment later, other frames not at all.
      const d = read()
      const answer = () => reply({ report: d ? d.report : null, seen: d ? d.seen : null, roots: d ? d.roots : 0, running: !!d })
      if (d && d.report) answer()
      else if (window === window.top) setTimeout(answer, 400)
      else return false
      return true
    }
    return false
  })
})()
