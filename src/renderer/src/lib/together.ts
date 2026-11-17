import { localDate } from '@core/library'

const pad = (n: number): string => String(n).padStart(2, '0')

/** A Date as a datetime-local value, "YYYY-MM-DDTHH:MM". */
export const toLocalInput = (d: Date): string => `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`

/** "tonight at 21:00", "tomorrow at 20:30", "Fri 21 Nov at 21:00". */
export function sessionLabel(d: Date, now: Date): string {
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const day = localDate(d)
  const today = localDate(now)
  const tomorrow = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  if (day === today) return d.getTime() <= now.getTime() ? `now (started ${time})` : `today at ${time}`
  if (day === tomorrow) return `tomorrow at ${time}`
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at ${time}`
}
