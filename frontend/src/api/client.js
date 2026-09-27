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

let accessToken = null
let refreshPromise = null

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

async function request(path, options = {}) {
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

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: 'DELETE' }),
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