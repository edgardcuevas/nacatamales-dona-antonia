import { describe, it, expect } from 'vitest'
import { extractCoordinates, isShortMapsLink, mapsSearchUrl } from './mapsLink'

describe('extractCoordinates', () => {
  it('prefiere el pin exacto (!3d!4d) sobre el centro de la vista (@)', () => {
    const url =
      'https://www.google.com/maps/place/Doña+Antonia/@12.1364,-86.2514,17z/data=!3m1!4b1!4m6!3m5!1s0x8f:0x1!8m2!3d12.1371!4d-86.2520'
    expect(extractCoordinates(url)).toEqual({ latitude: 12.1371, longitude: -86.252 })
  })

  it('lee la vista (@) cuando no hay pin exacto', () => {
    expect(
      extractCoordinates('https://www.google.com/maps/@12.1364,-86.2514,15z')
    ).toEqual({ latitude: 12.1364, longitude: -86.2514 })
  })

  it('lee ?q= y ll=', () => {
    expect(extractCoordinates('https://maps.google.com/?q=12.1364,-86.2514')).toEqual({
      latitude: 12.1364,
      longitude: -86.2514,
    })
    expect(extractCoordinates('https://maps.google.com/?ll=12.1,-86.2&z=10')).toEqual({
      latitude: 12.1,
      longitude: -86.2,
    })
  })

  it('lee coordenadas sueltas copiadas desde el mapa', () => {
    expect(extractCoordinates('12.1364, -86.2514')).toEqual({ latitude: 12.1364, longitude: -86.2514 })
    expect(extractCoordinates('  12.1364 -86.2514 ')).toEqual({ latitude: 12.1364, longitude: -86.2514 })
  })

  it('rechaza lo que no son coordenadas o están fuera de rango', () => {
    expect(extractCoordinates('hola')).toBeNull()
    expect(extractCoordinates('')).toBeNull()
    expect(extractCoordinates(null)).toBeNull()
    expect(extractCoordinates('120.5, -86.2')).toBeNull()
    expect(extractCoordinates('https://maps.app.goo.gl/abc123')).toBeNull()
  })
})

describe('isShortMapsLink', () => {
  it('detecta enlaces cortos', () => {
    expect(isShortMapsLink('https://maps.app.goo.gl/abc123')).toBe(true)
    expect(isShortMapsLink('https://goo.gl/maps/xyz')).toBe(true)
    expect(isShortMapsLink('https://www.google.com/maps/place/x')).toBe(false)
  })
})

describe('mapsSearchUrl', () => {
  it('codifica la búsqueda', () => {
    expect(mapsSearchUrl('Nacatamales de Doña Antonia')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Nacatamales%20de%20Do%C3%B1a%20Antonia'
    )
  })
})