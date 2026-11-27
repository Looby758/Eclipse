import { app, BrowserWindow, clipboard, dialog, ipcMain, session, shell } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { exportFiles } from '@core/export'
import { toIcs } from '@core/calendar'
import { moveWatchSoon, setWatchSoon } from '@core/watchsoon'
import { type LibraryItem, dropTitle, restoreDropped, setFrom, endWatchWith, planWatchWith, startWatchWith, tickWith, endRewatch, localDate, markRowSeen, settleSeenShows, markSeenBefore, preferencesOf, removeRewatch, setEpisodes, startRewatch, setFinishBy, snoozeTitle, setNote, setRating, setPreferences, setStatus, setWatchedOn } from '@core/library'
import { TmdbError } from '@core/tmdb'
import { createList, followList, moveInList, removeList, renameList, setInList } from '@core/lists'
import { UNDATED, type Library, type Reaction, type TitleRef } from '@core/types'
import { mergeSequel, summarizeImport, type SequelImport } from '@core/sequel'
import type { AppStatus, Result } from '@shared/api'
import { loadSettings, saveSettings } from './settings'
import { clearCache } from './cacheStore'
import * as tmdb from './tmdb'
import { backupLibrary, getLibrary, isDirectory, onSave, openLibrary, saveLibrary } from './library'
import { readSequelExport } from './sequelImport'
import { setupUpdater, updatesOff } from './updater'
import { getHistory, startServiceWatch } from './services'
import { keysWatchedIn, yearInReview } from '@core/year'
import { repairBatch, type Batch, type RepairChoice } from '@core/repair'
import { refreshTray, setTray, setupTray, trayOn } from './tray'
import { startTogetherReminders } from './together'
import { acceptSuggestion, changeDiscord, dismissSuggestion, notMine, noticingStatus, scanHistory, setNoticing, setupNoticing, stopNoticing } from './noticing'
import { discordStatus, setupDiscord, stopDiscord } from './discord'
import { showExtensionFolder } from './extension'
import { editMoment } from '@core/watching'
import { orderPosters, setBackdrop, setPoster } from '@core/posters'
import { moveFavourite, setFavourite } from '@core/favourites'
import { markMilestones, milestoneBoard, milestoneKeys } from '@core/milestones'
import { allTimeStats } from '@core/stats'
import { myTerms } from '@core/myterms'
import type { TitleKey } from '@core/types'
import { setEraName, timelineOf } from '@core/timeline'
import { setCountdown } from '@core/countdowns'
import { CATCH_UP_ID, dismissCatchUp } from '@core/catchup'
import { markAnnouncedSeen } from '@core/announced'
import { answerRecommendation } from '@core/recommend'
import { newRemoteCode, remoteStatus, setRemote, setupRemote, stopRemote } from './remote'
import { guardStatus, readOnlyReason, startGuard, stopGuard, takeOver } from './guard'
import { carryForward, carryUndo, remember, undoTarget } from './undo'
import { setReaction } from '@core/reactions'
import { loginStatus, markAsked, setStartAtLogin, startedHidden } from './login'
import { backupFor, dailyBackup, listBackups } from './backups'
import { getZoom, setupZoom, setZoom } from './zoom'
import { foldFromPhone, phoneAsks, resolveAsk, startPhone } from './phone'
import { foldHandoffsNow, startHandoff } from './handoff'
import { finaleImage, themeFor } from './finale'
import { errorText, healthStatus, log, onHealthChanged, recentLog, report } from './health'
import { setupClaudeDesktop } from './claudeDesktop'
import { APP_SETTINGS, type AppControls, type AppSetting } from './claudeTools'
import type { ClaudeShow } from '@shared/claudeDesktop'

// Window background, matching --bg in src/renderer/src/styles/theme.css so there's no flash on start.
const BG = '#040309'
const IS_MAC = process.platform === 'darwin'

app.setPath('userData', join(app.getPath('appData'), 'Eclipse'))
// Windows names notifications (and finds their icon) by the app ID. It has to match the appId in
// electron-builder.yml, which the installer puts on the Start Menu shortcut; without it Windows
// shows "electron.app.Eclipse" and no logo.
if (process.platform === 'win32') app.setAppUserModelId('com.looby758.eclipse')

let mainWindow: BrowserWindow | null = null

