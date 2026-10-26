// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const get = vi.fn()
const del = vi.fn()

vi.mock('../../../api/client', () => ({
  api: {
    get: (...args) => get(...args),
    delete: (...args) => del(...args),
  },
}))

import MediaLibrary from './MediaLibrary'

function mediaItem(id, url) {
  return {
    id,
    publicId: `public-${id}`,
    secureUrl: url,
    format: 'jpeg',
    bytes: 1000,
    width: 800,
    height: 600,
    altText: null,
    isActive: true,
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: null,
  }
}

function emptyPage(totalPages = 1) {
  return {
    page: 1,
    limit: 100,
    totalItems: 0,
    totalPages,
  }
}

function mockGallery({ mediaTotalPages = 1, products = [], photos = [] } = {}) {
  get.mockImplementation((path) => {
    if (path.startsWith('/admin/media')) {
      const page = Number(new URLSearchParams(path.split('?')[1]).get('page'))
      const items =
        page === 1
          ? [mediaItem(5, 'https://ik.imagekit.io/test/uno.jpg')]
          : [mediaItem(6, 'https://ik.imagekit.io/test/dos.jpg')]

      return Promise.resolve({
        media: items,
        pagination: { ...emptyPage(mediaTotalPages), page },
      })
    }

    if (path.startsWith('/admin/categories')) {
      return Promise.resolve({ categories: [], pagination: emptyPage() })
    }

    if (path.startsWith('/admin/products')) {
      return Promise.resolve({ products, pagination: emptyPage() })
    }

    if (path.startsWith('/admin/announcements')) {
      return Promise.resolve({ announcements: [], pagination: emptyPage() })
    }

    if (path.startsWith('/admin/photos')) {
      return Promise.resolve({ photos, pagination: emptyPage() })
    }

    return Promise.resolve({})
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('MediaLibrary', () => {
  it('marca una imagen sin uso y lista dónde se usa la que sí', async () => {
    mockGallery({
      products: [
        {
          id: 4,
          name: 'Tortilla de maíz',
          imageMediaId: 5,
          image: null,
        },
      ],
    })

    render(<MediaLibrary />)

    expect(await screen.findByText('Producto: Tortilla de maíz')).toBeTruthy()
    expect(screen.queryByText('Sin usar')).toBeNull()
  })

  it('carga la página siguiente de la galería sin duplicar', async () => {
    mockGallery({ mediaTotalPages: 2 })

    render(<MediaLibrary />)
    await screen.findByText('Sin usar')

    fireEvent.click(
      screen.getByRole('button', { name: /Ver más imágenes/ }),
    )

    await waitFor(() =>
      expect(
        get.mock.calls.some(
          (call) => call[0] === '/admin/media?limit=100&page=2',
        ),
      ).toBe(true),
    )
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))
  })

  it('no dice "Sin usar" cuando no pudo verificar el uso', async () => {
    mockGallery()
    get.mockImplementation((path) => {
      if (path.startsWith('/admin/products')) {
        return Promise.reject(new Error('falló'))
      }
      if (path.startsWith('/admin/media')) {
        return Promise.resolve({
          media: [mediaItem(5, 'https://ik.imagekit.io/test/uno.jpg')],
          pagination: emptyPage(),
        })
      }
      if (path.startsWith('/admin/categories')) {
        return Promise.resolve({ categories: [], pagination: emptyPage() })
      }
      if (path.startsWith('/admin/announcements')) {
        return Promise.resolve({ announcements: [], pagination: emptyPage() })
      }
      if (path.startsWith('/admin/photos')) {
        return Promise.resolve({ photos: [], pagination: emptyPage() })
      }
      return Promise.resolve({})
    })

    render(<MediaLibrary />)

    expect(await screen.findByText('Uso no verificado')).toBeTruthy()
    expect(screen.queryByText('Sin usar')).toBeNull()
  })

  it('borra una imagen que no está en uso', async () => {
    mockGallery()
    del.mockResolvedValue({ mediaId: 5, deleted: true })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<MediaLibrary />)
    await screen.findByText('Sin usar')

    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    await waitFor(() => expect(del).toHaveBeenCalledTimes(1))
    expect(del).toHaveBeenCalledWith('/admin/media/5')
  })
})
