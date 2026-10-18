import { describe, it, expect } from 'vitest'
import { splitBusinessName, storyExcerpt } from './brand'

describe('splitBusinessName', () => {
  it('separa el nombre por defecto en dos líneas', () => {
    expect(splitBusinessName('Nacatamales de Doña Antonia')).toEqual({
      main: 'NACATAMALES',
      rest: 'DE DOÑA ANTONIA',
    })
  })

  it('deja todo en la primera línea si no hay " de "', () => {
    expect(splitBusinessName('Fritanga Los Pinos')).toEqual({
      main: 'FRITANGA LOS PINOS',
      rest: null,
    })
  })

  it('tolera espacios sobrantes y valores vacíos', () => {
    expect(splitBusinessName('  Tamales   de  Rosa ').rest).toBe('DE ROSA')
    expect(splitBusinessName(null)).toEqual({ main: '', rest: null })
  })
})

describe('storyExcerpt', () => {
  it('devuelve solo el primer párrafo', () => {
    expect(storyExcerpt('Primero.\n\nSegundo.')).toBe('Primero.')
  })

  it('no toca un texto corto', () => {
    expect(storyExcerpt('Somos un negocio familiar.')).toBe('Somos un negocio familiar.')
  })

  it('recorta en límite de palabra y agrega puntos suspensivos', () => {
    const long = 'palabra '.repeat(60).trim()
    const result = storyExcerpt(long, 50)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(51)
    expect(result.slice(0, -1).endsWith('palabr')).toBe(false)
  })

  it('devuelve cadena vacía sin texto', () => {
    expect(storyExcerpt(null)).toBe('')
  })
})