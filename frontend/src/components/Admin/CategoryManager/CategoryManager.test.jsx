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

import CategoryManager from './CategoryManager'

const CATEGORIES = [
  {
    id: 3,
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

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('CategoryManager', () => {
  it('elimina una categoría y vuelve a cargar la lista', async () => {
    get.mockResolvedValue({ categories: CATEGORIES })
    del.mockResolvedValue({ categoryId: 3, deleted: true })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<CategoryManager />)
    await screen.findByText('Nacatamales')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(del).toHaveBeenCalledTimes(1))
    expect(del).toHaveBeenCalledWith('/admin/categories/3')
    expect(confirm).toHaveBeenCalled()
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1))
  })

  it('no borra nada si se cancela la confirmación', async () => {
    get.mockResolvedValue({ categories: CATEGORIES })
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<CategoryManager />)
    await screen.findByText('Nacatamales')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(del).not.toHaveBeenCalled()
  })

  it('explica que la categoría todavía tiene productos', async () => {
    get.mockResolvedValue({ categories: CATEGORIES })
    const error = new Error(
      'This category still has 3 product(s); move or delete them first',
    )
    error.code = 'CATEGORY_HAS_PRODUCTS'
    del.mockRejectedValue(error)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<CategoryManager />)
    await screen.findByText('Nacatamales')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    expect(
      await screen.findByText(/todavía tiene 3 producto/),
    ).toBeTruthy()
  })
})
