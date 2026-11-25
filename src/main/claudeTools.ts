import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { ClaudeArea, ClaudeShow } from '@shared/claudeDesktop'
import { CLAUDE_PAGES } from '@shared/claudeDesktop'
import {
  between,
  entryLabel,
  entryLine,
  episodeLabel,
  episodesFor,
  episodesText,
  findInLibrary,
  hoursText,
  keyOf,
  pickFromSearch,
  titleLabel
} from '@core/claude'
import {
  activeEntry,
  countByStatus,
  currentRewatch,
  endRewatch,
  entriesWith,
  localDate,
  nextOutEpisodeFor,
  preferencesOf,
  setEpisodes,
  setFinishBy,
  setFrom,
  setNote,
  setPreferences,
  setRating,
  setStatus,
  setWatchedOn,
  settleSeenShows,
  showProgress,
  startRewatch,
  type LibraryItem
} from '@core/library'
import { matchesQuery, sortEntries, type LibrarySort } from '@core/find'
import { remoteState, tonightChange } from '@core/remote'
import { remainingEpisodes, setWatchSoon, watchSoonOf } from '@core/watchsoon'
import { setReaction } from '@core/reactions'
import { setFavourite } from '@core/favourites'
import { setCountdown } from '@core/countdowns'
import { createList, findList, listsOf, refOf, removeList, renameList, setInList } from '@core/lists'
import { answerRecommendation, whyText, type Recommendation } from '@core/recommend'
import { allTimeStats, watchEvents } from '@core/stats'
import { milestoneKeys } from '@core/milestones'
import { formatHours } from '@core/time'
import type { ReleaseEvent } from '@core/calendar'
import type { WeekSoFar } from '@core/week'
import {
  REACTIONS,
  REACTION_LIST,
  STATUS_LABELS,
  episodeKey,
  parseTitleKey,
  type Credits,
  type Library,
  type LibraryEntry,
  type MediaType,
  type PersonDetails,
  type PersonResult,
  type Provider,
  type Reaction,
  type SearchResult,
  type SeasonDetails,
  type TitleDetails,
  type TitleRef,
  type Trait,
  type WatchProviders,
  type WatchSlot
} from '@core/types'

/**
 * What Claude Desktop can ask Eclipse (the tools of the connection in claudeDesktop.ts). Unlike
 * Orbit, everything Eclipse knows lives here in the main process (the library and TMDB), so the
 * tools answer straight from it, even while Eclipse is tucked away in the tray. Changes go through
 * the same functions the window uses, are saved the same way, and show the window's Undo bar.
 * Only the parts switched on in Settings are offered.
 */

export interface TmdbDeps {
  hasKey(): boolean
  search(query: string): Promise<SearchResult[]>
  details(type: MediaType, id: number): Promise<TitleDetails>
  detailsMany(keys: string[]): Promise<Record<string, TitleDetails>>
  season(tvId: number, n: number): Promise<SeasonDetails>
  /** Where to watch, in your country. */
  providers(type: MediaType, id: number): Promise<WatchProviders>
  /** Every streaming service in your country. */
  services(): Promise<Provider[]>
  credits(type: MediaType, id: number): Promise<Credits>
  searchPeople(query: string): Promise<PersonResult[]>
  person(id: number): Promise<PersonDetails>
  recommendations(library: Library): Promise<Recommendation[]>
  traitsOf(key: string): Promise<Trait[]>
  calendar(library: Library): Promise<ReleaseEvent[]>
  weekBudget(library: Library): Promise<WeekSoFar | null>
}

/** App settings Claude can switch (this computer only). */
export interface AppControls {
  /** Each setting and its value, as text. */
  status(): string
  set(setting: AppSetting, value: boolean | number): string
}

export const APP_SETTINGS = ['tray', 'discord_status', 'notice_browser_history', 'notice_whats_playing', 'bedtime_guard', 'start_with_computer', 'text_size'] as const
export type AppSetting = (typeof APP_SETTINGS)[number]

export interface ToolDeps {
  areas: Record<ClaudeArea, boolean>
  library(): Library
  /** Makes a change, saves it, shows it in the window and offers Undo. Throws while saving isn't allowed. */
  change(fn: (lib: Library) => Library): Library
  /** Puts back the last change Claude made (if nothing has changed since). */
  undoLast(): string
  tmdb: TmdbDeps
  /** Brings Eclipse's window up on a page, or a film or show's page. */
  show(what: ClaudeShow): void
  app?: AppControls
  now?: () => Date
}

const text = (t: string): CallToolResult => ({ content: [{ type: 'text', text: t }] })
const failed = (err: unknown): CallToolResult => ({ content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true })

/** Runs a tool, turning a failure into a message Claude can read (and pass on). */
const safely =
  <A>(fn: (args: A) => Promise<string> | string) =>
  async (args: A): Promise<CallToolResult> => {
    try {
      return text(await fn(args))
    } catch (err) {
      return failed(err)
    }
  }

const READ = { readOnlyHint: true, openWorldHint: false } as const
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const

type Shape = Record<string, z.ZodType>
function tool<A>(server: McpServer, name: string, config: { title: string; description: string; inputSchema: Shape; write?: boolean }, fn: (args: A) => Promise<string> | string): void {
  server.registerTool(name, { title: config.title, description: config.description, inputSchema: config.inputSchema, annotations: config.write ? WRITE : READ }, safely(fn) as never)
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date like 2026-11-25')
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'A 24-hour time like 21:30')
const titleArg = z.string().min(1).describe('The film or show: its name as the user said it (add the year in brackets if there are several, like "Dune (2021)"), or its key from an earlier answer, like "tv:1396"')
const typeArg = z.enum(['movie', 'tv']).optional().describe('movie for a film, tv for a show, when the name alone could be either')
const STATUS = z.enum(['want', 'watching', 'watched', 'stopped'])
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

const today = (d: ToolDeps): string => localDate(d.now?.() ?? new Date())
const nowOf = (d: ToolDeps): Date => d.now?.() ?? new Date()

function needKey(d: ToolDeps): void {
  if (!d.tmdb.hasKey()) throw new Error('Eclipse has no TMDB key yet, so it can’t look anything up. Add one in Eclipse’s Settings.')
}

// ---------- Finding the title Claude means ----------

interface Found {
  item: LibraryItem
  entry?: LibraryEntry
}

const itemOfEntry = (e: LibraryEntry): LibraryItem => ({ key: e.key, type: e.type, id: e.id, title: e.title })
const itemOfResult = (r: Pick<SearchResult, 'key' | 'type' | 'id' | 'name' | 'year' | 'posterPath'>): LibraryItem => ({ key: r.key, type: r.type, id: r.id, title: { name: r.name, year: r.year, posterPath: r.posterPath } })
const refOfItem = (i: LibraryItem): TitleRef => ({ key: i.key, type: i.type, id: i.id, name: i.title.name, year: i.title.year, posterPath: i.title.posterPath })

const optionsText = (list: { key: string; name: string; year: number | null; type?: MediaType }[]): string =>
  list
    .slice(0, 8)
    .map((r) => `- ${titleLabel(r)}${r.type ? (r.type === 'tv' ? ' show' : ' film') : ''}`)
    .join('\n')

/**
 * The film or show Claude means: by key, else in the library, else (when `search` is allowed) the
 * one clear match on TMDB. Never guesses between several: they're listed to choose from by key.
 */