// Only one copy runs (two copies writing the same library would fight); starting it again shows the window.
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => {
  // Opening Eclipse again while it's in the tray brings the window back.
  if (app.isReady()) showWindow()
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

const broadcastLibrary = (): void => {
  mainWindow?.webContents.send('library:changed', getLibrary())
  refreshTray()
}
const sendRemote = (s: unknown): void => mainWindow?.webContents.send('remote:changed', s)

/** Phase 36: tells the window a change was made that the "Done · Undo" bar can put back. */
function offerUndo(before: Library, after: Library): Library {
  const offer = remember(before, after)
  if (offer) mainWindow?.webContents.send('undo:offer', offer)
  return after
}
/** Makes a change to the library, saves it, and offers to undo it. */
const change = (fn: (lib: Library) => Library): Library => {
  const before = getLibrary()
  return offerUndo(before, saveLibrary(fn(before)))
}

/** Shows ticked season by season as seen before, all the way through, move from Watching to Watched. */
async function settleOnStart(): Promise<void> {
  try {
    const lib = getLibrary()
    const keys = Object.values(lib.entries)
      .filter((e) => e.type === 'tv' && e.status === 'watching' && Object.values(e.episodes ?? {}).includes(UNDATED))
      .map((e) => e.key)
    if (!keys.length || !tmdb.hasKey()) return
    const details = await tmdb.detailsMany(keys)
    const settled = settleSeenShows(getLibrary(), details, localDate(new Date()))
    if (settled !== getLibrary()) {
      saveLibrary(settled)
      broadcastLibrary()
    }
  } catch {
    // Not worth stopping anything for: it'll try again next time.
  }
}

/** Google Drive can take a minute or two after login: keep looking for the data folder until it's there. */
function waitForDataFolder(): void {
  const timer = setInterval(() => {
    const { dataFolder } = loadSettings()
    if (!dataFolder) return clearInterval(timer)
    if (!isDirectory(dataFolder)) return
    clearInterval(timer)
    reopenLibrary()
    broadcastLibrary()
  }, 20_000)
  if (isDirectory(loadSettings().dataFolder)) clearInterval(timer)
}

function reopenLibrary(): void {
  const { dataFolder } = loadSettings()
  openLibrary(
    dataFolder,
    () => {
      report('sync', true, 'Picked up a change from your other computer')
      // Changes handed over from here may have come back saved, or (on the saving copy) be waiting.
      foldHandoffsNow()
      broadcastLibrary()
    },
    readOnlyReason
  )
  dailyBackup(isDirectory(dataFolder) ? dataFolder : null)
  // Before the guard, so it knows the folder when the guard first says whose it is.
  startHandoff(isDirectory(dataFolder) ? dataFolder : null, readOnlyReason, broadcastLibrary)
  startGuard(isDirectory(dataFolder) ? dataFolder : null, (s) => {
    mainWindow?.webContents.send('guard:changed', s)
    // Phase 45: changes from the phone wait while this copy is read-only.
    void foldFromPhone()
    // And ones handed over while read-only are saved as soon as this copy may save.
    foldHandoffsNow()
    broadcastLibrary()
  })
  startPhone(
    isDirectory(dataFolder) ? dataFolder : null,
    (asks, libraryChanged) => {
      if (libraryChanged) broadcastLibrary()
      mainWindow?.webContents.send('phone:asks', asks)
    },
    readOnlyReason
  )
}

/** Runs a TMDB call and turns errors into a plain message for the window. */
async function attempt<T>(job: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await job() }
  } catch (err) {
    const message = errorText(err)
    if (err instanceof TmdbError) report('tmdb', false, message)
    else log(`[error] ${message}`)
    return { ok: false, error: message, kind: err instanceof TmdbError ? err.kind : undefined }
  }
}

const dataFolderNow = (): string | null => {
  const { dataFolder } = loadSettings()
  return isDirectory(dataFolder) ? dataFolder : null
}

/** Phase 39: every background job, with the ones that are switched off saying so. */
function healthNow(): ReturnType<typeof healthStatus> {
  const n = noticingStatus().settings
  return healthStatus({ history: !n.history && 'Switched off', playing: !n.playing && 'Switched off', updates: updatesOff() ?? false })
}

// ---------- Claude Desktop ----------

/** The last change Claude made, so "undo that" can put it back. */
let claudeUndo: number | null = null
/** Looks Claude changed (Settings → Appearance) not yet applied by a window. */
let claudeLooks: { setting: string; value: string }[] = []
/** A page Claude asked to show before the window was ready to hear it. */
let claudeShowPending: ClaudeShow | null = null

function showForClaude(what: ClaudeShow): void {
  showWindow()
  const win = mainWindow
  if (!win) return
  claudeShowPending = what
  // A window that's still loading picks it up itself (claude:takeShow) once it's ready.
  if (!win.webContents.isLoading()) win.webContents.send('claude:show', what)
}

