import { describe, it, expect } from 'vitest'
import { formatPrice } from './price'

describe('formatPrice', () => {
  it('agrupa miles con coma segun la region', () => {
    expect(formatPrice(1250)).toBe('1,250')
    expect(formatPrice('1250')).toBe('1,250')
    expect(formatPrice(1000000)).toBe('1,000,000')
  })

  it('conserva decimales con punto', () => {
    expect(formatPrice(12.5)).toBe('12.5')
    expect(formatPrice('12.50')).toBe('12.5')
  })

  it('deja enteros sin decimales', () => {
    expect(formatPrice(900)).toBe('900')
    expect(formatPrice('0')).toBe('0')
  })

  it('es idempotente con un valor ya formateado', () => {
    // Un valor que ya viene con separador debe devolver lo mismo, no
    // stripped. Servir el dato crudo seria un error de formato.
    expect(formatPrice('1,250')).toBe('1,250')
    expect(formatPrice(formatPrice(1250))).toBe('1,250')
  })

  it('devuelve cadena vacia en vez de NaN', () => {
    // El precio jamas debe romper la carta con un "NaN" en pantalla.
    expect(formatPrice(null)).toBe('')
    expect(formatPrice(undefined)).toBe('')
    expect(formatPrice('')).toBe('')
    expect(formatPrice('abc')).toBe('')
    expect(formatPrice('.')).toBe('')
  })
})