import { createContext, useContext, useEffect, useState } from 'react'
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

  return (
    <SettingsContext.Provider value={{ settings, isLoading }}>
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