async function findTitle(d: ToolDeps, want: string, opts: { type?: MediaType; search?: boolean } = {}): Promise<Found> {
  const lib = d.library()
  const key = keyOf(want)
  if (key) {
    const entry = lib.entries[key]
    if (entry) return { item: itemOfEntry(entry), entry }
    needKey(d)
    const p = parseTitleKey(key)!
    const det = await d.tmdb.details(p.type, p.id)
    return { item: itemOfResult(det) }
  }
  const mine = findInLibrary(lib, want, opts.type)
  if (mine.length === 1) return { item: itemOfEntry(mine[0]), entry: mine[0] }
  if (mine.length > 1) throw new Error(`More than one title in the library matches “${want}”:\n${optionsText(mine.map((e) => ({ key: e.key, name: e.title.name, year: e.title.year, type: e.type })))}\nAsk again with the key.`)
  if (opts.search === false) throw new Error(`“${want}” isn’t in the library.`)
  needKey(d)
  const results = await d.tmdb.search(want.replace(/\s*\(\d{4}\)$/, ''))
  const { pick, options } = pickFromSearch(results, want, opts.type)
  if (pick) return { item: itemOfResult(pick), entry: lib.entries[pick.key] }
  if (!options.length) throw new Error(`Nothing called “${want}” was found on TMDB.`)
  throw new Error(`It isn’t clear which “${want}” is meant. TMDB has:\n${optionsText(options)}\nAsk the user which, then use its key.`)
}

async function findShow(d: ToolDeps, want: string, search = true): Promise<Found & { details: TitleDetails }> {
  const f = await findTitle(d, want, { type: 'tv', search })
  if (f.item.type !== 'tv') throw new Error(`${f.item.title.name} is a film, not a show.`)
  needKey(d)
  return { ...f, details: await d.tmdb.details('tv', f.item.id) }
}

const statusOf = (lib: Library, key: string): string => {
  const e = activeEntry(lib.entries[key])
  return e ? STATUS_LABELS[e.status] : 'not in library'
}

// ---------- Reading the library ----------

