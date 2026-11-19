import { contextBridge, ipcRenderer } from 'electron'
import type { EclipseApi } from '@shared/api'

// IPC channels are named area:action, as in Orbit.
const api: EclipseApi = {
  status: () => ipcRenderer.invoke('app:status'),
  pickDataFolder: () => ipcRenderer.invoke('data:pick'),
  useDefaultDataFolder: () => ipcRenderer.invoke('data:useDefault'),
  revealDataFolder: () => ipcRenderer.invoke('data:reveal'),

  setTmdbKey: (key) => ipcRenderer.invoke('tmdb:setKey', key),
  clearTmdbKey: () => ipcRenderer.invoke('tmdb:clearKey'),
  clearCache: () => ipcRenderer.invoke('cache:clear'),

  search: (query) => ipcRenderer.invoke('tmdb:search', query),
  searchPeople: (query) => ipcRenderer.invoke('tmdb:searchPeople', query),
  details: (type, id, refresh) => ipcRenderer.invoke('tmdb:details', type, id, refresh),
  trending: () => ipcRenderer.invoke('tmdb:trending'),
  season: (tvId, n, refresh) => ipcRenderer.invoke('tmdb:season', tvId, n, refresh),
  providers: (type, id, refresh) => ipcRenderer.invoke('tmdb:providers', type, id, refresh),
  providersMany: (keys) => ipcRenderer.invoke('tmdb:providersMany', keys),
  detailsMany: (keys) => ipcRenderer.invoke('tmdb:detailsMany', keys),
  services: () => ipcRenderer.invoke('tmdb:services'),

  credits: (type, id) => ipcRenderer.invoke('tmdb:credits', type, id),
  knownFrom: (type, id) => ipcRenderer.invoke('tmdb:knownFrom', type, id),
  universe: (type, id) => ipcRenderer.invoke('tmdb:universe', type, id),
  person: (id) => ipcRenderer.invoke('tmdb:person', id),
  partEpisodes: (tvId, personId, creditIds) => ipcRenderer.invoke('tmdb:partEpisodes', tvId, personId, creditIds),
  collection: (id) => ipcRenderer.invoke('tmdb:collection', id),
  tmdbList: (id) => ipcRenderer.invoke('tmdb:list', id),
  openList: (id, refresh) => ipcRenderer.invoke('lists:open', id, refresh),
  calendarPreview: () => ipcRenderer.invoke('calendar:preview'),
  calendarExport: () => ipcRenderer.invoke('calendar:export'),
  createList: (name, items) => ipcRenderer.invoke('lists:create', name, items),
  followList: (list) => ipcRenderer.invoke('lists:follow', list),
  removeList: (id) => ipcRenderer.invoke('lists:remove', id),
  renameList: (id, name) => ipcRenderer.invoke('lists:rename', id, name),
  setInList: (id, ref, inList) => ipcRenderer.invoke('lists:setIn', id, ref, inList),
  moveInList: (id, from, to) => ipcRenderer.invoke('lists:move', id, from, to),
  setWatchSoon: (ref, on) => ipcRenderer.invoke('soon:set', ref, on),
  moveWatchSoon: (from, to) => ipcRenderer.invoke('soon:move', from, to),
  posterOptions: (type, id) => ipcRenderer.invoke('posters:list', type, id),
  setPoster: (key, path) => ipcRenderer.invoke('posters:set', key, path),
  backdropOptions: (type, id) => ipcRenderer.invoke('backdrops:list', type, id),
  setBackdrop: (key, path) => ipcRenderer.invoke('backdrops:set', key, path),
  setFavourite: (ref, on) => ipcRenderer.invoke('favourites:set', ref, on),
  moveFavourite: (from, to) => ipcRenderer.invoke('favourites:move', from, to),
  comingSoon: () => ipcRenderer.invoke('shelf:comingSoon'),
  boxSet: (key) => ipcRenderer.invoke('shelf:boxSet', key),

  getLibrary: () => ipcRenderer.invoke('library:get'),
  setStatus: (item, status) => ipcRenderer.invoke('library:setStatus', item, status),
  setEpisodes: (item, keys, watched, undated) => ipcRenderer.invoke('library:setEpisodes', item, keys, watched, undated),
  markSeenBefore: (item) => ipcRenderer.invoke('library:seenBefore', item),
  startWatchWith: (item, name) => ipcRenderer.invoke('library:startWith', item, name),
  tickWith: (key, index, keys, watched) => ipcRenderer.invoke('library:tickWith', key, index, keys, watched),
  planWatchWith: (key, index, planned) => ipcRenderer.invoke('library:planWith', key, index, planned),
  endWatchWith: (key, index, keep) => ipcRenderer.invoke('library:endWith', key, index, keep),
  markRowSeen: (ref, on) => ipcRenderer.invoke('library:markRowSeen', ref, on),
  startRewatch: (item) => ipcRenderer.invoke('library:startRewatch', item),
  endRewatch: (key, keep) => ipcRenderer.invoke('library:endRewatch', key, keep),
  removeRewatch: (key, index) => ipcRenderer.invoke('library:removeRewatch', key, index),
  setNote: (key, note) => ipcRenderer.invoke('library:setNote', key, note),
  dropTitle: (key) => ipcRenderer.invoke('library:drop', key),
  restoreDropped: (key) => ipcRenderer.invoke('library:restore', key),
  setFrom: (key, from) => ipcRenderer.invoke('library:setFrom', key, from),
  setWatchedOn: (key, day) => ipcRenderer.invoke('library:setWatchedOn', key, day),
  setFinishBy: (key, day) => ipcRenderer.invoke('library:setFinishBy', key, day),
  snooze: (key, until) => ipcRenderer.invoke('library:snooze', key, until),
  servicesHistory: () => ipcRenderer.invoke('services:history'),
  repairBatch: (batch, choice) => ipcRenderer.invoke('library:repair', batch, choice),
  yearReview: (year) => ipcRenderer.invoke('year:review', year),
  weekBudget: () => ipcRenderer.invoke('week:budget'),
  recommendations: () => ipcRenderer.invoke('recs:list'),
  answerRecommendation: (item, answer) => ipcRenderer.invoke('recs:answer', item, answer),
  catchUps: () => ipcRenderer.invoke('catchup:list'),
  dismissCatchUp: (id) => ipcRenderer.invoke('catchup:dismiss', id),
  trayOn: () => ipcRenderer.invoke('tray:get'),
  setTray: (on) => ipcRenderer.invoke('tray:set', on),
  discordStatus: () => ipcRenderer.invoke('discord:status'),
  setDiscord: (patch) => ipcRenderer.invoke('discord:set', patch),
  onDiscordChanged: (callback) => {
    const handler = (_e: unknown, s: Parameters<typeof callback>[0]): void => callback(s)
    ipcRenderer.on('discord:changed', handler)
    return () => ipcRenderer.removeListener('discord:changed', handler)
  },
  noticingStatus: () => ipcRenderer.invoke('noticing:status'),
  setNoticing: (patch) => ipcRenderer.invoke('noticing:set', patch),
  scanHistory: () => ipcRenderer.invoke('noticing:scan'),
  acceptSuggestion: (id, who) => ipcRenderer.invoke('noticing:accept', id, who),
  dismissSuggestion: (id) => ipcRenderer.invoke('noticing:dismiss', id),
  showExtensionFolder: () => ipcRenderer.invoke('noticing:extensionFolder'),
  notMine: (name) => ipcRenderer.invoke('noticing:notMine', name),
  onNoticingChanged: (callback) => {
    const handler = (): void => callback()
    ipcRenderer.on('noticing:changed', handler)
    return () => ipcRenderer.removeListener('noticing:changed', handler)
  },
  editMoment: (key, index, note) => ipcRenderer.invoke('moments:edit', key, index, note),
  phoneAsks: () => ipcRenderer.invoke('phone:asks'),
  resolvePhoneAsk: (id, choice) => ipcRenderer.invoke('phone:resolve', id, choice),
  onPhoneAsks: (callback) => {
    const handler = (_e: unknown, asks: Parameters<typeof callback>[0]): void => callback(asks)
    ipcRenderer.on('phone:asks', handler)
    return () => ipcRenderer.removeListener('phone:asks', handler)
  },
  remoteStatus: () => ipcRenderer.invoke('remote:status'),
  setRemote: (on) => ipcRenderer.invoke('remote:set', on),
  newRemoteCode: () => ipcRenderer.invoke('remote:newCode'),
  onRemoteStatus: (callback) => {
    const handler = (_e: unknown, s: Parameters<typeof callback>[0]): void => callback(s)
    ipcRenderer.on('remote:changed', handler)
    return () => ipcRenderer.removeListener('remote:changed', handler)
  },
  onServicesChanged: (callback) => {
    const handler = (_e: unknown, h: Parameters<typeof callback>[0]): void => callback(h)
    ipcRenderer.on('services:changed', handler)
    return () => ipcRenderer.removeListener('services:changed', handler)
  },
  setPreferences: (patch) => ipcRenderer.invoke('library:setPreferences', patch),
  onLibraryChanged: (callback) => {
    const handler = (_e: unknown, library: Parameters<typeof callback>[0]): void => callback(library)
    ipcRenderer.on('library:changed', handler)
    return () => ipcRenderer.removeListener('library:changed', handler)
  },

  undo: (id) => ipcRenderer.invoke('library:undo', id),
  onUndoOffer: (callback) => {
    const handler = (_e: unknown, offer: Parameters<typeof callback>[0]): void => callback(offer)
    ipcRenderer.on('undo:offer', handler)
    return () => ipcRenderer.removeListener('undo:offer', handler)
  },
  listBackups: () => ipcRenderer.invoke('backups:list'),
  restoreBackup: (day) => ipcRenderer.invoke('backups:restore', day),
  loginStatus: () => ipcRenderer.invoke('login:status'),
  setStartAtLogin: (on) => ipcRenderer.invoke('login:set', on),
  markStartAsked: () => ipcRenderer.invoke('login:asked'),
  health: () => ipcRenderer.invoke('health:status'),
  copyHealth: () => ipcRenderer.invoke('health:copy'),
  onHealthChanged: (callback) => {
    const handler = (): void => callback()
    ipcRenderer.on('health:changed', handler)
    return () => ipcRenderer.removeListener('health:changed', handler)
  },

  pickSequel: (folder) => ipcRenderer.invoke('import:pickSequel', folder),
  applySequel: () => ipcRenderer.invoke('import:applySequel'),
  cancelSequel: () => ipcRenderer.invoke('import:cancel'),

  guardStatus: () => ipcRenderer.invoke('guard:status'),
  takeOver: () => ipcRenderer.invoke('guard:takeOver'),
  onGuardChanged: (callback) => {
    const handler = (_e: unknown, s: Parameters<typeof callback>[0]): void => callback(s)
    ipcRenderer.on('guard:changed', handler)
    return () => ipcRenderer.removeListener('guard:changed', handler)
  },
  exportData: () => ipcRenderer.invoke('data:export'),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback) => {
    const handler = (_e: unknown, status: Parameters<typeof callback>[0]): void => callback(status)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.removeListener('update:status', handler)
  },

  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  platform: process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux'
}

contextBridge.exposeInMainWorld('api', api)
