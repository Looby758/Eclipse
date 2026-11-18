import { app, Menu, nativeImage, Notification, Tray, type MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { formatHours } from '@core/time'
import { trayMenuOf } from '@core/remote'
import { loadSettings, saveSettings } from './settings'
import { state, tickEpisode } from './remote'
import { discordStatus } from './discord'
import { changeDiscord } from './noticing'

/**
 * Phase 26: Eclipse in the Mac menu bar or the Windows tray. The next episode of each show you're
 * watching, with a one-click tick, and tonight's "start by" time. While it's on, closing the window
 * leaves Eclipse running there (Quit from the menu to close it properly).
 */

const IS_MAC = process.platform === 'darwin'
let tray: Tray | null = null
let timer: NodeJS.Timeout | null = null
let hooks: { show: () => void; changed: () => void } = { show: () => undefined, changed: () => undefined }

export const trayOn = (): boolean => !!loadSettings().trayOn

function icon(): Electron.NativeImage {
  // Mac: a black "template" image the menu bar recolours for light and dark. Elsewhere: the app icon.
  const file = join(__dirname, '../../build', IS_MAC ? 'trayTemplate.png' : 'tray.png')
  const img = nativeImage.createFromPath(file)
  if (IS_MAC) img.setTemplateImage(true)
  return img
}

async function rebuild(): Promise<void> {
  if (!tray) return
  let items: MenuItemConstructorOptions[] = []
  try {
    const menu = trayMenuOf(await state())
    items = [
      ...(menu.shows.length ? [{ label: 'Tick the next episode', enabled: false } as MenuItemConstructorOptions] : []),
      ...menu.shows.map(
        (s): MenuItemConstructorOptions => ({
          label: s.label,
          click: () => {
            try {
              if (tickEpisode(s.key, s.season, s.episode)) {
                hooks.changed()
                if (Notification.isSupported()) new Notification({ title: 'Ticked', body: s.done, silent: true }).show()
              }
            } catch (err) {
              if (Notification.isSupported()) new Notification({ title: 'Not ticked', body: err instanceof Error ? err.message : String(err) }).show()
            }
            void rebuild()
          }
        })
      ),
      ...(menu.shows.length ? [{ type: 'separator' } as MenuItemConstructorOptions] : []),
      { label: menu.tonight, enabled: false },
      ...(menu.startBy ? [{ label: menu.startBy, enabled: false }] : [])
    ]
    tray.setToolTip(menu.minutesLeft > 0 ? `Eclipse: ${formatHours(menu.minutesLeft)} left before bed` : 'Eclipse')
  } catch {
    items = [{ label: 'Choose a data folder in Eclipse first', enabled: false }]
  }
  // Phase 44: quick to switch off when you'd rather friends didn't see.
  const discord = discordStatus()
  const discordItems: MenuItemConstructorOptions[] = discord.appId
    ? [
        {
          label: discord.on && discord.showing ? `Discord status: ${discord.showing}` : 'Show what I’m watching on Discord',
          type: 'checkbox',
          checked: discord.on,
          click: () => {
            changeDiscord({ on: !discord.on })
            void rebuild()
          }
        }
      ]
    : []
  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...items,
      { type: 'separator' },
      ...discordItems,
      ...(discordItems.length ? [{ type: 'separator' } as MenuItemConstructorOptions] : []),
      { label: 'Open Eclipse', click: () => hooks.show() },
      { label: IS_MAC ? 'Quit Eclipse' : 'Quit Eclipse (and close the tray icon)', click: () => app.quit() }
    ])
  )
}

function start(): void {
  if (tray) return
  tray = new Tray(icon())
  tray.setToolTip('Eclipse')
  // Windows: a left click opens the menu too, not just a right click.
  if (!IS_MAC) tray.on('click', () => tray?.popUpContextMenu())
  void rebuild()
  // "Start by" and what fits move on as the evening goes.
  timer = setInterval(() => void rebuild(), 60_000)
}

function stop(): void {
  if (timer) clearInterval(timer)
  timer = null
  tray?.destroy()
  tray = null
}

export function setupTray(show: () => void, changed: () => void): void {
  hooks = { show, changed }
  if (trayOn()) start()
}

export function setTray(on: boolean): boolean {
  saveSettings({ trayOn: on })
  if (on) start()
  else stop()
  return on
}

/** The library changed (here, on the phone or from the other computer): refresh the menu. */
export const refreshTray = (): void => void rebuild()
