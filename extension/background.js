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
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['page.js'], world: 'MAIN' })
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content.js'] })
    } catch {
      // A tab Chrome won't let extensions into: it picks it up when reloaded.
    }
  }
})

// Tabs that have sent something, and the address they sent it from, so Eclipse can be told straight
// away when one is closed or goes elsewhere (instead of waiting for it to go quiet).
const PLAYING_KEY = 'playingTabs'
async function playingTabs() {
  return (await chrome.storage.session.get(PLAYING_KEY))[PLAYING_KEY] || {}
}
async function gone(tabId) {
  const tabs = await playingTabs()
  const url = tabs[tabId]
  if (!url) return
  delete tabs[tabId]
  await chrome.storage.session.set({ [PLAYING_KEY]: tabs })
  await post('/gone', { url }).catch(() => undefined)
}
chrome.tabs.onRemoved.addListener((tabId) => void gone(tabId))
chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (!change.url) return
  const tabs = await playingTabs()
  if (tabs[tabId] && tabs[tabId] !== change.url) void gone(tabId)
})

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'playing') {
    // The player can be in a frame inside the page: Eclipse wants the page's own address.
    if (sender.tab && sender.tab.url) msg.report.url = sender.tab.url
    if (sender.tab) void playingTabs().then((tabs) => chrome.storage.session.set({ [PLAYING_KEY]: { ...tabs, [sender.tab.id]: msg.report.url } }))
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
