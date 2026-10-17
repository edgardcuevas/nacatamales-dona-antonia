import { describe, expect, it } from 'vitest'
import { withCacheBuster } from './cacheBuster'

const YOUTUBE_THUMBNAIL = 'https://i.ytimg.com/vi/QFZSYdzDVKQ/maxresdefault.jpg'
const CREATED_AT = '2026-10-16T15:01:57.000Z'
const UPDATED_AT = '2026-10-16T15:02:22.000Z'

describe('withCacheBuster', () => {
  it('nunca usa el parametro v, que i.ytimg.com reserva y responde 404', () => {
    const busted = withCacheBuster(YOUTUBE_THUMBNAIL, UPDATED_AT)

    // El nombre del parametro es parte del contrato con el proveedor:
    // `v` con un numero grande hace que el CDN conteste 404 y la
    // miniatura publica desaparezca.
    expect(busted).not.toContain('?v=')
    expect(busted).not.toContain('&v=')
    expect(new URL(busted).searchParams.get('v')).toBeNull()
  })

  it('conserva el path que el administrador ya recibe del backend', () => {
    expect(withCacheBuster(YOUTUBE_THUMBNAIL, UPDATED_AT)).toMatch(
      /^https:\/\/i\.ytimg\.com\/vi\/QFZSYdzDVKQ\/maxresdefault\.jpg\?/,
    )
  })

  it('marca el URL con la version recibida', () => {
    expect(withCacheBuster(YOUTUBE_THUMBNAIL, UPDATED_AT)).toBe(
      `${YOUTUBE_THUMBNAIL}?cb=${Date.parse(UPDATED_AT)}`,
    )
  })

  it('cambia el URL cuando cambia la version y no cuando no', () => {
    const antes = withCacheBuster(YOUTUBE_THUMBNAIL, CREATED_AT)
    const despues = withCacheBuster(YOUTUBE_THUMBNAIL, UPDATED_AT)
    const repetido = withCacheBuster(YOUTUBE_THUMBNAIL, UPDATED_AT)

    expect(antes).not.toBe(despues)
    expect(despues).toBe(repetido)
  })

  it('agrega el parametro a un URL que ya tiene query', () => {
    expect(withCacheBuster('https://ik.imagekit.io/abc/foto.jpg?w=400', UPDATED_AT)).toBe(
      `https://ik.imagekit.io/abc/foto.jpg?w=400&cb=${Date.parse(UPDATED_AT)}`,
    )
  })

  it('devuelve el URL intacto cuando no hay una version utilizable', () => {
    expect(withCacheBuster(YOUTUBE_THUMBNAIL, null)).toBe(YOUTUBE_THUMBNAIL)
    expect(withCacheBuster(YOUTUBE_THUMBNAIL, undefined)).toBe(YOUTUBE_THUMBNAIL)
    expect(withCacheBuster(YOUTUBE_THUMBNAIL, '')).toBe(YOUTUBE_THUMBNAIL)
    expect(withCacheBuster(YOUTUBE_THUMBNAIL, 'no es una fecha')).toBe(YOUTUBE_THUMBNAIL)
    expect(withCacheBuster('', UPDATED_AT)).toBe('')
    expect(withCacheBuster(null, UPDATED_AT)).toBeNull()
  })
})