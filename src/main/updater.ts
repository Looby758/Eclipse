import { app, BrowserWindow, ipcMain, shell } from 'electron'
import type { AppUpdater } from 'electron-updater'
import { GITHUB_REPO, type UpdateStatus } from '@shared/api'

/**
 * Updates come from the project's GitHub Releases, as in Orbit. On Windows a newer version
 * downloads in the background and installs when you restart (or next quit). On a Mac, apps can
 * only replace themselves when signed with a paid Apple certificate, so there Eclipse just tells
 * you about the new version and opens its download page.
 */

const MAC = process.platform === 'darwin'
const CHECK_EVERY = 6 * 60 * 60 * 1000
const FIRST_CHECK_AFTER = 15_000

let status: UpdateStatus = { state: 'off', current: app.getVersion() }
let supported = false
// Loaded only in the installed app, so running from the code never needs it.
let autoUpdater: AppUpdater

function set(patch: Partial<UpdateStatus>): void {
  status = { ...status, ...patch }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update:status', status)
}

/** Short, readable reasons instead of stack traces. */
function friendly(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|net::ERR_/i.test(text)) return 'Couldn’t reach GitHub. Check your internet connection.'
  if (/\b404\b/.test(text)) return 'No releases have been published yet.'
  return text.split('\n')[0].slice(0, 200)
}

async function install(): Promise<void> {
  if (status.manual || MAC) {
    const tag = status.version ? `tag/v${status.version}` : 'latest'
    await shell.openExternal(`https://github.com/${GITHUB_REPO}/releases/${tag}`)
    return
  }
  if (status.state === 'ready') autoUpdater.quitAndInstall(true, true)
}

async function check(): Promise<UpdateStatus> {
  if (!supported) return status
  if (status.state === 'ready' || status.state === 'downloading') return status
  try {
    const result = await autoUpdater.checkForUpdates()
    result?.downloadPromise?.catch(() => undefined)
  } catch (err) {
    set({ state: 'error', error: friendly(err) })
  }
  return status
}

export async function setupUpdater(): Promise<void> {
  ipcMain.handle('update:status', () => status)
  ipcMain.handle('update:check', () => check())
  ipcMain.handle('update:install', () => install())
  supported = app.isPackaged
  if (!supported) {
    status = { ...status, reason: 'Updates are checked in the installed app only.' }
    return
  }
  try {
    autoUpdater = (await import('electron-updater')).autoUpdater
  } catch {
    supported = false
    status = { ...status, reason: 'The update checker is missing from this copy.' }
    return
  }
  status = { ...status, state: 'none' }

  autoUpdater.logger = null
  autoUpdater.autoDownload = !MAC
  autoUpdater.autoInstallOnAppQuit = !MAC

  autoUpdater.on('checking-for-update', () => set({ state: 'checking', error: undefined }))
  autoUpdater.on('update-not-available', () => set({ state: 'none' }))
  autoUpdater.on('update-available', (info) => set({ state: MAC ? 'available' : 'downloading', version: info.version, percent: 0, manual: MAC }))
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version, percent: 100 }))
  autoUpdater.on('error', (err) => set({ state: 'error', error: friendly(err) }))

  setTimeout(() => void check(), FIRST_CHECK_AFTER)
  setInterval(() => void check(), CHECK_EVERY)
}
