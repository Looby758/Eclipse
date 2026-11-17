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

  getLibrary: () => ipcRenderer.invoke('library:get'),
  setStatus: (item, status) => ipcRenderer.invoke('library:setStatus', item, status),
  onLibraryChanged: (callback) => {
    const handler = (_e: unknown, library: Parameters<typeof callback>[0]): void => callback(library)
    ipcRenderer.on('library:changed', handler)
    return () => ipcRenderer.removeListener('library:changed', handler)
  },

  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  platform: process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux'
}

contextBridge.exposeInMainWorld('api', api)
