// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const get = vi.fn()
const post = vi.fn()
const streamPost = vi.fn()

vi.mock('../../../api/client', () => ({
  api: {
    get: (...a) => get(...a),
    post: (...a) => post(...a),
    streamPost: (...a) => streamPost(...a),
  },
}))
vi.mock('../../../context/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, email: 'a@b.c', role: 'ADMIN' } }),
}))

import AssistantChat from './AssistantChat'

const STATUS = {
  enabled: true,
  capabilities: { supportsStreaming: true },
}
const PENDING = {
  token: 't1',
  summary: 'Marcar como agotado',
  target: { type: 'product', id: 1, label: 'Nacatamal' },
  changes: [],
  warnings: [],
  expiresAt: new Date(Date.now() + 60000).toISOString(),
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AssistantChat confirmaciones y 429', () => {
  it('muestra la tarjeta si pendingAction viene dentro de reply', async () => {
    get.mockImplementation((path) =>
      Promise.resolve(path.includes('status') ? STATUS : { conversations: [] }),
    )
    streamPost.mockResolvedValue({
      conversation: { id: 1, title: 'x' },
      reply: { role: 'assistant', content: 'Listo', pendingAction: PENDING },
    })
    render(<AssistantChat />)
    fireEvent.change(await screen.findByLabelText('Mensaje'), {
      target: { value: 'hola' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText('Confirmación pendiente')).toBeTruthy()
  })

  it('no usa initialStatus para repetir la petición de estado', async () => {
    get.mockResolvedValue({ conversations: [] })
    render(<AssistantChat variant="drawer" initialStatus={STATUS} />)
    await screen.findByLabelText('Mensaje')
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/admin/assistant/conversations?limit=20')
  })

  it('un 429 al cargar no dice "hiciste demasiadas consultas"', async () => {
    const error = Object.assign(new Error('x'), {
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 30,
    })
    get.mockRejectedValue(error)
    render(<AssistantChat />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/30 s/)
    expect(alert.textContent).not.toMatch(/Hiciste/)
  })
})
