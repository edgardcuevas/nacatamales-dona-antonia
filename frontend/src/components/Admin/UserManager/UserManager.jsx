import { useEffect, useState } from 'react'
import { api, authApi } from '../../../api/client'
import { useAuth } from '../../../context/useAuth'
import { checkPassword, isStrongPassword } from '../../../utils/password'
import './UserManager.css'

const EMPTY_FORM = {
  email: '',
  password: '',
  role: 'EDITOR',
  currentPassword: '',
}

export default function UserManager() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)

  const passwordRules = checkPassword(form.password)

  function fetchUsers() {
    return api
      .get('/admin/users?limit=100')
      .then((data) => {
        setUsers(data.users || [])
        setIsLoading(false)
      })
      .catch(() => setErrorMessage('No se pudieron cargar los usuarios.'))
  }

  function loadUsers() {
    setIsLoading(true)
    fetchUsers()
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  function resetForm() {
    setForm(EMPTY_FORM)
    setErrorMessage(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage(null)
    setIsSaving(true)

    try {
      // 1. Verificar identidad del admin actual con su contraseña
      await authApi.login(currentUser.email, form.currentPassword)
    } catch (error) {
      setErrorMessage(
        error.status === 429
          ? 'Demasiados intentos. Espera unos minutos e intenta de nuevo.'
          : error.status === 401
            ? 'La contraseña actual es incorrecta.'
            : 'No se pudo verificar la contraseña actual. Intenta de nuevo.'
      )
      setIsSaving(false)
      return
    }

    // 2. Validar contraseña del nuevo usuario (client-side)
    if (!isStrongPassword(form.password)) {
      setErrorMessage('La contraseña nueva no cumple todas las reglas de la lista.')
      setIsSaving(false)
      return
    }

    try {
      const payload = {
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      }

      await api.post('/admin/users', payload)

      resetForm()
      loadUsers()
    } catch (error) {
      if (error.code === 'USER_EMAIL_ALREADY_EXISTS') {
        setErrorMessage('El email ya está registrado.')
      } else if (error.code === 'INVALID_USER_PASSWORD') {
        setErrorMessage('El servidor rechazó la contraseña. Revisa las reglas de la lista.')
      } else if (error.code === 'INVALID_USER_ROLE') {
        setErrorMessage('Rol inválido. Los roles permitidos son: ADMIN, EDITOR.')
      } else if (error.code === 'INVALID_USER_EMAIL') {
        setErrorMessage('El email no es válido.')
      } else {
        setErrorMessage('No se pudo guardar el usuario.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleStatus(user) {
    try {
      await api.patch(`/admin/users/${user.id}/status`, {
        isActive: !user.isActive,
      })
      loadUsers()
    } catch {
      setErrorMessage('No se pudo cambiar el estado del usuario.')
    }
  }

  return (
    <div className="user-manager">
      <form className="user-manager__form" onSubmit={handleSubmit}>
        <h3>Nuevo usuario</h3>

        <label className="admin-field">
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, email: event.target.value }))
            }
            required
          />
        </label>

        <label className="admin-field">
          <span>Contraseña del nuevo usuario</span>
          <input
            type="password"
            value={form.password}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, password: event.target.value }))
            }
            autoComplete="new-password"
            required
          />
        </label>

        <ul className="user-manager__rules">
          {passwordRules.map((rule) => (
            <li
              key={rule.id}
              className={rule.ok ? 'user-manager__rule user-manager__rule--ok' : 'user-manager__rule'}
            >
              <span aria-hidden="true">{rule.ok ? '✓' : '•'}</span> {rule.label}
            </li>
          ))}
        </ul>

        <label className="admin-field">
          <span>Rol</span>
          <select
            value={form.role}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, role: event.target.value }))
            }
            required
          >
            <option value="ADMIN">ADMIN</option>
            <option value="EDITOR">EDITOR</option>
          </select>
        </label>

        <div className="user-manager__divider" />

        <label className="admin-field">
          <span>Tu contraseña actual (validación)</span>
          <input
            type="password"
            value={form.currentPassword}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, currentPassword: event.target.value }))
            }
            autoComplete="current-password"
            required
            placeholder="Requerida para crear o editar usuarios"
          />
        </label>

        {errorMessage && <p className="admin-error" role="alert">{errorMessage}</p>}

        <div className="user-manager__form-actions">
          <button type="submit" className="btn btn--primary" disabled={isSaving}>
            {isSaving ? 'Guardando…' : 'Crear usuario'}
          </button>
        </div>
      </form>

      <div className="user-manager__list">
        {isLoading && <p className="admin-loading-inline">Cargando usuarios…</p>}

        {!isLoading && users.length === 0 && (
          <p className="admin-empty-inline">Aún no hay usuarios.</p>
        )}

        {users.map((user) => (
          <div className="user-row" key={user.id}>
            <div className="user-row__body">
              <strong>{user.email}</strong>
              <span>Rol: {user.role}</span>
            </div>
            <span className={user.isActive ? 'status-pill status-pill--active' : 'status-pill'}>
              {user.isActive ? 'Activo' : 'Inactivo'}
            </span>
            <div className="user-row__actions">
              <button
                type="button"
                className="btn-link"
                onClick={() => toggleStatus(user)}
              >
                {user.isActive ? 'Desactivar' : 'Activar'}
              </button>
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  const newPassword = window.prompt(
                    `Nueva contraseña para ${user.email} (mínimo 12 caracteres, mayús/minús, nums, especiales):`
                  )
                  if (!newPassword) return
                  if (!isStrongPassword(newPassword)) {
                    setErrorMessage('La contraseña no cumple las reglas de seguridad.')
                    return
                  }
                  if (!form.currentPassword) {
                    setErrorMessage('Ingresa tu contraseña actual en el formulario para confirmar.')
                    return
                  }
                  setErrorMessage(null)
                  setIsSaving(true)
                  authApi.login(currentUser.email, form.currentPassword)
                    .then(() => api.patch(`/admin/users/${user.id}/password`, { password: newPassword }))
                    .then(() => {
                      setErrorMessage(null)
                      alert('Contraseña actualizada correctamente.')
                    })
                    .catch((error) => {
                      if (error.status === 401) {
                        setErrorMessage('La contraseña actual es incorrecta.')
                      } else if (error.code === 'INVALID_USER_PASSWORD') {
                        setErrorMessage('El servidor rechazó la contraseña.')
                      } else {
                        setErrorMessage('No se pudo actualizar la contraseña.')
                      }
                    })
                    .finally(() => setIsSaving(false))
                }}
                disabled={isSaving}
              >
                Resetear contraseña
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}