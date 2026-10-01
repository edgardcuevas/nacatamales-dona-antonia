const DEFAULT_FALLBACKS = {
  businessName: 'Nacatamales de Doña Antonia',
  tagline: 'El sabor tradicional de Nicaragua, hecho como en casa.',
  scheduleText: 'Jueves a Domingo · 5:00 AM – 9:00 PM',
  scheduleColor: 'AMARILLO',
  storyText:
    'Somos un pequeño negocio familiar nicaragüense, dedicado a preparar nacatamales y fritanga con la receta de siempre. Cada plato lo hacemos a mano, con el mismo cariño con el que empezó este negocio.',
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const NO_RETRY_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout']

// Every public read used to be fetched once per component mount, and
// navigating remounts the page, so a seven page visit repeated the same
// endpoints over and over. These are the reads worth remembering: they
// change when an admin publishes, and the cache is dropped on any
// successful mutation in this tab. Admin reads are deliberately absent,
// so the management panel never renders a stale list.
const CACHE_TTL_MS = 60_000
const CACHEABLE_GET_PREFIXES = [
  '/settings',
  '/categories',
  '/products',
  '/videos',
  '/photos',
  '/announcements',
]

// Distinct from a cached `null`, which is a legitimate result for a 204.
const CACHE_MISS = Symbol('cache-miss')

// Both stores are module scoped, so the cache lives for the lifetime of
// the tab and is shared by every component, including the ones that
// mount later.
const responseCache = new Map()
const inFlightReads = new Map()

let accessToken = null
let refreshPromise = null

function isCacheableRead(path, method) {
  return (
    method === 'GET' &&
    CACHEABLE_GET_PREFIXES.some((prefix) => path.startsWith(prefix))
  )
}

function readCache(key) {
  const entry = responseCache.get(key)
  if (!entry) {
    return CACHE_MISS
  }

  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(key)
    return CACHE_MISS
  }

  return entry.data
}

function writeCache(key, data) {
  responseCache.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
}

function invalidateCache() {
  responseCache.clear()
}

export function setAccessToken(token) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

async function rawRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  // A 204 or a failed request can legitimately have no JSON body, so
  // the guard has to read the status before touching the payload.
  if (response.status === 204) {
    return null
  }

  const body = await response.json().catch(() => null)

  if (!response.ok || !body?.success) {
    const error = new Error(body?.error?.message || 'Error de red')
    error.code = body?.error?.code || 'UNKNOWN_ERROR'
    error.status = response.status
    throw error
  }

  return body.data
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = rawRequest('/auth/refresh', { method: 'POST' })
      .then((data) => {
        setAccessToken(data.accessToken)
        return data.user
      })
      .catch((error) => {
        setAccessToken(null)
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

// The 401 refresh-and-retry, unchanged. Kept separate from the cache so
// the cache only ever wraps a fully resolved read.
async function performRequest(path, options) {
  try {
    return await rawRequest(path, options)
  } catch (error) {
    const shouldRetry =
      error.status === 401 && !NO_RETRY_PATHS.includes(path) && !options.__isRetry

    if (!shouldRetry) {
      throw error
    }

    await refreshAccessToken()
    return rawRequest(path, { ...options, __isRetry: true })
  }
}

async function request(path, options = {}) {
  const method = options.method || 'GET'
  const cacheable = isCacheableRead(path, method)

  if (cacheable) {
    const cached = readCache(path)
    if (cached !== CACHE_MISS) {
      return cached
    }

    // Two components asking for the same read in the same tick get one
    // network call, not two.
    const pending = inFlightReads.get(path)
    if (pending) {
      return pending
    }
  }

  const promise = (async () => {
    try {
      const data = await performRequest(path, options)

      if (cacheable) {
        // Only a resolved read is stored, so a transient failure never
        // becomes a cached one.
        writeCache(path, data)
      } else if (method !== 'GET') {
        // A successful mutation can change anything the public reads
        // hold. The cache is per tab, so dropping all of it is cheap and
        // always correct.
        invalidateCache()
      }

      return data
    } finally {
      if (cacheable) {
        inFlightReads.delete(path)
      }
    }
  })()

  if (cacheable) {
    inFlightReads.set(path, promise)
  }

  return promise
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  upload: (path, file, extraHeaders = {}) =>
    request(path, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type, ...extraHeaders },
    }),
  // Raw binary body with a caller-chosen method. Used by the YouTube
  // thumbnail route, which is a PUT of an image, not a form upload.
  putBinary: (path, file, extraHeaders = {}) =>
    request(path, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type, ...extraHeaders },
    }),
}

export const authApi = {
  login: (email, password) =>
    rawRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => rawRequest('/auth/logout', { method: 'POST' }),
  refresh: refreshAccessToken,
}

export function withSettingsFallback(settings) {
  return {
    businessName: settings?.businessName || DEFAULT_FALLBACKS.businessName,
    tagline: settings?.tagline || DEFAULT_FALLBACKS.tagline,
    whatsappNumber: settings?.whatsappNumber || null,
    facebookUrl: settings?.facebookUrl || null,
    instagramUrl: settings?.instagramUrl || null,
    address: settings?.address || null,
    latitude: settings?.latitude ?? null,
    longitude: settings?.longitude ?? null,
    scheduleText: settings?.scheduleText || DEFAULT_FALLBACKS.scheduleText,
    scheduleColor: settings?.scheduleColor || DEFAULT_FALLBACKS.scheduleColor,
    fritangaScheduleText: settings?.fritangaScheduleText || null,
    fritangaScheduleColor: settings?.fritangaScheduleColor || 'ROJO',
    storyText: settings?.storyText || DEFAULT_FALLBACKS.storyText,
  }
}