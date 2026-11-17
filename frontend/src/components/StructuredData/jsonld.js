import { SITE_URL } from '../../utils/siteUrl'

// JSON-LD de negocio local para Google. Solo se emiten campos que existen en
// settings: inventar un openingHoursSpecification a partir de scheduleText
// (texto libre) seria peor que omitirlo, porque Google contrasta los datos
// estructurados con lo que la pagina realmente muestra.
// Vive fuera del componente para no romper react-refresh/only-export-components.
export function buildRestaurantJsonLd(settings, siteUrl = SITE_URL) {
  const sameAs = [settings.facebookUrl, settings.instagramUrl].filter(Boolean)
  const hasGeo =
    typeof settings.latitude === 'number' && typeof settings.longitude === 'number'
  const absolute = (path) => (siteUrl ? `${siteUrl}${path}` : undefined)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: settings.businessName,
    url: absolute('/'),
    image: absolute('/og-image.png'),
    // whatsappNumber se guarda solo con digitos y codigo de pais.
    telephone: settings.whatsappNumber ? `+${settings.whatsappNumber}` : undefined,
    address: settings.address
      ? { '@type': 'PostalAddress', streetAddress: settings.address }
      : undefined,
    geo: hasGeo
      ? {
          '@type': 'GeoCoordinates',
          latitude: settings.latitude,
          longitude: settings.longitude,
        }
      : undefined,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    hasMenu: absolute('/menu'),
  }

  // Las claves sin dato se quitan de verdad (no quedan como undefined) para
  // que el objeto sea el mismo que se publica en el script.
  return Object.fromEntries(
    Object.entries(jsonLd).filter(([, value]) => value !== undefined)
  )
}
