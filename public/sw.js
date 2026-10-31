// FlowMint PWA Service Worker (flowmint-pwa-v1)
const CACHE_NAME = 'flowmint-pwa-v1'

const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-icon.png',
  '/icon-32.png',
]

// 1. Install Event — Pre-cache core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[FlowMint SW] Pre-cache warning:', err)),
  )
})

// 2. Activate Event — Clean up stale versions
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

// 3. Fetch Event — Network First for navigation, Cache First for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only handle GET requests
  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)

  // Skip chrome-extension, API calls, and third-party requests from full caching
  if (url.origin !== self.location.origin) {
    return
  }

  // API calls: Network only (data syncing is handled by client IndexedDB/localStorage queue)
  if (url.pathname.startsWith('/api/')) {
    return
  }

  // Page Navigations: Network First with Cache Fallback
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
          // Offline fallback: serve cached page or root app shell
          const cachedResponse = await caches.match(request)
          if (cachedResponse) {
            return cachedResponse
          }
          const rootCached = await caches.match('/')
          if (rootCached) {
            return rootCached
          }
          return new Response(
            '<!DOCTYPE html><html><head><title>FlowMint Offline</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family: sans-serif; text-align: center; padding: 40px; background: #f8f6f3; color: #222;"><h2>FlowMint Offline</h2><p>You are offline. Please open your installed app from the home screen.</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } },
          )
        }),
    )
    return
  }

  // Static Assets (_next/static, images, fonts): Stale-While-Revalidate
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

