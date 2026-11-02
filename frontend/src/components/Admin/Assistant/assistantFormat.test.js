import { describe, expect, it } from 'vitest'
import {
  formatActionField,
  formatActionValue,
  describeActionChange,
  formatRelativeTime,
  humanizeField,
} from './assistantFormat'

describe('humanizeField', () => {
  it('convierte camelCase en frase legible', () => {
    expect(humanizeField('isAvailable')).toBe('Is available')
  })

  it('reemplaza guiones y puntos por espacios', () => {
    expect(humanizeField('start_date')).toBe('Start date')
  })

  it('devuelve Campo para entrada vacia', () => {
    expect(humanizeField('')).toBe('Campo')
    expect(humanizeField(null)).toBe('Campo')
  })
})

describe('formatActionField', () => {
  it('mapea los campos conocidos', () => {
    expect(formatActionField('isAvailable')).toBe('Disponibilidad')
    expect(formatActionField('isActive')).toBe('Visibilidad')
    expect(formatActionField('price')).toBe('Precio')
    expect(formatActionField('categoryId')).toBe('Categoría')
    expect(formatActionField('name')).toBe('Nombre')
    expect(formatActionField('description')).toBe('Descripción')
    expect(formatActionField('sortOrder')).toBe('Orden')
    expect(formatActionField('imageMediaId')).toBe('Imagen')
    expect(formatActionField('title')).toBe('Título')
    expect(formatActionField('content')).toBe('Mensaje')
    expect(formatActionField('type')).toBe('Tipo')
    expect(formatActionField('startsAt')).toBe('Inicia')
    expect(formatActionField('endsAt')).toBe('Termina')
  })

  it('humaniza un campo desconocido', () => {
    expect(formatActionField('somethingElse')).toBe('Something else')
  })
})

describe('formatActionValue', () => {
  it('formatea disponibilidad', () => {
    expect(formatActionValue('isAvailable', true)).toBe('Disponible')
    expect(formatActionValue('isAvailable', false)).toBe('No disponible')
  })

  it('formatea visibilidad segun el tipo de objetivo', () => {
    expect(formatActionValue('isActive', true, 'announcement')).toBe('Publicado')
    expect(formatActionValue('isActive', false, 'announcement')).toBe('Oculto')
    expect(formatActionValue('isActive', true, 'video')).toBe('Publicado')
    expect(formatActionValue('isActive', false, 'video')).toBe('Oculto')
    expect(formatActionValue('isActive', true, 'category')).toBe('Visible')
    expect(formatActionValue('isActive', false, 'category')).toBe('Oculta')
  })

  it('usa Activo/Inactivo por defecto', () => {
    expect(formatActionValue('isActive', true, 'product')).toBe('Activo')
    expect(formatActionValue('isActive', false)).toBe('Inactivo')
  })

  it('formatea precio en cordobas', () => {
    expect(formatActionValue('price', 35)).toBe('C$ 35.00')
    expect(formatActionValue('price', null)).toBe('Sin definir')
  })

  it('cubre valores nulos y vacios', () => {
    expect(formatActionValue('otro', null)).toBe('Sin definir')
    expect(formatActionValue('otro', '')).toBe('Sin definir')
    expect(formatActionValue('otro', true)).toBe('Sí')
    expect(formatActionValue('otro', false)).toBe('No')
    expect(formatActionValue('otro', 42)).toBe('42')
  })

  it('formatea la imagen de la galeria', () => {
    expect(formatActionValue('imageMediaId', null)).toBe('Sin imagen')
    expect(formatActionValue('imageMediaId', 12)).toBe('Imagen #12')
  })

  it('traduce el tipo de aviso', () => {
    expect(formatActionValue('type', 'AVAILABLE')).toBe('Disponible')
    expect(formatActionValue('type', 'SOLD_OUT')).toBe('Agotado')
    expect(formatActionValue('type', 'PROMOTION')).toBe('Promoción')
    expect(formatActionValue('type', 'INFO')).toBe('Aviso')
  })

  it('formatea las fechas del aviso', () => {
    const startsAt = formatActionValue('startsAt', '2026-11-02T10:00:00.000Z')
    expect(startsAt).toContain('2026')
    expect(startsAt).not.toContain('T10:00')
    expect(formatActionValue('startsAt', null)).toBe('Sin fecha')
    expect(formatActionValue('endsAt', undefined)).toBe('Sin fecha')
    expect(formatActionValue('endsAt', 'no es fecha')).toBe('no es fecha')
  })

  it('recorta el mensaje largo del aviso', () => {
    expect(formatActionValue('content', 'Texto corto')).toBe('Texto corto')
    const long = 'x'.repeat(300)
    const preview = formatActionValue('content', long)
    expect(preview).toHaveLength(241)
    expect(preview.endsWith('…')).toBe(true)
  })
})

describe('describeActionChange', () => {
  it('devuelve label, from y to humanizados', () => {
    const result = describeActionChange(
      { field: 'isAvailable', from: true, to: false },
      'product',
    )
    expect(result).toEqual({
      field: 'isAvailable',
      label: 'Disponibilidad',
      from: 'Disponible',
      to: 'No disponible',
    })
  })

  it('devuelve null para entrada invalida', () => {
    expect(describeActionChange(null, 'product')).toBeNull()
    expect(describeActionChange('x', 'product')).toBeNull()
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-30T12:00:00Z').getTime()

  it('devuelve ahora para el presente', () => {
    expect(formatRelativeTime('2026-10-30T12:00:00Z', now)).toBe('ahora')
    expect(formatRelativeTime('2026-10-30T11:59:50Z', now)).toBe('ahora')
  })

  it('formatea minutos y horas', () => {
    expect(formatRelativeTime('2026-10-30T11:45:00Z', now)).toBe('hace 15 min')
    expect(formatRelativeTime('2026-10-30T10:00:00Z', now)).toBe('hace 2 h')
  })

  it('formatea ayer y dias', () => {
    expect(formatRelativeTime('2026-10-29T11:00:00Z', now)).toBe('ayer')
    expect(formatRelativeTime('2026-10-28T12:00:00Z', now)).toBe('hace 2 días')
  })

  it('formatea fechas antiguas', () => {
    expect(formatRelativeTime('2026-01-05T12:00:00Z', now)).toBe('05/01/2026')
  })

  it('devuelve vacio para entrada invalida', () => {
    expect(formatRelativeTime(null, now)).toBe('')
    expect(formatRelativeTime('no es fecha', now)).toBe('')
  })
})