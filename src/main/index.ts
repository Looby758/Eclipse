import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { toIcs } from '@core/calendar'
import { moveWatchSoon, setWatchSoon } from '@core/watchsoon'
import { endRewatch, markRowSeen, markSeenBefore, preferencesOf, removeRewatch, setEpisodes, startRewatch, setFinishBy, setNote, setPreferences, setStatus, setWatchedOn } from '@core/library'
import { TmdbError } from '@core/tmdb'
import { createList, followList, moveInList, removeList, renameList, setInList } from '@core/lists'
import type { TitleRef } from '@core/types'
import { mergeSequel, summarizeImport, type SequelImport } from '@core/sequel'
import type { AppStatus, Result } from '@shared/api'
import { loadSettings, saveSettings } from './settings'
import { clearCache } from './cacheStore'
import * as tmdb from './tmdb'
import { backupLibrary, getLibrary, isDirectory, openLibrary, saveLibrary } from './library'
import { readSequelExport } from './sequelImport'

// Window background, matching --bg in src/renderer/src/styles/theme.css so there's no flash on start.
const BG = '#040309'
const IS_MAC = process.platform === 'darwin'

app.setPath('userData', join(app.getPath('appData'), 'Eclipse'))

let mainWindow: BrowserWindow | null = null

// Only one copy runs (two copies writing the same library would fight); starting it again shows the window.
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

function status(): AppStatus {
  const { dataFolder } = loadSettings()
  const { region } = preferencesOf(getLibrary())
  return {
    dataFolder,
    dataFolderMissing: !!dataFolder && !isDirectory(dataFolder),
    hasKey: tmdb.hasKey(),
    canEncrypt: tmdb.canEncrypt(),
    region,
    version: app.getVersion()
  }
}

const broadcastLibrary = (): void => mainWindow?.webContents.send('library:changed', getLibrary())

function reopenLibrary(): void {
  openLibrary(loadSettings().dataFolder, broadcastLibrary)
}

/** Runs a TMDB call and turns errors into a plain message for the window. */
async function attempt<T>(job: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await job() }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message, kind: err instanceof TmdbError ? err.kind : undefined }
  }
}

