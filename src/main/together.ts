import { Notification } from 'electron'
import { sessionsStartingSoon } from '@core/library'
import type { Library } from '@core/types'

/**
 * A reminder 15 minutes before a time you've arranged to watch with someone:
 * "The Walking Dead with Jack at 21:00". Checked once a minute while Eclipse is running.
 */
export function startTogetherReminders(getLibrary: () => Library, show: () => void): void {
  const sent = new Set<string>()
  const check = (): void => {
    if (!Notification.isSupported()) return
    for (const s of sessionsStartingSoon(getLibrary(), new Date())) {
      if (sent.has(s.id)) continue
      sent.add(s.id)
      const time = `${String(s.at.getHours()).padStart(2, '0')}:${String(s.at.getMinutes()).padStart(2, '0')}`
      const n = new Notification({ title: `${s.name} with ${s.who} at ${time}`, body: 'Open Eclipse to see the next episode and tick it when you’re done.' })
      n.on('click', show)
      n.show()
    }
  }
  check()
  setInterval(check, 60_000)
}
