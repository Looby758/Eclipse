// Eclipse on your phone: keeps the page itself (not your library) so it opens with no signal.
// The page is always asked for fresh first; the saved copy is only used when that fails.
const CACHE = 'eclipse-phone-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // Only this page's own files: Google and TMDB are never touched.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  const hashed = url.pathname.includes('/assets/')
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      if (hashed) {
        const hit = await cache.match(e.request)
        if (hit) return hit
      }
      try {
        const res = await fetch(e.request)
        if (res.ok) cache.put(e.request, res.clone())
        return res
      } catch (err) {
        const hit = await cache.match(e.request, { ignoreSearch: true })
        if (hit) return hit
        if (e.request.mode === 'navigate') {
          const page = await cache.match(new URL('./', self.registration.scope).href)
          if (page) return page
        }
        throw err
      }
    })()
  )
})