function libraryTools(server: McpServer, d: ToolDeps): void {
  tool(
    server,
    'get_overview',
    {
      title: 'What’s going on in Eclipse',
      description:
        'A summary of the user’s Eclipse: how many titles are in each list, the shows they’re watching with the next episode of each (Up next), Watch soon, countdowns, and how much time is left tonight before bed. A good first call for “what should I watch?” or “where am I up to?”.',
      inputSchema: {}
    },
    async () => {
      const lib = d.library()
      const counts = countByStatus(lib)
      const watchingKeys = Object.values(lib.entries).filter((e) => e.type === 'tv' && activeEntry(e)!.status === 'watching').map((e) => e.key as string)
      const details = d.tmdb.hasKey() ? await d.tmdb.detailsMany([...watchingKeys, ...watchSoonOf(lib).map((r) => r.key as string)]) : {}
      const s = remoteState(lib, details, preferencesOf(lib), nowOf(d))
      const out = [`Library: ${counts.watching} watching, ${counts.want} want to watch, ${counts.watched} watched, ${counts.stopped} stopped.`]
      out.push('', s.watchingTonight ? `Tonight: ${formatHours(s.minutesLeft)} left before bed at ${s.bedtime}. Start a 45-minute episode by ${s.startBy}.` : 'Tonight: not a watching night.')
      out.push('', 'Up next (shows being watched, most recent first):')
      if (!s.shows.length) out.push('- nothing')
      for (const sh of s.shows) {
        const name = titleLabel({ key: sh.key, name: sh.name, year: lib.entries[sh.key]?.title.year ?? null })
        out.push(`- ${name}: ${sh.next ? `next ${episodeLabel(sh.next.season, sh.next.episode)}, ${sh.left} out to watch, ${sh.minutesEach} min each${sh.fits ? `, ${sh.fits} fit tonight` : ''}` : 'caught up, waiting for new episodes'}`)
      }
      out.push('', 'Watch soon (the user’s own order):')
      if (!s.soon.length) out.push('- nothing')
      for (const w of s.soon) out.push(`- ${titleLabel({ key: w.key, name: w.name, year: lib.entries[w.key]?.title.year ?? null })}${w.done ? ' (done)' : w.film ? ` film, ${hoursText(w.minutes)}` : `, ${w.episodes} episodes, ${hoursText(w.minutes)}`}`)
      const countdowns = lib.countdowns ?? []
      if (countdowns.length) out.push('', `Countdowns: ${countdowns.map((r) => titleLabel(r)).join(', ')}`)
      return out.join('\n')
    }
  )

  tool(
    server,
    'list_library',
    {
      title: 'List the library',
      description: 'Titles in the user’s library, with status, progress, rating and notes. Filter by status (want = watchlist), type and words in the name.',
      inputSchema: {
        status: STATUS.optional().describe('want (Want to watch), watching, watched or stopped. Leave out for all.'),
        type: typeArg,
        query: z.string().optional().describe('Only titles whose name has these words'),
        sort: z.enum(['recent', 'az', 'watched', 'added', 'year']).optional().describe('recent (last changed, the default), az, watched (last watched), added or year'),
        limit: z.number().int().min(1).max(1000).optional().describe('How many (default 60)')
      }
    },
    ({ status, type, query, sort, limit }: { status?: 'want' | 'watching' | 'watched' | 'stopped'; type?: MediaType; query?: string; sort?: LibrarySort; limit?: number }) => {
      const lib = d.library()
      let list = entriesWith(lib, status, type).filter((e) => !query || matchesQuery(e, query))
      if (sort && sort !== 'recent') list = sortEntries(list, sort)
      const total = list.length
      const shown = list.slice(0, limit ?? 60)
      if (!total) return 'Nothing matches.'
      return [`${total} title${total === 1 ? '' : 's'}${total > shown.length ? `, showing ${shown.length}` : ''}:`, ...shown.map((e) => `- ${entryLine(lib.entries[e.key])}`)].join('\n')
    }
  )

  tool(
    server,
    'get_title',
    {
      title: 'A film or show',
      description:
        'Everything about one film or show: what it is (overview, genres, runtime, seasons and when the next episode airs) and the user’s own record of it (status, episodes ticked by season, next episode, rating, note, who recommended it, rewatches, lists). Works for titles not in the library too.',
      inputSchema: { title: titleArg, type: typeArg, cast: z.boolean().optional().describe('Also list the director(s) and main cast') }
    },
    async ({ title, type, cast }: { title: string; type?: MediaType; cast?: boolean }) => {
      const f = await findTitle(d, title, { type })
      const lib = d.library()
      const raw = lib.entries[f.item.key]
      const det = d.tmdb.hasKey() ? await d.tmdb.details(f.item.type, f.item.id) : null
      const out = [`${titleLabel({ key: f.item.key, name: f.item.title.name, year: f.item.title.year })}, ${f.item.type === 'tv' ? 'show' : 'film'}`]
      out.push(raw ? `In library: ${entryLine(raw, det ?? undefined)}` : 'Not in the library.')
      if (det) {
        if (det.tagline) out.push(`Tagline: ${det.tagline}`)
        if (det.overview) out.push(`Overview: ${det.overview}`)
        out.push(`Genres: ${det.genres.join(', ') || 'none listed'}. ${det.runtime ? `${det.runtime} min${det.type === 'tv' ? ' an episode' : ''}. ` : ''}TMDB status: ${det.status}.${det.voteAverage ? ` TMDB rating ${det.voteAverage.toFixed(1)}/10.` : ''}`)
        if (det.date) out.push(`${det.type === 'tv' ? 'First aired' : 'Released'}: ${det.date}`)
        if (det.type === 'tv') {
          const e = activeEntry(raw)
          out.push('Seasons:')
          for (const s of det.seasons.filter((x) => x.number > 0)) {
            const ticked = Object.keys(e?.episodes ?? {}).filter((k) => k.startsWith(`S${s.number}E`)).length
            out.push(`- Season ${s.number}: ${s.episodeCount} episodes${s.airDate ? `, from ${s.airDate}` : ''}${raw ? `, ${ticked} ticked` : ''}`)
          }
          if (det.nextEpisode) out.push(`Next to air: ${episodeLabel(det.nextEpisode.season, det.nextEpisode.episode)} “${det.nextEpisode.name}”${det.nextEpisode.airDate ? ` on ${det.nextEpisode.airDate}` : ''}`)
          if (raw) {
            const next = nextOutEpisodeFor(e, det, today(d))
            out.push(next ? `The user’s next episode: ${episodeLabel(next.season, next.episode)}` : e?.status === 'watched' ? 'Finished.' : 'Caught up with everything that’s out.')
          }
        }
        if (det.collection) out.push(`Part of: ${det.collection.name}`)
      }
      if (raw) {
        if (raw.seenBefore) out.push('Seen before using Eclipse.')
        for (const r of raw.rewatches ?? []) out.push(`${r.with ? `Watching with ${r.with}` : 'Rewatch'}: started ${r.startedOn}${r.finishedOn ? `, finished ${r.finishedOn}` : ', still going'}${r.episodes ? `, ${Object.keys(r.episodes).length} episodes` : ''}`)
        if (raw.finishBy) out.push(`Wants to finish it by ${raw.finishBy}.`)
        if (raw.moments?.length) out.push(`Saved moments: ${raw.moments.length}`)
      }
      const flags = [
        watchSoonOf(lib).some((r) => r.key === f.item.key) && 'Watch soon',
        (lib.countdowns ?? []).some((r) => r.key === f.item.key) && 'Countdowns',
        (lib.favourites ?? []).some((r) => r.key === f.item.key) && 'Favourites',
        ...listsOf(lib)
          .filter((l) => l.items?.some((r) => r.key === f.item.key))
          .map((l) => `list “${l.name}”`)
      ].filter(Boolean)
      if (flags.length) out.push(`On: ${flags.join(', ')}`)
      if (cast && d.tmdb.hasKey()) {
        const c = await d.tmdb.credits(f.item.type, f.item.id)
        if (c.directors.length) out.push(`Directed by: ${c.directors.map((p) => p.name).join(', ')}`)
        if (c.cast.length) out.push(`Cast: ${c.cast.map((p) => `${p.name}${p.role ? ` (${p.role})` : ''}`).join(', ')}`)
      }
      return out.join('\n')
    }
  )

  tool(
    server,
    'get_season',
    {
      title: 'A season’s episodes',
      description: 'The episodes of one season of a show: names, air dates, runtimes, and which the user has ticked (and when) and how each hit them.',
      inputSchema: { title: titleArg, season: z.number().int().min(0).describe('Season number (0 is specials)') }
    },
    async ({ title, season }: { title: string; season: number }) => {
      const f = await findShow(d, title)
      const s = await d.tmdb.season(f.item.id, season)
      const e = activeEntry(d.library().entries[f.item.key])
      const out = [`${titleLabel({ key: f.item.key, name: f.item.title.name, year: f.item.title.year })}, ${s.name}:`]
      for (const ep of s.episodes) {
        const k = episodeKey(ep.season, ep.number)
        const seen = e?.episodes?.[k]
        const r = e?.reactions?.[k]
        out.push(`- ${episodeLabel(ep.season, ep.number)} “${ep.name}”${ep.airDate ? `, ${ep.airDate}` : ''}${ep.runtime ? `, ${ep.runtime} min` : ''}${seen ? `, watched${seen === 'seen' ? ' (before Eclipse)' : ` ${seen}`}` : ''}${r ? ` ${REACTIONS[r].emoji}` : ''}`)
      }
      return out.join('\n')
    }
  )

  tool(
    server,
    'get_watch_history',
    {
      title: 'What was watched when',
      description: 'Every episode and film the user watched between two days, day by day, with the time it took. Defaults to the last 7 days.',
      inputSchema: { from: day.optional().describe('First day (default 6 days ago)'), to: day.optional().describe('Last day (default today)') }
    },
    async ({ from, to }: { from?: string; to?: string }) => {
      const lib = d.library()
      const end = to ?? today(d)
      const start = from ?? localDate(new Date(nowOf(d).getTime() - 6 * 86_400_000))
      const keys = [...new Set(watchEvents(lib).filter((w) => between(w.day, start, end)).map((w) => w.key as string))]
      const details = d.tmdb.hasKey() ? await d.tmdb.detailsMany(keys) : {}
      const events = watchEvents(lib, details).filter((w) => between(w.day, start, end))
      if (!events.length) return `Nothing watched between ${start} and ${end}.`
      const byDay = new Map<string, typeof events>()
      for (const w of events) byDay.set(w.day!, [...(byDay.get(w.day!) ?? []), w])
      const out = [`${events.length} watch${events.length === 1 ? '' : 'es'}, ${hoursText(events.reduce((n, w) => n + w.minutes, 0))}, ${start} to ${end}:`]
      for (const [dayKey, list] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        out.push('', `${dayKey} (${hoursText(list.reduce((n, w) => n + w.minutes, 0))}):`)
        const shows = new Map<string, typeof list>()
        for (const w of list) shows.set(w.key, [...(shows.get(w.key) ?? []), w])
        for (const [key, ws] of shows) {
          const w = ws[0]
          const eps = ws.filter((x) => x.episode).map((x) => x.episode!)
          out.push(`- ${titleLabel({ key, name: w.name, year: lib.entries[key]?.title.year ?? null })}${eps.length ? `: ${episodesText(eps.sort(byEpisode))}` : ' (film)'}${ws.some((x) => x.again) ? ' (again)' : ''}${w.with ? ` with ${w.with}` : ''}`)
        }
      }
      return out.join('\n')
    }
  )

  tool(
    server,
    'get_stats',
    {
      title: 'Stats',
      description: 'All-time stats: hours watched (shows and films), episodes, films, shows finished, streaks, busiest days, top shows and films, genres, people, ratings, and watching by year and month.',
      inputSchema: {}
    },
    async () => {
      const lib = d.library()
      const details = d.tmdb.hasKey() ? await d.tmdb.detailsMany(milestoneKeys(lib)) : {}
      const s = allTimeStats(lib, details, today(d))
      const out = [
        `Time watched: ${formatHours(s.minutes)} (${formatHours(s.showMinutes)} of shows, ${formatHours(s.filmMinutes)} of films, ${formatHours(s.againMinutes)} rewatching).`,
        `${s.episodes} episodes, ${s.films} films (${s.filmWatches} watches), ${s.showsStarted} shows started, ${s.showsFinished} finished, ${s.seasonsFinished} seasons finished, ${s.rewatchesFinished} rewatches finished.`,
        `Watching days: ${s.days}, about ${formatHours(s.perDay)} a watching day. Current streak: ${s.currentStreak} day${s.currentStreak === 1 ? '' : 's'}.${s.longestStreak ? ` Longest: ${s.longestStreak.days} days (${s.longestStreak.from} to ${s.longestStreak.to}).` : ''}`,
        s.first ? `First thing logged: ${s.first.name} on ${s.first.day}.` : '',
        s.busiestDay ? `Busiest day: ${s.busiestDay.day} (${formatHours(s.busiestDay.minutes)}).` : '',
        s.binge ? `Biggest binge: ${s.binge.episodes} episodes of ${s.binge.name} on ${s.binge.day}.` : '',
        s.busiestMonth ? `Busiest month: ${s.busiestMonth.month} (${formatHours(s.busiestMonth.minutes)}).` : '',
        `Top shows: ${s.topShows.slice(0, 10).map((t) => `${t.name} (${formatHours(t.minutes)})`).join(', ') || 'none'}`,
        `Top films: ${s.topFilms.slice(0, 10).map((t) => `${t.name}${t.count > 1 ? ` ×${t.count}` : ''}`).join(', ') || 'none'}`,
        `Genres: ${s.genres.slice(0, 8).map((g) => `${g.name} ${formatHours(g.minutes)}`).join(', ') || 'none'}`,
        s.people.length ? `Watched with: ${s.people.map((p) => `${p.name} (${formatHours(p.minutes)})`).join(', ')}` : '',
        `Ratings: ${s.ratings.count} rated${s.ratings.average ? `, average ${s.ratings.average.toFixed(1)}/10` : ''}${s.ratings.top.length ? `. Highest: ${s.ratings.top.slice(0, 5).map((r) => `${r.name} ${r.rating}`).join(', ')}` : ''}`,
        `By year: ${s.byYear.map((y) => `${y.year} ${formatHours(y.minutes)}`).join(', ')}`,
        `Last 12 months: ${s.months.map((m) => `${m.month} ${formatHours(m.minutes)}`).join(', ')}`
      ]
      return out.filter(Boolean).join('\n')
    }
  )

  tool(
    server,
    'get_lists',
    {
      title: 'Lists',
      description: 'The user’s lists (their own lists, and the people, collections and guides they follow). Give a list’s name to see what’s on one of their own lists.',
      inputSchema: { list: z.string().optional().describe('A list’s name or id, to see its titles') }
    },
    ({ list }: { list?: string }) => {
      const lib = d.library()
      const all = listsOf(lib)
      if (!list) {
        if (!all.length) return 'No lists yet.'
        return all.map((l) => `- ${l.name} [${l.id}]${l.source.kind === 'custom' ? `, own list, ${l.items?.length ?? 0} titles` : `, following (${l.source.kind})`}`).join('\n')
      }
      const l = pickList(lib, list, false)
      if (l.source.kind !== 'custom') return `${l.name} is a list Eclipse fills from TMDB or its guides. Open it in Eclipse to see it (open_in_eclipse with page lists).`
      if (!l.items?.length) return `${l.name} is empty.`
      return [`${l.name}:`, ...l.items.map((r, i) => `${i + 1}. ${titleLabel(r)}: ${statusOf(lib, r.key)}`)].join('\n')
    }
  )

  tool(
    server,
    'get_release_calendar',
    {
      title: 'Coming up',
      description: 'New seasons, finales, episodes and films coming out for titles in the user’s library, soonest first.',
      inputSchema: { days: z.number().int().min(1).max(365).optional().describe('How far ahead (default 60 days)') }
    },
    async ({ days }: { days?: number }) => {
      needKey(d)
      const start = today(d)
      const end = localDate(new Date(nowOf(d).getTime() + (days ?? 60) * 86_400_000))
      const events = (await d.tmdb.calendar(d.library())).filter((e) => between(e.date, start, end)).sort((a, b) => a.date.localeCompare(b.date))
      if (!events.length) return `Nothing coming out in the next ${days ?? 60} days.`
      return events.map((e) => `- ${e.date}: ${e.title}${e.detail ? ` (${e.detail})` : ''} [${e.key}]`).join('\n')
    }
  )
}

