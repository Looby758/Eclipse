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
  // Only what's on the page now: when you move to the next episode, Disney+ can leave the last
  // episode's player behind, taken off the page but still holding its title ("S24:E1").
  const all = (sel) => {
    const out = [...document.querySelectorAll(sel)]
    for (const r of known) if (r.host && r.host.isConnected) out.push(...r.querySelectorAll(sel))
    return out.filter((el) => el.isConnected)
  }
  // Lines beside the playing video, and on screen, come first.
  const nearness = (el, v) => (v && el.getRootNode() === v.getRootNode() ? 2 : 0) + (el.getClientRects().length ? 1 : 0)

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
  let last = null
  function videos() {
    const list = new Set([...all('video'), ...media])
    // Old players taken off the page are left out, except the one you were just watching (a paused
    // Disney+ video can live off the page).
    for (const v of list) if (!v.isConnected && v.paused && v !== last) list.delete(v)
    return [...list]
  }
  function video(list) {
    const ready = list.filter((v) => v.readyState > 0)
    const size = (v) => v.videoWidth * v.videoHeight
    const pick = () => {
      // A programme: over two minutes long, the one playing first.
      const long = ready.filter((v) => Number.isFinite(v.duration) && v.duration > 120).sort((a, b) => Number(a.paused) - Number(b.paused) || b.duration - a.duration)[0]
      if (long) return long
      // Streams that don't say how long they are: the biggest one playing, else the one you were
      // watching (paused), else the biggest one on the page.
      const playing = ready.filter((v) => !v.paused && v.videoWidth > 0).sort((a, b) => size(b) - size(a))[0]
      if (playing) return playing
      if (last && ready.includes(last)) return last
      return ready.filter((v) => v.isConnected && v.videoWidth > 0).sort((a, b) => size(b) - size(a))[0] || null
    }
    last = pick()
    return last
  }

  const episodeLines = new Map()
  const visible = (el) => el.getClientRects().length > 0
  function texts(v) {
    // Each line with how much to trust it. Lines naming an episode compete: only the best one goes
    // to Eclipse, so an episode list elsewhere on the page ("S1 E1: Pilot") can't win.
    const lines = []
    const add = (t, score) => {
      if (!t || t.length > 200) return
      const had = lines.find((l) => l.t === t)
      if (had) had.score = Math.max(had.score, score)
      else lines.push({ t, score, at: lines.length })
    }
    const site = SITES.find(([host]) => host.test(location.hostname))
    // Each selector's lines, nearest the video first.
    for (const sel of site ? site[1] : []) {
      const els = all(sel).filter((el) => !skipped(el))
      // When some sit beside the video, the rest belong to another player: leave them out.
      const beside = els.some((el) => nearness(el, v) >= 2)
      for (const el of els) if (!beside || nearness(el, v) >= 2) add(text(el), 4 + nearness(el, v))
    }
    try {
      const m = navigator.mediaSession && navigator.mediaSession.metadata
      if (m) [m.title, m.artist, m.album].forEach((t) => add((t || '').trim(), 3))
    } catch {
      // No media session.
    }
    add(document.title.trim(), 3)
    // The smallest bits of text that name an episode (not the big containers around them), on
    // screen and beside the video first.
    for (const el of all(GENERIC)) {
      if (el.children.length > 3) continue
      const t = text(el)
      if (t.length >= 4 && t.length <= 150 && EPISODE.test(t) && !skipped(el)) add(t, (visible(el) ? 2 : 0) + (v && el.getRootNode() === v.getRootNode() ? 0.5 : 0))
      if (lines.length >= 40) break
    }
    const named = lines.filter((l) => EPISODE.test(l.t)).sort((a, b) => b.score - a.score || a.at - b.at)
    // The episode lines go with the page's address (Disney+ gives each episode its own): when the
    // player hides them (controls tucked away, the end-of-episode screen), keep using the last one
    // seen on this address. A line only hidden away on the page (NOW's episode guide, "S3 E1 ...")
    // never names the episode by itself: during an advert before the next one it's all there is.
    const here = location.href.split('?')[0]
    let best = null
    if (named[0] && named[0].score >= 2) episodeLines.set(here, (best = named[0].t))
    else if (episodeLines.has(here)) best = episodeLines.get(here)
    const out = lines.filter((l) => !EPISODE.test(l.t)).map((l) => l.t)
    if (best) out.splice(Math.min(1, out.length), 0, best)
    return out.filter(Boolean).slice(0, 12)
  }

  // ---- Where you are in the episode ----
  // Some players (Disney+) count the video's own time from when it loaded, not the episode's, so a
  // skip doesn't show. The player's progress bar and time labels know the real place: read those
  // when they're there, and while the controls are hidden carry on from the last reading by how
  // far the video has played since.
  const clockSecs = (t) => {
    const m = /(-)?\s*(?:(\d+):)?(\d{1,2}):(\d{2})/.exec(t || '')
    return m ? Number(m[2] || 0) * 3600 + Number(m[3]) * 60 + Number(m[4]) : null
  }
  const label = (el) => `${el.getAttribute('aria-label') || ''} ${typeof el.className === 'string' ? el.className : ''} ${el.getAttribute('data-testid') || ''}`
  const NOT_PROGRESS = /volume|audio|sound|brightness|speed|subtitle|caption/i

  function fromControls() {
    let bar = null
    for (const el of all('[role="slider"], [role="progressbar"], input[type="range"], progress')) {
      if (NOT_PROGRESS.test(label(el))) continue
      const max = Number(el.getAttribute('aria-valuemax') ?? el.max)
      const now = Number(el.getAttribute('aria-valuenow') ?? el.value)
      if (!(max > 0) || !(now >= 0) || now > max) continue
      if (!bar || max > bar.max) bar = { el, max, now }
    }
    // "1:02 of 21:30" on the bar itself is the clearest of all.
    const vt = bar && bar.el.getAttribute('aria-valuetext')
    const pair = vt && /(\d+(?::\d{2}){1,2}).*?(?:of|\/)\s*(\d+(?::\d{2}){1,2})/.exec(vt)
    if (pair) return { position: clockSecs(pair[1]), duration: clockSecs(pair[2]) }
    // Time labels: what's left ("20:08", "-20:08"), how far in, how long.
    let left = null
    let at = null
    let total = null
    for (const el of all('[class*="time" i], [data-testid*="time" i], [class*="remaining" i], [class*="elapsed" i], [class*="duration" i]')) {
      if (el.children.length > 2) continue
      const t = (el.textContent || '').trim()
      // "0:00:26 / 0:35:40" (NOW): how far in and how long, together.
      const both = /^((?:\d+:)?\d{1,2}:\d{2})\s*(?:\/|of)\s*((?:\d+:)?\d{1,2}:\d{2})$/.exec(t)
      if (both) {
        at = clockSecs(both[1])
        total = clockSecs(both[2])
        continue
      }
      if (!/^-?\s*(\d+:)?\d{1,2}:\d{2}$/.test(t)) continue
      const kind = label(el)
      if (/remain|left/i.test(kind) || t.startsWith('-')) left = clockSecs(t)
      else if (/duration|total/i.test(kind)) total = clockSecs(t)
      else if (/elapsed|current|position/i.test(kind)) at = clockSecs(t)
      else if (left == null) left = clockSecs(t)
    }
    if (bar) {
      // Seconds, or milliseconds for very big numbers; 0 to 1 or 0 to 100 is a fraction.
      if (bar.max > 100 || (bar.max === 100 && total == null && left == null && at == null)) {
        const scale = bar.max > 6 * 3600 ? 1000 : 1
        if (bar.max > 100) return { position: bar.now / scale, duration: bar.max / scale }
      }
      const f = bar.now / bar.max
      if (total != null) return { position: total * f, duration: total }
      if (left != null && f < 1) return { position: (left / (1 - f)) * f, duration: left / (1 - f) }
      if (at != null && f > 0) return { position: at, duration: at / f }
    }
    if (at != null && total != null) return { position: at, duration: total }
    if (at != null && left != null) return { position: at, duration: at + left }
    return null
  }

  let anchor = null
  function where(v) {
    const ui = fromControls()
    if (ui && ui.duration > 60 && ui.position >= 0 && ui.position <= ui.duration + 5) {
      anchor = { v, url: location.href.split('?')[0], offset: ui.position - v.currentTime, duration: ui.duration }
      return { position: ui.position, duration: ui.duration, from: 'player' }
    }
    // The last reading counts only for the same episode: the next one can reuse the same video.
    if (anchor && anchor.v === v && anchor.url === location.href.split('?')[0]) return { position: Math.max(0, Math.min(anchor.duration, v.currentTime + anchor.offset)), duration: anchor.duration, from: 'player' }
    const finite = (n) => (Number.isFinite(n) ? n : null)
    return { position: finite(v.currentTime), duration: finite(v.duration), from: 'video' }
  }

  function write() {
    try {
      known = openRoots()
      const list = videos()
      const v = video(list)
      const w = v ? where(v) : null
      const report = v ? { url: location.href, texts: texts(v), position: w.position, duration: w.duration, timeFrom: w.from, paused: v.paused, ended: v.ended } : null
      // What it looked at, for the popup when nothing's found.
      const seen = list.map((x) => `${x.readyState}/${Number.isFinite(x.duration) ? Math.round(x.duration) : String(x.duration)}/${x.paused ? 'paused' : 'playing'}`)
      document.documentElement.dataset.eclipse = JSON.stringify({ report, seen, roots: known.length })
    } catch {
      // Try again next time.
    }
  }
  setInterval(write, 2000)
})()
