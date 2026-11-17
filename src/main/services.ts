import { errorText, report } from './health'
import { app } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { localDate, preferencesOf } from '@core/library'
import { normalizeHistory, streamingIds, updateHistory, type ServiceHistory } from '@core/services'
import type { Library } from '@core/types'
import * as tmdb from './tmdb'

/**
 * Phase 19: once a day, note where your watchlist and shows are streaming, so Eclipse can say what
 * arrived on your services and what left. Kept with the app's own data (not synced): each
 * computer keeps its own, and both come to the same answers.
 */

const file = (): string => join(app.getPath('userData'), 'services-history.json')

let history: ServiceHistory | null = null

export function getHistory(): ServiceHistory {
  if (history) return history
  try {
    history = normalizeHistory(existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : null)
  } catch {
    history = normalizeHistory(null)
  }
  return history
}

function save(h: ServiceHistory): void {
  history = h
  writeFileSync(`${file()}.tmp`, JSON.stringify(h), 'utf8')
  renameSync(`${file()}.tmp`, file())
}

/** The titles worth watching for: your watchlist, what you're watching, and Watch soon. */
function trackedKeys(lib: Library): string[] {
  const keys = Object.values(lib.entries)
    .filter((e) => e.status === 'want' || e.status === 'watching')
    .map((e) => e.key as string)
  return [...new Set([...keys, ...(lib.watchSoon ?? []).map((r) => r.key as string)])]
}

/** Takes today's snapshot if there isn't one yet. Returns true when there's news. */
export async function snapshotServices(getLibrary: () => Library): Promise<boolean> {
  const today = localDate(new Date())
  const h = getHistory()
  if (h.snapshot?.day === today || !tmdb.hasKey()) return false
  const lib = getLibrary()
  const region = preferencesOf(lib).region
  const keys = trackedKeys(lib)
  if (!keys.length) return false
  const found = await tmdb.providersMany(keys, region)
  const titles: Record<string, number[]> = {}
  const providers: Record<number, string> = {}
  for (const key of keys) {
    const p = found[key]
    // Couldn't check it today: keep yesterday's answer rather than calling it gone.
    if (!p) {
      if (h.snapshot?.titles[key]) titles[key] = h.snapshot.titles[key]
      continue
    }
    titles[key] = streamingIds(p)
    for (const s of [...p.stream, ...p.free]) providers[s.id] = s.name
  }
  try {
    for (const s of (await tmdb.services(region)).data) providers[s.id] ??= s.name
  } catch {
    // Names from the titles themselves will do.
  }
  const names: Record<string, string> = {}
  for (const key of keys) names[key] = lib.entries[key]?.title.name ?? lib.watchSoon?.find((r) => r.key === key)?.name ?? key
  const next = updateHistory(h, { day: today, titles }, names, providers)
  save(next)
  return next.events.length > h.events.length
}

/** On start (after a moment, so opening the app stays quick) and every six hours after. */
export function startServiceWatch(getLibrary: () => Library, onNews: () => void): void {
  const run = (): void => {
    snapshotServices(getLibrary)
      .then((news) => {
        report('services', true, news ? 'Checked: something arrived or left' : 'Checked where your titles are streaming')
        if (news) onNews()
      })
      .catch((err) => report('services', false, `Couldn't check your services: ${errorText(err)}`))
  }
  setTimeout(run, 20_000)
  setInterval(run, 6 * 60 * 60 * 1000)
}
