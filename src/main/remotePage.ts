// The same colour tokens as the app (theme.css), so the phone page matches it, light and dark.
import theme from '../renderer/src/styles/theme.css?raw'

/**
 * The page your phone opens (Phase 23): one self-contained file, with its own small script. It reads
 * the pairing code from its own address and talks to Eclipse with it.
 */
export function remotePage(): string {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#040309">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>Eclipse remote</title>
<style>
${theme}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font-ui); -webkit-text-size-adjust: 100%; }
body { padding: max(18px, env(safe-area-inset-top)) 16px max(28px, env(safe-area-inset-bottom)); }
h1 { font-family: var(--font-display); font-size: 22px; margin: 0; letter-spacing: -0.01em; }
h2 { font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin: 26px 0 10px; }
.top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.tonight { margin-top: 12px; padding: 14px 16px; border-radius: 18px; background: var(--glass-soft); border: 1px solid var(--line); line-height: 1.45; }
.tonight strong { color: var(--text-strong); }
.card { display: flex; gap: 12px; align-items: center; padding: 12px; border-radius: 18px; background: var(--glass-soft); border: 1px solid var(--line); margin-bottom: 10px; }
.card img, .ph { width: 52px; height: 78px; border-radius: 10px; object-fit: cover; background: var(--glass); flex-shrink: 0; }
.body { flex: 1; min-width: 0; }
.name { font-weight: 700; color: var(--text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { font-size: 13px; color: var(--text-muted); margin-top: 3px; }
.tick { flex-shrink: 0; height: 44px; padding: 0 16px; border-radius: 999px; border: 0; font: 600 15px var(--font-ui); color: var(--on-accent); background: var(--accent-gradient); box-shadow: 0 6px 18px var(--accent-shadow); }
.tick:disabled { opacity: 0.5; }
.tick.done { background: var(--ok); box-shadow: none; }
.row { display: flex; justify-content: space-between; gap: 12px; padding: 11px 2px; border-bottom: 1px solid var(--line); font-size: 15px; }
.row span:last-child { color: var(--text-muted); white-space: nowrap; }
.muted { color: var(--text-muted); font-size: 14px; }
.error { margin-top: 12px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--danger); color: var(--danger); font-size: 14px; display: none; }
</style>
</head>
<body>
<div class="top"><h1>Eclipse</h1><span class="muted" id="when"></span></div>
<div class="error" id="error"></div>
<div class="tonight" id="tonight">Loading…</div>
<h2>Up next</h2>
<div id="shows"></div>
<h2>Watch soon</h2>
<div id="soon"></div>
<script>
const token = new URLSearchParams(location.search).get('t') || ''
const $ = (id) => document.getElementById(id)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const hours = (m) => m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '')
const ep = (n) => 'S' + n.season + ' E' + n.episode
function showError(msg) { const e = $('error'); e.textContent = msg || ''; e.style.display = msg ? 'block' : 'none' }
function render(s) {
  $('when').textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  $('tonight').innerHTML = s.minutesLeft > 0
    ? '<strong>' + hours(s.minutesLeft) + '</strong> left before bed (' + esc(s.bedtime) + '). Start an episode by <strong>' + esc(s.startBy) + '</strong>.'
    : 'It\\u2019s past bedtime (' + esc(s.bedtime) + '). Tomorrow, then.'
  $('shows').innerHTML = s.shows.length ? s.shows.map((x) => {
    const img = x.posterPath ? '<img src="https://image.tmdb.org/t/p/w154' + esc(x.posterPath) + '" alt="">' : '<div class="ph"></div>'
    const sub = x.next ? ep(x.next) + ' \\u00b7 ' + x.left + ' left' + (x.fits ? ' \\u00b7 ' + x.fits + ' fit tonight' : '') : 'All caught up'
    const btn = x.next ? '<button class="tick" data-key="' + esc(x.key) + '" data-s="' + x.next.season + '" data-e="' + x.next.episode + '">Watched</button>' : ''
    return '<div class="card">' + img + '<div class="body"><div class="name">' + esc(x.name) + '</div><div class="sub">' + sub + '</div></div>' + btn + '</div>'
  }).join('') : '<p class="muted">Nothing on the go. Start a show in Eclipse.</p>'
  $('soon').innerHTML = s.soon.length ? s.soon.map((x) =>
    '<div class="row"><span>' + esc(x.name) + '</span><span>' + (x.done ? (x.film ? 'Watched' : 'Caught up') : x.film ? hours(x.minutes) : x.episodes + ' ep \\u00b7 ' + hours(x.minutes)) + '</span></div>'
  ).join('') : '<p class="muted">Nothing on Watch soon.</p>'
}
async function load() {
  try {
    const r = await fetch('/api/state?t=' + encodeURIComponent(token))
    if (!r.ok) throw new Error(r.status === 403 ? 'This link has expired. Scan the QR code in Eclipse again.' : 'Eclipse didn\\u2019t answer.')
    render(await r.json()); showError('')
  } catch (e) { showError(e.message === 'Failed to fetch' ? 'Can\\u2019t reach Eclipse. Is it open, and is this phone on the same Wi-Fi?' : e.message) }
}
document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('.tick'); if (!b || b.disabled) return
  b.disabled = true
  try {
    const r = await fetch('/api/tick?t=' + encodeURIComponent(token), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: b.dataset.key, season: Number(b.dataset.s), episode: Number(b.dataset.e) }) })
    const body = await r.json()
    if (!r.ok) throw new Error(body.error || 'Couldn\\u2019t tick it.')
    b.textContent = 'Ticked'; b.classList.add('done')
    setTimeout(() => render(body), 700); showError('')
  } catch (e) { b.disabled = false; showError(e.message) }
})
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && load())
setInterval(load, 30000)
load()
</script>
</body>
</html>`
}
