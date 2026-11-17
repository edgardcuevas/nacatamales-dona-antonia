import { normalizeSiteUrl } from './normalizeSiteUrl'

// En el navegador el origen real es la fuente de verdad; VITE_SITE_URL solo
// hace falta en el build (og:image, canonical, sitemap) y en las pruebas.
// Si la variable falta, el sitio sigue funcionando con rutas relativas.
function currentOrigin() {
  if (typeof window === 'undefined') {
    return ''
  }
  return window.location.origin
}

export const SITE_URL = normalizeSiteUrl(import.meta.env.VITE_SITE_URL || currentOrigin())

// URL absoluta para metadatos. Sin SITE_URL devuelve la ruta relativa, que
// sigue siendo un canonical valido aunque no sea lo ideal.
export function absoluteUrl(path = '/') {
  const withSlash = path.startsWith('/') ? path : `/${path}`
  return `${SITE_URL}${withSlash}`
}
