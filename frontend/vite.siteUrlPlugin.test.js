import { describe, expect, it, vi } from 'vitest'
import { buildRobotsTxt, buildSitemapXml, siteUrlPlugin } from './vite.siteUrlPlugin.js'

function collectAssets(plugin) {
  const assets = []
  plugin.generateBundle.call({ emitFile: (asset) => assets.push(asset) })
  return assets
}

describe('siteUrlPlugin', () => {
  it('sustituye el marcador y normaliza la barra final', () => {
    const plugin = siteUrlPlugin(' https://sitio.test/ ')

    expect(plugin.transformIndexHtml('<meta content="__SITE_URL__/og-image.png">')).toBe(
      '<meta content="https://sitio.test/og-image.png">'
    )
  })

  it('sin URL deja rutas relativas en vez de un marcador roto', () => {
    const plugin = siteUrlPlugin(undefined)

    expect(plugin.transformIndexHtml('<link rel="canonical" href="__SITE_URL__/">')).toBe(
      '<link rel="canonical" href="/">'
    )
  })

  it('avisa en el build cuando falta la URL', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    siteUrlPlugin('').configResolved({ command: 'build' })
    expect(warn).toHaveBeenCalledTimes(1)

    // En dev no avisa: el marcador se sustituye y no hay build que romper.
    siteUrlPlugin('').configResolved({ command: 'serve' })
    expect(warn).toHaveBeenCalledTimes(1)

    warn.mockRestore()
  })

  it('falla el build con REQUIRE_SITE_URL y sin URL', () => {
    expect(() => siteUrlPlugin('', { requireSiteUrl: true })).toThrow(/REQUIRE_SITE_URL/)
  })

  it('no emite archivos sin URL absoluta', () => {
    expect(collectAssets(siteUrlPlugin(''))).toHaveLength(0)
  })

  it('emite robots.txt y sitemap.xml con rutas absolutas', () => {
    const assets = collectAssets(siteUrlPlugin('https://sitio.test'))

    expect(assets.map((asset) => asset.fileName)).toEqual(['robots.txt', 'sitemap.xml'])

    const robots = assets[0].source
    expect(robots).toContain('Disallow: /administracion')
    expect(robots).toContain('Sitemap: https://sitio.test/sitemap.xml')

    const sitemap = assets[1].source
    expect(sitemap).toContain('<loc>https://sitio.test/menu</loc>')
    expect(sitemap).toContain('<loc>https://sitio.test/dia-a-dia</loc>')
    expect(sitemap).not.toContain('/administracion')
    expect(sitemap.match(/<loc>/g)).toHaveLength(5)
    expect(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  })
})

describe('generadores de archivos', () => {
  it('robots.txt declara el sitemap del mismo dominio', () => {
    expect(buildRobotsTxt('https://sitio.test')).toBe(
      'User-agent: *\nDisallow: /administracion\nAllow: /\n\nSitemap: https://sitio.test/sitemap.xml\n'
    )
  })

  it('sitemap.xml lista las cinco paginas publicas', () => {
    const xml = buildSitemapXml('https://sitio.test')

    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain('<loc>https://sitio.test/</loc>')
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true)
  })
})