const byEpisode = (a: string, b: string): number => {
  const [x, y] = [a, b].map((k) => k.match(/\d+/g)!.map(Number))
  return x[0] - y[0] || x[1] - y[1]
}

function pickList(lib: Library, want: string, ownOnly = true) {
  const all = listsOf(lib).filter((l) => !ownOnly || l.source.kind === 'custom')
  const byId = findList(lib, want)
  if (byId && (!ownOnly || byId.source.kind === 'custom')) return byId
  const w = want.trim().toLowerCase()
  const exact = all.filter((l) => l.name.toLowerCase() === w)
  const inside = exact.length ? exact : all.filter((l) => l.name.toLowerCase().includes(w))
  if (inside.length === 1) return inside[0]
  if (!all.length) throw new Error(ownOnly ? 'There are no lists of the user’s own yet. create_list makes one.' : 'There are no lists yet.')
  if (inside.length > 1) throw new Error(`More than one list matches “${want}”: ${inside.map((l) => `“${l.name}”`).join(', ')}.`)
  throw new Error(`There’s no ${ownOnly ? 'list of the user’s own' : 'list'} called “${want}”. There’s ${all.map((l) => `“${l.name}”`).join(', ')}.`)
}

// ---------- Ticking and changing things ----------

function trackingTools(server: McpServer, d: ToolDeps): void {
  tool(
    server,
    'set_status',
    {
      title: 'Add, move or remove a title',
      description:
        'Puts a film or show on one of the user’s lists: want (Want to watch, the watchlist), watching, watched or stopped, adding it to the library if it isn’t there. remove takes it out of the library altogether, with its ticks (check with the user first unless they asked).',
      inputSchema: { title: titleArg, type: typeArg, status: z.enum(['want', 'watching', 'watched', 'stopped', 'remove']) },
      write: true
    },
    async ({ title, type, status }: { title: string; type?: MediaType; status: 'want' | 'watching' | 'watched' | 'stopped' | 'remove' }) => {
      const f = await findTitle(d, title, { type, search: status !== 'remove' })
      const label = titleLabel({ key: f.item.key, name: f.item.title.name, year: f.item.title.year })
      if (status === 'remove') {
        if (!f.entry) return `${label} isn’t in the library.`
        d.change((lib) => setStatus(lib, f.item, null))
        return `Removed ${label} from the library. The user can press Undo in Eclipse (or ask you to undo it).`
      }
      const was = f.entry ? STATUS_LABELS[activeEntry(f.entry)!.status] : null
      d.change((lib) => setStatus(lib, f.item, status, nowOf(d)))
      return was ? `Moved ${label} from ${was} to ${STATUS_LABELS[status]}.` : `Added ${label} to ${STATUS_LABELS[status]}.`
    }
  )

  tool(
    server,
    'mark_episodes',
    {
      title: 'Tick episodes',
      description:
        'Ticks (or unticks) episodes of a show as watched today. One episode (season + episode), a run (episode to to_episode), a whole season (season only), everything up to an episode (up_to: true, like Eclipse’s “Watched up to here”), or the whole show (all: true). before_eclipse ticks them with no date (watched long ago). A show not in the library is added as Watching. While the user is rewatching, ticks go on the rewatch.',
      inputSchema: {
        title: titleArg,
        season: z.number().int().min(0).optional(),
        episode: z.number().int().min(1).optional(),
        to_episode: z.number().int().min(1).optional().describe('The last episode of a run'),
        up_to: z.boolean().optional().describe('Tick every episode from the start of the show up to this one'),
        all: z.boolean().optional().describe('Every episode of every season'),
        watched: z.boolean().optional().describe('false unticks them (default true)'),
        before_eclipse: z.boolean().optional().describe('Seen long ago: tick with no date')
      },
      write: true
    },
    async (a: { title: string; season?: number; episode?: number; to_episode?: number; up_to?: boolean; all?: boolean; watched?: boolean; before_eclipse?: boolean }) => {
      const f = await findShow(d, a.title)
      const keys = episodesFor(f.details.seasons, { season: a.season, episode: a.episode, toEpisode: a.to_episode, upTo: a.up_to, all: a.all })
      const watched = a.watched !== false
      const undated = watched && !!a.before_eclipse
      const after = d.change((lib) => {
        const next = setEpisodes(lib, f.item, keys, watched, nowOf(d), undated)
        // All of it seen before Eclipse: it's Watched, not Watching (as the window does).
        return undated ? settleSeenShows(next, { [f.item.key]: f.details }, today(d), nowOf(d)) : next
      })
      const e = activeEntry(after.entries[f.item.key])
      const p = showProgress(e, f.details.seasons)
      const next = e && e.status !== 'watched' ? remainingEpisodes(f.details, e, today(d))[0] : undefined
      const label = titleLabel({ key: f.item.key, name: f.item.title.name, year: f.item.title.year })
      return [
        `${watched ? 'Ticked' : 'Unticked'} ${episodesText(keys)} of ${label}${undated ? ' (no date)' : ''}.`,
        `Now ${p.watched} of ${p.total} episodes, status ${e ? STATUS_LABELS[e.status] : 'not in library'}${currentRewatch(after.entries[f.item.key]) ? ' (rewatch)' : ''}.`,
        next ? `Next: ${episodeLabel(next.season, next.episode)}.` : e?.status === 'watching' ? 'That’s everything that’s out. If the show has ended, it could be marked Watched (set_status).' : ''
      ]
        .filter(Boolean)
        .join(' ')
    }
  )

  tool(
    server,
    'tick_next_episode',
    {
      title: 'Tick the next episode',
      description: 'Ticks the next episode of a show the user is watching (what they’d press on Home), and says what’s next after it.',
      inputSchema: { title: titleArg, count: z.number().int().min(1).max(50).optional().describe('Tick this many in a row (default 1)') },
      write: true
    },
    async ({ title, count }: { title: string; count?: number }) => {
      const f = await findShow(d, title)
      const e = activeEntry(d.library().entries[f.item.key])
      const rest = remainingEpisodes(f.details, e, today(d))
      if (!rest.length) return `${f.item.title.name} has nothing left that’s out.`
      const eps = rest.slice(0, count ?? 1)
      const keys = eps.map((x) => episodeKey(x.season, x.episode))
      d.change((lib) => setEpisodes(lib, f.item, keys, true, nowOf(d)))
      const after = rest[eps.length]
      return `Ticked ${episodesText(keys)} of ${titleLabel({ key: f.item.key, name: f.item.title.name, year: f.item.title.year })}. ${after ? `Next: ${episodeLabel(after.season, after.episode)}.` : 'That was the last one out.'}`
    }
  )

  tool(
    server,
    'update_title',
    {
      title: 'Rating, note, date and who recommended it',
      description: 'Changes the user’s own details on a title in their library: rating out of 10, a one-line note, who recommended it, the day they watched it (films), or the day they want to finish a show by. Pass null (or an empty note) to clear one.',
      inputSchema: {
        title: titleArg,
        rating: z.number().min(1).max(10).nullable().optional().describe('Out of 10 (halves are fine), or null to clear'),
        note: z.string().max(500).optional(),
        recommended_by: z.string().max(80).optional().describe('Who or what recommended it ("Sam", "a podcast"); empty clears'),
        watched_on: day.nullable().optional().describe('The day they watched it'),
        finish_by: day.nullable().optional().describe('Shows: the day they want to have finished it by')
      },
      write: true
    },
    async (a: { title: string; rating?: number | null; note?: string; recommended_by?: string; watched_on?: string | null; finish_by?: string | null }) => {
      const f = await findTitle(d, a.title, { search: false })
      if (!f.entry) throw new Error(`${f.item.title.name} isn’t in the library. Add it first (set_status).`)
      const done: string[] = []
      d.change((lib) => {
        let next = lib
        const key = f.item.key
        if (a.rating !== undefined) (next = setRating(next, key, a.rating === null ? null : Math.round(a.rating * 2) / 2, nowOf(d))), done.push(a.rating === null ? 'cleared the rating' : `rated it ${a.rating}/10`)
        if (a.note !== undefined) (next = setNote(next, key, a.note, nowOf(d))), done.push(a.note ? 'set the note' : 'cleared the note')
        if (a.recommended_by !== undefined) (next = setFrom(next, key, a.recommended_by, nowOf(d))), done.push(a.recommended_by ? `noted it was from ${a.recommended_by}` : 'cleared who recommended it')
        if (a.watched_on !== undefined) (next = setWatchedOn(next, key, a.watched_on, nowOf(d))), done.push(a.watched_on ? `set the watched day to ${a.watched_on}` : 'cleared the watched day')
        if (a.finish_by !== undefined) (next = setFinishBy(next, key, a.finish_by, nowOf(d))), done.push(a.finish_by ? `set finish by ${a.finish_by}` : 'cleared finish by')
        return next
      })
      if (!done.length) return 'Nothing to change: say what to set.'
      return `${entryLabel(f.entry!)}: ${done.join(', ')}.`
    }
  )

  tool(
    server,
    'react_to_episode',
    {
      title: 'How an episode hit',
      description: `Records how a ticked episode hit the user (their own heatmap): ${REACTION_LIST.map((r) => `${r} ${REACTIONS[r].emoji} ${REACTIONS[r].label}`).join(', ')}, or none to clear.`,
      inputSchema: { title: titleArg, season: z.number().int().min(0), episode: z.number().int().min(1), reaction: z.enum(['cry', 'fire', 'laugh', 'sleep', 'wow', 'none']) },
      write: true
    },
    async ({ title, season, episode, reaction }: { title: string; season: number; episode: number; reaction: Reaction | 'none' }) => {
      const f = await findTitle(d, title, { type: 'tv', search: false })
      const k = episodeKey(season, episode)
      const e = activeEntry(f.entry)
      if (!e?.episodes?.[k]) throw new Error(`${episodeLabel(season, episode)} isn’t ticked yet. Tick it first (mark_episodes).`)
      d.change((lib) => setReaction(lib, f.item.key, k, reaction === 'none' ? null : reaction, nowOf(d)))
      return reaction === 'none' ? `Cleared the reaction on ${episodeLabel(season, episode)}.` : `${episodeLabel(season, episode)} of ${f.item.title.name}: ${REACTIONS[reaction].emoji} ${REACTIONS[reaction].label}.`
    }
  )

  tool(
    server,
    'rewatch',
    {
      title: 'Start or finish a rewatch',
      description: 'start begins watching something again (new ticks go on the rewatch, the first watch is kept). finish ends the current rewatch and keeps it. cancel throws the current rewatch away.',
      inputSchema: { title: titleArg, action: z.enum(['start', 'finish', 'cancel']) },
      write: true
    },
    async ({ title, action }: { title: string; action: 'start' | 'finish' | 'cancel' }) => {
      const f = await findTitle(d, title, { search: action === 'start' })
      const label = titleLabel({ key: f.item.key, name: f.item.title.name, year: f.item.title.year })
      if (action === 'start') {
        if (currentRewatch(f.entry)) return `${label} is already being rewatched.`
        d.change((lib) => startRewatch(lib, f.item, nowOf(d)))
        return `Started rewatching ${label}.`
      }
      if (!currentRewatch(f.entry)) return `${label} isn’t being rewatched.`
      d.change((lib) => endRewatch(lib, f.item.key, action === 'finish', nowOf(d)))
      return action === 'finish' ? `Finished the rewatch of ${label}.` : `Cancelled the rewatch of ${label}.`
    }
  )

  for (const [name, label, set, list] of [
    ['set_watch_soon', 'Watch soon', setWatchSoon, (l: Library) => l.watchSoon ?? []],
    ['set_countdown', 'Countdowns', setCountdown, (l: Library) => l.countdowns ?? []],
    ['set_favourite', 'Favourites', setFavourite, (l: Library) => l.favourites ?? []]
  ] as const) {
    tool(
      server,
      name,
      {
        title: `Add to or take off ${label}`,
        description:
          name === 'set_watch_soon'
            ? 'Adds a title to Watch soon (the few things the user wants to get to next, which Eclipse plans their evenings around) or takes it off.'
            : name === 'set_countdown'
              ? 'Adds a countdown on Home for a film or show the user is waiting for (counting down to its release or next season), or takes it off.'
              : 'Adds a title to the user’s all-time favourites wall, or takes it off.',
        inputSchema: { title: titleArg, type: typeArg, on: z.boolean().describe('true adds it, false takes it off') },
        write: true
      },
      async ({ title, type, on }: { title: string; type?: MediaType; on: boolean }) => {
        const f = await findTitle(d, title, { type, search: on })
        const ref = f.entry ? refOf(f.entry) : refOfItem(f.item)
        const had = list(d.library()).some((r) => r.key === ref.key)
        const tl = titleLabel(ref)
        if (had === on) return `${tl} is ${on ? 'already on' : 'not on'} ${label}.`
        d.change((lib) => set(lib, ref, on))
        return `${on ? 'Added' : 'Took'} ${tl} ${on ? 'to' : 'off'} ${label}.`
      }
    )
  }

  tool(
    server,
    'create_list',
    {
      title: 'Make a list',
      description: 'Makes a new list of the user’s own, optionally with titles on it.',
      inputSchema: { name: z.string().min(1).max(80), titles: z.array(z.string()).max(50).optional().describe('Titles to put on it (names or keys)') },
      write: true
    },
    async ({ name, titles }: { name: string; titles?: string[] }) => {
      const refs: TitleRef[] = []
      const problems: string[] = []
      for (const t of titles ?? []) {
        try {
          const f = await findTitle(d, t)
          refs.push(f.entry ? refOf(f.entry) : refOfItem(f.item))
        } catch (err) {
          problems.push(err instanceof Error ? err.message : String(err))
        }
      }
      let id = ''
      d.change((lib) => {
        const made = createList(lib, name, nowOf(d), refs)
        id = made.id
        return made.library
      })
      return [`Made the list “${name}” [${id}]${refs.length ? ` with ${refs.map((r) => r.name).join(', ')}` : ''}.`, ...problems.map((p) => `Not added: ${p}`)].join('\n')
    }
  )

  tool(
    server,
    'set_in_list',
    {
      title: 'Add to or take off a list',
      description: 'Adds a title to one of the user’s own lists, or takes it off.',
      inputSchema: { list: z.string().min(1).describe('The list’s name or id'), title: titleArg, on: z.boolean().describe('true adds it, false takes it off') },
      write: true
    },
    async ({ list, title, on }: { list: string; title: string; on: boolean }) => {
      const l = pickList(d.library(), list)
      const f = await findTitle(d, title, { search: on })
      const ref = f.entry ? refOf(f.entry) : refOfItem(f.item)
      d.change((lib) => setInList(lib, l.id, ref, on))
      return `${on ? 'Added' : 'Took'} ${titleLabel(ref)} ${on ? 'to' : 'off'} “${l.name}”.`
    }
  )

  tool(
    server,
    'edit_list',
    {
      title: 'Rename or delete a list',
      description: 'Renames one of the user’s lists, or deletes it (or stops following one). Check with the user before deleting unless they asked.',
      inputSchema: { list: z.string().min(1), rename_to: z.string().min(1).max(80).optional(), delete: z.boolean().optional() },
      write: true
    },
    ({ list, rename_to, delete: del }: { list: string; rename_to?: string; delete?: boolean }) => {
      const l = pickList(d.library(), list, false)
      if (del) {
        d.change((lib) => removeList(lib, l.id))
        return `Deleted the list “${l.name}”.`
      }
      if (!rename_to) return 'Say rename_to or delete.'
      d.change((lib) => renameList(lib, l.id, rename_to))
      return `Renamed “${l.name}” to “${rename_to}”.`
    }
  )

  tool(
    server,
    'undo_last_change',
    {
      title: 'Undo',
      description: 'Puts back the last change made through this connection (only if nothing else has changed the library since).',
      inputSchema: {},
      write: true
    },
    () => d.undoLast()
  )
}

