import type { Library, LibraryEntry, TitleDetails } from './types'
import { episodeKey, parseEpisodeKey } from './types'
import { activeEntry, currentRewatch, sessionIsOn, setEpisodes, tickWith, watchesWith } from './library'
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

/** "S2 E4", "S2:E4", "s02e04", "S2 Ep4", "Season 2 Episode 4", "Series 2, Episode 4" (iPlayer), "2x04". */
export function parseEpisode(text: string): { season: number; episode: number } | null {
  const patterns = [
    /\bS(\d{1,2})\s*[:.\- ]?\s*E(?:p\.?\s*)?(\d{1,3})\b/i,
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
 * words. Very short names (under 4 letters) must be the whole title, or one whole part of it
 * ("Ted · S1 E4"), so "It" doesn't match everything.
 */
export function matchTitle(text: string, library: Library, types: ('tv' | 'movie')[] = ['tv']): LibraryEntry | null {
  const t = ` ${norm(text)} `
  const parts = new Set(text.split(' · ').map((p) => norm(cleanTitle(p))))
  let best: LibraryEntry | null = null
  let bestLen = 0
  for (const e of Object.values(library.entries)) {
    if (!types.includes(e.type)) continue
    const n = norm(e.title.name)
    if (!n) continue
    const hit = n.length < 4 ? t.trim() === n || parts.has(n) : t.includes(` ${n} `)
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
  /**
   * Where it can be ticked: a watch with someone ("Sam"), or your own progress (null), leaving out
   * the ones that already have it. Missing on suggestions saved before watches with someone counted.
   */
  targets?: TickTarget[]
}

/** One place an episode can be ticked: a watch with someone, or your own progress (with: null). */
export interface TickTarget {
  with: string | null
}

const ticked = (e: LibraryEntry | undefined, k: string): boolean => !!e?.episodes?.[k]

/**
 * Your own progress is in play when there's no watch with someone, or you're properly watching it
 * yourself too: your own rewatch, or Watching with ticks of your own. A show you've seen and are
 * now rewatching with Sam is Sam's watch only.
 */
function ownInPlay(raw: LibraryEntry): boolean {
  if (!watchesWith(raw).length || currentRewatch(raw)) return true
  return raw.status === 'watching' && Object.keys(raw.episodes ?? {}).length > 0
}

const lastTick = (episodes: Record<string, string> | undefined): string => Object.values(episodes ?? {}).reduce((a, d) => (d > a && d !== 'seen' ? d : a), '')

/** Where an episode could still be ticked: each watch with someone without it, then your own. */
export function tickTargets(raw: LibraryEntry, k: string): TickTarget[] {
  const out: TickTarget[] = watchesWith(raw)
    .filter(({ watch }) => !watch.episodes?.[k])
    .map(({ watch }) => ({ with: watch.with }))
  if (ownInPlay(raw) && !ticked(activeEntry(raw), k)) out.push({ with: null })
  return out
}

/**
 * Whose progress to guess the next episode from, when the title doesn't name it: a watch with
 * someone whose arranged time is now, then your own progress, then the watch with someone you
 * ticked most recently.
 */
export function guessFrom(raw: LibraryEntry, at: Date): LibraryEntry {
  const watches = watchesWith(raw)
  const view = (w: (typeof watches)[number]): LibraryEntry => ({ ...raw, status: 'watching', episodes: w.watch.episodes ?? {} })
  const on = watches.find((w) => sessionIsOn(w.watch, at))
  if (on) return view(on)
  if (!watches.length || ownInPlay(raw)) return activeEntry(raw)!
  const latest = [...watches].sort((a, b) => (lastTick(b.watch.episodes) || b.watch.startedOn).localeCompare(lastTick(a.watch.episodes) || a.watch.startedOn))[0]
  return view(latest)
}

/**
 * A saved suggestion as it stands now: where it can still be ticked, or null when nowhere. Guessed
 * episodes (saved by earlier versions) are dropped: Eclipse only asks about episodes it was told.
 */
export function refreshSuggestion(s: Suggestion, library: Library): Suggestion | null {
  const raw = library.entries[s.key]
  if (!raw || !s.sure) return null
  const targets = tickTargets(raw, episodeKey(s.season, s.episode))
  return targets.length ? { ...s, targets } : null
}

/**
 * Ticks a suggestion on the day it was watched: on the watch with the person named, or your own
 * progress with null. With nothing named, the first place it can go.
 */
export function tickSuggestion(library: Library, s: Suggestion, who?: string | null): Library {
  const now = refreshSuggestion(s, library)
  if (!now) return library
  const target = who === undefined ? now.targets![0] : now.targets!.find((t) => (t.with ?? '').toLowerCase() === (who ?? '').toLowerCase())
  if (!target) return library
  const e = library.entries[s.key]
  const k = episodeKey(s.season, s.episode)
  const when = new Date(`${s.day}T21:00:00`)
  if (target.with === null) return setEpisodes(library, { key: e.key, type: e.type, id: e.id, title: e.title }, [k], true, when)
  const w = watchesWith(e).find((x) => x.watch.with === target.with)
  return w ? tickWith(library, e.key, w.index, [k], true, when) : library
}

/**
 * What a "Not this" is recorded as: the id for one from browser history (or saved before this
 * was kept apart), the id with "#playing" for one the player saw finish. A no to a guess from
 * history isn't a no to the episode the player later names and sees to the end.
 */
export const noKey = (s: Pick<Suggestion, 'id' | 'source'>): string => (s.source === 'playing' ? `${s.id}#playing` : s.id)

/**
 * Adds new suggestions to the saved ones, leaving out any still being asked about or said no to.
 * Guesses saved by earlier versions (never shown any more) are dropped. A finish the player saw
 * replaces one from history that you said no to.
 */
export function mergeSuggestions(saved: Suggestion[], found: Suggestion[], dismissed: string[]): { suggestions: Suggestion[]; fresh: Suggestion[] } {
  const no = new Set(dismissed)
  let kept = saved.filter((x) => x.sure)
  const fresh: Suggestion[] = []
  for (const x of found) {
    if (no.has(noKey(x)) || fresh.some((y) => y.id === x.id)) continue
    const had = kept.find((y) => y.id === x.id)
    if (had && !no.has(noKey(had))) continue
    kept = kept.filter((y) => y.id !== x.id)
    fresh.push(x)
  }
  return { suggestions: [...kept, ...fresh], fresh }
}

/**
 * From browser visits to streaming players: one suggestion per episode the page title names, on
 * the day it was played. Titles that don't name the episode (Disney+, NOW) are left to the Chrome
 * extension, which reads it from the player: guessing "the next one" from history ticked the wrong
 * episodes. Already-ticked and dismissed ones are left out.
 */
export function suggestFromVisits(visits: Visit[], library: Library, dismissed: Set<string>): Suggestion[] {
  const out: Suggestion[] = []
  for (const v of [...visits].sort((a, b) => a.at - b.at)) {
    const svc = serviceOf(v.url)
    if (!svc?.playing) continue
    const clean = cleanTitle(v.title)
    const raw = library.entries[matchTitle(clean, library)?.key ?? '']
    const ep = raw ? parseEpisode(clean) : null
    if (!raw || !ep) continue
    const k = episodeKey(ep.season, ep.episode)
    const id = `${raw.key}@${k}`
    const targets = tickTargets(raw, k)
    if (!targets.length || dismissed.has(id) || out.some((s) => s.id === id)) continue
    out.push({ id, key: raw.key, name: raw.title.name, season: ep.season, episode: ep.episode, day: v.day, source: 'history', service: svc.service.name, url: v.url, sure: true, targets })
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

/** What the Eclipse extension for Chrome sends while a player is open (see extension/). */
export interface ExtensionReport {
  url: string
  /** What the page says is playing, best first: the player's own title lines, the media session (what Chrome shows in its media controls), the tab title. */
  texts: string[]
  position: number | null
  duration: number | null
  paused: boolean
  ended?: boolean
}

/**
 * Checks and tidies a report from the extension. Only streaming sites count; text is trimmed and
 * capped so a strange page can't flood Eclipse.
 */
export function fromExtension(raw: unknown): NowPlaying | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<ExtensionReport>
  if (typeof r.url !== 'string' || !/^https:\/\//.test(r.url)) return null
  const svc = serviceOf(r.url)
  if (!svc) return null
  const seen = new Set<string>()
  const texts: string[] = []
  for (const t of Array.isArray(r.texts) ? r.texts : []) {
    if (typeof t !== 'string') continue
    const clean = t.replace(/\s+/g, ' ').trim().slice(0, 200)
    if (clean && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase())
      texts.push(clean)
    }
    if (texts.length >= 12) break
  }
  if (!texts.length) return null
  const num = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null)
  const duration = num(r.duration)
  const position = num(r.position)
  return {
    app: `Chrome extension (${svc.service.name})`,
    title: texts.join(' · '),
    status: r.ended ? 'stopped' : r.paused ? 'paused' : 'playing',
    position: position != null && duration != null ? Math.min(position, duration) : position,
    duration: duration && duration > 0 ? duration : null,
    url: r.url
  }
}

/** Works out which of your shows (or films) is playing, and which episode. */
export function recognise(np: NowPlaying, library: Library, details: Record<string, TitleDetails>, today: string, now: Date = new Date()): Recognised | null {
  // Each part cleaned on its own: a site's ending (" - NOW") would otherwise take the rest with it.
  const text = [np.title, np.artist, np.album]
    .filter(Boolean)
    .flatMap((s) => s!.split(' · '))
    .map((s) => cleanTitle(s))
    .filter(Boolean)
    .join(' · ')
  const hit = matchTitle(text, library, ['tv', 'movie'])
  if (!hit) return null
  const e = guessFrom(hit, now)
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

// ---- Something playing that isn't in your library ----

export interface UnknownShow {
  /** The show's name as the player gave it: "Family Guy". */
  name: string
  season: number
  episode: number
  service: string | null
}

/**
 * A show the player names, with the episode, that isn't in your library: from the Chrome extension
 * (or anything else that gives a streaming address), so it's really a player and not a page you're
 * browsing. The name is the first line that isn't the episode ("Family Guy", then "S24:E1 ...").
 */
export function unknownShow(np: NowPlaying, library: Library): UnknownShow | null {
  if (!np.url) return null
  const svc = serviceOf(np.url)
  if (!svc) return null
  const parts = np.title.split(' · ').map((t) => cleanTitle(t))
  const ep = parseEpisode(parts.join(' · '))
  if (!ep || matchTitle(parts.join(' · '), library, ['tv', 'movie'])) return null
  const name = parts.find((t) => !parseEpisode(t) && t.length >= 2 && t.length <= 80 && !SERVICES.some((x) => x.name.toLowerCase() === t.toLowerCase()))
  return name ? { name, season: ep.season, episode: ep.episode, service: svc.service.name } : null
}

/** The TMDB show that a name from a player means: the most popular one with exactly that name, else the top result. */
export function pickShow<T extends { type: string; name: string; popularity: number }>(name: string, results: T[]): T | null {
  const shows = results.filter((r) => r.type === 'tv')
  const exact = shows.filter((r) => norm(r.name) === norm(name)).sort((a, b) => b.popularity - a.popularity)
  return exact[0] ?? shows[0] ?? null
}

/** "Andor S2 E4, 31 minutes in" */
export function playingLine(r: Recognised): string {
  // Only an episode the player named: a guess ("the next one") would be shown as fact.
  const ep = r.season && r.sure ? ` S${r.season} E${r.episode}` : ''
  const m = r.position != null ? Math.floor(r.position / 60) : null
  const mins = m != null ? `, ${m} minute${m === 1 ? '' : 's'} in` : ''
  return `${r.name}${ep}${mins}`
}

/**
 * Follows playback between checks and says when something finished: it reached the credits while you watched, or it was already there when it stopped or moved on (the
 * credits, then the next episode). Stopping anywhere earlier doesn't count: you haven't finished it.
 */
export function finished(prev: Recognised | null, now: Recognised | null): Recognised | null {
  if (!prev || prev.duration == null || prev.position == null || prev.duration < 300) return null
  const same = !!now && now.key === prev.key && now.season === prev.season && now.episode === prev.episode && (now.position ?? 0) >= (prev.position ?? 0) - 30
  if (same) return !atCredits(prev) && atCredits(now!) ? now : null
  // Stopped or moved on: it counts only from the credits (repeat reports are dropped by id).
  return atCredits(prev) ? prev : null
}

/**
 * In the credits: the last 10% or the last 3 minutes. NOW and Disney+ can start the credits (and
 * the next episode) with 4 or 5 minutes still to run, so the last 5% missed them.
 */
export function atCredits(r: Recognised): boolean {
  return r.duration != null && r.position != null && (r.position >= r.duration * 0.9 || r.duration - r.position <= 180)
}

/**
 * One step of following playback, for finishes: what finished, and what to follow next. While the
 * player's tab moves to the next episode's address, something that only names the show (the
 * window title, Windows' media controls) fills the gap with a guess at the episode. That guess
 * can't say which episode finished, so the last episode the player named is kept until it names
 * another or everything stops.
 */
export function followPlayback(followed: Recognised | null, now: Recognised | null): { done: Recognised | null; followed: Recognised | null } {
  if (now && !now.sure && now.type === 'tv' && followed?.sure && followed.key === now.key) return { done: null, followed }
  // The player names an episode that's already in its credits (Eclipse opened then, or you skipped
  // to the end): that's a finish too.
  const arrived = !!now?.sure && !(followed?.sure && followed.key === now.key && followed.season === now.season && followed.episode === now.episode)
  const done = finished(followed, now) ?? (arrived && now!.duration != null && now!.duration >= 300 && atCredits(now!) ? now : null)
  return { done, followed: now }
}

/**
 * A suggestion from the player, for the day it actually played (after midnight still counts as that
 * evening when late). Null when it's a film, the player didn't say which episode, or it's already
 * ticked everywhere it could go.
 */
export function suggestionFromPlaying(r: Recognised, day: string, library: Library): Suggestion | null {
  if (r.type !== 'tv' || !r.season || !r.episode || !r.sure) return null
  const s: Suggestion = { id: `${r.key}@${episodeKey(r.season, r.episode)}`, key: r.key, name: r.name, season: r.season, episode: r.episode, day, source: 'playing', service: r.service, url: null, sure: r.sure }
  return refreshSuggestion(s, library)
}

/** "with Sam" when a suggestion can only go on one watch with someone; "" otherwise. */
export function suggestionWith(s: Suggestion): string {
  return s.targets?.length === 1 && s.targets[0].with ? `with ${s.targets[0].with}` : ''
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

