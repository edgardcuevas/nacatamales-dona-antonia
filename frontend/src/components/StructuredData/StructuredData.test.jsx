// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { SettingsContext } from '../../context/settings-context'
import StructuredData from './StructuredData'
import { buildRestaurantJsonLd } from './jsonld'

const FULL_SETTINGS = {
  businessName: 'Nacatamales de Doña Antonia',
  whatsappNumber: '50588887777',
  address: 'Barrio Central, Masaya',
  latitude: 11.97,
  longitude: -86.09,
  facebookUrl: 'https://facebook.com/nacatamales',
  instagramUrl: 'https://instagram.com/nacatamales',
}

function renderJsonLd(settings) {
  return render(
    <SettingsContext.Provider value={{ settings }}>
      <StructuredData />
    </SettingsContext.Provider>
  )
}

describe('buildRestaurantJsonLd', () => {
  it('emite solo los campos que existen en settings', () => {
    const json = buildRestaurantJsonLd(FULL_SETTINGS, 'https://sitio.test')

    expect(json['@context']).toBe('https://schema.org')
    expect(json['@type']).toBe('Restaurant')
    expect(json.name).toBe('Nacatamales de Doña Antonia')
    expect(json.url).toBe('https://sitio.test/')
    expect(json.image).toBe('https://sitio.test/og-image.png')
    expect(json.telephone).toBe('+50588887777')
    expect(json.address).toEqual({ '@type': 'PostalAddress', streetAddress: 'Barrio Central, Masaya' })
    expect(json.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 11.97, longitude: -86.09 })
    expect(json.sameAs).toEqual([
      'https://facebook.com/nacatamales',
      'https://instagram.com/nacatamales',
    ])
    expect(json.hasMenu).toBe('https://sitio.test/menu')
  })

  it('nunca inventa un horario a partir del texto libre', () => {
    const json = buildRestaurantJsonLd({ businessName: 'X' }, 'https://sitio.test')

    expect(json).not.toHaveProperty('openingHoursSpecification')
    expect(json).not.toHaveProperty('openingHours')
  })

  it('omite los campos vacios en vez de publicarlos a null', () => {
    const json = buildRestaurantJsonLd({ businessName: 'X' }, '')

    expect(json).not.toHaveProperty('telephone')
    expect(json).not.toHaveProperty('address')
    expect(json).not.toHaveProperty('geo')
    expect(json).not.toHaveProperty('sameAs')
    expect(json).not.toHaveProperty('url')
    expect(json).not.toHaveProperty('hasMenu')
  })
})

describe('StructuredData', () => {
  afterEach(() => {
    cleanup()
  })

  it('monta un unico script JSON-LD legible', () => {
    renderJsonLd(FULL_SETTINGS)

    const scripts = document.querySelectorAll('script#site-jsonld')
    expect(scripts).toHaveLength(1)
    expect(scripts[0].getAttribute('type')).toBe('application/ld+json')

    const json = JSON.parse(scripts[0].textContent)
    expect(json['@type']).toBe('Restaurant')
    expect(json.name).toBe('Nacatamales de Doña Antonia')
  })

  it('sigue habiendo uno solo cuando cambian los ajustes', () => {
    const { rerender } = renderJsonLd(FULL_SETTINGS)
    rerender(
      <SettingsContext.Provider value={{ settings: { businessName: 'Otro nombre' } }}>
        <StructuredData />
      </SettingsContext.Provider>
    )

    const scripts = document.querySelectorAll('script#site-jsonld')
    expect(scripts).toHaveLength(1)
    expect(JSON.parse(scripts[0].textContent).name).toBe('Otro nombre')
  })

  it('escapa los angulos para no cerrar la etiqueta script', () => {
    renderJsonLd({ businessName: 'Tamales </script><script>alert(1)</script>' })

    const script = document.querySelector('script#site-jsonld')
    expect(script.textContent).not.toContain('</script>')
    expect(script.textContent).toContain('\\u003c')
  })
})