// ---------- Search and recommendations ----------

function discoverTools(server: McpServer, d: ToolDeps): void {
  tool(
    server,
    'search',
    {
      title: 'Search films and shows',
      description: 'Searches TMDB for films and shows by name, saying which are already in the user’s library. Use the keys it gives with the other tools.',
      inputSchema: { query: z.string().min(1), type: typeArg }
    },
    async ({ query, type }: { query: string; type?: MediaType }) => {
      needKey(d)
      const lib = d.library()
      const results = (await d.tmdb.search(query)).filter((r) => !type || r.type === type).slice(0, 15)
      if (!results.length) return `Nothing found for “${query}”.`
      return results.map((r) => `- ${titleLabel(r)} ${r.type === 'tv' ? 'show' : 'film'}: ${statusOf(lib, r.key)}${r.overview ? `. ${r.overview.slice(0, 160)}${r.overview.length > 160 ? '…' : ''}` : ''}`).join('\n')
    }
  )

  tool(
    server,
    'find_person',
    {
      title: 'An actor or director',
      description: 'Finds an actor or director and lists the films and shows they’ve been in or directed, with which ones the user has seen.',
      inputSchema: { name: z.string().min(1) }
    },
    async ({ name }: { name: string }) => {
      needKey(d)
      const people = await d.tmdb.searchPeople(name)
      if (!people.length) return `Nobody called “${name}” was found.`
      const p = await d.tmdb.person(people[0].id)
      const lib = d.library()
      const line = (r: TitleRef): string => `- ${titleLabel(r)}${r.role ? ` as ${r.role}` : ''}: ${statusOf(lib, r.key)}`
      const out = [`${p.name} (known for ${p.knownFor})`]
      if (p.directed.length) out.push('Directed:', ...p.directed.map(line))
      if (p.acted.length) out.push('Appeared in:', ...p.acted.slice(0, 80).map(line))
      if (people.length > 1) out.push('', `Others with that name: ${people.slice(1, 5).map((x) => `${x.name} (${x.knownTitles.join(', ')})`).join('; ')}`)
      return out.join('\n')
    }
  )

  tool(
    server,
    'where_to_watch',
    {
      title: 'Where to watch',
      description: 'Where a film or show can be streamed, watched free, rented or bought in the user’s country, marking the services they pay for.',
      inputSchema: { title: titleArg, type: typeArg }
    },
    async ({ title, type }: { title: string; type?: MediaType }) => {
      needKey(d)
      const f = await findTitle(d, title, { type })
      const w = await d.tmdb.providers(f.item.type, f.item.id)
      const mine = new Set(preferencesOf(d.library()).services)
      const names = (list: Provider[]): string => list.map((p) => `${p.name}${mine.has(p.id) ? ' (yours)' : ''}`).join(', ')
      const out = [`${titleLabel({ key: f.item.key, name: f.item.title.name, year: f.item.title.year })} in ${w.region}:`]
      if (w.stream.length) out.push(`Streaming: ${names(w.stream)}`)
      if (w.free.length) out.push(`Free: ${names(w.free)}`)
      if (w.rent.length) out.push(`Rent: ${names(w.rent)}`)
      if (w.buy.length) out.push(`Buy: ${names(w.buy)}`)
      if (out.length === 1) out.push('Not available anywhere right now.')
      else if (![...w.stream, ...w.free].some((p) => mine.has(p.id))) out.push('Not on any of the user’s services.')
      return out.join('\n')
    }
  )

  tool(
    server,
    'get_recommendations',
    {
      title: 'Recommended for the user',
      description: 'Eclipse’s recommendations from what the user has watched and liked, each with why (“because you watched …”).',
      inputSchema: { type: typeArg, limit: z.number().int().min(1).max(40).optional().describe('How many (default 15)') }
    },
    async ({ type, limit }: { type?: MediaType; limit?: number }) => {
      needKey(d)
      const recs = (await d.tmdb.recommendations(d.library())).filter((r) => !type || r.type === type).slice(0, limit ?? 15)
      if (!recs.length) return 'No recommendations yet: they come from what the user has watched.'
      return recs.map((r) => `- ${titleLabel(r)} ${r.type === 'tv' ? 'show' : 'film'}: ${whyText(r)}${r.overview ? `. ${r.overview.slice(0, 140)}${r.overview.length > 140 ? '…' : ''}` : ''}`).join('\n')
    }
  )

  tool(
    server,
    'answer_recommendation',
    {
      title: 'Interested or Not for me',
      description: 'Answers a recommendation: interested adds it to Want to watch, not_for_me hides it. Either way Eclipse learns from it (its creators, cast, network and keywords).',
      inputSchema: { title: titleArg, answer: z.enum(['interested', 'not_for_me']) },
      write: true
    },
    async ({ title, answer }: { title: string; answer: 'interested' | 'not_for_me' }) => {
      needKey(d)
      const f = await findTitle(d, title)
      const traits = await d.tmdb.traitsOf(f.item.key).catch(() => [])
      const yes = answer === 'interested'
      d.change((lib) => {
        const learnt = answerRecommendation(lib, f.item.key, yes, traits)
        return yes && !learnt.entries[f.item.key] ? setStatus(learnt, f.item, 'want', nowOf(d)) : learnt
      })
      const label = titleLabel({ key: f.item.key, name: f.item.title.name, year: f.item.title.year })
      return yes ? `Added ${label} to Want to watch, and Eclipse will suggest more like it.` : `Hid ${label}; Eclipse will suggest less like it.`
    }
  )
}

