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
  // Ne jamais mettre en cache les pages d'analyse, coupons, dashboard
  if (url.pathname === '/analyse' || url.pathname === '/coupons' || url.pathname === '/dashboard') {
    return  // réseau uniquement, pas de cache
  }
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

// ── PUSH NOTIFICATIONS ──────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return
  let payload
  try { payload = e.data.json() }
  catch { payload = { title: 'Betoracle Pro', body: e.data.text() } }

  const title   = payload.title || 'Betoracle Pro'
  const options = {
    body:  payload.body || 'Nouvelle notification',
    icon:  payload.icon  || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-72.png',
    tag:   payload.tag   || 'betoracle-notif',
    data:  { url: payload.url || '/dashboard' },
    actions: payload.actions || [],
    vibrate: [100, 50, 100],
    renotify: true
  }
  e.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url || '/dashboard'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const found = cs.find(c => c.url.includes(url) && 'focus' in c)
      if (found) return found.focus()
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