/** Eclipse's settings on this computer that Claude can switch (Settings → App settings in the tools). */
const claudeApp: AppControls = {
  status: () => {
    const n = noticingStatus().settings
    const d = discordStatus()
    const login = loginStatus()
    return [
      `tray: ${trayOn()}`,
      `phone_remote: ${remoteStatus().on}`,
      `discord_status: ${d.on}${d.appId ? '' : ' (not set up yet: needs a Discord application in Settings)'}`,
      `notice_browser_history: ${n.history}`,
      `notice_whats_playing: ${n.playing}`,
      `bedtime_guard: ${n.bedtime}`,
      `start_with_computer: ${login.on}${login.supported ? '' : ' (not available on this computer)'}`,
      `text_size: ${getZoom()}`
    ].join('\n')
  },
  set: (setting: AppSetting, value: boolean | number) => {
    if (!APP_SETTINGS.includes(setting)) throw new Error('Eclipse has no setting called that.')
    if (setting === 'text_size') {
      if (typeof value !== 'number') throw new Error('text_size takes a number, like 1.1.')
      return `Text size is now ${setZoom(value)}.`
    }
    if (typeof value !== 'boolean') throw new Error(`${setting} takes true or false.`)
    if (setting === 'tray') setTray(value)
    else if (setting === 'phone_remote') {
      void setRemote(value, sendRemote).then(sendRemote)
      return `The phone remote is ${value ? 'on: open Settings → Your phone as a remote in Eclipse for the QR code to scan' : 'off'}.`
    }
    else if (setting === 'discord_status') {
      if (value && !discordStatus().appId) throw new Error('The Discord status needs setting up in Eclipse first (Settings → Discord).')
      changeDiscord({ on: value })
      mainWindow?.webContents.send('discord:changed', discordStatus())
    } else if (setting === 'notice_browser_history') setNoticing({ history: value })
    else if (setting === 'notice_whats_playing') setNoticing({ playing: value })
    else if (setting === 'bedtime_guard') setNoticing({ bedtime: value })
    else if (setting === 'start_with_computer') {
      if (!setStartAtLogin(value).supported) throw new Error('Starting with the computer isn’t available here (only in the installed app).')
    }
    if (setting.startsWith('notice') || setting === 'bedtime_guard') mainWindow?.webContents.send('noticing:changed')
    refreshTray()
    return `${setting} is now ${value ? 'on' : 'off'}.`
  }
}

function claudeDeps(): Parameters<typeof setupClaudeDesktop>[0] {
  const region = (): string => preferencesOf(getLibrary()).region
  const data = async <T>(p: Promise<{ data: T }>): Promise<T> => (await p).data
  return () => ({
    library: getLibrary,
    change: (fn) => {
      const before = getLibrary()
      const after = saveLibrary(fn(before))
      const offer = remember(before, after)
      if (offer) {
        claudeUndo = offer.id
        mainWindow?.webContents.send('undo:offer', offer)
      }
      broadcastLibrary()
      return after
    },
    undoLast: () => {
      if (claudeUndo === null) return 'There’s nothing of Claude’s to undo.'
      const target = undoTarget(claudeUndo, getLibrary())
      claudeUndo = null
      if (!target.ok) throw new Error(target.error)
      saveLibrary(target.library)
      broadcastLibrary()
      return `Undone: ${target.label}.`
    },
    tmdb: {
      hasKey: tmdb.hasKey,
      search: (q) => data(tmdb.search(q)),
      details: (type, id) => data(tmdb.details(type, id)),
      detailsMany: tmdb.detailsMany,
      season: (id, n) => data(tmdb.season(id, n)),
      providers: (type, id) => data(tmdb.providers(type, id, region())),
      services: () => data(tmdb.services(region())),
      credits: (type, id) => data(tmdb.credits(type, id)),
      searchPeople: (q) => data(tmdb.searchPeople(q)),
      person: (id) => data(tmdb.person(id)),
      recommendations: (lib) => tmdb.recommendationsFor(lib),
      traitsOf: tmdb.traitsOf,
      calendar: (lib) => tmdb.calendarEvents(lib),
      weekBudget: (lib) => tmdb.weekBudget(lib),
      trending: () => data(tmdb.trending()),
      yearReview: async (lib, year) => {
        const { details, credits, lists } = await tmdb.yearData(lib, keysWatchedIn(lib, year))
        return yearInReview(getLibrary(), year, details, credits, lists, localDate(new Date()))
      },
      catchUp: (lib) => tmdb.catchUpList(lib),
      universe: (type, id, lib) => tmdb.universeFor(type, id, lib),
      knownFrom: (type, id, lib) => tmdb.knownFromFor(type, id, lib),
      openList: (id, lib) => tmdb.openList(id, lib),
      collection: (id) => data(tmdb.collection(id))
    },
    show: showForClaude,
    app: claudeApp,
    more: {
      suggestions: () => noticingStatus().suggestions,
      acceptSuggestion: (id, who) => {
        acceptSuggestion(id, who)
        broadcastLibrary()
        mainWindow?.webContents.send('noticing:changed')
      },
      dismissSuggestion: (id) => {
        dismissSuggestion(id)
        mainWindow?.webContents.send('noticing:changed')
      },
      backups: () => listBackups(dataFolderNow()),
      restoreBackup: (day) => {
        const restored = backupFor(dataFolderNow(), day)
        backupLibrary('before-restore')
        const before = getLibrary()
        const after = saveLibrary(restored)
        const offer = remember(before, after)
        if (offer) {
          claudeUndo = offer.id
          mainWindow?.webContents.send('undo:offer', offer)
        }
        broadcastLibrary()
      },
      health: () => healthNow(),
      appearance: (setting, value) => {
        claudeLooks.push({ setting, value })
        // Sent now if the window's open; a window opened later picks it up (claude:takeLooks).
        mainWindow?.webContents.send('claude:appearance', { setting, value })
      }
    }
  })
}

