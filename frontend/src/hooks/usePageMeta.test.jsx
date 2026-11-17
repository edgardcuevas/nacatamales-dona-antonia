// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { SettingsContext } from '../context/settings-context'
import usePageMeta from './usePageMeta'
import { SITE_URL } from '../utils/siteUrl'

function Probe(props) {
  usePageMeta(props)
  return null
}

function renderPage(props, businessName = 'Doña Antonia') {
  return render(
    <SettingsContext.Provider value={{ settings: { businessName } }}>
      <Probe {...props} />
    </SettingsContext.Provider>
  )
}

function meta(attribute, key) {
  return document.head.querySelector(`meta[${attribute}="${key}"]`)?.getAttribute('content') ?? null
}

function canonical() {
  return document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null
}

describe('usePageMeta', () => {
  afterEach(() => {
    cleanup()
    document.head.querySelectorAll('meta[name="robots"], link[rel="canonical"]').forEach((el) => el.remove())
    document.head.querySelectorAll('meta[name="description"]').forEach((el) => el.remove())
    document.title = ''
  })

  it('compone el titulo con el nombre del negocio', () => {
    renderPage({ title: 'Menú', description: 'El menú del día.' })

    expect(document.title).toBe('Menú · Doña Antonia')
    expect(meta('property', 'og:title')).toBe('Menú · Doña Antonia')
  })

  it('sin titulo de pagina deja solo el nombre del negocio', () => {
    renderPage({ description: 'Inicio.' })

    expect(document.title).toBe('Doña Antonia')
    expect(meta('property', 'og:title')).toBe('Doña Antonia')
  })

  it('escribe description, og:url y canonical absolutos', () => {
    renderPage({ title: 'Contacto', description: 'Cómo llegar.' })

    expect(meta('name', 'description')).toBe('Cómo llegar.')
    expect(meta('property', 'og:description')).toBe('Cómo llegar.')
    expect(meta('property', 'og:url')).toBe(`${SITE_URL}/`)
    expect(canonical()).toBe(`${SITE_URL}/`)
  })

  it('no escribe robots cuando la pagina es indexable', () => {
    renderPage({ title: 'Menú' })

    expect(meta('name', 'robots')).toBeNull()
  })

  it('marca noindex,follow y lo retira al desmontar', () => {
    const { unmount } = renderPage({ title: 'Administración', noindex: true })

    expect(meta('name', 'robots')).toBe('noindex,follow')

    unmount()

    expect(meta('name', 'robots')).toBeNull()
    expect(canonical()).toBeNull()
  })

  it('restaura los metadatos que ya estaban en el documento', () => {
    const base = document.createElement('meta')
    base.setAttribute('name', 'description')
    base.setAttribute('content', 'descripcion base')
    document.head.appendChild(base)

    const { unmount } = renderPage({ title: 'Menú', description: 'descripcion de menu' })
    expect(meta('name', 'description')).toBe('descripcion de menu')

    unmount()
    expect(meta('name', 'description')).toBe('descripcion base')
  })

  it('reacciona al cambio de nombre del negocio sin duplicar etiquetas', () => {
    const { rerender } = renderPage({ title: 'Menú' }, 'Doña Antonia')
    rerender(
      <SettingsContext.Provider value={{ settings: { businessName: 'Nacatamales' } }}>
        <Probe title="Menú" />
      </SettingsContext.Provider>
    )

    expect(document.title).toBe('Menú · Nacatamales')
    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1)
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
  })
})
