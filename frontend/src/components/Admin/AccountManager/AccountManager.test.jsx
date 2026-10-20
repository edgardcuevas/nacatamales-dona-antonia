// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const login = vi.fn()
const patch = vi.fn()
const logout = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../api/client', () => ({
  api: { patch: (...args) => patch(...args) },
  authApi: { login: (...args) => login(...args) },
}))
vi.mock('../../../context/useAuth', () => ({
  useAuth: () => ({ user: { id: 7, email: 'dueno@example.com' }, logout }),
}))

import AccountManager from './AccountManager'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function fill(current, next, confirm = next) {
  fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: next } })
  fireEvent.change(screen.getByLabelText('Repite la contraseña nueva'), { target: { value: confirm } })
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
}

describe('AccountManager', () => {
  it('verifica la actual, cambia la nueva y ofrece volver al login', async () => {
    login.mockResolvedValue({})
    patch.mockResolvedValue({})
    render(<AccountManager />)

    fill('ClaveVieja#2025', 'ClaveNueva#2026')

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect(login).toHaveBeenCalledWith('dueno@example.com', 'ClaveVieja#2025')
    expect(patch).toHaveBeenCalledWith('/admin/users/7/password', { password: 'ClaveNueva#2026' })

    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar sesión de nuevo' }))
    await waitFor(() => expect(logout).toHaveBeenCalled())
  })

  it('no cambia nada si la contraseña actual es incorrecta', async () => {
    login.mockRejectedValue({ status: 401 })
    render(<AccountManager />)

    fill('mala', 'ClaveNueva#2026')

    expect(await screen.findByText('La contraseña actual no es correcta.')).toBeTruthy()
    expect(patch).not.toHaveBeenCalled()
  })

  it('no envía si la nueva es débil o la confirmación no coincide', async () => {
    render(<AccountManager />)

    fill('ClaveVieja#2025', 'debil')
    expect(await screen.findByText(/no cumple todas las reglas/)).toBeTruthy()

    fill('ClaveVieja#2025', 'ClaveNueva#2026', 'ClaveOtra#2026')
    expect(await screen.findByText(/no coincide/)).toBeTruthy()

    expect(login).not.toHaveBeenCalled()
    expect(patch).not.toHaveBeenCalled()
  })
})