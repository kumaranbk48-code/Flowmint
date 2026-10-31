// FlowMint PWA Service Worker (flowmint-pwa-v2)
const CACHE_NAME = 'flowmint-pwa-v2'
const OFFLINE_FALLBACK_URL = '/offline.html'

const PRECACHE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-icon.png',
  '/icon-32.png',
  '/screenshot-desktop.png',
  '/screenshot-mobile.png',
  OFFLINE_FALLBACK_URL,
]

// 1. Install Event — Pre-cache core shell & offline page
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[FlowMint SW] Pre-cache warning:', err)),
  )
})

// 2. Activate Event — Clean up stale cache versions & claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name)
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// 3. Fetch Event — Network First for navigation, Cache First / Stale-While-Revalidate for assets
self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)

  // Skip third-party and cross-origin requests
  if (url.origin !== self.location.origin) {
    return
  }

  // API calls: Network only (client-side offline queue handles offline state)
  if (url.pathname.startsWith('/api/')) {
    return
  }

  // Page Navigations: Network-First with Cache Fallback and Offline HTML Page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request)
          if (cachedResponse) {
            return cachedResponse
          }
          const rootCached = await caches.match('/')
          if (rootCached) {
            return rootCached
          }
          const offlinePage = await caches.match(OFFLINE_FALLBACK_URL)
          if (offlinePage) {
            return offlinePage
          }
          return new Response(
            '<!DOCTYPE html><html><head><title>FlowMint — Offline</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family: system-ui, sans-serif; text-align: center; padding: 48px 16px; background: #f8f6f3; color: #1c1917;"><h1 style="font-size: 24px; font-weight: 700; color: #c45a2c;">FlowMint Offline</h1><p style="color: #78716c; margin-top: 8px;">You are currently offline. Any changes made will automatically sync when you reconnect.</p><a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #c45a2c; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Return to Cashbook</a></body></html>',
            { headers: { 'Content-Type': 'text/html' } },
          )
        }),
    )
    return
  }

  // Static Assets (_next, images, fonts): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return networkResponse
        })
        .catch(() => cachedResponse)

      return cachedResponse || fetchPromise
    }),
  )
})

// 4. Background Sync (PWABuilder requirement)
self.addEventListener('sync', (event) => {
  if (event.tag === 'flowmint-sync-queue') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'FLUSH_SYNC_QUEUE' })
        })
      }),
    )
  }
})

// 5. Periodic Background Sync (PWABuilder requirement)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'flowmint-periodic-refresh') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return fetch('/').then((response) => {
          if (response && response.status === 200) {
            return cache.put('/', response)
          }
        }).catch(() => {})
      }),
    )
  }
})

// 6. Push Notifications (PWABuilder requirement)
self.addEventListener('push', (event) => {
  let payload = {
    title: 'FlowMint Cashbook',
    body: 'Your contractor daily ledger is updated.',
    url: '/',
  }
  if (event.data) {
    try {
      payload = Object.assign(payload, event.data.json())
    } catch {
      payload.body = event.data.text()
    }
  }
  const options = {
    body: payload.body,
    icon: '/icon-192.png',
    badge: '/icon-32.png',
    vibrate: [100, 50, 100],
    data: { url: payload.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(payload.title, options))
})

// 7. Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    }),
  )
})
