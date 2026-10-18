import { useEffect } from 'react'
import { useSettings } from '../context/useSettings'

// Pone el título de la pestaña: "Menú · Nacatamales de Doña Antonia".
// Sin título de página, muestra solo el nombre del negocio.
export default function usePageTitle(title) {
  const { settings } = useSettings()
  const businessName = settings.businessName

  useEffect(() => {
    document.title = title ? `${title} · ${businessName}` : businessName
  }, [title, businessName])
}