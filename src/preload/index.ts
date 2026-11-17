import { contextBridge, ipcRenderer } from 'electron'
import type { EclipseApi } from '@shared/api'

// IPC channels are named area:action, as in Orbit.
const api: EclipseApi = {
  status: () => ipcRenderer.invoke('app:status'),
  pickDataFolder: () => ipcRenderer.invoke('data:pick'),
  revealDataFolder: () => ipcRenderer.invoke('data:reveal'),

  setTmdbKey: (key) => ipcRenderer.invoke('tmdb:setKey', key),
  clearTmdbKey: () => ipcRenderer.invoke('tmdb:clearKey'),
  clearCache: () => ipcRenderer.invoke('cache:clear'),

  search: (query) => ipcRenderer.invoke('tmdb:search', query),
  details: (type, id, refresh) => ipcRenderer.invoke('tmdb:details', type, id, refresh),
  trending: () => ipcRenderer.invoke('tmdb:trending'),
  season: (tvId, n, refresh) => ipcRenderer.invoke('tmdb:season', tvId, n, refresh),
  providers: (type, id, refresh) => ipcRenderer.invoke('tmdb:providers', type, id, refresh),
  providersMany: (keys) => ipcRenderer.invoke('tmdb:providersMany', keys),
  detailsMany: (keys) => ipcRenderer.invoke('tmdb:detailsMany', keys),
  services: () => ipcRenderer.invoke('tmdb:services'),

  credits: (type, id) => ipcRenderer.invoke('tmdb:credits', type, id),
  person: (id) => ipcRenderer.invoke('tmdb:person', id),
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

  getLibrary: () => ipcRenderer.invoke('library:get'),
  setStatus: (item, status) => ipcRenderer.invoke('library:setStatus', item, status),
  setEpisodes: (item, keys, watched, undated) => ipcRenderer.invoke('library:setEpisodes', item, keys, watched, undated),
  markSeenBefore: (item) => ipcRenderer.invoke('library:seenBefore', item),
  markRowSeen: (ref, on) => ipcRenderer.invoke('library:markRowSeen', ref, on),
  startRewatch: (item) => ipcRenderer.invoke('library:startRewatch', item),
  endRewatch: (key, keep) => ipcRenderer.invoke('library:endRewatch', key, keep),
  removeRewatch: (key, index) => ipcRenderer.invoke('library:removeRewatch', key, index),
  setNote: (key, note) => ipcRenderer.invoke('library:setNote', key, note),
  setWatchedOn: (key, day) => ipcRenderer.invoke('library:setWatchedOn', key, day),
  setFinishBy: (key, day) => ipcRenderer.invoke('library:setFinishBy', key, day),
  setPreferences: (patch) => ipcRenderer.invoke('library:setPreferences', patch),
  onLibraryChanged: (callback) => {
    const handler = (_e: unknown, library: Parameters<typeof callback>[0]): void => callback(library)
    ipcRenderer.on('library:changed', handler)
    return () => ipcRenderer.removeListener('library:changed', handler)
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
