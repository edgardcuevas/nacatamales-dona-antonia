import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi, setAccessToken, setSessionExpiredHandler } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    let isMounted = true

    authApi
      .refresh()
      .then((refreshedUser) => {
        if (isMounted) {
          setUser(refreshedUser)
        }
      })
      .catch(() => {
        // No hay una sesión previa válida; el usuario simplemente no está logueado.
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
    setUser(data.user)
    setSessionExpired(false)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setAccessToken(null)
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

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  }
  return context
}