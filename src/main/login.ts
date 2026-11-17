import { app } from 'electron'
import { loadSettings, saveSettings } from './settings'
import { setTray } from './tray'

/**
 * Phase 38: start Eclipse when the computer starts, quietly in the tray (menu bar on the Mac), so
 * noticing, What's playing, the phone remote and the tray keep working. Off unless you say yes,
 * and per computer.
 */

const HIDDEN = '--hidden'

export interface LoginStatus {
  /** Windows and Mac only. */
  supported: boolean
  on: boolean
  /** You've already been asked once (so it's never asked again). */
  asked: boolean
}

const supported = (): boolean => process.platform === 'win32' || process.platform === 'darwin'

export function loginStatus(): LoginStatus {
  const s = loadSettings()
  return { supported: supported(), on: !!s.startAtLogin, asked: !!s.startAsked }
}

export function setStartAtLogin(on: boolean): LoginStatus {
  if (supported()) {
    if (process.platform === 'darwin') app.setLoginItemSettings({ openAtLogin: on, openAsHidden: true })
    else {
      // Running from the code (npm run dev) the app's folder has to be passed too; the installed app is just itself.
      const args = app.isPackaged ? [HIDDEN] : [app.getAppPath(), HIDDEN]
      app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args })
    }
  }
  saveSettings({ startAtLogin: on, startAsked: true })
  // Starting quietly only makes sense with somewhere to live: the tray.
  if (on) setTray(true)
  return loginStatus()
}

/** "Not now" on the one-time question. */
export function markAsked(): LoginStatus {
  saveSettings({ startAsked: true })
  return loginStatus()
}

/** Opened by the computer at login, so no window: Eclipse waits in the tray. */
export function startedHidden(): boolean {
  if (!loadSettings().startAtLogin) return false
  if (process.argv.includes(HIDDEN)) return true
  try {
    return process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAsHidden
  } catch {
    return false
  }
}
