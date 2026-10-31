// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const streamPost = vi.fn()

vi.mock('../../../api/client', () => ({
  api: {
    get: (...args) => get(...args),
    post: (...args) => post(...args),
    streamPost: (...args) => streamPost(...args),
    delete: vi.fn(),
  },
}))

vi.mock('../../../context/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'admin@example.com', role: 'ADMIN' },
    logout: vi.fn(),
  }),
}))

import AssistantDrawer from './AssistantDrawer'

const STATUS_ENABLED = {
  enabled: true,
  provider: 'gemini',
  model: 'gemini-test',
  capabilities: { supportsTools: true, supportsStreaming: true },
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('AssistantDrawer', () => {
  it('no muestra el boton si el asistente esta desactivado', async () => {
    get.mockResolvedValue({ enabled: false })
    render(<AssistantDrawer activeSection={null} />)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Abrir asistente' })).toBeNull()
    })
  })

  it('abre y cierra el panel con Escape', async () => {
    get.mockResolvedValue(STATUS_ENABLED)

    render(<AssistantDrawer activeSection={null} />)

    const fab = await screen.findByRole('button', { name: 'Abrir asistente' })
    fireEvent.click(fab)

    const dialog = await screen.findByRole('dialog', { name: 'Asistente' })
    expect(dialog).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Asistente' })).toBeNull()
    })
  })

  it('no se monta cuando la seccion asistente esta abierta', () => {
    get.mockResolvedValue(STATUS_ENABLED)
    const { container } = render(
      <AssistantDrawer activeSection="assistant" />,
    )
    expect(container.firstChild).toBeNull()
  })
})