// ---------- Your evenings ----------

const weekdayName = (n: number): string => WEEKDAYS[n][0].toUpperCase() + WEEKDAYS[n].slice(1)
const slotText = (slots: WatchSlot[]): string => (slots.length ? slots.map((s) => `${s.start} to ${s.end}`).join(' and ') : 'not watching')

function eveningTools(server: McpServer, d: ToolDeps): void {
  tool(
    server,
    'get_evenings',
    {
      title: 'Tonight and the week',
      description: 'How much time is left tonight before bed, when to start, what fits, this week’s budget, and the user’s usual week (each day’s watching times), gaps, wind-down and services.',
      inputSchema: {}
    },
    async () => {
      const lib = d.library()
      const prefs = preferencesOf(lib)
      const watchingKeys = Object.values(lib.entries).filter((e) => e.type === 'tv' && activeEntry(e)!.status === 'watching').map((e) => e.key as string)
      const details = d.tmdb.hasKey() ? await d.tmdb.detailsMany(watchingKeys) : {}
      const s = remoteState(lib, details, prefs, nowOf(d))
      const out = [s.watchingTonight ? `Tonight${s.tonightChanged ? ' (changed just for tonight)' : ''}: ${formatHours(s.minutesLeft)} left before bed at ${s.bedtime}; start a 45-minute episode by ${s.startBy}.` : `Tonight: not watching${s.tonightChanged ? ' (just for tonight)' : ''}.`]
      const fits = s.shows.filter((x) => x.fits > 0)
      if (fits.length) out.push(`Fits tonight: ${fits.map((x) => `${x.fits} of ${x.name}`).join(', ')}.`)
      const week = d.tmdb.hasKey() ? await d.tmdb.weekBudget(lib) : null
      if (week) out.push(`This week: ${formatHours(week.watchedMinutes)} watched of a ${formatHours(week.budgetMinutes)} budget, ${formatHours(week.leftMinutes)} left over ${week.nightsLeft} night${week.nightsLeft === 1 ? '' : 's'}.`)
      out.push('', 'Usual week:', ...prefs.schedule.map((slots, i) => `- ${weekdayName(i)}: ${slotText(slots)}`))
      out.push('', `Between episodes: ${prefs.gapMinutes} min. Wind down before bed: ${prefs.windDownMinutes} min. Weekly budget: ${prefs.weeklyBudgetMinutes ? formatHours(prefs.weeklyBudgetMinutes) : 'none'}. Country: ${prefs.region}.`)
      if (d.tmdb.hasKey() && prefs.services.length) {
        const all = await d.tmdb.services().catch(() => [] as Provider[])
        out.push(`Services: ${prefs.services.map((id) => all.find((p) => p.id === id)?.name ?? `#${id}`).join(', ')}`)
      }
      return out.join('\n')
    }
  )

  tool(
    server,
    'change_tonight',
    {
      title: 'Change tonight',
      description: 'Changes just tonight: off (not watching tonight), later (bed 30 minutes later) or usual (back to the usual evening).',
      inputSchema: { action: z.enum(['off', 'later', 'usual']) },
      write: true
    },
    ({ action }: { action: 'off' | 'later' | 'usual' }) => {
      d.change((lib) => setPreferences(lib, { justTonight: tonightChange(preferencesOf(lib), nowOf(d), action) }))
      return action === 'off' ? 'Not watching tonight.' : action === 'later' ? 'Bedtime is 30 minutes later tonight.' : 'Tonight is back to the usual.'
    }
  )

  tool(
    server,
    'set_evenings',
    {
      title: 'Change the usual evenings',
      description:
        'Changes the user’s usual week: start time and bedtime (for the given days, or every watching day), nights off, the gap between episodes, wind-down before bed, the weekly budget, and whether the release calendar lists every episode.',
      inputSchema: {
        start_time: time.optional(),
        bedtime: time.optional().describe('After midnight is fine, like 00:30'),
        days: z.array(z.enum(WEEKDAYS)).optional().describe('Which days the times apply to (and which become watching days). Default: every day that already has watching.'),
        nights_off: z.array(z.enum(WEEKDAYS)).optional().describe('Days with no watching'),
        gap_minutes: z.number().int().min(0).max(30).optional(),
        wind_down_minutes: z.number().int().min(0).max(120).optional(),
        weekly_budget_hours: z.number().min(0).max(80).optional().describe('About how many hours a week (0 for no budget)'),
        calendar_every_episode: z.boolean().optional()
      },
      write: true
    },
    (a: { start_time?: string; bedtime?: string; days?: (typeof WEEKDAYS)[number][]; nights_off?: (typeof WEEKDAYS)[number][]; gap_minutes?: number; wind_down_minutes?: number; weekly_budget_hours?: number; calendar_every_episode?: boolean }) => {
      const after = d.change((lib) => {
        const prefs = preferencesOf(lib)
        const schedule = prefs.schedule.map((s) => s.map((x) => ({ ...x })))
        if (a.start_time || a.bedtime) {
          const days = a.days?.length ? a.days.map((n) => WEEKDAYS.indexOf(n)) : schedule.map((s, i) => (s.length ? i : -1)).filter((i) => i >= 0)
          for (const i of days) {
            const last = schedule[i][schedule[i].length - 1] ?? { start: prefs.startTime, end: prefs.bedtime }
            const slot = { start: a.start_time ?? last.start, end: a.bedtime ?? last.end }
            schedule[i] = [...schedule[i].slice(0, -1), slot]
          }
        }
        for (const n of a.nights_off ?? []) schedule[WEEKDAYS.indexOf(n)] = []
        return setPreferences(lib, {
          schedule,
          ...(a.gap_minutes !== undefined ? { gapMinutes: a.gap_minutes } : {}),
          ...(a.wind_down_minutes !== undefined ? { windDownMinutes: a.wind_down_minutes } : {}),
          ...(a.weekly_budget_hours !== undefined ? { weeklyBudgetMinutes: Math.round(a.weekly_budget_hours * 60) } : {}),
          ...(a.calendar_every_episode !== undefined ? { calendarEpisodes: a.calendar_every_episode } : {})
        })
      })
      const p = preferencesOf(after)
      return ['Done. The usual week is now:', ...p.schedule.map((slots, i) => `- ${weekdayName(i)}: ${slotText(slots)}`), `Gap ${p.gapMinutes} min, wind down ${p.windDownMinutes} min, weekly budget ${p.weeklyBudgetMinutes ? formatHours(p.weeklyBudgetMinutes) : 'none'}.`].join('\n')
    }
  )

  tool(
    server,
    'set_services',
    {
      title: 'Streaming services',
      description: 'Adds or removes the streaming services the user pays for (by name, like "Netflix" or "Disney Plus"), which Eclipse uses for where to watch and filters.',
      inputSchema: { add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() },
      write: true
    },
    async ({ add, remove }: { add?: string[]; remove?: string[] }) => {
      needKey(d)
      const all = await d.tmdb.services()
      const squash = (s: string): string => s.toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, '')
      const find = (name: string): Provider => {
        const w = squash(name)
        const exact = all.filter((p) => squash(p.name) === w)
        const inside = exact.length ? exact : all.filter((p) => squash(p.name).includes(w))
        if (inside.length >= 1) return [...inside].sort((x, y) => x.name.length - y.name.length)[0]
        throw new Error(`No service called “${name}” in this country. Some there are: ${all.slice(0, 30).map((p) => p.name).join(', ')}.`)
      }
      const adding = (add ?? []).map(find)
      const removing = (remove ?? []).map(find)
      const after = d.change((lib) => {
        const ids = new Set(preferencesOf(lib).services)
        for (const p of adding) ids.add(p.id)
        for (const p of removing) ids.delete(p.id)
        return setPreferences(lib, { services: [...ids] })
      })
      const now = preferencesOf(after).services.map((id) => all.find((p) => p.id === id)?.name ?? `#${id}`)
      return `Services now: ${now.join(', ') || 'none'}.`
    }
  )
}

