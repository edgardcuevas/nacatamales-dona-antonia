const DEFAULT_FALLBACKS = {
  businessName: 'Nacatamales de Doña Antonia',
  tagline: 'El sabor tradicional de Nicaragua, hecho como en casa.',
  scheduleText: 'Jueves a Domingo · 5:00 AM – 9:00 PM',
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

let accessToken = null

export function setAccessToken(token) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

async function request(path, options = {}) {
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

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data) }),
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
  }
}