import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'fs'
import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import { localDate, normalizeLibrary } from '@core/library'
import { BACKUP_NAME, backupName, backupsToDrop, librarySummary } from '@core/safety'
import type { Library } from '@core/types'
import { LIBRARY_FILE } from './library'
import { errorText, report } from './health'

/**
 * Phase 37: a copy of library.json every day in a "backups" folder inside the data folder. The last
 * 14 days are kept, plus the first one of each month before that.
 */

export interface BackupInfo {
  day: string
  file: string
  bytes: number
  titles: number
  episodes: number
  watched: number
}

const dirOf = (folder: string): string => join(folder, 'backups')

/** Makes today's backup if there isn't one, then tidies old ones away. Safe to call often. */
export function dailyBackup(folder: string | null, now = new Date()): void {
  if (!folder) return
  try {
    const source = join(folder, LIBRARY_FILE)
    if (!existsSync(source)) return
    const dir = dirOf(folder)
    mkdirSync(dir, { recursive: true })
    const today = localDate(now)
    const target = join(dir, backupName(today))
    if (!existsSync(target)) {
      copyFileSync(source, target)
      report('backup', true, `Made today's backup`)
    } else report('backup', true, `Today's backup is there`)
    const days = readdirSync(dir)
      .map((n) => BACKUP_NAME.exec(n)?.[1])
      .filter((d): d is string => !!d)
    for (const d of backupsToDrop(days, today)) unlinkSync(join(dir, backupName(d)))
  } catch (err) {
    report('backup', false, `Couldn't make a backup: ${errorText(err)}`)
  }
}

function readBackup(file: string): Library {
  return normalizeLibrary(JSON.parse(readFileSync(file, 'utf8')))
}

/** What's in each backup file, kept while the file is unchanged, so opening Settings doesn't re-read them all. */
const summaries = new Map<string, { mtimeMs: number; size: number; info: BackupInfo }>()

/**
 * The backups, newest first, with what's in each. Reads the files without holding up the app (each
 * one is a whole library), and only the ones that are new or changed since last time.
 */
export async function listBackups(folder: string | null): Promise<BackupInfo[]> {
  if (!folder) return []
  const dir = dirOf(folder)
  if (!existsSync(dir)) return []
  const out: BackupInfo[] = []
  for (const name of await readdir(dir)) {
    const day = BACKUP_NAME.exec(name)?.[1]
    if (!day) continue
    const file = join(dir, name)
    try {
      const { mtimeMs, size } = await stat(file)
      const known = summaries.get(file)
      if (known && known.mtimeMs === mtimeMs && known.size === size) {
        out.push(known.info)
        continue
      }
      const info = { day, file: name, bytes: size, ...librarySummary(normalizeLibrary(JSON.parse(await readFile(file, 'utf8')))) }
      summaries.set(file, { mtimeMs, size, info })
      out.push(info)
    } catch {
      // A half-synced or broken copy: leave it out of the list.
    }
  }
  return out.sort((a, b) => b.day.localeCompare(a.day))
}

/** Reads one backup by its day, for restoring. */
export function backupFor(folder: string | null, day: string): Library {
  if (!folder || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('That backup can’t be found.')
  const file = join(dirOf(folder), backupName(day))
  if (!existsSync(file)) throw new Error('That backup can’t be found.')
  return readBackup(file)
}
