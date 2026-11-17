// Normaliza la URL publica del sitio: sin espacios y sin barra final.
// Vive en su propio archivo porque vite.siteUrlPlugin.js lo importa desde
// Node, donde `import.meta.env` no existe.
export function normalizeSiteUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}
