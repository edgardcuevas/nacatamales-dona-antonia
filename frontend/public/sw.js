/* Service worker de notificaciones.
   ------------------------------------------------------------
   Este archivo NO tiene handler de fetch a propósito: el sitio no es
   una PWA offline y cachear assets solo produciría versiones viejas
   del bundle. Aquí únicamente viven push y notificationclick.

   Se sirve desde /sw.js con scope raíz, que es el único que permite
   controlar todas las rutas del sitio. */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function readPayload(event) {
  if (!event.data) {
    return {}
  }

  try {
    return event.data.json()
  } catch {
    return { body: event.data.text() }
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event)

  const title =
    payload.title || 'Nacatamales de Doña Antonia'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/apple-touch-icon.png',
    badge: payload.badge || '/apple-touch-icon.png',
    tag: payload.tag || 'announcement',
    // Con tag, renotify hace vibrar/sonar aunque ya exista una
    // notificación del mismo aviso. Sin tag, el navegador lo ignora.
    renotify: Boolean(payload.tag),
    data: {
      url: payload.url || '/',
      announcementId: payload.announcementId ?? null,
    },
  }

  event.waitUntil(
    self.registration.showNotification(title, options),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const target = new URL(
    event.notification.data?.url || '/',
    self.location.origin,
  ).href

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      for (const client of clientList) {
        if (
          client.url.startsWith(self.location.origin) &&
          'focus' in client
        ) {
          await client.focus()
          return
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(target)
      }
    })(),
  )
})

/* Si el navegador rota la suscripción (por ejemplo al expirar), se
   vuelve a crear con la misma clave pública y se avisa al backend.
   Es best-effort: si falla, la próxima visita lo reintenta. */
self.addEventListener(
  'pushsubscriptionchange',
  (event) => {
    event.waitUntil(
      (async () => {
        try {
          const response = await fetch(
            '/api/notifications/public-key',
            {
              headers: {
                accept: 'application/json',
              },
            },
          )
          const body = await response.json()
          const publicKey = body?.data?.publicKey

          if (!body?.success || !publicKey) {
            return
          }

          const subscription =
            await self.registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey:
                urlBase64ToUint8Array(publicKey),
            })
          const payload = subscription.toJSON()

          await fetch(
            '/api/notifications/subscriptions',
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                endpoint: payload.endpoint,
                keys: payload.keys,
              }),
            },
          )
        } catch {
          // Sin conexión o con el backend caído: no hay nada más que
          // hacer desde el service worker.
        }
      })(),
    )
  },
)

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat(
    (4 - (base64String.length % 4)) % 4,
  )
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index)
  }

  return output
}
