const $ = (id) => document.getElementById(id)
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

chrome.runtime.sendMessage({ type: 'check' }, (r) => {
  if (r && r.ok) {
    $('status').className = 'ok'
    $('status').textContent = 'Connected to Eclipse.'
  } else {
    $('status').className = 'no'
    $('status').textContent = "Can't reach Eclipse. Open it, and switch on Settings → Noticing what you watch → What's playing."
  }
})

// What this tab's player shows, so you can see what Eclipse will be told.
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return
  chrome.tabs.sendMessage(tab.id, { type: 'what' }, (r) => {
    if (chrome.runtime.lastError || !r) {
      $('page').textContent = /^https:\/\/[^/]*(disneyplus|nowtv|now|netflix|primevideo|amazon|bbc|itv|channel4|apple|paramountplus)\./.test(tab.url || '')
        ? 'This page can’t be read yet: reload it.'
        : 'Not a streaming page the extension reads.'
      return
    }
    if (!r.report) {
      $('page').textContent = 'On this page: no player found yet (it can take a few seconds after it starts).'
      return
    }
    const p = r.report
    $('page').textContent = `On this page: ${p.texts.slice(0, 3).join(' · ') || 'no title found'} · ${clock(p.position)} of ${clock(p.duration)}${p.paused ? ' · paused' : ''}`
  })
})

chrome.storage.local.get('last', ({ last: l }) => {
  if (!l) {
    $('last').textContent = 'Nothing sent to Eclipse yet.'
    return
  }
  const mins = Math.round((Date.now() - l.at) / 60000)
  $('last').textContent = `Sent to Eclipse ${mins < 1 ? 'just now' : `${mins} min ago`}${l.ok ? '' : ' (Eclipse didn’t take it)'}.`
})
