// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const refresh = vi.fn()

vi.mock('../api/client', () => ({
  authApi: { refresh: (...args) => refresh(...args), login: vi.fn(), logout: vi.fn() },
  setAccessToken: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}))

import { AuthProvider } from './AuthContext'
import { useAuth } from './useAuth'

function Probe() {
  const { isLoading, isAuthenticated } = useAuth()
  return <p>{isLoading ? 'cargando' : isAuthenticated ? 'dentro' : 'fuera'}</p>
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AuthProvider', () => {
  it('un visitante anónimo no consulta al servidor y no espera', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )

    expect(screen.getByText('fuera')).toBeTruthy()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('si hubo sesión, la recupera con el refresh', async () => {
    window.localStorage.setItem('nacatamales:admin-session', '1')
    refresh.mockResolvedValue({ id: 1, email: 'dueno@example.com' })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )

    expect(screen.getByText('cargando')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('dentro')).toBeTruthy())
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('si el servidor rechaza la sesión, borra la marca', async () => {
    window.localStorage.setItem('nacatamales:admin-session', '1')
    refresh.mockRejectedValue(Object.assign(new Error('no'), { status: 401 }))

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByText('fuera')).toBeTruthy())
    expect(window.localStorage.getItem('nacatamales:admin-session')).toBeNull()
  })

  it('un corte de red conserva la marca para reintentar', async () => {
    window.localStorage.setItem('nacatamales:admin-session', '1')
    refresh.mockRejectedValue(Object.assign(new Error('red'), { status: 503 }))

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByText('fuera')).toBeTruthy())
    expect(window.localStorage.getItem('nacatamales:admin-session')).toBe('1')
  })
})