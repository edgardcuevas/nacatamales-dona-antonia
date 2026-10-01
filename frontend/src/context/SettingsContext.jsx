import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api, withSettingsFallback } from '../api/client'

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(withSettingsFallback(null))
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    api
      .get('/settings')
      .then((data) => {
        if (isMounted) {
          setSettings(withSettingsFallback(data.settings))
        }
      })
      .catch(() => {
        // Si falla, seguimos con los valores por defecto ya cargados.
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  // An inline value object would hand every consumer a new reference on
  // each provider render and re-render all six of them for nothing.
  const value = useMemo(
    () => ({ settings, isLoading }),
    [settings, isLoading]
  )

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings debe usarse dentro de <SettingsProvider>')
  }
  return context
}