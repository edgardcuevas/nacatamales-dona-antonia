import { describe, expect, it } from 'vitest'
import { mergeFeed } from './feed'
import { withCacheBuster } from './cacheBuster'

const CREATED_AT = '2026-10-16T15:01:57.000Z'
const UPDATED_AT = '2026-10-16T15:02:22.000Z'

function publicVideo(overrides = {}) {
  return {
    id: 7,
    title: 'pruebaaaaaa!!!!!!!!!',
    description: 'algo',
    url: 'https://www.youtube.com/watch?v=QFZSYdzDVKQ',
    provider: 'YOUTUBE',
    externalId: 'QFZSYdzDVKQ',
    thumbnailUrl: 'https://i.ytimg.com/vi/QFZSYdzDVKQ/maxresdefault.jpg',
    sortOrder: 0,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  }
}

describe('mergeFeed', () => {
  it('usa el thumbnailUrl que entrega el backend sin transformarlo', () => {
    const [item] = mergeFeed([publicVideo()], [])

    expect(item.thumbnailUrl).toBe('https://i.ytimg.com/vi/QFZSYdzDVKQ/maxresdefault.jpg')
    expect(item.externalId).toBe('QFZSYdzDVKQ')
  })

  it('toma updatedAt y no createdAt como senal de version', () => {
    const [item] = mergeFeed([publicVideo()], [])

    expect(item.thumbnailVersion).toBe(UPDATED_AT)
    expect(item.thumbnailVersion).not.toBe(item.createdAt)
  })

  it('produce un URL distinto cuando el admin reemplaza la miniatura', () => {
    const antes = mergeFeed([publicVideo({ updatedAt: CREATED_AT })], [])[0]
    const despues = mergeFeed([publicVideo({ updatedAt: UPDATED_AT })], [])[0]

    const urlAntes = withCacheBuster(antes.thumbnailUrl, antes.thumbnailVersion)
    const urlDespues = withCacheBuster(despues.thumbnailUrl, despues.thumbnailVersion)

    expect(urlAntes).not.toBe(urlDespues)
  })

  it('sigue funcionando con la miniatura estandar de YouTube', () => {
    const [item] = mergeFeed([
      publicVideo({
        thumbnailUrl: 'https://i.ytimg.com/vi/QFZSYdzDVKQ/hqdefault.jpg',
        updatedAt: CREATED_AT,
      }),
    ], [])

    expect(withCacheBuster(item.thumbnailUrl, item.thumbnailVersion)).toBe(
      `https://i.ytimg.com/vi/QFZSYdzDVKQ/hqdefault.jpg?cb=${Date.parse(CREATED_AT)}`,
    )
  })

  it('deja las fotos intactas', () => {
    const [item] = mergeFeed([], [
      { id: 1, caption: 'cocina', image: { url: 'https://ik.imagekit.io/abc/foto.jpg' } },
    ])

    expect(item.type).toBe('photo')
    expect(item.imageUrl).toBe('https://ik.imagekit.io/abc/foto.jpg')
    expect(item.thumbnailVersion).toBeUndefined()
  })
})