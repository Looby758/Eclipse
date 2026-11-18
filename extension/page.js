// Runs in the page itself, from the very start, so it can see players that streaming sites tuck
// away inside their own components (Disney+ puts its player in a "shadow root", which the rest of
// the extension can't look inside). Every 2 seconds it writes what's playing onto the page for
// content.js to pass on: the main video's position, and the lines that name the show and episode.
// Reads only: it never clicks or changes anything you can see.
;(() => {
  if (window.__eclipsePage) return
  window.__eclipsePage = true

  // Keep hold of every shadow root as the page makes it (open or closed), to look inside later.
  const roots = []
  const attach = Element.prototype.attachShadow
  Element.prototype.attachShadow = function (init) {
    const root = attach.call(this, init)
    roots.push(root)
    return root
  }
  // Every video or audio element the page starts playing or gives a stream to, wherever it lives
  // (a player can be built outside the page and only some of it shown).
  const media = new Set()
  const remember = (el) => {
    try {
      if (el instanceof HTMLVideoElement) media.add(el)
    } catch {
      // Not a media element.
    }
  }
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (...args) {
    remember(this)
    return play.apply(this, args)
  }
  const srcDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')
  if (srcDesc && srcDesc.set) {
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      ...srcDesc,
      set(v) {
        remember(this)
        srcDesc.set.call(this, v)
      }
    })
  }
  for (const ev of ['play', 'playing', 'loadedmetadata', 'timeupdate']) document.addEventListener(ev, (e) => remember(e.target), true)

  // Plus open ones made before this started (when added to a tab that was already open).
  const openRoots = () => {
    const found = new Set(roots)
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot && !found.has(el.shadowRoot)) {
          found.add(el.shadowRoot)
          walk(el.shadowRoot)
        }
      }
    }
    walk(document)
    return [...found]
  }
  let known = []
  const all = (sel) => {
    const out = [...document.querySelectorAll(sel)]
    for (const r of known) out.push(...r.querySelectorAll(sel))
    return out
  }

  // Where each service's player shows the show and episode, best first.
  const SITES = [
    [/disneyplus\.com$/, ['.title-field', '.subtitle-field', '[data-testid="title-field"]', '[data-testid="subtitle-field"]', '[class*="TitleField"]', '[class*="SubtitleField"]', '[class*="title-field" i]', '[class*="subtitle-field" i]']],
    [/(nowtv|now)\.com$/, ['[data-testid*="player-title" i]', '[data-testid*="playerTitle" i]', '[class*="player-title" i]', '[class*="playerTitle" i]', '[class*="episode-title" i]', '[class*="episodeTitle" i]']],
    [/netflix\.com$/, ['[data-uia="video-title"]']],
    [/(primevideo|amazon\.co\.uk|amazon\.com)$/, ['.atvwebplayersdk-title-text', '.atvwebplayersdk-subtitle-text']],
    [/bbc\.co\.uk$/, ['.play-cta__title', '.typo--canary', '[data-bbc-content-label="title"]', 'h1']],
    [/itv\.com$/, ['[data-testid="player-title"]', '[data-testid="player-subtitle"]', 'h1']],
    [/channel4\.com$/, ['[class*="player__title" i]', '[class*="playerTitle" i]', 'h1']],
    [/tv\.apple\.com$/, ['[class*="title" i][class*="player" i]', 'h1']],
    [/paramountplus\.com$/, ['[class*="player-title" i]', '[class*="playerTitle" i]', 'h1']]
  ]
  // Anything else that names an episode ("S24:E1 The Edible Arrangement"), when the above don't.
  const GENERIC = 'h1, h2, h3, h4, span, div, p'
  const NOT = /next|upnext|recommend|related|rail|tile|card|collection|shelf|carousel|more-like|similar/i
  const EPISODE = /\bS\d{1,2}\s*[:.\- ]?\s*E(?:p\.?\s*)?\d{1,3}\b|\b(?:Season|Series)\s*\d{1,2}\s*[,:\-]?\s*(?:Episode|Ep\.?)\s*\d{1,3}\b/i

  const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim()
  const skipped = (el) => {
    for (let x = el, i = 0; x && i < 6; x = x.parentElement || (x.getRootNode && x.getRootNode().host) || null, i++) {
      const id = `${typeof x.className === 'string' ? x.className : ''} ${x.getAttribute ? x.getAttribute('data-testid') || '' : ''}`
      if (NOT.test(id)) return true
    }
    return false
  }

  /** Every video the page has, in the page or tucked away, and which one is the programme. */
  function videos() {
    const list = new Set([...all('video'), ...media])
    for (const v of list) if (!v.isConnected && v.paused) list.delete(v)
    return [...list]
  }
  function video(list) {
    const ready = list.filter((v) => v.readyState > 0)
    // A programme: over two minutes long. Streams that don't say how long they are: the biggest one playing.
    const long = ready.filter((v) => Number.isFinite(v.duration) && v.duration > 120).sort((a, b) => b.duration - a.duration)[0]
    if (long) return long
    return ready.filter((v) => !v.paused && v.videoWidth > 0).sort((a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight)[0] || null
  }

  function texts() {
    const out = []
    const add = (t) => {
      if (t && t.length <= 200 && !out.includes(t)) out.push(t)
    }
    const site = SITES.find(([host]) => host.test(location.hostname))
    for (const sel of site ? site[1] : []) for (const el of all(sel)) if (!skipped(el)) add(text(el))
    try {
      const m = navigator.mediaSession && navigator.mediaSession.metadata
      if (m) [m.title, m.artist, m.album].forEach((t) => add((t || '').trim()))
    } catch {
      // No media session.
    }
    add(document.title.trim())
    if (!out.some((t) => EPISODE.test(t))) {
      // The smallest bits of text that name an episode (not the big containers around them).
      for (const el of all(GENERIC)) {
        if (el.children.length > 3) continue
        const t = text(el)
        if (t.length >= 4 && t.length <= 150 && EPISODE.test(t) && !skipped(el)) add(t)
        if (out.length >= 12) break
      }
    }
    return out.filter(Boolean).slice(0, 12)
  }

  function write() {
    try {
      known = openRoots()
      const list = videos()
      const v = video(list)
      const finite = (n) => (Number.isFinite(n) ? n : null)
      const report = v ? { url: location.href, texts: texts(), position: finite(v.currentTime), duration: finite(v.duration), paused: v.paused, ended: v.ended } : null
      // What it looked at, for the popup when nothing's found.
      const seen = list.map((x) => `${x.readyState}/${Number.isFinite(x.duration) ? Math.round(x.duration) : String(x.duration)}/${x.paused ? 'paused' : 'playing'}`)
      document.documentElement.dataset.eclipse = JSON.stringify({ report, seen, roots: known.length })
    } catch {
      // Try again next time.
    }
  }
  setInterval(write, 2000)
})()