function setupIpc(): void {
  ipcMain.handle('app:status', () => status())
  ipcMain.handle('app:openExternal', (_e, url: string) => {
    // Only web links: nothing else is opened from the window.
    if (/^https:\/\//.test(url)) return shell.openExternal(url)
  })

  ipcMain.handle('data:pick', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)!
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose a folder for your Eclipse data',
      buttonLabel: 'Use this folder',
      properties: ['openDirectory', 'createDirectory', 'promptToCreate']
    })
    if (!result.canceled && result.filePaths[0]) {
      saveSettings({ dataFolder: result.filePaths[0] })
      reopenLibrary()
      broadcastLibrary()
    }
    return status()
  })
  ipcMain.handle('data:reveal', async () => {
    const { dataFolder } = loadSettings()
    if (isDirectory(dataFolder)) await shell.openPath(dataFolder)
  })

  ipcMain.handle('tmdb:setKey', (_e, key: string) => attempt(async () => (await tmdb.setKey(key), status())))
  ipcMain.handle('tmdb:clearKey', () => (tmdb.clearKey(), status()))
  ipcMain.handle('tmdb:search', (_e, query: string) => attempt(() => tmdb.search(query)))
  const region = (): string => preferencesOf(getLibrary()).region
  ipcMain.handle('tmdb:season', (_e, tvId: number, n: number, refresh?: boolean) => attempt(() => tmdb.season(tvId, n, refresh)))
  ipcMain.handle('tmdb:providers', (_e, type: 'movie' | 'tv', id: number, refresh?: boolean) => attempt(() => tmdb.providers(type, id, region(), refresh)))
  ipcMain.handle('tmdb:providersMany', (_e, keys: string[]) => tmdb.providersMany(keys, region()))
  ipcMain.handle('tmdb:credits', (_e, type: 'movie' | 'tv', id: number) => attempt(() => tmdb.credits(type, id)))
  ipcMain.handle('tmdb:person', (_e, id: number) => attempt(() => tmdb.person(id)))
  ipcMain.handle('tmdb:collection', (_e, id: number) => attempt(() => tmdb.collection(id)))
  ipcMain.handle('tmdb:list', (_e, id: number) => attempt(() => tmdb.tmdbList(id)))
  ipcMain.handle('calendar:preview', () => attempt(() => tmdb.calendarEvents(getLibrary())))
  ipcMain.handle('calendar:export', (event) =>
    attempt(async () => {
      const events = await tmdb.calendarEvents(getLibrary())
      const win = BrowserWindow.fromWebContents(event.sender)!
      const result = await dialog.showSaveDialog(win, {
        title: 'Save your release calendar',
        defaultPath: join(app.getPath('downloads'), 'Eclipse releases.ics'),
        buttonLabel: 'Save',
        filters: [{ name: 'Calendar file', extensions: ['ics'] }]
      })
      if (result.canceled || !result.filePath) return { saved: false, count: events.length }
      writeFileSync(result.filePath, toIcs(events), 'utf8')
      shell.showItemInFolder(result.filePath)
      return { saved: true, path: result.filePath, count: events.length }
    })
  )
  ipcMain.handle('lists:open', (_e, id: string, refresh?: boolean) => attempt(() => tmdb.openList(id, getLibrary(), refresh)))
  ipcMain.handle('tmdb:detailsMany', (_e, keys: string[]) => tmdb.detailsMany(keys))
  ipcMain.handle('tmdb:services', () => attempt(() => tmdb.services(region())))
  ipcMain.handle('tmdb:trending', () => attempt(() => tmdb.trending()))
  ipcMain.handle('tmdb:details', (_e, type: 'movie' | 'tv', id: number, refresh?: boolean) => attempt(() => tmdb.details(type, id, refresh)))
  ipcMain.handle('cache:clear', () => clearCache())

  ipcMain.handle('library:get', () => {
    // The folder may have appeared since (Google Drive started late).
    if (!Object.keys(getLibrary().entries).length) reopenLibrary()
    return getLibrary()
  })
  ipcMain.handle('library:setStatus', (_e, item, newStatus) => saveLibrary(setStatus(getLibrary(), item, newStatus)))
  ipcMain.handle('library:setEpisodes', (_e, item, keys: string[], watched: boolean, undated?: boolean) => saveLibrary(setEpisodes(getLibrary(), item, keys, watched, new Date(), !!undated)))
  ipcMain.handle('library:seenBefore', (_e, item) => saveLibrary(markSeenBefore(getLibrary(), item)))
  ipcMain.handle('library:markRowSeen', (_e, ref, on) => saveLibrary(markRowSeen(getLibrary(), ref, on)))
  ipcMain.handle('library:startRewatch', (_e, item) => saveLibrary(startRewatch(getLibrary(), item)))
  ipcMain.handle('library:endRewatch', (_e, key: string, keep: boolean) => saveLibrary(endRewatch(getLibrary(), key, keep)))
  ipcMain.handle('library:removeRewatch', (_e, key: string, index: number) => saveLibrary(removeRewatch(getLibrary(), key, index)))
  ipcMain.handle('library:setNote', (_e, key: string, note: string) => saveLibrary(setNote(getLibrary(), key, note)))
  ipcMain.handle('library:setWatchedOn', (_e, key: string, day: string | null) => saveLibrary(setWatchedOn(getLibrary(), key, day)))
  ipcMain.handle('lists:create', (_e, name: string, items?: TitleRef[]) => {
    const made = createList(getLibrary(), name, new Date(), items)
    return { library: saveLibrary(made.library), id: made.id }
  })
  ipcMain.handle('lists:follow', (_e, list) => saveLibrary(followList(getLibrary(), list)))
  ipcMain.handle('lists:remove', (_e, id: string) => saveLibrary(removeList(getLibrary(), id)))
  ipcMain.handle('lists:rename', (_e, id: string, name: string) => saveLibrary(renameList(getLibrary(), id, name)))
  ipcMain.handle('lists:setIn', (_e, id: string, ref: TitleRef, inList: boolean) => saveLibrary(setInList(getLibrary(), id, ref, inList)))
  ipcMain.handle('lists:move', (_e, id: string, from: number, to: number) => saveLibrary(moveInList(getLibrary(), id, from, to)))
  ipcMain.handle('soon:set', (_e, ref: TitleRef, on: boolean) => saveLibrary(setWatchSoon(getLibrary(), ref, on)))
  ipcMain.handle('soon:move', (_e, from: number, to: number) => saveLibrary(moveWatchSoon(getLibrary(), from, to)))
  ipcMain.handle('library:setFinishBy', (_e, key: string, day: string | null) => saveLibrary(setFinishBy(getLibrary(), key, day)))
  ipcMain.handle('library:setPreferences', (_e, patch) => saveLibrary(setPreferences(getLibrary(), patch)))

  // Sequel import: pick the export and see what it holds, then apply it (or don't).
  let pending: SequelImport | null = null
  ipcMain.handle('import:pickSequel', async (event, folder?: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)!
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose your Sequel export',
      buttonLabel: 'Read it',
      properties: folder ? ['openDirectory'] : ['openFile'],
      filters: folder ? undefined : [{ name: 'Sequel export', extensions: ['zip', 'csv'] }]
    })
    const path = result.filePaths[0]
    if (result.canceled || !path) return { ok: true, value: null }
    return attempt(async () => {
      pending = readSequelExport(path)
      return summarizeImport(pending, getLibrary())
    })
  })
  ipcMain.handle('import:applySequel', () =>
    attempt(async () => {
      if (!pending) throw new Error('Pick your Sequel export first.')
      backupLibrary('before-sequel')
      const lib = saveLibrary(mergeSequel(getLibrary(), pending))
      pending = null
      return lib
    })
  )
  ipcMain.handle('import:cancel', () => {
    pending = null
  })
}

function createWindow(): BrowserWindow {
  const bounds = loadSettings().window
  const win = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 820,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 760,
    minHeight: 520,
    show: false,
    backgroundColor: BG,
    title: 'Eclipse',
    // Same window style as Orbit: our own title bar, with the system's buttons kept.
    ...(IS_MAC
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 14 } }
      : { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: '#00000000', symbolColor: '#b3afd0', height: 40 } }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (bounds?.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())

  const remember = (): void => {
    if (win.isMinimized() || win.isFullScreen()) return
    saveSettings({ window: { ...(win.isMaximized() ? (loadSettings().window ?? win.getNormalBounds()) : win.getBounds()), maximized: win.isMaximized() } })
  }
  win.on('close', remember)

  // Links never open inside the app: web links go to your browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

app.whenReady().then(() => {
  reopenLibrary()
  setupIpc()
  mainWindow = createWindow()
  mainWindow.on('closed', () => (mainWindow = null))
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) {
      mainWindow = createWindow()
      mainWindow.on('closed', () => (mainWindow = null))
    }
  })
})

app.on('window-all-closed', () => {
  if (!IS_MAC) app.quit()
})