function setupIpc(): void {
  ipcMain.handle('claude:takeShow', () => {
    const what = claudeShowPending
    claudeShowPending = null
    return what
  })
  ipcMain.on('claude:shown', () => (claudeShowPending = null))
  ipcMain.handle('claude:takeLooks', () => {
    const looks = claudeLooks
    claudeLooks = []
    return looks
  })
  ipcMain.on('claude:lookApplied', () => (claudeLooks = []))
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
  ipcMain.handle('data:useDefault', () => {
    const folder = join(app.getPath('documents'), 'Eclipse')
    mkdirSync(folder, { recursive: true })
    saveSettings({ dataFolder: folder })
    reopenLibrary()
    broadcastLibrary()
    return status()
  })
  ipcMain.handle('data:reveal', async () => {
    const { dataFolder } = loadSettings()
    if (isDirectory(dataFolder)) await shell.openPath(dataFolder)
  })

  ipcMain.handle('tmdb:setKey', (_e, key: string) => attempt(async () => (await tmdb.setKey(key), status())))
  ipcMain.handle('tmdb:clearKey', () => (tmdb.clearKey(), status()))
  ipcMain.handle('tmdb:search', (_e, query: string) => attempt(() => tmdb.search(query)))
  ipcMain.handle('tmdb:searchPeople', (_e, query: string) => attempt(() => tmdb.searchPeople(query)))
  const region = (): string => preferencesOf(getLibrary()).region
  ipcMain.handle('tmdb:season', (_e, tvId: number, n: number, refresh?: boolean) => attempt(() => tmdb.season(tvId, n, refresh)))
  ipcMain.handle('tmdb:providers', (_e, type: 'movie' | 'tv', id: number, refresh?: boolean) => attempt(() => tmdb.providers(type, id, region(), refresh)))
  ipcMain.handle('tmdb:providersMany', (_e, keys: string[]) => tmdb.providersMany(keys, region()))
  ipcMain.handle('tmdb:credits', (_e, type: 'movie' | 'tv', id: number) => attempt(() => tmdb.credits(type, id)))
  ipcMain.handle('tmdb:person', (_e, id: number) => attempt(() => tmdb.person(id)))
  ipcMain.handle('tmdb:partEpisodes', (_e, tvId: number, personId: number, creditIds: string[]) => attempt(() => tmdb.partEpisodes(tvId, personId, creditIds)))
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
  ipcMain.handle('guard:status', () => guardStatus())
  ipcMain.handle('guard:takeOver', () => takeOver())
  ipcMain.handle('data:export', (event) =>
    attempt(async () => {
      const win = BrowserWindow.fromWebContents(event.sender)!
      const result = await dialog.showOpenDialog(win, {
        title: 'Choose where to save your Eclipse export',
        defaultPath: app.getPath('documents'),
        buttonLabel: 'Save here',
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled || !result.filePaths[0]) return { saved: false }
      const base = join(result.filePaths[0], `Eclipse export ${localDate(new Date())}`)
      let dir = base
      for (let n = 2; existsSync(dir); n++) dir = `${base} (${n})`
      mkdirSync(dir, { recursive: true })
      for (const f of exportFiles(getLibrary())) writeFileSync(join(dir, f.name), f.text, 'utf8')
      shell.showItemInFolder(join(dir, 'titles.csv'))
      return { saved: true, path: dir }
    })
  )
  ipcMain.handle('lists:open', (_e, id: string, refresh?: boolean) => attempt(() => tmdb.openList(id, getLibrary(), refresh)))
  ipcMain.handle('tmdb:knownFrom', (_e, type: 'movie' | 'tv', id: number) => attempt(() => tmdb.knownFromFor(type, id, getLibrary())))
  ipcMain.handle('tmdb:universe', (_e, type: 'movie' | 'tv', id: number) => attempt(() => tmdb.universeFor(type, id, getLibrary())))
  ipcMain.handle('tmdb:detailsMany', (_e, keys: string[]) => tmdb.detailsMany(keys))
  ipcMain.handle('tmdb:services', () => attempt(() => tmdb.services(region())))
  ipcMain.handle('tmdb:findImdb', (_e, imdbId: string) => attempt(() => tmdb.findImdb(imdbId)))
  ipcMain.handle('tmdb:trending', () => attempt(() => tmdb.trending()))
  ipcMain.handle('tmdb:details', (_e, type: 'movie' | 'tv', id: number, refresh?: boolean) => attempt(() => tmdb.details(type, id, refresh)))
  ipcMain.handle('cache:clear', () => clearCache())

  ipcMain.handle('library:get', () => {
    // The folder may have appeared since (Google Drive started late).
    if (!Object.keys(getLibrary().entries).length) reopenLibrary()
    return getLibrary()
  })
  ipcMain.handle('library:setStatus', (_e, item, newStatus) => change((lib) => setStatus(lib, item, newStatus)))
  ipcMain.handle('library:setEpisodes', (_e, item, keys: string[], watched: boolean, undated?: boolean) => change((lib) => setEpisodes(lib, item, keys, watched, new Date(), !!undated)))
  ipcMain.handle('library:drop', (_e, key) => change((lib) => dropTitle(lib, key)))
  ipcMain.handle('library:restore', (_e, key) => saveLibrary(restoreDropped(getLibrary(), key)))
  ipcMain.handle('library:setFrom', (_e, key, from) => saveLibrary(setFrom(getLibrary(), key, from)))
  ipcMain.handle('library:startWith', (_e, item, name) => saveLibrary(startWatchWith(getLibrary(), item, name)))
  ipcMain.handle('library:tickWith', (_e, key, index, keys, watched) => change((lib) => tickWith(lib, key, index, keys, watched)))
  ipcMain.handle('library:planWith', (_e, key, index, planned) => saveLibrary(planWatchWith(getLibrary(), key, index, planned)))
  ipcMain.handle('library:endWith', (_e, key, index, keep) => change((lib) => endWatchWith(lib, key, index, keep)))
  ipcMain.handle('library:seenBefore', (_e, item) => change((lib) => markSeenBefore(lib, item)))
  ipcMain.handle('library:markRowSeen', async (_e, ref, on) => {
    const before = getLibrary()
    const lib = saveLibrary(markRowSeen(before, ref, on))
    if (!on || ref.type !== 'tv') return offerUndo(before, lib)
    // Every season ticked: the show is Watched, not Watching.
    try {
      const d = (await tmdb.details('tv', ref.id)).data
      const settled = settleSeenShows(getLibrary(), { [ref.key]: d }, localDate(new Date()))
      return offerUndo(before, settled === getLibrary() ? getLibrary() : saveLibrary(settled))
    } catch {
      return offerUndo(before, getLibrary())
    }
  })
  ipcMain.handle('library:startRewatch', (_e, item) => change((lib) => startRewatch(lib, item)))
  ipcMain.handle('library:endRewatch', (_e, key: string, keep: boolean) => change((lib) => endRewatch(lib, key, keep)))
  ipcMain.handle('library:removeRewatch', (_e, key: string, index: number) => change((lib) => removeRewatch(lib, key, index)))
  ipcMain.handle('library:setReaction', (_e, key: string, episode: string, reaction: Reaction | null) => {
    const before = getLibrary()
    const after = saveLibrary(setReaction(before, key, episode, reaction))
    carryUndo(before, after)
    return after
  })
  ipcMain.handle('library:setRating', (_e, key: string, rating: number | null) => saveLibrary(setRating(getLibrary(), String(key), typeof rating === 'number' ? rating : null)))
  ipcMain.handle('library:setNote', (_e, key: string, note: string) => saveLibrary(setNote(getLibrary(), key, note)))
  ipcMain.handle('library:setWatchedOn', (_e, key: string, day: string | null) => saveLibrary(setWatchedOn(getLibrary(), key, day)))
  ipcMain.handle('lists:create', (_e, name: string, items?: TitleRef[]) => {
    const made = createList(getLibrary(), name, new Date(), items)
    return { library: saveLibrary(made.library), id: made.id }
  })
  ipcMain.handle('lists:follow', (_e, list) => saveLibrary(followList(getLibrary(), list)))
  ipcMain.handle('lists:remove', (_e, id: string) => change((lib) => removeList(lib, id)))
  ipcMain.handle('lists:rename', (_e, id: string, name: string) => saveLibrary(renameList(getLibrary(), id, name)))
  ipcMain.handle('lists:setIn', (_e, id: string, ref: TitleRef, inList: boolean) => saveLibrary(setInList(getLibrary(), id, ref, inList)))
  ipcMain.handle('lists:move', (_e, id: string, from: number, to: number) => saveLibrary(moveInList(getLibrary(), id, from, to)))
  ipcMain.handle('soon:set', (_e, ref: TitleRef, on: boolean) => saveLibrary(setWatchSoon(getLibrary(), ref, on)))
  ipcMain.handle('posters:list', (_e, type: 'movie' | 'tv', id: number) =>
    attempt(async () => {
      const [images, d] = await Promise.all([tmdb.images(type, id), tmdb.details(type, id)])
      return orderPosters(images.data.posters, d.data.posterPath)
    })
  )
  ipcMain.handle('backdrops:list', (_e, type: 'movie' | 'tv', id: number) =>
    attempt(async () => {
      const [images, d] = await Promise.all([tmdb.images(type, id), tmdb.details(type, id)])
      // Backgrounds with no text first: words over the page would fight with its own.
      return orderPosters(images.data.backdrops, d.data.backdropPath, 'none')
    })
  )
  ipcMain.handle('backdrops:set', (_e, key: string, path: string | null) => saveLibrary(setBackdrop(getLibrary(), String(key), typeof path === 'string' ? path : null)))
  ipcMain.handle('posters:set', (_e, key: string, path: string | null) => saveLibrary(setPoster(getLibrary(), String(key), typeof path === 'string' ? path : null)))
  ipcMain.handle('finale:theme', (_e, tvId: number) => themeFor(Number(tvId)))
  ipcMain.handle('finale:image', (event, how: 'copy' | 'save', name: string) => finaleImage(BrowserWindow.fromWebContents(event.sender)!, how === 'save' ? 'save' : 'copy', String(name ?? '')))
  ipcMain.handle('favourites:set', (_e, ref: TitleRef, on: boolean) => saveLibrary(setFavourite(getLibrary(), ref, !!on)))
  ipcMain.handle('milestones:seen', (_e, ids: unknown) => {
    const before = getLibrary()
    const next = markMilestones(before, Array.isArray(ids) ? ids.map(String) : [])
    if (next === before) return before
    const after = saveLibrary(next)
    carryForward(before, after, (lib) => markMilestones(lib, Array.isArray(ids) ? ids.map(String) : []))
    return after
  })
  ipcMain.handle('countdowns:set', (_e, ref: TitleRef, on: boolean) => saveLibrary(setCountdown(getLibrary(), ref, !!on)))
  ipcMain.handle('favourites:move', (_e, from: number, to: number) => saveLibrary(moveFavourite(getLibrary(), Number(from), Number(to))))
  ipcMain.handle('shelf:comingSoon', () => attempt(() => tmdb.comingSoonList(getLibrary())))
  ipcMain.handle('shelf:boxSet', (_e, key: string) => attempt(() => tmdb.boxSet(getLibrary(), String(key))))
  ipcMain.handle('soon:move', (_e, from: number, to: number) => saveLibrary(moveWatchSoon(getLibrary(), from, to)))
  ipcMain.handle('library:setFinishBy', (_e, key: string, day: string | null) => saveLibrary(setFinishBy(getLibrary(), key, day)))
  ipcMain.handle('library:snooze', (_e, key: string, until: string | null) => saveLibrary(snoozeTitle(getLibrary(), key, until)))
  ipcMain.handle('services:history', () => getHistory())
  let repairBackedUp = false
  ipcMain.handle('library:repair', (_e, batch: Batch, choice: RepairChoice) => {
    // Copy library.json aside before the first repair, so it can always be undone by hand.
    if (!repairBackedUp && choice.kind !== 'leave') {
      backupLibrary('before-repair')
      repairBackedUp = true
    }
    return change((lib) => repairBatch(lib, batch, choice))
  })
  ipcMain.handle('year:review', (_e, year: number) =>
    attempt(async () => {
      const lib = getLibrary()
      const { details, credits, lists } = await tmdb.yearData(lib, keysWatchedIn(lib, year))
      return yearInReview(getLibrary(), year, details, credits, lists, localDate(new Date()))
    })
  )
  // Stats: everything you've watched over all time, and every milestone (phase 53).
  ipcMain.handle('stats:all', () =>
    attempt(async () => {
      const details = await tmdb.detailsMany(milestoneKeys(getLibrary()))
      const lib = getLibrary()
      return { stats: allTimeStats(lib, details, localDate(new Date())), milestones: milestoneBoard(lib, details), shown: lib.milestones?.length ?? 0 }
    })
  )
  // Phase 61: your time on something, in terms of your own history.
  ipcMain.handle('stats:myTerms', (_e, key: string) =>
    attempt(async () => {
      const details = await tmdb.detailsMany(milestoneKeys(getLibrary()))
      return myTerms(getLibrary(), details, String(key) as TitleKey)
    })
  )
  // Phase 64: everything you've watched along a line of dates, with the eras of your watching.
  ipcMain.handle('timeline:data', () =>
    attempt(async () => {
      const details = await tmdb.detailsMany(milestoneKeys(getLibrary()))
      return timelineOf(getLibrary(), details)
    })
  )
  ipcMain.handle('timeline:eraName', (_e, id: string, name: string | null) => saveLibrary(setEraName(getLibrary(), String(id), typeof name === 'string' ? name : null)))
  ipcMain.handle('recs:list', () => attempt(() => tmdb.recommendationsFor(getLibrary())))
  // Interested (adds it to Want to watch) or Not for me (hides it); either way it learns from the
  // title's creators, network, cast and keywords. Undo puts everything back as it was.
  ipcMain.handle('recs:answer', async (_e, item: LibraryItem, answer: 'yes' | 'no') => {
    const key = String(item?.key)
    if (!/^(movie|tv):\d+$/.test(key) || (answer !== 'yes' && answer !== 'no')) return getLibrary()
    const traits = await tmdb.traitsOf(key).catch(() => [])
    const yes = answer === 'yes'
    return change((lib) => {
      const learnt = answerRecommendation(lib, key, yes, traits)
      return yes && !learnt.entries[key] ? setStatus(learnt, item, 'want') : learnt
    })
  })
  ipcMain.handle('week:budget', () => attempt(() => tmdb.weekBudget(getLibrary())))
  ipcMain.handle('catchup:list', () => attempt(() => tmdb.catchUpList(getLibrary())))
  ipcMain.handle('catchup:dismiss', (_e, id: string) => (CATCH_UP_ID.test(String(id)) ? saveLibrary(dismissCatchUp(getLibrary(), String(id))) : getLibrary()))
  ipcMain.handle('announced:seen', (_e, id: string) => saveLibrary(markAnnouncedSeen(getLibrary(), String(id))))
  // Phase 51: the opening plays for the first window of a launch only.
  ipcMain.handle('opening:take', () => {
    const play = !openingTaken
    openingTaken = true
    return play
  })
  ipcMain.handle('tray:get', () => trayOn())
  ipcMain.handle('tray:set', (_e, on: boolean) => setTray(!!on))
  ipcMain.handle('zoom:get', () => getZoom())
  ipcMain.handle('zoom:set', (_e, z: unknown) => setZoom(typeof z === 'number' ? z : 1))
  ipcMain.handle('discord:status', () => discordStatus())
  ipcMain.handle('discord:set', (_e, patch: { on?: unknown; appId?: unknown }) =>
    changeDiscord({ ...(typeof patch?.on === 'boolean' ? { on: patch.on } : {}), ...(typeof patch?.appId === 'string' ? { appId: patch.appId } : {}) })
  )
  ipcMain.handle('noticing:status', () => noticingStatus())
  ipcMain.handle('noticing:set', (_e, patch) => setNoticing(patch ?? {}))
  ipcMain.handle('noticing:scan', async () => {
    await scanHistory().catch(() => undefined)
    return noticingStatus()
  })
  ipcMain.handle('noticing:accept', (_e, id: string, who?: string | null) => acceptSuggestion(String(id), typeof who === 'string' || who === null ? who : undefined))
  ipcMain.handle('noticing:extensionFolder', () => showExtensionFolder())
  ipcMain.handle('noticing:notMine', (_e, name: string) => notMine(String(name).slice(0, 80)))
  ipcMain.handle('noticing:dismiss', (_e, id: string) => {
    dismissSuggestion(String(id))
    return noticingStatus()
  })
  ipcMain.handle('moments:edit', (_e, key: string, index: number, note: string | null) => saveLibrary(editMoment(getLibrary(), key, Number(index), typeof note === 'string' ? note : null)))
  ipcMain.handle('phone:asks', () => phoneAsks())
  ipcMain.handle('phone:resolve', (_e, id: string, choice: 'phone' | 'computer') => {
    const asks = resolveAsk(String(id), choice)
    broadcastLibrary()
    return asks
  })
  ipcMain.handle('remote:status', () => remoteStatus())
  ipcMain.handle('remote:set', (_e, on: boolean) => setRemote(!!on, sendRemote))
  ipcMain.handle('remote:newCode', () => newRemoteCode())
  ipcMain.handle('library:undo', (_e, id: number) => {
    const target = undoTarget(Number(id), getLibrary())
    if (!target.ok) return target
    try {
      const lib = saveLibrary(target.library)
      broadcastLibrary()
      return { ok: true, value: lib }
    } catch (err) {
      return { ok: false, error: errorText(err) }
    }
  })
  ipcMain.handle('backups:list', () => listBackups(dataFolderNow()))
  ipcMain.handle('backups:restore', (_e, day: string) =>
    attempt(async () => {
      const restored = backupFor(dataFolderNow(), String(day))
      // The current copy is kept aside first, so restoring can always be put back by hand too.
      backupLibrary('before-restore')
      const lib = change(() => restored)
      broadcastLibrary()
      return lib
    })
  )
  ipcMain.handle('login:status', () => loginStatus())
  ipcMain.handle('login:set', (_e, on: boolean) => setStartAtLogin(!!on))
  ipcMain.handle('login:asked', () => markAsked())
  ipcMain.handle('health:status', () => healthNow())
  ipcMain.handle('health:copy', () => {
    const lines = healthNow().map((j) => `${j.ok ? 'ok ' : 'ERR'} ${j.label}: ${j.detail}${j.at ? ` (${new Date(j.at).toLocaleString()})` : ''}`)
    const text = [`Eclipse ${app.getVersion()} on ${process.platform} ${process.arch}`, '', ...lines, '', 'Recent log:', recentLog() || '(nothing logged)'].join('\n')
    clipboard.writeText(text)
    return text
  })
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
    // Windows and Linux show it in the taskbar while running from source; installers bring their own.
    ...(IS_MAC ? {} : { icon: join(__dirname, '../../build/icon.png') }),
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
  setupZoom(win, IS_MAC)

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

/** Phase 51: the opening has played (or been passed over) this launch. */
let openingTaken = false

/** Opens the window, or brings it to the front (from the tray, or the dock on a Mac). */
function showWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    return
  }
  mainWindow = createWindow()
  mainWindow.on('closed', () => (mainWindow = null))
}

