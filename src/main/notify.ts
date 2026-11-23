import { Notification, type NotificationConstructorOptions } from 'electron'
import { join } from 'path'

const IS_MAC = process.platform === 'darwin'

/**
 * Every Eclipse notification goes through here so it carries the Eclipse logo. On Windows the
 * toast's name and header icon come from the app ID (set in index.ts, matching the installer's
 * Start Menu shortcut); this adds the logo inside the toast too. Macs use the app's own icon.
 */
export function eclipseNotification(options: NotificationConstructorOptions): Notification {
  return new Notification({ ...(IS_MAC ? {} : { icon: join(__dirname, '../../build/icon.png') }), ...options })
}
