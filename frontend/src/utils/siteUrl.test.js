import { describe, expect, it } from 'vitest'
import { normalizeSiteUrl } from './normalizeSiteUrl'
import { SITE_URL, absoluteUrl } from './siteUrl'

describe('normalizeSiteUrl', () => {
  it('quita espacios y todas las barras finales', () => {
    expect(normalizeSiteUrl(' https://sitio.test/// ')).toBe('https://sitio.test')
  })

  it('trata un valor ausente como cadena vacia', () => {
    expect(normalizeSiteUrl(null)).toBe('')
    expect(normalizeSiteUrl(undefined)).toBe('')
  })
})

describe('absoluteUrl', () => {
  it('antepone SITE_URL y acepta ruta con o sin barra inicial', () => {
    expect(absoluteUrl('menu')).toBe(`${SITE_URL}/menu`)
    expect(absoluteUrl('/menu')).toBe(`${SITE_URL}/menu`)
  })

  it('sin SITE_URL devuelve una ruta relativa utilizable', () => {
    expect(absoluteUrl('/menu').endsWith('/menu')).toBe(true)
  })
})
