// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { api } from '../../../api/client'
import VideoManager from './VideoManager'

vi.mock('../../../api/client', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
    upload: vi.fn(),
  },
}))

vi.mock('../../../utils/mediaUpload', () => ({
  uploadVideoThumbnail: vi.fn(),
  revertVideoThumbnail: vi.fn(),
}))

vi.mock('./VideoThumbnailField', () => ({
  default: () => null,
}))

const VALID_AUTHORIZATION_URL =
  'https://accounts.google.com/o/oauth2/v2/auth?state=mock-state'

function getConnectCalls() {
  return api.get.mock.calls.filter(([path]) => path === '/admin/youtube/connect')
}

describe('VideoManager YouTube reconnection', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.get.mockResolvedValue({ videos: [] })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the reconnect button without requesting an authorization URL on mount', async () => {
    render(<VideoManager />)

    expect(screen.getByRole('button', { name: 'Reconectar YouTube' })).toBeTruthy()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(getConnectCalls()).toHaveLength(0)
  })

  it('makes exactly one authenticated-client GET on click and navigates the current tab', async () => {
    const navigate = vi.fn()
    api.get.mockImplementation((path) =>
      path === '/admin/youtube/connect'
        ? Promise.resolve({ authorizationUrl: VALID_AUTHORIZATION_URL })
        : Promise.resolve({ videos: [] })
    )
    render(<VideoManager navigate={navigate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reconectar YouTube' }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(VALID_AUTHORIZATION_URL))
    expect(getConnectCalls()).toHaveLength(1)
    expect(getConnectCalls()[0][0]).toBe('/admin/youtube/connect')
  })

  it('disables the button and prevents duplicate requests while pending', async () => {
    let resolveRequest
    api.get.mockImplementation((path) => {
      if (path === '/admin/youtube/connect') {
        return new Promise((resolve) => {
          resolveRequest = resolve
        })
      }
      return Promise.resolve({ videos: [] })
    })
    const navigate = vi.fn()
    render(<VideoManager navigate={navigate} />)
    const button = screen.getByRole('button', { name: 'Reconectar YouTube' })

    fireEvent.click(button)
    fireEvent.click(button)

    expect(button.disabled).toBe(true)
    expect(button.textContent).toBe('Conectando…')
    expect(getConnectCalls()).toHaveLength(1)

    resolveRequest({ authorizationUrl: VALID_AUTHORIZATION_URL })
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
  })

  it.each([
    ['missing authorizationUrl', {}],
    ['empty authorizationUrl', { authorizationUrl: ' ' }],
    ['non-HTTPS authorizationUrl', { authorizationUrl: 'http://accounts.google.com/oauth' }],
    ['different host', { authorizationUrl: 'https://accounts.google.com.evil.test/oauth' }],
    ['different port', { authorizationUrl: 'https://accounts.google.com:8443/oauth' }],
  ])('rejects %s without navigating', async (_label, response) => {
    const navigate = vi.fn()
    api.get.mockImplementation((path) =>
      path === '/admin/youtube/connect'
        ? Promise.resolve(response)
        : Promise.resolve({ videos: [] })
    )
    render(<VideoManager navigate={navigate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reconectar YouTube' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'No se pudo iniciar la reconexión de YouTube.'
    )
    expect(navigate).not.toHaveBeenCalled()
  })

  it('shows a sanitized API error and re-enables the button', async () => {
    const navigate = vi.fn()
    api.get.mockImplementation((path) =>
      path === '/admin/youtube/connect'
        ? Promise.reject(new Error('sensitive response detail'))
        : Promise.resolve({ videos: [] })
    )
    render(<VideoManager navigate={navigate} />)
    const button = screen.getByRole('button', { name: 'Reconectar YouTube' })

    fireEvent.click(button)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'No se pudo iniciar la reconexión de YouTube.'
    )
    expect(screen.queryByText('sensitive response detail')).toBeNull()
    expect(button.disabled).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})