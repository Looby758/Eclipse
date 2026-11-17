import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'path'
import { setStatus } from '@core/library'
import { TmdbError } from '@core/tmdb'
import type { AppStatus, Result } from '@shared/api'
import { loadSettings, saveSettings } from './settings'
import { clearCache } from './cacheStore'
import * as tmdb from './tmdb'
import { getLibrary, isDirectory, openLibrary, saveLibrary } from './library'

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
  const { dataFolder, region } = loadSettings()
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
  ipcMain.handle('tmdb:trending', () => attempt(() => tmdb.trending()))
  ipcMain.handle('tmdb:details', (_e, type: 'movie' | 'tv', id: number, refresh?: boolean) => attempt(() => tmdb.details(type, id, refresh)))
  ipcMain.handle('cache:clear', () => clearCache())

  ipcMain.handle('library:get', () => {
    // The folder may have appeared since (Google Drive started late).
    if (!Object.keys(getLibrary().entries).length) reopenLibrary()
    return getLibrary()
  })
  ipcMain.handle('library:setStatus', (_e, item, newStatus) => saveLibrary(setStatus(getLibrary(), item, newStatus)))
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
