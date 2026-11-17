import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'fs'
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

/** The backups, newest first, with what's in each. */
export function listBackups(folder: string | null): BackupInfo[] {
  if (!folder) return []
  const dir = dirOf(folder)
  if (!existsSync(dir)) return []
  const out: BackupInfo[] = []
  for (const name of readdirSync(dir)) {
    const day = BACKUP_NAME.exec(name)?.[1]
    if (!day) continue
    const file = join(dir, name)
    try {
      out.push({ day, file: name, bytes: statSync(file).size, ...librarySummary(readBackup(file)) })
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
