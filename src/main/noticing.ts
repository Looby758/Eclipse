import { log, report as reportHealth } from './health'
import { app, globalShortcut, Notification } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { localDate, preferencesOf } from '@core/library'
import { bedtimeTonight, tonightStart } from '@core/time'
import { episodeKey, type Library, type SearchResult, type TitleDetails } from '@core/types'
import {
  addMoment,
  atCredits,
  bedtimeWarning,
  followPlayback,
  formatAt,
  learnLinks,
  mergeSuggestions,
  playingLine,
  recognise,
  refreshSuggestion,
  showPagesFromVisits,
  suggestFromVisits,
  suggestionFromPlaying,
  tickSuggestion,
  pickShow,
  unknownShow,
  type UnknownShow,
  type NowPlaying,
  type Recognised,
  type Suggestion
} from '@core/watching'
import type { NoticingStatus, NoticingSettings } from '@shared/api'
import { loadSettings, saveSettings } from './settings'
import { getLibrary, saveLibrary } from './library'
import * as tmdb from './tmdb'
import { browsers, streamingVisits } from './history'
import { nowPlaying, startNowPlaying, stopNowPlaying } from './nowplaying'
import { extensionLink, startExtensionLink, stopExtensionLink } from './extension'
import { discordOn, setDiscord, updateDiscord } from './discord'
import type { DiscordStatus } from '@shared/api'

/**
 * Group B (Phases 27 to 30) in the main process: reads browser history and what's playing, turns
 * them into "Tick Andor S2 E4?" suggestions (never ticking anything by itself), warns about bedtime
 * and saves bookmarked moments. Suggestions and what you said no to are kept per computer.
 */

const MOMENT_KEY = 'CommandOrControl+Alt+B'
const file = (): string => join(app.getPath('userData'), 'noticing.json')

interface Saved {
  suggestions: Suggestion[]
  dismissed: string[]
  /** Shows you said aren't yours to track ("Not mine"), by lower-case name. */
  notMine?: string[]
}

let saved: Saved | null = null
let lastScan: { at: number; browsers: string[]; errors: string[]; visits: number } | null = null
let current: Recognised | null = null
/** The episode being followed for finishes: the last one the player named (see followPlayback). */
let followed: Recognised | null = null
let warned = ''
let details: Record<string, TitleDetails> = {}
let detailsAt = 0
let hooks = { changed: () => undefined as void, show: () => undefined as void, libraryChanged: () => undefined as void }
let scanTimer: NodeJS.Timeout | null = null
/** Something playing that isn't in your library, and the TMDB show it most likely is. */
let unknown: { show: UnknownShow; match: SearchResult | null; at: number } | null = null
let lookingUp = ''

function load(): Saved {
  if (saved) return saved
  try {
    const raw = existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : {}
    const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((y: unknown): y is string => typeof y === 'string') : [])
    saved = { suggestions: Array.isArray(raw.suggestions) ? raw.suggestions : [], dismissed: strings(raw.dismissed), notMine: strings(raw.notMine) }
  } catch {
    saved = { suggestions: [], dismissed: [] }
  }
  return saved
}

function store(next: Saved): void {
  saved = { suggestions: next.suggestions.slice(-200), dismissed: next.dismissed.slice(-3000), notMine: (next.notMine ?? []).slice(-500) }
  writeFileSync(`${file()}.tmp`, JSON.stringify(saved), 'utf8')
  renameSync(`${file()}.tmp`, file())
  hooks.changed()
}

export function settings(): NoticingSettings {
  const s = loadSettings()
  return { history: !!s.noticeHistory, playing: !!s.noticePlaying, bedtime: !!s.bedtimeGuard }
}

/**
 * Suggestions still worth asking about: not said no to, and still unticked somewhere it could go
 * (your own progress, or a watch with someone), with those places listed.
 */
function pending(lib: Library = getLibrary()): Suggestion[] {
  const { suggestions, dismissed } = load()
  const no = new Set(dismissed)
  return suggestions.filter((s) => !no.has(s.id)).flatMap((s) => refreshSuggestion(s, lib) ?? [])
}

function addSuggestions(found: Suggestion[]): Suggestion[] {
  const s = load()
  const merged = mergeSuggestions(s.suggestions, found, s.dismissed)
  if (merged.suggestions.length !== s.suggestions.length) store({ ...s, suggestions: merged.suggestions })
  return merged.fresh
}

