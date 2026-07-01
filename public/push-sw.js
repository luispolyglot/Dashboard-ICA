self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await precacheCriticalAssets()
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await cleanupOldCaches()
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request))
    return
  }

  if (!isSameOrigin(request.url)) return

  if (shouldIgnoreRequest(request)) return

  const isStaticAsset =
    request.destination === 'script'
    || request.destination === 'style'
    || request.destination === 'image'
    || request.destination === 'font'

  if (isStaticAsset) {
    event.respondWith(handleStaticAssetRequest(request, event))
    return
  }

  if (shouldHandleAsDataRequest(request)) {
    event.respondWith(handleDataRequest(request))
  }
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload = {}
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Recordatorio ICADEMY', body: event.data.text() }
  }

  const title = payload.title || 'Recordatorio ICADEMY'
  const body = payload.body || 'Tienes una clase próxima en tu calendario.'
  const url = payload.url || '/calendar-icademy'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/android-chrome-192x192.png',
      badge: '/badge-72.png',
      data: { url },
      tag: payload.tag || undefined,
      renotify: false,
    }),
  )
})

const CACHE_VERSION = 'v1'
const APP_SHELL_CACHE = `dashboard-ica-app-shell-${CACHE_VERSION}`
const STATIC_ASSETS_CACHE = `dashboard-ica-static-assets-${CACHE_VERSION}`
const RUNTIME_DATA_CACHE = `dashboard-ica-runtime-data-${CACHE_VERSION}`
const APP_SHELL_URL = '/index.html'
const STATIC_MAX_ENTRIES = 120
const DATA_MAX_ENTRIES = 30
const MAX_DATA_RESPONSE_SIZE_BYTES = 256 * 1024
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/favicon-32x32.png',
  '/android-chrome-192x192.png',
]

function isSameOrigin(rawUrl) {
  try {
    return new URL(rawUrl).origin === self.location.origin
  } catch {
    return false
  }
}

async function precacheCriticalAssets() {
  const cache = await caches.open(APP_SHELL_CACHE)

  for (const assetUrl of CRITICAL_ASSETS) {
    try {
      const response = await fetch(assetUrl, { cache: 'no-cache' })
      if (!response || !response.ok) continue
      await cache.put(assetUrl, response.clone())
    } catch {
      // noop
    }
  }
}

async function cleanupOldCaches() {
  const names = await caches.keys()

  const pendingDeletes = names
    .filter((name) => {
      if (
        name === APP_SHELL_CACHE
        || name === STATIC_ASSETS_CACHE
        || name === RUNTIME_DATA_CACHE
      ) {
        return false
      }

      return (
        name.startsWith('dashboard-ica-app-shell-')
        || name.startsWith('dashboard-ica-static-assets-')
        || name.startsWith('dashboard-ica-runtime-data-')
      )
    })
    .map((name) => caches.delete(name))

  await Promise.all(pendingDeletes)
}

async function handleNavigationRequest(request) {
  try {
    const networkResponse = await fetch(request)

    if (networkResponse && networkResponse.ok) {
      const contentType = networkResponse.headers.get('content-type') || ''
      if (contentType.includes('text/html')) {
        const cache = await caches.open(APP_SHELL_CACHE)
        await cache.put(APP_SHELL_URL, networkResponse.clone())
      }
    }

    return networkResponse
  } catch {
    const cache = await caches.open(APP_SHELL_CACHE)
    const shell =
      (await cache.match(APP_SHELL_URL))
      || (await cache.match('/'))

    if (shell) {
      return shell
    }

    return new Response('Offline', {
      status: 503,
      statusText: 'Offline',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  }
}

async function handleStaticAssetRequest(request, event) {
  const cache = await caches.open(STATIC_ASSETS_CACHE)
  const cached = await cache.match(request)

  const fetchAndRefresh = fetch(request)
    .then(async (networkResponse) => {
      if (networkResponse && shouldCacheStaticResponse(networkResponse, request)) {
        await cache.put(request, networkResponse.clone())
        await pruneCacheByMaxEntries(STATIC_ASSETS_CACHE, STATIC_MAX_ENTRIES)
      }
      return networkResponse
    })
    .catch(() => null)

  if (cached) {
    event.waitUntil(fetchAndRefresh)
    return cached
  }

  const networkResponse = await fetchAndRefresh
  if (networkResponse) {
    return networkResponse
  }

  return Response.error()
}

async function handleDataRequest(request) {
  const cache = await caches.open(RUNTIME_DATA_CACHE)

  try {
    const networkResponse = await fetch(request)
    if (networkResponse && shouldCacheDataResponse(networkResponse, request)) {
      await cache.put(request, networkResponse.clone())
      await pruneCacheByMaxEntries(RUNTIME_DATA_CACHE, DATA_MAX_ENTRIES)
    }
    return networkResponse
  } catch {
    const cached = await cache.match(request)
    if (cached) {
      return cached
    }
    return Response.error()
  }
}

function shouldIgnoreRequest(request) {
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) return true
  if (request.cache === 'no-store') return true
  return false
}

function shouldHandleAsDataRequest(request) {
  const acceptHeader = request.headers.get('accept') || ''
  return acceptHeader.includes('application/json')
}

function shouldCacheStaticResponse(response, request) {
  if (!response || !response.ok) return false

  const cacheControl = response.headers.get('cache-control') || ''
  if (cacheControl.includes('no-store') || cacheControl.includes('private')) {
    return false
  }

  if (request.destination === 'image') {
    const contentLength = Number(response.headers.get('content-length') || '0')
    if (Number.isFinite(contentLength) && contentLength > 2 * 1024 * 1024) {
      return false
    }
  }

  return true
}

function shouldCacheDataResponse(response, request) {
  if (!response || !response.ok) return false

  const cacheControl = response.headers.get('cache-control') || ''
  if (cacheControl.includes('no-store') || cacheControl.includes('private')) {
    return false
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return false

  const contentLength = Number(response.headers.get('content-length') || '0')
  if (Number.isFinite(contentLength) && contentLength > MAX_DATA_RESPONSE_SIZE_BYTES) {
    return false
  }

  const url = new URL(request.url)
  if (url.pathname.includes('/auth/')) return false

  return true
}

async function pruneCacheByMaxEntries(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const requests = await cache.keys()

  if (requests.length <= maxEntries) return

  const amountToDelete = requests.length - maxEntries
  const deletions = []
  for (let i = 0; i < amountToDelete; i += 1) {
    deletions.push(cache.delete(requests[i]))
  }

  await Promise.all(deletions)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetPath = event.notification?.data?.url || '/calendar-icademy'
  const targetUrl = new URL(targetPath, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (!('focus' in client)) continue

        const sameOrigin = new URL(client.url).origin === self.location.origin
        if (!sameOrigin) continue

        if ('navigate' in client) {
          return client.navigate(targetUrl).then(() => client.focus())
        }

        return client.focus()
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }

      return null
    }),
  )
})