app.whenReady().then(() => {
  // Trailers: YouTube's player refuses to play without a Referer, which a page loaded from a file
  // doesn't send. Name the app's own home page instead.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube-nocookie.com/*'] }, (details, callback) => {
    details.requestHeaders['Referer'] ??= 'https://github.com/Looby758/Eclipse'
    callback({ requestHeaders: details.requestHeaders })
  })
  reopenLibrary()
  setupIpc()
  const hidden = startedHidden()
  // Started quietly in the tray: no opening, even when the window is opened from there later.
  if (hidden) openingTaken = true
  if (hidden) {
    // Started with the computer: stay in the tray, and wait for Google Drive to bring the data folder.
    waitForDataFolder()
  } else showWindow()
  void settleOnStart()
  setupTray(showWindow, broadcastLibrary)
  if (hidden && !trayOn()) setTray(true)
  onSave(refreshTray)
  onSave(() => report('save', true, 'Saved'))
  onHealthChanged(() => mainWindow?.webContents.send('health:changed'))
  // Today's backup, checked again every few hours in case Eclipse stays open past midnight.
  setInterval(() => dailyBackup(dataFolderNow()), 3 * 60 * 60 * 1000)
  setupRemote(broadcastLibrary, sendRemote)
  setupDiscord(() => {
    mainWindow?.webContents.send('discord:changed', discordStatus())
    refreshTray()
  })
  setupNoticing({ changed: () => mainWindow?.webContents.send('noticing:changed'), show: showWindow, libraryChanged: broadcastLibrary })
  startTogetherReminders(getLibrary, showWindow)
  startServiceWatch(getLibrary, () => mainWindow?.webContents.send('services:changed', getHistory()))
  void setupUpdater()
  setupClaudeDesktop(claudeDeps())
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) showWindow()
  })
})

app.on('will-quit', () => {
  stopGuard()
  stopRemote()
  stopNoticing()
  stopDiscord()
})

app.on('window-all-closed', () => {
  // With the tray / menu bar on, Eclipse keeps running there until you choose Quit.
  if (!IS_MAC && !trayOn()) app.quit()
})
