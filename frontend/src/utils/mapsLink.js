// Saca las coordenadas de lo que el dueño pegue desde Google Maps, para que
// no tenga que entender de latitud y longitud.
//
// Formatos que se reconocen:
//   - URL de un lugar:  .../maps/place/Nombre/@12.1364,-86.2514,17z/data=!3d12.1365!4d-86.2515
//   - URL con ?q= / ll= / query=  (12.1364,-86.2514)
//   - Coordenadas sueltas, como las que Google copia al hacer clic derecho
//     sobre el mapa:  12.1364, -86.2514

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)'

const PATTERNS = [
  // Pin exacto del lugar. Va primero: "@" es el centro de la vista, que casi
  // siempre coincide pero no es garantía.
  new RegExp(`!3d${NUM}!4d${NUM}`),
  new RegExp(`@${NUM},${NUM}`),
  new RegExp(`[?&](?:q|ll|query|center|destination)=${NUM}(?:,|%2C)\\s*${NUM}`, 'i'),
  new RegExp(`^\\s*${NUM}\\s*[,;\\s]\\s*${NUM}\\s*$`),
]

function inRange(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}

export function extractCoordinates(text) {
  if (typeof text !== 'string') {
    return null
  }

  for (const pattern of PATTERNS) {
    const match = pattern.exec(text.trim())
    if (!match) {
      continue
    }
    const latitude = Number(match[1])
    const longitude = Number(match[2])
    if (inRange(latitude, longitude)) {
      return {
        latitude: Math.round(latitude * 1e6) / 1e6,
        longitude: Math.round(longitude * 1e6) / 1e6,
      }
    }
  }

  return null
}

// Los enlaces cortos (maps.app.goo.gl/...) no llevan coordenadas a la vista
// y el navegador no puede resolverlos desde la página: hay que avisar.
export function isShortMapsLink(text) {
  return /maps\.app\.goo\.gl|goo\.gl\/maps/i.test(String(text ?? ''))
}

export function mapsSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export function mapsEmbedUrl(latitude, longitude) {
  return `https://www.google.com/maps?q=${latitude},${longitude}&output=embed`
}