import { createContext, useContext, useEffect, useState } from 'react'
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

  async function login(email, password) {
    const data = await authApi.login(email, password)
    setAccessToken(data.accessToken)
    setUser(data.user)
    return data.user
  }

  async function logout() {
    try {
      await authApi.logout()
    } finally {
      setAccessToken(null)
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: Boolean(user), isLoading, login, logout }}>
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