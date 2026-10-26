// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const get = vi.fn()
const post = vi.fn()

vi.mock('../../../api/client', () => ({
  api: {
    get: (...args) => get(...args),
    post: (...args) => post(...args),
    delete: vi.fn(),
  },
}))

vi.mock('../../../context/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'admin@example.com', role: 'ADMIN' },
    logout: vi.fn(),
  }),
}))

import AssistantChat from './AssistantChat'

const STATUS_ENABLED = {
  enabled: true,
  provider: 'gemini',
  model: 'gemini-test',
  capabilities: { supportsTools: false, supportsStreaming: false },
}

const EMPTY_CONVERSATIONS = { conversations: [] }

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('AssistantChat', () => {
  it('muestra el estado desactivado sin llamar a conversaciones', async () => {
    get.mockResolvedValueOnce({ enabled: false })

    render(<AssistantChat />)

    expect(
      await screen.findByText('Asistente desactivado'),
    ).toBeTruthy()
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('envía un mensaje y muestra la respuesta', async () => {
    get.mockResolvedValueOnce(STATUS_ENABLED)
    get.mockResolvedValueOnce(EMPTY_CONVERSATIONS)
    post.mockResolvedValue({
      conversation: { id: 9, title: 'Hola' },
      userMessage: { role: 'user', content: 'Hola' },
      reply: { role: 'assistant', content: 'Respuesta' },
      prunedConversationId: null,
    })

    render(<AssistantChat />)
    await screen.findByText('Asistente')

    const input = screen.getByLabelText('Mensaje')
    fireEvent.change(input, { target: { value: 'Hola' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith(
      '/admin/assistant/messages',
      { message: 'Hola' },
    )
    expect(await screen.findByText('Respuesta')).toBeTruthy()
    expect(screen.getByText('Vos')).toBeTruthy()
  })

  it('bloquea el doble envío en el mismo tick', async () => {
    get.mockResolvedValueOnce(STATUS_ENABLED)
    get.mockResolvedValueOnce(EMPTY_CONVERSATIONS)
    let resolvePost
    post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve
        }),
    )

    render(<AssistantChat />)
    await screen.findByText('Asistente')

    const input = screen.getByLabelText('Mensaje')
    fireEvent.change(input, { target: { value: 'Hola' } })

    const button = screen.getByRole('button', { name: 'Enviar' })
    fireEvent.click(button)
    fireEvent.click(button)

    expect(post).toHaveBeenCalledTimes(1)

    resolvePost({
      conversation: { id: 9, title: 'Hola' },
      userMessage: { role: 'user', content: 'Hola' },
      reply: { role: 'assistant', content: 'Respuesta' },
      prunedConversationId: null,
    })

    await waitFor(() => expect(screen.getByText('Respuesta')).toBeTruthy())
  })

  it('muestra un error cuando el proveedor falla', async () => {
    get.mockResolvedValueOnce(STATUS_ENABLED)
    get.mockResolvedValueOnce(EMPTY_CONVERSATIONS)
    const error = new Error('boom')
    error.code = 'ASSISTANT_PROVIDER_ERROR'
    post.mockRejectedValue(error)

    render(<AssistantChat />)
    await screen.findByText('Asistente')

    fireEvent.change(screen.getByLabelText('Mensaje'), {
      target: { value: 'Hola' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    expect(
      await screen.findByText(
        'No se pudo generar una respuesta. Intentá de nuevo.',
      ),
    ).toBeTruthy()
  })

  it('avisa cuando la conversación se podó', async () => {
    get.mockResolvedValueOnce(STATUS_ENABLED)
    get.mockResolvedValueOnce(EMPTY_CONVERSATIONS)
    post.mockResolvedValue({
      conversation: { id: 9, title: 'Hola' },
      userMessage: { role: 'user', content: 'Hola' },
      reply: { role: 'assistant', content: 'Respuesta' },
      prunedConversationId: 3,
    })

    render(<AssistantChat />)
    await screen.findByText('Asistente')

    fireEvent.change(screen.getByLabelText('Mensaje'), {
      target: { value: 'Hola' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    expect(
      await screen.findByText(/Se eliminó la conversación más antigua/),
    ).toBeTruthy()
  })

  it('carga el historial al elegir una conversación', async () => {
    get.mockResolvedValueOnce(STATUS_ENABLED)
    get.mockResolvedValueOnce({
      conversations: [
        { id: 5, title: 'Anterior', createdAt: null, updatedAt: null },
      ],
    })
    get.mockResolvedValueOnce({
      messages: [
        { id: 1, role: 'user', content: 'Pregunta vieja' },
        { id: 2, role: 'assistant', content: 'Respuesta vieja' },
      ],
    })

    render(<AssistantChat />)
    await screen.findByText('Anterior')

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        '/admin/assistant/conversations/5/messages?limit=50',
      ),
    )
    expect(await screen.findByText('Pregunta vieja')).toBeTruthy()
    expect(screen.getByText('Respuesta vieja')).toBeTruthy()
  })

  it('muestra las sugerencias y las inserta al hacer clic', async () => {
    get.mockResolvedValueOnce(STATUS_ENABLED)
    get.mockResolvedValueOnce(EMPTY_CONVERSATIONS)

    render(<AssistantChat />)
    await screen.findByText('Asistente')

    const suggestion = screen.getByRole('button', {
      name: '¿Cómo agrego un producto?',
    })
    fireEvent.click(suggestion)

    expect(screen.getByLabelText('Mensaje').value).toBe(
      '¿Cómo agrego un producto?',
    )
  })

  it('expone la lista de mensajes como log accesible', async () => {
    get.mockResolvedValueOnce(STATUS_ENABLED)
    get.mockResolvedValueOnce(EMPTY_CONVERSATIONS)

    render(<AssistantChat />)

    const log = await screen.findByRole('log')
    expect(log.getAttribute('aria-live')).toBe('polite')
  })
})
