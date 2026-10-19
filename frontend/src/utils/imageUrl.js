// Imágenes públicas a la medida de la pantalla.
//
// Las fotos se suben una vez, a tamaño original (pueden ser de varios MB), y
// el sitio las mostraba tal cual aunque la tarjeta midiera 170 px. ImageKit
// redimensiona y recomprime al vuelo con el parámetro `tr`:
//   w-640   ancho en píxeles (la altura se ajusta sola)
//   q-80    calidad
//   f-auto  WebP/AVIF cuando el navegador lo soporta
//
// Solo se tocan URLs de ImageKit. Cualquier otra (o una que ya traiga su
// propia transformación) se devuelve igual, así nada se rompe.
const IMAGEKIT_URL = /^https:\/\/ik\.imagekit\.io\//i

function isOptimizable(url) {
  return typeof url === 'string' && IMAGEKIT_URL.test(url) && !/[?&]tr=/.test(url)
}

export function optimizeImage(url, width) {
  if (!isOptimizable(url) || !Number.isFinite(width) || width <= 0) {
    return url
  }

  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}tr=w-${Math.round(width)},q-80,f-auto`
}

// Lista para el atributo srcSet: "…?tr=w-400… 400w, …?tr=w-800… 800w".
// Devuelve undefined si la URL no es de ImageKit, y React omite el atributo.
export function imageSrcSet(url, widths) {
  if (!isOptimizable(url)) {
    return undefined
  }

  return widths.map((width) => `${optimizeImage(url, width)} ${width}w`).join(', ')
}