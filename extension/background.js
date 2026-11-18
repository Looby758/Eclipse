// Passes what content.js reads to the Eclipse app on this computer, and remembers how that went
// for the popup. Nothing is sent anywhere else.
const ECLIPSE = 'http://127.0.0.1:47615'

async function post(path, body) {
  const res = await fetch(`${ECLIPSE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return res.ok
}

// Streaming tabs that were already open when the extension was installed or updated don't have it
// yet: add it to them, so you don't have to reload the page.
chrome.runtime.onInstalled.addListener(async () => {
  const matches = chrome.runtime.getManifest().content_scripts[0].matches
  for (const tab of await chrome.tabs.query({ url: matches })) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['page.js'], world: 'MAIN' })
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
    } catch {
      // A tab Chrome won't let extensions into: it picks it up when reloaded.
    }
  }
})

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === 'playing') {
    post('/playing', msg.report)
      .then((ok) => chrome.storage.local.set({ last: { at: Date.now(), ok, texts: msg.report.texts, url: msg.report.url } }))
      .catch(() => chrome.storage.local.set({ last: { at: Date.now(), ok: false, texts: msg.report.texts, url: msg.report.url, unreachable: true } }))
    return false
  }
  if (msg && msg.type === 'check') {
    fetch(`${ECLIPSE}/hello`, { method: 'GET' })
      .then((r) => r.json().then((j) => reply({ ok: r.ok && !!j.ok })))
      .catch(() => reply({ ok: false }))
    return true
  }
  return false
})