function notify(title: string, body: string, onClick?: () => void): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body, silent: false })
  if (onClick) n.on('click', onClick)
  n.show()
}

async function showDetails(lib: Library): Promise<Record<string, TitleDetails>> {
  if (Date.now() - detailsAt < 30 * 60_000 && Object.keys(details).length) return details
  if (!tmdb.hasKey()) return details
  // Shows you're watching, want to, or are watching again (on your own or with someone).
  const keys = Object.values(lib.entries)
    .filter((e) => e.type === 'tv' && (e.status === 'watching' || e.status === 'want' || (e.rewatches ?? []).some((r) => !r.finishedOn)))
    .map((e) => e.key as string)
  details = { ...details, ...(await tmdb.detailsMany(keys)) }
  detailsAt = Date.now()
  return details
}

const trySave = (lib: Library): boolean => {
  try {
    saveLibrary(lib)
    return true
  } catch {
    return false // Read-only while open on the other computer: try again next time.
  }
}

// ---- Phase 27: browser history ----

export async function scanHistory(): Promise<void> {
  if (!settings().history) return
  const s = loadSettings()
  const since = s.historySince ?? Date.now() - 14 * 86_400_000
  const result = await streamingVisits(since)
  const lib = getLibrary()
  const found = suggestFromVisits(result.visits, lib, new Set(load().dismissed))
  const fresh = addSuggestions(found).length
  // Learn where each show is watched, for "Play next".
  let next = getLibrary()
  for (const p of showPagesFromVisits(result.visits, next)) next = learnLinks(next, p.key, p.url)
  if (next !== getLibrary() && trySave(next)) hooks.libraryChanged()
  const latest = Math.max(since, ...result.visits.map((v) => v.at))
  saveSettings({ historySince: latest + 1 })
  lastScan = { at: Date.now(), browsers: result.browsers, errors: result.errors, visits: result.visits.length }
  const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`
  if (!result.browsers.length && result.errors.length) reportHealth('history', false, `Couldn't read browser history: ${result.errors.join('; ')}`)
  else if (!result.browsers.length) reportHealth('history', false, 'No Chrome, Edge or Opera history found on this computer')
  else reportHealth('history', true, `Checked ${result.browsers.join(', ')}, found ${plural(fresh, 'episode')}${result.errors.length ? ` (${result.errors.join('; ')})` : ''}`)
  hooks.changed()
}

// ---- Phase 28 and 29: what's playing ----

let playingReported = 0

async function onPlaying(): Promise<void> {
  const report = nowPlaying()
  if (report.error) reportHealth('playing', false, report.error)
  else if (Date.now() - playingReported > 5 * 60_000) {
    playingReported = Date.now()
    reportHealth('playing', true, report.items.length ? `Watching: ${report.items.length} thing${report.items.length === 1 ? '' : 's'} reported` : 'Watching: nothing playing')
  }
  const lib = getLibrary()
  const d = await showDetails(lib)
  // Phase 44 can be on without the rest of "What's playing": then it only sets the Discord status.
  const noticing = settings().playing
  const today = localDate(new Date())
  // Prefer a media session that's playing, then any media session, then browser windows.
  // The Chrome extension first, playing or paused: it names the episode. Then a media session
  // that's playing, then any media session, then browser windows (which only name the show).
  const order = (n: NowPlaying): number => (n.app.startsWith('Chrome extension') ? (n.status === 'playing' ? -2 : -1) : n.position != null && n.status === 'playing' ? 0 : n.position != null ? 1 : 2)
  const now = [...report.items].sort((a, b) => order(a) - order(b)).map((n) => ({ n, r: recognise(n, lib, d, today, new Date()) })).find((x) => x.r)
  const next = now?.r ?? null
  updateDiscord(next, next ? lib.entries[next.key]?.title.posterPath : null)
  if (!noticing) {
    const moved = JSON.stringify(next) !== JSON.stringify(current)
    current = next
    followed = null
    if (moved) hooks.changed()
    return
  }
  if (!next) void noticeUnknown(report.items, lib)
  if (unknown && ((unknown.match && lib.entries[unknown.match.key]) || Date.now() - unknown.at > 12 * 3_600_000)) {
    unknown = null
    hooks.changed()
  }
  const step = followPlayback(followed, next)
  recordPlaying(now?.n ?? null, next, step.done)
  followed = step.followed
  const done = step.done
  if (done) {
    const s = suggestionFromPlaying(done, eveningDay(new Date()), getLibrary())
    // No notification: it waits on Home for when you're back in Eclipse.
    if (!s) log('[playing] not asked: a film, no episode named, or already ticked')
    else if (addSuggestions([s]).length) log(`[playing] asking about ${s.name} S${s.season}E${s.episode} on Home`)
    else log(`[playing] not asked again: ${s.name} S${s.season}E${s.episode} was already asked about, or you said no to it`)
  }
  // Phase 31: on a Mac, the tab's address teaches where the show is watched.
  if (now?.n.url && next) {
    const learnt = learnLinks(getLibrary(), next.key, now.n.url)
    if (learnt !== getLibrary() && trySave(learnt)) hooks.libraryChanged()
  }
  if (next && settings().bedtime) {
    const id = `${next.key}@${next.season}:${next.episode}`
    const prefs = preferencesOf(lib)
    const warning = id !== warned ? bedtimeWarning(next, new Date(), bedtimeTonight(new Date(), prefs), tonightStart(new Date(), prefs)) : null
    if (warning) {
      warned = id
      notify('Past bedtime?', warning)
    }
  }
  const changed = JSON.stringify(next) !== JSON.stringify(current)
  current = next
  if (changed) hooks.changed()
}

