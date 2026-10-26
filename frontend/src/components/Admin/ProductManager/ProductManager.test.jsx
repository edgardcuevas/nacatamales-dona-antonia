// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
const del = vi.fn()

vi.mock('../../../api/client', () => ({
  api: {
    get: (...args) => get(...args),
    post: (...args) => post(...args),
    patch: (...args) => patch(...args),
    delete: (...args) => del(...args),
  },
}))

import ProductManager from './ProductManager'

const CATEGORIES = [
  {
    id: 1,
    name: 'Nacatamales',
    slug: 'nacatamales',
    description: null,
    sortOrder: 0,
    imageMediaId: null,
    image: null,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
]

const PRODUCTS = [
  {
    id: 4,
    categoryId: 1,
    name: 'Tortilla de maíz',
    slug: 'tortilla-de-maiz',
    description: null,
    price: '10.00',
    isAvailable: true,
    isActive: true,
    sortOrder: 0,
    imageMediaId: null,
    image: null,
    category: { id: 1, name: 'Nacatamales', slug: 'nacatamales' },
    createdAt: null,
    updatedAt: null,
  },
]

function mockLists() {
  get.mockImplementation((path) => {
    if (path.startsWith('/admin/categories')) {
      return Promise.resolve({ categories: CATEGORIES })
    }
    if (path.startsWith('/admin/products')) {
      return Promise.resolve({ products: PRODUCTS })
    }
    return Promise.resolve({})
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('ProductManager', () => {
  it('elimina un producto y vuelve a cargar la lista', async () => {
    mockLists()
    del.mockResolvedValue({ productId: 4, deleted: true })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<ProductManager />)
    await screen.findByText('Tortilla de maíz')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(del).toHaveBeenCalledTimes(1))
    expect(del).toHaveBeenCalledWith('/admin/products/4')
    expect(confirm).toHaveBeenCalled()
  })

  it('no borra nada si se cancela la confirmación', async () => {
    mockLists()
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<ProductManager />)
    await screen.findByText('Tortilla de maíz')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(del).not.toHaveBeenCalled()
  })

  it('avisa cuando el producto no se pudo eliminar', async () => {
    mockLists()
    del.mockRejectedValue(new Error('No se pudo eliminar'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<ProductManager />)
    await screen.findByText('Tortilla de maíz')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    expect(
      await screen.findByText('No se pudo eliminar el producto.'),
    ).toBeTruthy()
  })
})
