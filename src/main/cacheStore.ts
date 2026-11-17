import { app } from 'electron'
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { cacheFileName, type CacheEntry, type CacheStore } from '@core/cache'

/**
 * Saved TMDB answers, one small JSON file each, in the app's own data folder (tmdb-cache). Not
 * synced with your library: it's only a copy of TMDB and can always be rebuilt.
 */
export const cacheDir = (): string => join(app.getPath('userData'), 'tmdb-cache')

export const fileCache: CacheStore = {
  async read<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const entry = JSON.parse(await readFile(join(cacheDir(), `${cacheFileName(key)}.json`), 'utf8'))
      return typeof entry?.savedAt === 'number' ? (entry as CacheEntry<T>) : null
    } catch {
      return null
    }
  },
  async write<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    await mkdir(cacheDir(), { recursive: true })
    const file = join(cacheDir(), `${cacheFileName(key)}.json`)
    await writeFile(`${file}.tmp`, JSON.stringify(entry), 'utf8')
    await rename(`${file}.tmp`, file)
  }
}

export async function clearCache(): Promise<void> {
  await rm(cacheDir(), { recursive: true, force: true })
}
