import { STATUS_LABELS, type Library, type LibraryEntry } from './types'

/**
 * Phases 36 and 37: asking before removing something with history, naming a change so it can be
 * undone, and choosing which daily backups to keep. Plain functions, no Electron.
 */

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** What removing a title would forget, as short phrases ("62 watched episodes", "1 rewatch"). Empty if nothing. */
export function whatRemovingForgets(entry: LibraryEntry): string[] {
  const out: string[] = []
  const episodes = Object.keys(entry.episodes ?? {}).length
  if (episodes) out.push(plural(episodes, 'watched episode'))
  else if (entry.status === 'watched' || entry.watchedOn || entry.seenBefore) out.push(entry.watchedOn ? `the day you watched it (${entry.watchedOn})` : 'that you watched it')
  const rewatches = (entry.rewatches ?? []).filter((r) => !r.with).length
  if (rewatches) out.push(plural(rewatches, 'rewatch', 'rewatches'))
  const together = (entry.rewatches ?? []).filter((r) => r.with)
  if (together.length) out.push(`your watch with ${[...new Set(together.map((r) => r.with))].join(' and ')}`)
  if (entry.moments?.length) out.push(plural(entry.moments.length, 'saved moment'))
  if (entry.note?.trim()) out.push('your note')
  if (entry.rating != null) out.push('your rating')
  return out
}

const joinAnd = (parts: string[]): string => (parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`)

/** "Remove Breaking Bad? This forgets 62 watched episodes and 1 rewatch." or null when there's no history to lose. */
export function removeQuestion(entry: LibraryEntry): { title: string; detail: string } | null {
  const parts = whatRemovingForgets(entry)
  if (!parts.length) return null
  return { title: `Remove ${entry.title.name}?`, detail: `This forgets ${joinAnd(parts)}.` }
}

const ticks = (e: LibraryEntry | undefined): number => Object.keys(e?.episodes ?? {}).length
const rewatchTicks = (e: LibraryEntry | undefined): number => (e?.rewatches ?? []).reduce((n, r) => n + Object.keys(r.episodes ?? {}).length, 0)

/** Names what changed between two copies of the library, for the "Done · Undo" bar. null if nothing did. */
export function describeChange(before: Library, after: Library): string | null {
  if (before === after) return null
  const keys = new Set([...Object.keys(before.entries), ...Object.keys(after.entries)])
  const changed = [...keys].filter((k) => before.entries[k] !== after.entries[k])
  if (changed.length === 1) {
    const k = changed[0]
    const a = before.entries[k]
    const b = after.entries[k]
    const name = (b ?? a)!.title.name
    if (!b) return `Removed ${name}`
    if (!a) return `Added ${name} to ${STATUS_LABELS[b.status]}`
    const own = ticks(b) - ticks(a)
    const again = rewatchTicks(b) - rewatchTicks(a)
    const diff = own || again
    if (diff > 0) return `Ticked ${plural(diff, 'episode')} of ${name}`
    if (diff < 0) return `Unticked ${plural(-diff, 'episode')} of ${name}`
    if ((b.rewatches?.length ?? 0) < (a.rewatches?.length ?? 0)) return `Removed a watch of ${name}`
    if ((b.rewatches?.length ?? 0) > (a.rewatches?.length ?? 0)) return `Started watching ${name} again`
    if (a.status !== b.status) return `${name}: ${STATUS_LABELS[b.status]}`
    return `Changed ${name}`
  }
  if (changed.length > 1) {
    const ep = changed.reduce((n, k) => n + ticks(after.entries[k]) - ticks(before.entries[k]), 0)
    if (ep > 0) return `Ticked ${plural(ep, 'episode')} across ${plural(changed.length, 'title')}`
    if (ep < 0) return `Unticked ${plural(-ep, 'episode')} across ${plural(changed.length, 'title')}`
    return `Changed ${plural(changed.length, 'title')}`
  }
  if ((after.lists?.length ?? 0) < (before.lists?.length ?? 0)) {
    const gone = (before.lists ?? []).find((l) => !(after.lists ?? []).some((m) => m.id === l.id))
    return gone ? `Removed the list ${gone.name}` : 'Removed a list'
  }
  return 'Changed your library'
}

// ---- Phase 37: daily backups ----

/** A backup file's day, from its name: "library-2026-11-17.json". */
export const BACKUP_NAME = /^library-(\d{4}-\d{2}-\d{2})\.json$/
export const backupName = (day: string): string => `library-${day}.json`

const dayNumber = (day: string): number => Math.round(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86_400_000)

/**
 * Which backups to keep: every one from the last `days` days (today included), plus the earliest
 * one of each month before that. Returns the days to delete.
 */
export function backupsToDrop(days: string[], today: string, keepDays = 14): string[] {
  const sorted = [...new Set(days)].sort()
  const cutoff = dayNumber(today) - (keepDays - 1)
  const monthly = new Set<string>()
  const seenMonth = new Set<string>()
  for (const d of sorted) {
    const month = d.slice(0, 7)
    if (!seenMonth.has(month)) {
      seenMonth.add(month)
      monthly.add(d)
    }
  }
  return sorted.filter((d) => dayNumber(d) < cutoff && !monthly.has(d))
}

/** What's in a library, in a few numbers, for the Restore list. */
export function librarySummary(library: Library): { titles: number; episodes: number; watched: number } {
  const entries = Object.values(library.entries)
  return {
    titles: entries.length,
    episodes: entries.reduce((n, e) => n + ticks(e), 0),
    watched: entries.filter((e) => e.status === 'watched').length
  }
}
