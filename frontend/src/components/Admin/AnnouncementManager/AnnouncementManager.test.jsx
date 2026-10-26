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

import AnnouncementManager from './AnnouncementManager'

const ANNOUNCEMENTS = [
  {
    id: 7,
    title: ' promotions '.trim(),
    content: 'Contenido',
    type: 'PROMOTION',
    isActive: true,
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    imageMediaId: null,
    image: null,
    notifiedAt: null,
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: null,
  },
]

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('AnnouncementManager', () => {
  it('elimina un anuncio y vuelve a cargar la lista', async () => {
    get.mockResolvedValue({ announcements: ANNOUNCEMENTS })
    del.mockResolvedValue({ announcementId: 7, deleted: true })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<AnnouncementManager />)
    await screen.findByText('promotions')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(del).toHaveBeenCalledTimes(1))
    expect(del).toHaveBeenCalledWith('/admin/announcements/7')
    expect(confirm).toHaveBeenCalled()
  })

  it('no borra nada si se cancela la confirmación', async () => {
    get.mockResolvedValue({ announcements: ANNOUNCEMENTS })
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<AnnouncementManager />)
    await screen.findByText('promotions')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(del).not.toHaveBeenCalled()
  })

  it('avisa cuando el anuncio no se pudo eliminar', async () => {
    get.mockResolvedValue({ announcements: ANNOUNCEMENTS })
    del.mockRejectedValue(new Error('No se pudo eliminar'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<AnnouncementManager />)
    await screen.findByText('promotions')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    expect(
      await screen.findByText('No se pudo eliminar el anuncio.'),
    ).toBeTruthy()
  })

  it('envía la notificación de un aviso publicado y recarga la lista', async () => {
    get.mockResolvedValue({ announcements: ANNOUNCEMENTS })
    post.mockResolvedValue({ sent: 1 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<AnnouncementManager />)
    await screen.findByText('promotions')

    fireEvent.click(screen.getByRole('button', { name: 'Notificar' }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/admin/announcements/7/notify'),
    )
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('muestra el estado de notificación y permite reenviar', async () => {
    get.mockResolvedValue({
      announcements: [
        {
          ...ANNOUNCEMENTS[0],
          notifiedAt: '2026-01-02T10:00:00.000Z',
        },
      ],
    })
    post.mockResolvedValue({ sent: 1 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<AnnouncementManager />)

    expect(await screen.findByText('Notificación enviada')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Reenviar aviso' }),
    )

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/admin/announcements/7/notify'),
    )
  })

  it('no ofrece notificar un aviso programado para el futuro', async () => {
    get.mockResolvedValue({
      announcements: [
        {
          ...ANNOUNCEMENTS[0],
          startsAt: '2099-01-01T00:00:00.000Z',
        },
      ],
    })

    render(<AnnouncementManager />)

    expect(await screen.findByText('Programado')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Notificar' })).toBeNull()
  })

  it('explica por qué no se puede notificar un aviso no visible', async () => {
    get.mockResolvedValue({ announcements: ANNOUNCEMENTS })
    post.mockRejectedValue(
      Object.assign(new Error('not visible'), {
        code: 'ANNOUNCEMENT_NOT_VISIBLE',
      }),
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<AnnouncementManager />)
    await screen.findByText('promotions')

    fireEvent.click(screen.getByRole('button', { name: 'Notificar' }))

    expect(
      await screen.findByText(/no está visible ahora mismo/),
    ).toBeTruthy()
  })
})
