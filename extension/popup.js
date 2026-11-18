const status = document.getElementById('status')
const last = document.getElementById('last')

chrome.runtime.sendMessage({ type: 'check' }, (r) => {
  if (r && r.ok) {
    status.className = 'ok'
    status.textContent = 'Connected to Eclipse.'
  } else {
    status.className = 'no'
    status.textContent = "Can't reach Eclipse. Open it, and switch on Settings → Noticing what you watch → What's playing."
  }
})

chrome.storage.local.get('last', ({ last: l }) => {
  if (!l) {
    last.textContent = 'Nothing sent yet: play an episode on Disney+, NOW or another service.'
    return
  }
  const mins = Math.round((Date.now() - l.at) / 60000)
  const when = mins < 1 ? 'just now' : `${mins} min ago`
  last.textContent = `Last sent ${when}${l.ok ? '' : ' (Eclipse didn’t take it)'}: ${(l.texts || []).slice(0, 3).join(' · ') || 'no title found on the page'}`
})