// A record of what the player said, in the log (Settings → Is everything working? → Copy details),
// to see why an episode wasn't offered: each new episode with what the player reported, where it
// was once a minute, when it reached the credits, and what finished.
let recorded = { id: '', at: 0, credits: false }
const clock = (s: number | null): string => (s == null ? '?' : formatAt(s))

function recordPlaying(n: NowPlaying | null, r: Recognised | null, done: Recognised | null): void {
  if (done) log(`[playing] finished ${done.name} S${done.season}E${done.episode} at ${clock(done.position)} of ${clock(done.duration)}${done.sure ? '' : ' (episode guessed, not asked)'}`)
  if (!r || !n) {
    if (recorded.id) log('[playing] nothing playing')
    recorded = { id: '', at: 0, credits: false }
    return
  }
  const id = `${r.key}@${r.season}:${r.episode}`
  const where = `${clock(r.position)} of ${clock(r.duration)}, ${r.playing ? 'playing' : 'paused'}`
  const credits = atCredits(r)
  if (id !== recorded.id) {
    log(`[playing] ${r.name} S${r.season ?? '?'}E${r.episode ?? '?'}${r.sure ? '' : ' (guessed)'} at ${where}, from ${n.app}: ${n.title}${n.url ? ` (${n.url.split('?')[0]})` : ''}`)
    recorded = { id, at: Date.now(), credits }
  } else if (credits && !recorded.credits) {
    log(`[playing] credits at ${where}`)
    recorded = { ...recorded, at: Date.now(), credits }
  } else if (Date.now() - recorded.at >= 60_000) {
    log(`[playing] ${where}`)
    recorded = { ...recorded, at: Date.now() }
  }
}

/** Something's playing that isn't in your library: find which show it is, and ask once whether to add it. */
async function noticeUnknown(items: NowPlaying[], lib: Library): Promise<void> {
  const no = new Set(load().notMine ?? [])
  const show = items.map((n) => unknownShow(n, lib)).find((u) => u && !no.has(u.name.toLowerCase()))
  if (!show || show.name === unknown?.show.name || show.name === lookingUp) return
  lookingUp = show.name
  let match: SearchResult | null = null
  try {
    if (tmdb.hasKey()) match = pickShow(show.name, (await tmdb.search(show.name)).data)
  } catch {
    // No TMDB right now: still ask, by name.
  } finally {
    lookingUp = ''
  }
  if (match && lib.entries[match.key]) return
  unknown = { show, match, at: Date.now() }
  hooks.changed()
  // No notification: "Add it" waits on Home.
}

/** "Not mine": don't ask about this show again. */
export function notMine(name: string): NoticingStatus {
  const s = load()
  store({ ...s, notMine: [...(s.notMine ?? []), name.toLowerCase()] })
  if (unknown?.show.name.toLowerCase() === name.toLowerCase()) unknown = null
  return noticingStatus()
}

/** The evening it counts as: after midnight but before 5am is still last night. */
function eveningDay(now: Date): string {
  const d = new Date(now)
  if (d.getHours() < 5) d.setDate(d.getDate() - 1)
  return localDate(d)
}

