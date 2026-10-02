import { useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import './LoginForm.css'

export default function LoginForm() {
  const { login, sessionExpired } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    try {
      await login(email, password)
    } catch (error) {
      if (error.status === 401) {
        setErrorMessage('Correo o contraseña incorrectos.')
      } else if (error.code === 'INVALID_EMAIL' || error.code === 'INVALID_PASSWORD') {
        setErrorMessage('Ingresá tu correo y contraseña.')
      }
            if (error.status === 401) {
        setErrorMessage('Correo o contraseña incorrectos.')
      } else if (error.code === 'INVALID_EMAIL' || error.code === 'INVALID_PASSWORD') {
        setErrorMessage('Ingresá tu correo y contraseña.')
      } else if (error.status === 429) {
        setErrorMessage('Demasiados intentos. Espera unos minutos e intenta de nuevo.')
      } else {
        setErrorMessage('No se pudo iniciar sesión. Intenta de nuevo.')
      } 
      } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="admin-login">
      <form className="admin-login__card" onSubmit={handleSubmit}>
        <h1>Administración</h1>
        <p>Iniciá sesión para editar el contenido del sitio.</p>

        <label className="admin-login__field">
          <span>Correo</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="admin-login__field">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

                {sessionExpired && !errorMessage && (
          <p className="admin-login__error">Tu sesión expiró. Inicia sesión de nuevo.</p>
        )}

        {errorMessage && <p className="admin-login__error">{errorMessage}</p>}

        <button type="submit" className="btn btn--primary admin-login__submit" disabled={isSubmitting}>
          {isSubmitting ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}