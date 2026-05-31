self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload = {}
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Recordatorio ICADEMY', body: event.data.text() }
  }

  const title = payload.title || 'Recordatorio ICADEMY'
  const body = payload.body || 'Tienes una clase proxima en tu calendario.'
  const url = payload.url || '/calendar-icademy'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/android-chrome-192x192.png',
      badge: '/favicon-32x32.png',
      data: { url },
      tag: payload.tag || undefined,
      renotify: false,
    }),
  )
})

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
