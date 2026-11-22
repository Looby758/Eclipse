// "5 minutes ago", "3 hours ago", "2 days ago" from a time in milliseconds. The same wording as
// the app's Settings (HealthCard's ago), so the popup and Eclipse read alike.
function ago(at, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

if (typeof module === 'object') module.exports = { ago }
