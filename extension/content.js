// Reads which episode the player on this page says is on, and how far in you are, every 10
// seconds while a video plays (and once when it pauses or ends), and hands it to background.js to
// pass to Eclipse. Reads only: it never clicks or changes anything on the page.
;(() => {
  // Where each service's player shows the show and episode, best first. Checked in this order
  // before anything else on the page.
  const SITES = [
    [/disneyplus\.com$/, ['.title-field', '.subtitle-field', '[data-testid="title-field"]', '[data-testid="subtitle-field"]', '[class*="TitleField"]', '[class*="SubtitleField"]']],
    [/(nowtv|now)\.com$/, ['[data-testid*="player-title" i]', '[data-testid*="playerTitle" i]', '[class*="player-title" i]', '[class*="playerTitle" i]', '[class*="episode-title" i]', '[class*="episodeTitle" i]']],
    [/netflix\.com$/, ['[data-uia="video-title"]']],
    [/(primevideo|amazon\.co\.uk|amazon\.com)$/, ['.atvwebplayersdk-title-text', '.atvwebplayersdk-subtitle-text']],
    [/bbc\.co\.uk$/, ['.play-cta__title', '.typo--canary', '[data-bbc-content-label="title"]', 'h1']],
    [/itv\.com$/, ['[data-testid="player-title"]', '[data-testid="player-subtitle"]', 'h1']],
    [/channel4\.com$/, ['[class*="player__title" i]', '[class*="playerTitle" i]', 'h1']],
    [/tv\.apple\.com$/, ['[class*="title" i][class*="player" i]', 'h1']],
    [/paramountplus\.com$/, ['[class*="player-title" i]', '[class*="playerTitle" i]', 'h1']]
  ]
  // Anywhere else in a player that names a title or episode: used only when the above don't say
  // which episode. Rows of other things ("Up next", recommendations) are skipped.
  const GENERIC = '[data-testid*="title" i], [class*="title" i], [data-testid*="episode" i], [class*="episode" i], [aria-label*="episode" i]'
  const NOT = /next|upnext|recommend|related|rail|tile|card|collection|shelf|carousel|more-like|similar/i
  const EPISODE = /\bS\d{1,2}\s*[:.\- ]?\s*E(?:p\.?\s*)?\d{1,3}\b|\b(?:Season|Series)\s*\d{1,2}\s*[,:\-]?\s*(?:Episode|Ep\.?)\s*\d{1,3}\b|\b\d{1,2}x\d{1,3}\b/i

  const text = (el) => (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()
  const skipped = (el) => {
    for (let x = el, i = 0; x && i < 6; x = x.parentElement, i++) {
      const id = `${x.className && typeof x.className === 'string' ? x.className : ''} ${x.getAttribute ? x.getAttribute('data-testid') || '' : ''}`
      if (NOT.test(id)) return true
    }
    return false
  }

  /** The main video: the longest one that's loaded. */
  function video() {
    return [...document.querySelectorAll('video')].filter((v) => v.readyState > 0 && v.duration > 120 && Number.isFinite(v.duration)).sort((a, b) => b.duration - a.duration)[0] || null
  }

  function texts() {
    const out = []
    const add = (t) => {
      if (t && t.length <= 200 && !out.includes(t)) out.push(t)
    }
    const site = SITES.find(([host]) => host.test(location.hostname))
    for (const sel of site ? site[1] : []) for (const el of document.querySelectorAll(sel)) if (!skipped(el)) add(text(el))
    try {
      const m = JSON.parse(document.documentElement.dataset.eclipseMedia || '[]')
      for (const t of m) add(String(t).trim())
    } catch {
      // No media session.
    }
    add(document.title.trim())
    if (!out.some((t) => EPISODE.test(t))) {
      for (const el of document.querySelectorAll(GENERIC)) {
        const t = text(el)
        if (t.length >= 2 && t.length <= 150 && EPISODE.test(t) && !skipped(el)) add(t)
        if (out.length >= 12) break
      }
    }
    return out.filter(Boolean).slice(0, 12)
  }

  let lastSent = 0
  function send(force) {
    const v = video()
    if (!v) return
    if (!force && v.paused) return
    if (!force && Date.now() - lastSent < 9000) return
    lastSent = Date.now()
    const report = { url: location.href, texts: texts(), position: v.currentTime, duration: v.duration, paused: v.paused, ended: v.ended }
    try {
      chrome.runtime.sendMessage({ type: 'playing', report })
    } catch {
      // The extension was reloaded: this page needs a refresh to talk to it again.
    }
  }

  setInterval(() => send(false), 10000)
  // Pauses, ends and seeks are sent straight away (so "finished it?" knows).
  for (const ev of ['pause', 'ended', 'play', 'seeked']) document.addEventListener(ev, (e) => e.target instanceof HTMLVideoElement && send(true), true)
})()
