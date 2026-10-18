import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, withSettingsFallback } from '../api/client'
import { SettingsContext } from './settings-context'

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

  // Lo usa el panel de administración después de guardar: la caché del
  // cliente ya se vació con la mutación, así que esto trae lo recién
  // publicado y todo el sitio se actualiza sin recargar la página.
  const refreshSettings = useCallback(async () => {
    const data = await api.get('/settings')
    setSettings(withSettingsFallback(data.settings))
  }, [])

  // An inline value object would hand every consumer a new reference on
  // each provider render and re-render all six of them for nothing.
  const value = useMemo(
    () => ({ settings, isLoading, refreshSettings }),
    [settings, isLoading, refreshSettings]
  )

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}