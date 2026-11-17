import type { Library, SeasonDetails, TitleDetails } from './types'
import { tmdbPageUrl } from './tmdb'

/**
 * The release calendar: films on your watchlist coming out, and new seasons (or every new
 * episode) of shows you follow, as all-day events in an .ics file for Google Calendar or Outlook.
 */

export type ReleaseKind = 'film' | 'premiere' | 'episode' | 'finale'

export interface ReleaseEvent {
  /** Stable, so exporting again describes the same events rather than new ones. */
  uid: string
  /** YYYY-MM-DD */
  date: string
  kind: ReleaseKind
  key: string
  /** The calendar entry's title, e.g. "The Boys: season 5 starts". */
  title: string
  /** A line of detail, e.g. the episode's name. */
  detail: string
  url: string
}

export interface CalendarInput {
  library: Library
  /** Details for the films and shows in your library, by title key. */
  details: Record<string, TitleDetails>
  /** Seasons fetched for shows with something coming up, by "tvId:season". */
  seasons: Record<string, SeasonDetails>
  today: string
  /** Every new episode, not just premieres and finales. */
  everyEpisode: boolean
  /** How far ahead to look, in days. */
  horizonDays?: number
}

const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Shows count if you haven't stopped them (finished ones too, for new seasons); films only if they're on your watchlist. */
export function followed(library: Library): string[] {
  return Object.values(library.entries)
    .filter((e) => (e.type === 'tv' ? e.status !== 'stopped' : e.status === 'want'))
    .map((e) => e.key)
}

/** The seasons worth fetching for a show: the one airing now and any that start later. */
export function seasonsToCheck(d: TitleDetails, today: string): number[] {
  if (d.type !== 'tv') return []
  const out = new Set<number>()
  if (d.nextEpisode) out.add(d.nextEpisode.season)
  for (const s of d.seasons) if (s.number > 0 && s.airDate && s.airDate >= today) out.add(s.number)
  return [...out].sort((a, b) => a - b)
}

export function upcomingReleases({ library, details, seasons, today, everyEpisode, horizonDays = 730 }: CalendarInput): ReleaseEvent[] {
  const until = addDays(today, horizonDays)
  const inRange = (day: string | null | undefined): day is string => !!day && day >= today && day <= until
  const out = new Map<string, ReleaseEvent>()
  const add = (e: ReleaseEvent): void => {
    if (!out.has(e.uid)) out.set(e.uid, e)
  }

  for (const key of followed(library)) {
    const d = details[key]
    if (!d) continue
    const url = tmdbPageUrl(d.type, d.id)
    if (d.type === 'movie') {
      if (inRange(d.date)) add({ uid: `${key}-release`, date: d.date, kind: 'film', key, title: `${d.name} is out`, detail: d.tagline || 'On your watchlist.', url })
      continue
    }
    for (const n of seasonsToCheck(d, today)) {
      const s = seasons[`${d.id}:${n}`]
      const listed = d.seasons.find((x) => x.number === n)
      const aired = (s?.episodes ?? []).filter((ep) => ep.airDate).sort((a, b) => a.number - b.number)
      if (!aired.length) {
        // Only the season's start date is known.
        const day = listed?.airDate ?? (d.nextEpisode?.season === n ? d.nextEpisode.airDate : null)
        if (inRange(day)) add({ uid: `${key}-s${n}e1`, date: day, kind: 'premiere', key, title: `${d.name}: season ${n} starts`, detail: '', url })
        continue
      }
      const last = aired[aired.length - 1]
      for (const ep of aired) {
        if (!inRange(ep.airDate)) continue
        const first = ep.number === 1
        const finale = ep === last && aired.length > 1 && (s?.episodes.length ?? 0) === aired.length
        if (!everyEpisode && !first && !finale) continue
        const name = ep.name && !/^episode \d+$/i.test(ep.name) ? `“${ep.name}”` : ''
        add({
          uid: `${key}-s${n}e${ep.number}`,
          date: ep.airDate,
          kind: first ? 'premiere' : finale ? 'finale' : 'episode',
          key,
          title: first ? `${d.name}: season ${n} starts` : finale ? `${d.name}: season ${n} finale` : `${d.name}: S${n} E${ep.number}`,
          detail: [`Season ${n}, episode ${ep.number}`, name].filter(Boolean).join(' '),
          url
        })
      }
    }
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}

// ---- The .ics file ----

const escapeText = (s: string): string => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Splits a line at 75 bytes, as the calendar format asks, without breaking a character in two. */
function fold(line: string): string {
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length
    const limit = parts.length ? 74 : 75
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const stamp = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function toIcs(events: ReleaseEvent[], now: Date = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Eclipse//Release calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Eclipse releases']
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid.replace(/[^A-Za-z0-9-]/g, '-')}@eclipse`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`,
      `SUMMARY:${escapeText(e.title)}`,
      ...(e.detail ? [`DESCRIPTION:${escapeText(e.detail)}`] : []),
      `URL:${e.url}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT'
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
