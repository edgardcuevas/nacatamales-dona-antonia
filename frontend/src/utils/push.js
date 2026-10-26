import { api } from '../api/client'

// Un service worker se registra una sola vez por documento. Guardar la
// promesa evita pedir el mismo registro desde el modal, el arranque de
// la app y el reintento silencioso.
let registrationPromise = null
let configPromise = null
let syncPromise = null

const PROMPT_DISMISS_KEY = 'nda:push-prompt-dismissed-at'
const PROMPT_DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function isIosDevice() {
  if (typeof navigator === 'undefined') {
    return false
  }

  // iPadOS 13+ se presenta como MacIntel; el número de puntos táctiles
  // es lo que lo distingue de una Mac de escritorio.
  const isIpadOs =
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1

  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) || isIpadOs
  )
}

export function isStandalone() {
  if (typeof window === 'undefined') {
    return false
  }

  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.navigator.standalone === true
  )
}

export function registerServiceWorker() {
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return Promise.resolve(null)
  }

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register('/sw.js')
      .catch((error) => {
        // Un fallo de registro no debe quedar cacheado para siempre:
        // el siguiente intento merece una oportunidad.
        registrationPromise = null
        throw error
      })
  }

  return registrationPromise
}

export function getPushConfig({ force = false } = {}) {
  if (!configPromise || force) {
    configPromise = api
      .get('/notifications/public-key')
      .catch((error) => {
        configPromise = null
        throw error
      })
  }

  return configPromise
}

export async function getCurrentSubscription() {
  if (!isPushSupported()) {
    return null
  }

  const registration = await registerServiceWorker()

  if (!registration) {
    return null
  }

  return registration.pushManager.getSubscription()
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index)
  }

  return output
}

async function ensureSubscription(publicKey) {
  const registration = await registerServiceWorker()

  if (!registration) {
    throw new Error('Service worker unavailable')
  }

  // En la primera visita el registro existe antes de que el worker esté
  // activo. pushManager.subscribe() necesita un worker activo, así que
  // se espera a ready en vez de asumir que register() ya terminó.
  const ready = await navigator.serviceWorker.ready
  const existing = await ready.pushManager.getSubscription()

  if (existing) {
    return existing
  }

  return ready.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
}

async function persistSubscription(subscription) {
  const payload = subscription.toJSON()

  await api.post('/notifications/subscriptions', {
    endpoint: payload.endpoint,
    keys: payload.keys,
  })
}

// Pide el permiso SOLO desde un gesto del usuario (lo exigen Safari y
// Chrome). Devuelve el estado del permiso para que el modal decida qué
// mensaje mostrar.
export async function subscribeToPush() {
  if (!isPushSupported()) {
    return { status: 'unsupported', subscribed: false }
  }

  // El permiso se pide como primera operación asíncrona: si se espera
  // antes a otra promesa, algunos navegadores consideran que el gesto
  // del clic ya expiró y bloquean el diálogo sin preguntar.
  const permission = await Notification.requestPermission()

  if (permission !== 'granted') {
    return { status: permission, subscribed: false }
  }

  const config = await getPushConfig()

  if (!config?.enabled) {
    const error = new Error('Push notifications are not configured')
    error.code = 'PUSH_NOT_CONFIGURED'
    throw error
  }

  const subscription = await ensureSubscription(config.publicKey)
  await persistSubscription(subscription)

  return { status: 'granted', subscribed: true }
}

// Si el permiso ya está concedido pero el navegador perdió la
// suscripción (limpieza de datos, cambio de service worker), se vuelve a
// crear sin mostrar ningún modal. Se ejecuta una sola vez por carga de
// página: el efecto del modal se repite en cada navegación y no debe
// escribir en la base en cada cambio de ruta.
export function syncPushSubscription() {
  if (syncPromise) {
    return syncPromise
  }

  syncPromise = (async () => {
    if (
      !isPushSupported() ||
      Notification.permission !== 'granted'
    ) {
      return null
    }

    const config = await getPushConfig()

    if (!config?.enabled) {
      return null
    }

    const subscription = await ensureSubscription(
      config.publicKey,
    )
    await persistSubscription(subscription)

    return subscription
  })().catch((error) => {
    syncPromise = null
    throw error
  })

  return syncPromise
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) {
    return { unsubscribed: false }
  }

  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()

  if (!subscription) {
    return { unsubscribed: false }
  }

  const { endpoint } = subscription

  try {
    await api.post('/notifications/subscriptions/unsubscribe', {
      endpoint,
    })
  } finally {
    await subscription.unsubscribe()
  }

  return { unsubscribed: true }
}

export function wasPromptDismissedRecently(now = Date.now()) {
  try {
    const dismissedAt = Number(
      window.localStorage.getItem(PROMPT_DISMISS_KEY),
    )

    if (!Number.isFinite(dismissedAt) || dismissedAt <= 0) {
      return false
    }

    return now - dismissedAt < PROMPT_DISMISS_COOLDOWN_MS
  } catch {
    // localStorage puede lanzar en modo privado; en ese caso el modal
    // simplemente se comporta como si nunca se hubiera descartado.
    return false
  }
}

export function rememberPromptDismissal(now = Date.now()) {
  try {
    window.localStorage.setItem(PROMPT_DISMISS_KEY, String(now))
  } catch {
    // Sin almacenamiento no hay cooldown, pero la app sigue funcionando.
  }
}

export function clearPromptDismissal() {
  try {
    window.localStorage.removeItem(PROMPT_DISMISS_KEY)
  } catch {
    // Nada que limpiar.
  }
}
