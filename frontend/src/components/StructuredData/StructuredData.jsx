import { useSettings } from '../../context/useSettings'
import { buildRestaurantJsonLd } from './jsonld'

export default function StructuredData() {
  const { settings } = useSettings()
  // El "<" se escapa para que un nombre con "</script>" no cierre la etiqueta.
  const json = JSON.stringify(buildRestaurantJsonLd(settings)).replace(/</g, '\\u003c')

  return (
    <script
      type="application/ld+json"
      id="site-jsonld"
      // React lo monta y lo desmonta con el Layout, asi que no puede
      // duplicarse al navegar entre paginas.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}
