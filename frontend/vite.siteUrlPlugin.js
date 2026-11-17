import { normalizeSiteUrl } from './src/utils/normalizeSiteUrl.js'

// Rutas publicas que entran al sitemap. /administracion queda fuera a
// proposito: no debe indexarse y su HTML se sirve con noindex.
const PUBLIC_ROUTES = ['/', '/menu', '/dia-a-dia', '/nosotros', '/contacto']

export function buildRobotsTxt(siteUrl) {
  return [
    'User-agent: *',
    'Disallow: /administracion',
    'Allow: /',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n')
}

export function buildSitemapXml(siteUrl) {
  const entries = PUBLIC_ROUTES.map(
    (route) => `  <url><loc>${siteUrl}${route}</loc></url>`
  ).join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    '</urlset>',
    '',
  ].join('\n')
}

const MISSING_URL_MESSAGE = [
  'VITE_SITE_URL no esta definida y REQUIRE_SITE_URL=1.',
  'El build se detiene a proposito: sin URL absoluta se publicarian un',
  'sitemap, un canonical y un og:image rotos sin avisar.',
  "Ejecuta: $env:REQUIRE_SITE_URL='1'; $env:VITE_SITE_URL='https://tu-dominio'; npm run build",
].join('\n')

export function siteUrlPlugin(rawSiteUrl, { requireSiteUrl = false } = {}) {
  const siteUrl = normalizeSiteUrl(rawSiteUrl)

  if (!siteUrl && requireSiteUrl) {
    throw new Error(MISSING_URL_MESSAGE)
  }

  return {
    name: 'nacatamales-site-url',

    configResolved(config) {
      if (!siteUrl && config.command === 'build') {
        console.warn(
          '[site-url] VITE_SITE_URL sin definir: og:image, og:url y canonical ' +
            'quedan relativos y no se generan sitemap.xml ni robots.txt.'
        )
      }
    },

    // Sustituye el marcador tambien en dev, para que el HTML servido no
    // contenga nunca un __SITE_URL__ literal.
    transformIndexHtml(html) {
      return html.replaceAll('__SITE_URL__', siteUrl)
    },

    // Los dos archivos se emiten en dist/ y no viven en public/: su contenido
    // depende de la URL absoluta, que public/ no puede conocer.
    generateBundle() {
      if (!siteUrl) {
        return
      }

      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: buildRobotsTxt(siteUrl),
      })
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: buildSitemapXml(siteUrl),
      })
    },
  }
}