// ---------- App settings ----------

function settingsTools(server: McpServer, d: ToolDeps): void {
  const app = d.app
  if (!app) return
  tool(server, 'get_app_settings', { title: 'App settings', description: 'Eclipse’s settings on this computer: tray, Discord status, noticing what’s watched, bedtime guard, starting with the computer and text size.', inputSchema: {} }, () => app.status())
  tool(
    server,
    'set_app_setting',
    {
      title: 'Change an app setting',
      description:
        'Changes one of Eclipse’s settings on this computer. tray: show Eclipse in the tray/menu bar. discord_status: show what’s playing as the Discord status. notice_browser_history / notice_whats_playing: notice what’s watched. bedtime_guard: a nudge when starting an episode too close to bed. start_with_computer. text_size: 0.8 to 1.5 (1 is normal).',
      inputSchema: { setting: z.enum(APP_SETTINGS), value: z.union([z.boolean(), z.number()]).describe('true/false, or a number for text_size') },
      write: true
    },
    ({ setting, value }: { setting: AppSetting; value: boolean | number }) => app.set(setting, value)
  )
}

// ---------- Always there ----------

function openTool(server: McpServer, d: ToolDeps): void {
  tool(
    server,
    'open_in_eclipse',
    {
      title: 'Show something in Eclipse',
      description: `Brings Eclipse’s window up on a page (${CLAUDE_PAGES.join(', ')}) or on a film or show’s page.`,
      inputSchema: { page: z.enum(CLAUDE_PAGES as unknown as [string, ...string[]]).optional(), title: titleArg.optional(), type: typeArg }
    },
    async ({ page, title, type }: { page?: string; title?: string; type?: MediaType }) => {
      if (title) {
        const f = await findTitle(d, title, { type })
        d.show({ title: { type: f.item.type, id: f.item.id } })
        return `Opened ${f.item.title.name} in Eclipse.`
      }
      d.show({ page: (page ?? 'home') as (typeof CLAUDE_PAGES)[number] })
      return `Opened ${page ?? 'home'} in Eclipse.`
    }
  )
}

const AREA_TOOLS: Record<ClaudeArea, (server: McpServer, d: ToolDeps) => void> = {
  library: libraryTools,
  tracking: trackingTools,
  discover: discoverTools,
  evenings: eveningTools,
  settings: settingsTools
}

/** Adds the tools for the parts of Eclipse that are switched on. */
export function registerEclipseTools(server: McpServer, d: ToolDeps): void {
  for (const [area, add] of Object.entries(AREA_TOOLS) as [ClaudeArea, (typeof AREA_TOOLS)[ClaudeArea]][]) if (d.areas[area]) add(server, d)
  openTool(server, d)
}

