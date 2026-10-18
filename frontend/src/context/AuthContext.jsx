import { useCallback, useEffect, useMemo, useState } from 'react'
import { authApi, setAccessToken, setSessionExpiredHandler } from '../api/client'
import { clearSessionHint, hasSessionHint, setSessionHint } from '../utils/sessionHint'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // Solo se espera al servidor si este navegador tuvo una sesión. Un
  // visitante anónimo no consulta nada y la pantalla de login es inmediata.
  const [isLoading, setIsLoading] = useState(() => hasSessionHint())
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    if (!hasSessionHint()) {
      return undefined
    }

    let isMounted = true

    authApi
      .refresh()
      .then((refreshedUser) => {
        if (isMounted) {
          setUser(refreshedUser)
        }
      })
      .catch((error) => {
        // Solo un rechazo de autenticación significa que la sesión terminó.
        // Un corte de red o un 5xx no: la marca se conserva para reintentar.
        if (error.status === 401 || error.status === 403) {
          clearSessionHint()
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  // El cliente avisa cuando el refresh es rechazado a mitad de sesión:
  // se limpia el usuario y la pantalla vuelve al login.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setAccessToken(null)
      clearSessionHint()
      setUser(null)
      setSessionExpired(true)
    })

    return () => {
      setSessionExpiredHandler(null)
    }
  }, [])

  // Stable so the provider value does not change identity when this
  // component re-renders for any other reason.
  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password)
    setAccessToken(data.accessToken)
    setSessionHint()
    setUser(data.user)
    setSessionExpired(false)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setAccessToken(null)
      clearSessionHint()
      setUser(null)
    }
  }, [])

  // This provider sits above <Routes>, so an unmemoized value would
  // re-render the entire page tree on every auth state change.
  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      sessionExpired,
      login,
      logout,
    }),
    [user, isLoading, sessionExpired, login, logout]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}