// Passes what content.js reads to the Eclipse app on this computer, and remembers how that went
// for the popup. Nothing is sent anywhere else.
const ECLIPSE = 'http://127.0.0.1:47615'

async function post(path, body) {
  const res = await fetch(`${ECLIPSE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return res.ok
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === 'playing') {
    post('/playing', msg.report)
      .then((ok) => chrome.storage.local.set({ last: { at: Date.now(), ok, texts: msg.report.texts, url: msg.report.url } }))
      .catch(() => chrome.storage.local.set({ last: { at: Date.now(), ok: false, texts: msg.report.texts, url: msg.report.url, unreachable: true } }))
    return false
  }
  if (msg && msg.type === 'check') {
    fetch(`${ECLIPSE}/hello`, { method: 'GET' })
      .then((r) => r.json().then((j) => reply({ ok: r.ok && !!j.ok, version: j.version })))
      .catch(() => reply({ ok: false }))
    return true
  }
  return false
})
