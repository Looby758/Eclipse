/** Small text helpers for showing titles. */

/** 169 → "2h 49m", 45 → "45m". */
export function formatRuntime(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return ''
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

/** "2024-03-01" → "1 March 2024" (UK style). */
export function formatDate(date: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '')
  if (!m) return ''
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`
}

/** "2024-03-01" → "March 2024". */
export function formatMonth(date: string | null | undefined): string {
  return formatDate(date).replace(/^\d+ /, '')
}

/** 0 → "today", 1 → "yesterday", 40 → "40 days ago", 400 → "over a year ago". */
export function daysAgo(n: number): string {
  if (n <= 0) return 'today'
  if (n === 1) return 'yesterday'
  if (n < 60) return `${n} days ago`
  if (n < 365) return `${Math.round(n / 30)} months ago`
  return n < 730 ? 'over a year ago' : `${Math.floor(n / 365)} years ago`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "2026-11-20" → "Fri 20 Nov". */
export function formatShortDay(date: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '')
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`
}

/** "Stay for a scene mid-credits and one at the very end", or null when TMDB doesn't tag one. */
export function stingerLine(s: { during: boolean; after: boolean } | null | undefined): string | null {
  if (!s || (!s.during && !s.after)) return null
  if (s.during && s.after) return 'Stay for the credits: a scene mid-credits and one at the very end.'
  return s.during ? 'Stay for the credits: there’s a scene mid-credits.' : 'Stay for the credits: there’s a scene at the very end.'
}

/** The short version for list rows. */
export function stingerShort(s: { during: boolean; after: boolean } | null | undefined): string | null {
  if (!s || (!s.during && !s.after)) return null
  return s.during && s.after ? 'Stay: 2 credits scenes' : s.during ? 'Stay: mid-credits scene' : 'Stay: end-credits scene'
}
