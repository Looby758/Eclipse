import type { BrowserWindow } from 'electron'
import { clampZoom, DEFAULT_ZOOM, stepZoom, zoomKey } from '@core/zoom'
import { loadSettings, saveSettings } from './settings'

/**
 * Text size that sticks: the window's zoom is saved in this computer's settings and put back
 * every time the window opens. Ctrl + / Ctrl − / Ctrl 0 (⌘ on a Mac) and Ctrl + the mouse wheel
 * change it, as does Settings → Appearance.
 */
let win: BrowserWindow | null = null

export const getZoom = (): number => clampZoom(loadSettings().zoom ?? DEFAULT_ZOOM)

export function setZoom(z: number): number {
  const zoom = clampZoom(z)
  saveSettings({ zoom })
  if (win && !win.isDestroyed()) {
    win.webContents.setZoomFactor(zoom)
    win.webContents.send('zoom:changed', zoom)
  }
  return zoom
}

export function setupZoom(w: BrowserWindow, mac: boolean): void {
  win = w
  const wc = w.webContents
  // Chromium sets the zoom again when a page loads, so put yours back each time.
  wc.on('did-finish-load', () => wc.setZoomFactor(getZoom()))
  wc.on('before-input-event', (e, input) => {
    const k = zoomKey(input, mac)
    if (!k) return
    e.preventDefault()
    setZoom(k === 'reset' ? DEFAULT_ZOOM : stepZoom(getZoom(), k === 'in' ? 1 : -1))
  })
  wc.on('zoom-changed', (_e, direction) => setZoom(stepZoom(getZoom(), direction === 'in' ? 1 : -1)))
}