// ---- Phase 30: bookmark a moment ----

function saveMoment(): void {
  const r = current
  if (!r) return notify('Nothing to bookmark', 'Eclipse can’t see one of your shows or films playing right now.')
  const episode = r.type === 'tv' && r.season ? episodeKey(r.season, r.episode!) : null
  const lib = addMoment(getLibrary(), r.key, { episode, at: r.position != null ? Math.round(r.position) : null, savedAt: new Date().toISOString() })
  if (!trySave(lib)) return notify('Not saved', 'Eclipse is read-only here: it’s open on your other computer.')
  hooks.libraryChanged()
  notify('Moment saved', `${r.name}${episode ? ` S${r.season} E${r.episode}` : ''} at ${formatAt(r.position)}. Add a note on its page.`, hooks.show)
}

// ---- Switching on and off ----

function apply(): void {
  const s = settings()
  // The Discord status (Phase 44) needs to know what's playing too, even with the rest switched off.
  if (s.playing || discordOn()) {
    startNowPlaying(() => void onPlaying().catch(() => undefined))
    startExtensionLink(() => void onPlaying().catch(() => undefined))
  } else {
    stopNowPlaying()
    stopExtensionLink()
    current = null
    followed = null
  }
  if (s.playing && !globalShortcut.isRegistered(MOMENT_KEY)) globalShortcut.register(MOMENT_KEY, saveMoment)
  else if (!s.playing && globalShortcut.isRegistered(MOMENT_KEY)) globalShortcut.unregister(MOMENT_KEY)
  if (s.history && !scanTimer) {
    setTimeout(() => void scanHistory().catch(() => undefined), 30_000)
    scanTimer = setInterval(() => void scanHistory().catch(() => undefined), 30 * 60_000)
  } else if (!s.history && scanTimer) {
    clearInterval(scanTimer)
    scanTimer = null
  }
}

export function setupNoticing(h: { changed: () => void; show: () => void; libraryChanged: () => void }): void {
  hooks = h
  apply()
}

export function setNoticing(patch: Partial<NoticingSettings>): NoticingStatus {
  const s = loadSettings()
  saveSettings({
    noticeHistory: patch.history ?? s.noticeHistory,
    noticePlaying: patch.playing ?? s.noticePlaying,
    bedtimeGuard: patch.bedtime ?? s.bedtimeGuard,
    // Switching history on looks back two weeks.
    ...(patch.history && !s.noticeHistory ? { historySince: Date.now() - 14 * 86_400_000 } : {})
  })
  apply()
  if (patch.history) void scanHistory().catch(() => undefined)
  return noticingStatus()
}

/** Phase 44: switches the Discord status on or off (Settings, Home or the tray), starting or stopping what's-playing as needed. */
export function changeDiscord(patch: { on?: boolean; appId?: string }): DiscordStatus {
  const out = setDiscord(patch)
  apply()
  // Show it straight away rather than at the next check.
  if (out.on) void onPlaying().catch(() => undefined)
  return out
}

export function noticingStatus(): NoticingStatus {
  const report = nowPlaying()
  return {
    settings: settings(),
    browsers: browsers().map((b) => b.name),
    lastScan,
    playing: { raw: report.items, error: report.error, recognised: current, line: current ? playingLine(current) : null },
    suggestions: pending(),
    extension: extensionLink(),
    unknown: unknown ? { ...unknown.show, match: unknown.match } : null,
    momentKey: process.platform === 'darwin' ? '⌘⌥B' : 'Ctrl+Alt+B'
  }
}

/**
 * Ticks a suggestion on the day it was watched, on the watch with `who` (or your own progress with
 * null; the first place it can go when not given), and remembers where it was played.
 */
export function acceptSuggestion(id: string, who?: string | null): Library {
  const s = pending().find((x) => x.id === id)
  let lib = getLibrary()
  if (!s) return lib
  const ticked = tickSuggestion(lib, s, who)
  if (ticked === lib) return lib
  lib = ticked
  if (s.url) lib = learnLinks(lib, s.key, s.url)
  const out = saveLibrary(lib)
  hooks.changed()
  return out
}

export function dismissSuggestion(id: string): void {
  const s = load()
  store({ ...s, dismissed: [...s.dismissed, id] })
}

export function stopNoticing(): void {
  stopNowPlaying()
  stopExtensionLink()
  globalShortcut.unregisterAll()
}
