const CACHE = 'betoracle-v2'
const SHELL = [
  '/', '/dashboard', '/analyse', '/coupons', '/login', '/signup',
  '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png'
]

// Install : mise en cache du shell
self.addEventListener('install', e => {
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).catch(() => {})
  )
})

// Activate : nettoyer les anciens caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Fetch : network-first pour API/auth, cache-first pour assets
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  
  // Toujours réseau pour API Supabase, paiements, Resend
  if (url.hostname.includes('supabase') || 
      url.hostname.includes('geniuspay') ||
      url.hostname.includes('resend') ||
      url.hostname.includes('unsplash') ||
      url.pathname.startsWith('/api/')) {
    return
  }

  // Network-first pour HTML (pages)
  if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
          return res
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('/')))
    )
    return
  }

  // Cache-first pour fonts, images, CSS, JS
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      }).catch(() => cached)
    })
  )
})
