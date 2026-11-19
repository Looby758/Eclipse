import { app, BrowserWindow, clipboard, dialog, net, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as tmdb from './tmdb'
import { errorText, log } from './health'

/**
 * Phase 46: the send-off when you finish a show. The main process finds the show's theme tune and
 * turns the finale into a picture to paste into Discord or save.
 *
 * Theme tunes come from Plex's free theme library (one MP3 per show, by its TheTVDB number). It's
 * unofficial, so anything going wrong just means no music. Each tune is downloaded once and kept in
 * the app's own folder, so a finish plays offline next time, and "not there" is remembered for a month.
 */

const THEMES = 'https://tvthemes.plexapp.com'
const MISSING_FOR_MS = 30 * 24 * 60 * 60 * 1000

const themeDir = (): string => join(app.getPath('userData'), 'themes')

export async function themeFor(tvId: number): Promise<Uint8Array | null> {
  try {
    const tvdb = (await tmdb.tvdbId(tvId)).data
    if (!tvdb) return null
    const dir = themeDir()
    const file = join(dir, `${tvdb}.mp3`)
    const missing = join(dir, `${tvdb}.missing`)
    if (existsSync(file)) return new Uint8Array(readFileSync(file))
    if (existsSync(missing) && Date.now() - statSync(missing).mtimeMs < MISSING_FOR_MS) return null
    mkdirSync(dir, { recursive: true })
    const res = await net.fetch(`${THEMES}/${tvdb}.mp3`)
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !/audio|mpeg|octet-stream/.test(type)) {
      if (res.status === 404 || res.ok) writeFileSync(missing, '')
      return null
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length < 10_000) return null
    writeFileSync(file, bytes)
    return bytes
  } catch (err) {
    log(`[finale] No theme tune for ${tvId}: ${errorText(err)}`)
    return null
  }
}

/** The window as it looks right now (the finale, with its buttons already hidden), copied or saved. */
export async function finaleImage(win: BrowserWindow, how: 'copy' | 'save', name: string): Promise<{ done: boolean; path?: string }> {
  const image = await win.webContents.capturePage()
  if (how === 'copy') {
    clipboard.writeImage(image)
    return { done: true }
  }
  const safe = name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Eclipse'
  const result = await dialog.showSaveDialog(win, {
    title: 'Save your finish',
    defaultPath: join(app.getPath('pictures'), `${safe}, finished.png`),
    buttonLabel: 'Save',
    filters: [{ name: 'Picture', extensions: ['png'] }]
  })
  if (result.canceled || !result.filePath) return { done: false }
  writeFileSync(result.filePath, image.toPNG())
  shell.showItemInFolder(result.filePath)
  return { done: true, path: result.filePath }
}
