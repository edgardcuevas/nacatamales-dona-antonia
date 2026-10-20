import { useState } from 'react'
import { api, authApi } from '../../../api/client'
import { useAuth } from '../../../context/useAuth'
import { checkPassword, isStrongPassword } from '../../../utils/password'
import './AccountManager.css'

export default function AccountManager() {
  const { user, logout } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDone, setIsDone] = useState(false)

  const rules = checkPassword(newPassword)

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage(null)

    if (!isStrongPassword(newPassword)) {
      setErrorMessage('La contraseña nueva no cumple todas las reglas de la lista.')
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('La confirmación no coincide con la contraseña nueva.')
      return
    }

    if (newPassword === currentPassword) {
      setErrorMessage('La contraseña nueva debe ser distinta de la actual.')
      return
    }

    setIsSaving(true)

    try {
      // El servidor no pide la contraseña actual para cambiarla, así que se
      // comprueba aquí iniciando sesión con ella: evita que alguien con la
      // pantalla abierta (pero sin la contraseña) la cambie.
      await authApi.login(user.email, currentPassword)
    } catch (error) {
      setErrorMessage(
        error.status === 429
          ? 'Demasiados intentos. Espera unos minutos e intenta de nuevo.'
          : error.status === 401
            ? 'La contraseña actual no es correcta.'
            : 'No se pudo verificar la contraseña actual. Intenta de nuevo.'
      )
      setIsSaving(false)
      return
    }

    try {
      await api.patch(`/admin/users/${user.id}/password`, { password: newPassword })
      setIsDone(true)
    } catch (error) {
      setErrorMessage(
        error.code === 'INVALID_USER_PASSWORD'
          ? 'El servidor rechazó la contraseña nueva. Revisa las reglas de la lista.'
          : 'No se pudo cambiar la contraseña. Intenta de nuevo.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function handleReturnToLogin() {
    try {
      await logout()
    } catch {
      // El servidor ya cerró todas las sesiones al cambiar la contraseña:
      // que el cierre falle aquí no importa, el estado local se limpia igual.
    }
  }

  if (isDone) {
    return (
      <div className="account-manager" role="status">
        <p className="account-manager__success">
          Contraseña cambiada. Por seguridad se cerraron todas las sesiones abiertas, incluida esta.
        </p>
        <button type="button" className="btn btn--primary" onClick={handleReturnToLogin}>
          Iniciar sesión de nuevo
        </button>
      </div>
    )
  }

  return (
    <form className="account-manager" onSubmit={handleSubmit}>
      <p className="account-manager__email">
        Cuenta: <strong>{user.email}</strong>
      </p>

      <label className="admin-field">
        <span>Contraseña actual</span>
        <input
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </label>

      <label className="admin-field">
        <span>Contraseña nueva</span>
        <input
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          autoComplete="new-password"
          aria-describedby="account-password-rules"
          required
        />
      </label>

      <ul id="account-password-rules" className="account-manager__rules">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className={rule.ok ? 'account-manager__rule account-manager__rule--ok' : 'account-manager__rule'}
          >
            <span aria-hidden="true">{rule.ok ? '✓' : '•'}</span> {rule.label}
            <span className="visually-hidden">{rule.ok ? ' (cumplida)' : ' (pendiente)'}</span>
          </li>
        ))}
      </ul>

      <label className="admin-field">
        <span>Repite la contraseña nueva</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
      </label>

      <div role="alert">{errorMessage && <p className="admin-error">{errorMessage}</p>}</div>

      <button type="submit" className="btn btn--primary" disabled={isSaving}>
        {isSaving ? 'Cambiando…' : 'Cambiar contraseña'}
      </button>
    </form>
  )
}