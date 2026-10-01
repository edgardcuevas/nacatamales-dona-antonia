import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi, setAccessToken } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

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

  // Stable so the provider value does not change identity when this
  // component re-renders for any other reason.
  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password)
    setAccessToken(data.accessToken)
    setUser(data.user)
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
      login,
      logout,
    }),
    [user, isLoading, login, logout]
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