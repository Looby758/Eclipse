import { app } from 'electron'
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Phase 39, "Is everything working?": each background job says when it last ran and how it went,
 * in plain words, and problems go into a small log file in the app's own folder (not synced).
 */

export type JobId = 'save' | 'backup' | 'sync' | 'phone' | 'tmdb' | 'services' | 'history' | 'playing' | 'updates'

export interface JobState {
  id: JobId
  label: string
  /** Milliseconds; null if it hasn't run since Eclipse opened. */
  at: number | null
  ok: boolean
  detail: string
}

const LABELS: Record<JobId, string> = {
  save: 'Saving your library',
  backup: 'Daily backup',
  sync: 'Changes from your other computer',
  phone: 'Changes from your phone',
  tmdb: 'TMDB (titles, posters, episodes)',
  services: 'Daily services check',
  history: 'Browser history check',
  playing: "What's playing",
  updates: 'Update check'
}

const jobs = new Map<JobId, JobState>()
let changed: () => void = () => undefined

export const onHealthChanged = (fn: () => void): void => void (changed = fn)

export const logFile = (): string => join(app.getPath('userData'), 'eclipse.log')

const MAX_LOG = 200_000

/** Adds a line to the log file (trimmed to its newest part when it grows too big). */
export function log(line: string): void {
  try {
    const text = `${new Date().toISOString()} ${line.replace(/\s+/g, ' ').slice(0, 600)}\n`
    appendFileSync(logFile(), text, 'utf8')
    if (statSync(logFile()).size > MAX_LOG) {
      const keep = readFileSync(logFile(), 'utf8').slice(-MAX_LOG / 2)
      writeFileSync(logFile(), keep.slice(keep.indexOf('\n') + 1), 'utf8')
    }
  } catch {
    // Logging must never break anything.
  }
}

/** A job ran: whether it worked, and what to say about it ("found 2 episodes"). */
export function report(id: JobId, ok: boolean, detail: string): void {
  const before = jobs.get(id)
  jobs.set(id, { id, label: LABELS[id], at: Date.now(), ok, detail })
  // Log problems, and the moment something starts working again.
  if (!ok && (before?.ok !== false || before.detail !== detail)) log(`[${id}] ${detail}`)
  else if (ok && before && !before.ok) log(`[${id}] working again: ${detail}`)
  changed()
}

export const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** Every job, in a fixed order; ones that are switched off say why instead. */
export function healthStatus(off: Partial<Record<JobId, string | false>> = {}): JobState[] {
  return (Object.keys(LABELS) as JobId[]).map((id) => {
    const j = jobs.get(id)
    const why = off[id]
    if (why) return { id, label: LABELS[id], at: j?.at ?? null, ok: true, detail: why }
    return j ?? { id, label: LABELS[id], at: null, ok: true, detail: id === 'sync' ? 'Nothing new from another computer since Eclipse opened' : id === 'phone' ? 'Nothing new from your phone since Eclipse opened' : 'Not run yet since Eclipse opened' }
  })
}

/** The last part of the log, for Copy details. */
export function recentLog(lines = 60): string {
  try {
    if (!existsSync(logFile())) return ''
    return readFileSync(logFile(), 'utf8').trim().split('\n').slice(-lines).join('\n')
  } catch {
    return ''
  }
}
