import type { Library, LibraryEntry, TitleDetails } from './types'
import { episodeKey, parseEpisodeKey } from './types'
import { activeEntry } from './library'
import { remainingEpisodes } from './watchsoon'

/**
 * Group B: noticing what you watch. The shared, testable part: which streaming service a web
 * address belongs to, which of your shows a page or player title is about, which episode, and what
 * to suggest ticking. Nothing here reads your computer; src/main does that and passes the text in.
 */

// ---- Services ----

export interface StreamingService {
  id: string
  name: string
  hosts: RegExp
  /** Addresses of the player itself (as opposed to a show's page). */
  play: RegExp
  /** Endings the site adds to page titles: " | Disney+", " - NOW". */
  suffix: RegExp
}

export const SERVICES: StreamingService[] = [
  { id: 'disney', name: 'Disney+', hosts: /(^|\.)disneyplus\.com$/, play: /\/(play|video)\//, suffix: /\s*[|–-]\s*Disney\+.*$/i },
  { id: 'nowtv', name: 'NOW', hosts: /(^|\.)nowtv\.com$|(^|\.)now\.com$/, play: /\/(playback|watch\/playback|play)\b/, suffix: /\s*[|–-]\s*NOW( TV)?.*$/i },
  { id: 'netflix', name: 'Netflix', hosts: /(^|\.)netflix\.com$/, play: /\/watch\//, suffix: /\s*[|–-]\s*Netflix.*$/i },
  { id: 'prime', name: 'Prime Video', hosts: /(^|\.)primevideo\.com$|(^|\.)amazon\.co\.uk$|(^|\.)amazon\.com$/, play: /\/(detail|dp|gp\/video)\//, suffix: /\s*[|–-]\s*(Prime Video|Amazon).*$/i },
  { id: 'iplayer', name: 'BBC iPlayer', hosts: /(^|\.)bbc\.co\.uk$/, play: /\/iplayer\/episode\//, suffix: /\s*[|–-]\s*BBC iPlayer.*$/i },
  { id: 'itvx', name: 'ITVX', hosts: /(^|\.)itv\.com$/, play: /\/watch\/.+\/.+/, suffix: /\s*[|–-]\s*ITVX.*$/i },
  { id: 'channel4', name: 'Channel 4', hosts: /(^|\.)channel4\.com$/, play: /\/programmes\/.+\/on-demand\//, suffix: /\s*[|–-]\s*(Channel 4|All 4).*$/i },
  { id: 'apple', name: 'Apple TV+', hosts: /(^|\.)tv\.apple\.com$/, play: /\/episode\//, suffix: /\s*[|–-]\s*Apple TV.*$/i },
  { id: 'paramount', name: 'Paramount+', hosts: /(^|\.)paramountplus\.com$/, play: /\/video\//, suffix: /\s*[|–-]\s*Paramount\+.*$/i },
  { id: 'youtube', name: 'YouTube', hosts: /(^|\.)youtube\.com$/, play: /\/watch\b/, suffix: /\s*[|–-]\s*YouTube.*$/i }
]

/** Which service a web address is on, and whether it's the player or a page about a show. */
export function serviceOf(url: string): { service: StreamingService; playing: boolean } | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const service = SERVICES.find((s) => s.hosts.test(u.hostname))
  return service ? { service, playing: service.play.test(u.pathname) } : null
}

/** A page or player title without the site's own bits: "Watch Andor | Disney+" → "Andor". */
export function cleanTitle(title: string): string {
  let t = title.replace(/\s+/g, ' ').trim()
  for (const s of SERVICES) t = t.replace(s.suffix, '')
  // Browser window titles end with the browser's name; a playing tab can start with a sound symbol.
  t = t.replace(/\s*[-–]\s*(Google Chrome|Microsoft​? Edge|Microsoft Edge|Brave|Safari|Firefox|Mozilla Firefox|Opera GX|Opera).*$/i, '')
  t = t.replace(/^(🔊|🔈|\(\d+\))\s*/, '')
  return t.replace(/^(Watch|Stream)\s+/i, '').trim()
}

// ---- Shows and episodes ----

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** "S2 E4", "S2:E4", "s02e04", "Season 2 Episode 4", "Series 2, Episode 4" (iPlayer), "2x04". */
export function parseEpisode(text: string): { season: number; episode: number } | null {
  const patterns = [
    /\bS(\d{1,2})\s*[:.\- ]?\s*E(\d{1,3})\b/i,
    /\b(?:Season|Series)\s*(\d{1,2})\s*[,:\-]?\s*(?:Episode|Ep\.?)\s*(\d{1,3})\b/i,
    /\b(\d{1,2})x(\d{1,3})\b/
  ]
  for (const p of patterns) {
    const m = p.exec(text)
    if (m) return { season: Number(m[1]), episode: Number(m[2]) }
  }
  return null
}

/**
 * The show in your library a title is about: the longest show name that appears in it as whole
 * words. Very short names (under 4 letters) must be the whole title, so "It" doesn't match everything.
 */
export function matchTitle(text: string, library: Library, types: ('tv' | 'movie')[] = ['tv']): LibraryEntry | null {
  const t = ` ${norm(text)} `
  let best: LibraryEntry | null = null
  let bestLen = 0
  for (const e of Object.values(library.entries)) {
    if (!types.includes(e.type)) continue
    const n = norm(e.title.name)
    if (!n) continue
    const hit = n.length < 4 ? t.trim() === n : t.includes(` ${n} `)
    if (hit && n.length > bestLen) {
      best = e
      bestLen = n.length
    }
  }
  return best
}

// ---- Suggestions ("Tick Andor S2 E4?") ----

export interface Visit {
  url: string
  title: string
  /** Local day it happened, YYYY-MM-DD. */
  day: string
  /** Milliseconds since 1970. */
  at: number
}

export interface Suggestion {
  /** "tv:1396@S2E4" */
  id: string
  key: string
  name: string
  season: number
  episode: number
  day: string
  /** Where it came from: browser history or the player. */
  source: 'history' | 'playing'
  service: string | null
  /** The page it was played on, to learn for "Play next". */
  url: string | null
  /** The episode was named in the title, rather than guessed as the next one. */
  sure: boolean
}

const ticked = (e: LibraryEntry | undefined, k: string): boolean => !!e?.episodes?.[k]

/**
 * From browser visits to streaming players: one suggestion per show, per day, per distinct player
 * address (each a separate episode), named episodes as they are, the rest as the next ones you
 * haven't ticked. Already-ticked and dismissed ones are left out.
 */
export function suggestFromVisits(visits: Visit[], library: Library, details: Record<string, TitleDetails>, dismissed: Set<string>, today: string): Suggestion[] {
  const out: Suggestion[] = []
  const planned = new Map<string, Set<string>>()
  const seenPlays = new Set<string>()
  const sorted = [...visits].sort((a, b) => a.at - b.at)
  for (const v of sorted) {
    const svc = serviceOf(v.url)
    if (!svc?.playing) continue
    const clean = cleanTitle(v.title)
    const raw = library.entries[matchTitle(clean, library)?.key ?? '']
    if (!raw) continue
    const e = activeEntry(raw)!
    // The same player address visited again (a reload, coming back to it) is one episode.
    const playId = `${e.key}|${v.url.split('?')[0]}`
    if (seenPlays.has(playId)) continue
    seenPlays.add(playId)
    const plan = planned.get(e.key) ?? new Set<string>()
    planned.set(e.key, plan)
    const named = parseEpisode(clean)
    let ep: { season: number; episode: number } | null = named
    if (!ep) {
      const d = details[e.key]
      if (!d) continue
      const rest = remainingEpisodes(d, e, today).filter((x) => !plan.has(episodeKey(x.season, x.episode)))
      ep = rest[0] ?? null
    }
    if (!ep) continue
    const k = episodeKey(ep.season, ep.episode)
    plan.add(k)
    const id = `${e.key}@${k}`
    if (ticked(e, k) || dismissed.has(id) || out.some((s) => s.id === id)) continue
    out.push({ id, key: e.key, name: e.title.name, season: ep.season, episode: ep.episode, day: v.day, source: 'history', service: svc.service.name, url: v.url, sure: !!named })
  }
  return out
}

// ---- What's playing ----

/** One thing the computer says is playing (Windows' media controls, or a browser tab on a Mac). */
export interface NowPlaying {
  /** The app reporting it: "chrome.exe", "msedge", "Disney.37853FC22B2CE_6rarf9sa4v8jt!App", "Safari". */
  app: string
  title: string
  artist?: string
  album?: string
  status?: 'playing' | 'paused' | 'stopped' | string
  /** Seconds, when known. */
  position?: number | null
  duration?: number | null
  url?: string | null
}

export interface Recognised {
  key: string
  name: string
  type: 'tv' | 'movie'
  season: number | null
  episode: number | null
  /** The episode was named by the player, not guessed. */
  sure: boolean
  service: string | null
  position: number | null
  duration: number | null
  playing: boolean
}

/** Works out which of your shows (or films) is playing, and which episode. */
export function recognise(np: NowPlaying, library: Library, details: Record<string, TitleDetails>, today: string): Recognised | null {
  const text = [np.title, np.artist, np.album].filter(Boolean).map((s) => cleanTitle(s!)).join(' · ')
  const hit = matchTitle(text, library, ['tv', 'movie'])
  if (!hit) return null
  const e = activeEntry(hit)!
  const svc = np.url ? serviceOf(np.url)?.service.name : SERVICES.find((s) => new RegExp(s.id, 'i').test(np.app))?.name
  let ep = e.type === 'tv' ? parseEpisode(text) : null
  const sure = !!ep
  if (!ep && e.type === 'tv' && details[e.key]) ep = remainingEpisodes(details[e.key], e, today)[0] ?? null
  return {
    key: e.key,
    name: e.title.name,
    type: e.type,
    season: ep?.season ?? null,
    episode: ep?.episode ?? null,
    sure,
    service: svc ?? null,
    position: np.position ?? null,
    duration: np.duration ?? null,
    playing: !np.status || np.status === 'playing'
  }
}

/** "Andor S2 E4, 31 minutes in" */
export function playingLine(r: Recognised): string {
  const ep = r.season ? ` S${r.season} E${r.episode}` : ''
  const mins = r.position != null ? `, ${Math.floor(r.position / 60)} minutes in` : ''
  return `${r.name}${ep}${mins}`
}

/**
 * Follows playback between checks and says when something finished: it reached the last 5% (or
 * its last 3 minutes), or it was past 80% when it stopped or switched to something else.
 */
export function finished(prev: Recognised | null, now: Recognised | null): Recognised | null {
  if (!prev || prev.duration == null || prev.position == null || prev.duration < 300) return null
  const same = !!now && now.key === prev.key && now.season === prev.season && now.episode === prev.episode && (now.position ?? 0) >= (prev.position ?? 0) - 30
  const nearEnd = (r: Recognised): boolean => r.duration != null && r.position != null && (r.position >= r.duration * 0.95 || r.duration - r.position <= 180)
  if (same) return !nearEnd(prev) && nearEnd(now!) ? now : null
  // Stopped or moved on: it counts if you'd got most of the way (repeat reports are dropped by id).
  return prev.position >= prev.duration * 0.8 ? prev : null
}

/** A suggestion from the player, for the day it actually played (after midnight still counts as that evening when late). */
export function suggestionFromPlaying(r: Recognised, day: string): Suggestion | null {
  if (r.type !== 'tv' || !r.season || !r.episode) return null
  return { id: `${r.key}@${episodeKey(r.season, r.episode)}`, key: r.key, name: r.name, season: r.season, episode: r.episode, day, source: 'playing', service: r.service, url: null, sure: r.sure }
}

// ---- Bedtime guard (Phase 29) ----

/**
 * When a new episode has just started (in its first two minutes) and finishing it would take you
 * past bedtime: "This one ends at 00:12, 72 minutes past bedtime." Null otherwise.
 */
export function bedtimeWarning(r: Recognised, now: Date, bedtime: string, startTime: string, fallbackMinutes = 45): string | null {
  if (!r.playing || r.position == null || r.position > 120) return null
  const length = r.duration ?? fallbackMinutes * 60
  const ends = new Date(now.getTime() + (length - r.position) * 1000)
  const [bh, bm] = bedtime.split(':').map(Number)
  const [sh] = startTime.split(':').map(Number)
  // Tonight's bedtime: today, or tomorrow when it's after midnight (00:30) and we're still in the evening.
  const bed = new Date(now)
  bed.setHours(bh, bm, 0, 0)
  if (bh < sh && now.getHours() >= sh) bed.setDate(bed.getDate() + 1)
  if (bh >= sh && now.getHours() < 5) bed.setDate(bed.getDate() - 1)
  const over = Math.floor((ends.getTime() - bed.getTime()) / 60000)
  if (over <= 0) return null
  const hhmm = `${String(ends.getHours()).padStart(2, '0')}:${String(ends.getMinutes()).padStart(2, '0')}`
  return `This one ends at ${hhmm}, ${over} minute${over === 1 ? '' : 's'} past bedtime.`
}

// ---- Moments (Phase 30) ----

export interface Moment {
  /** "S5E14", or null for a film. */
  episode: string | null
  /** Seconds in, when known. */
  at: number | null
  note?: string
  savedAt: string
}

export const formatAt = (s: number | null): string => {
  if (s == null) return 'time unknown'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

export function addMoment(library: Library, key: string, m: Moment): Library {
  const e = library.entries[key]
  if (!e) return library
  return { ...library, entries: { ...library.entries, [key]: { ...e, moments: [...(e.moments ?? []), m] } } }
}

export function editMoment(library: Library, key: string, index: number, note: string | null): Library {
  const e = library.entries[key]
  if (!e?.moments?.[index]) return library
  const moments = [...e.moments]
  if (note === null) moments.splice(index, 1)
  else {
    const { note: _old, ...rest } = moments[index]
    void _old
    const text = note.trim().slice(0, 300)
    moments[index] = text ? { ...rest, note: text } : rest
  }
  return { ...library, entries: { ...library.entries, [key]: { ...e, moments } } }
}

export function normalizeMoments(raw: unknown): Moment[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: Moment[] = []
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue
    const x = m as Moment
    if (typeof x.savedAt !== 'string') continue
    const episode = typeof x.episode === 'string' && parseEpisodeKey(x.episode) ? x.episode : null
    const at = typeof x.at === 'number' && x.at >= 0 ? Math.round(x.at) : null
    out.push({ episode, at, savedAt: x.savedAt, ...(typeof x.note === 'string' && x.note.trim() ? { note: x.note.trim().slice(0, 300) } : {}) })
  }
  return out.length ? out : undefined
}

/**
 * Moments in watching order, with the ones past where you are hidden (no spoilers): an episode
 * you haven't ticked, after the furthest one you have.
 */
export function momentsOf(entry: LibraryEntry): { shown: (Moment & { index: number })[]; hidden: number } {
  const all = (entry.moments ?? []).map((m, index) => ({ ...m, index }))
  const order = (k: string | null): number => {
    const p = k ? parseEpisodeKey(k) : null
    return p ? p.season * 10000 + p.episode : 0
  }
  const furthest = Math.max(0, ...Object.keys(activeEntry(entry)?.episodes ?? {}).map(order))
  const sorted = all.sort((a, b) => order(a.episode) - order(b.episode) || (a.at ?? 0) - (b.at ?? 0))
  const shown = sorted.filter((m) => !m.episode || order(m.episode) <= furthest || ticked(activeEntry(entry), m.episode))
  return { shown, hidden: sorted.length - shown.length }
}

// ---- Play next (Phase 31) ----

/** Where you last watched a show, learnt from your history and the player. */
export interface PlayLinks {
  /** The service's page for the show (it has a Continue button). */
  show?: string
  /** The last episode you played there. */
  last?: string
  service?: string
}

export function learnLinks(library: Library, key: string, url: string): Library {
  const e = library.entries[key]
  const svc = serviceOf(url)
  if (!e || !svc) return library
  const links: PlayLinks = { ...(e.links ?? {}), service: svc.service.name }
  if (svc.playing) links.last = url
  else links.show = url
  if (JSON.stringify(links) === JSON.stringify(e.links ?? {})) return library
  return { ...library, entries: { ...library.entries, [key]: { ...e, links } } }
}

export function normalizeLinks(raw: unknown): PlayLinks | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as PlayLinks
  const ok = (u: unknown): u is string => typeof u === 'string' && /^https:\/\//.test(u) && !!serviceOf(u)
  const out: PlayLinks = {}
  if (ok(r.show)) out.show = r.show
  if (ok(r.last)) out.last = r.last
  if (typeof r.service === 'string') out.service = r.service.slice(0, 40)
  return out.show || out.last ? out : undefined
}

/**
 * What "Play next" opens: the show's page on the service you watch it on (its Continue button picks
 * up the next episode), or the last episode you played there. Null until Eclipse has seen you watch it.
 */
export function playTarget(entry: LibraryEntry | undefined): { url: string; label: string } | null {
  const l = entry?.links
  if (!l) return null
  const where = l.service ? ` on ${l.service}` : ''
  if (l.show) return { url: l.show, label: `Continue${where}` }
  if (l.last) return { url: l.last, label: `Continue${where}` }
  return null
}

/** Show pages seen in history: "Andor | Disney+" on a non-player address teaches the show's page. */
export function showPagesFromVisits(visits: Visit[], library: Library): { key: string; url: string }[] {
  const out = new Map<string, string>()
  for (const v of [...visits].sort((a, b) => a.at - b.at)) {
    const svc = serviceOf(v.url)
    if (!svc) continue
    const e = matchTitle(cleanTitle(v.title), library)
    if (!e) continue
    out.set(`${e.key}|${svc.playing ? 'play' : 'show'}`, v.url)
  }
  return [...out.entries()].map(([id, url]) => ({ key: id.split('|')[0], url }))
}

