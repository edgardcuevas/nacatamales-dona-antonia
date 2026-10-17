import { useState } from 'react'
import './ThumbnailImage.css'

// i.ytimg.com no siempre tiene maxresdefault.jpg. YouTube no la genera
// para un video que nunca llego a 720p, y una miniatura puesta por el
// administrador con thumbnails.set responde 404 hasta que la CDN la
// publica. hqdefault existe para todo video publico, asi que la imagen
// degrada una sola vez en lugar de quedar en el icono de imagen rota.
// Lookahead en vez de grupo: el `?cb=` del cache buster va justo despues
// del nombre de archivo, y un patron que lo consumiera se lo llevaria
// puesto al reemplazar.
const MAXRES_VARIANT = /maxresdefault\.jpg(?=\?|$)/i
const NEXT_VARIANT = 'hqdefault.jpg'

// Cuantos intentos quedan antes de rendirse. El tope son dos porque
// nunca hay un tercer origen al que caer: seguir probando solo repetiria
// peticiones contra URLs que ya respondieron 404.
const MAX_ATTEMPTS = 2

export default function ThumbnailImage({
  src,
  alt = '',
  className,
  placeholderClassName,
}) {
  const [attempts, setAttempts] = useState(0)

  // Se calcula siempre desde el origen, no desde el intento anterior, asi
  // que degradar no puede volver a pedir maxresdefault. Un URL que no es
  // de YouTube no tiene reemplazo y cae al placeholder de una sola vez.
  const degraded =
    typeof src === 'string' && MAXRES_VARIANT.test(src)
      ? src.replace(MAXRES_VARIANT, NEXT_VARIANT)
      : null

  const resolved =
    attempts === 0 ? src : attempts === 1 ? degraded : null

  if (!resolved) {
    return (
      <div
        className={
          placeholderClassName
            ? `thumbnail-image__placeholder ${placeholderClassName}`
            : 'thumbnail-image__placeholder'
        }
      />
    )
  }

  return (
    <img
      className={className}
      src={resolved}
      alt={alt}
      onError={() =>
        setAttempts((value) => Math.min(value + 1, MAX_ATTEMPTS))
      }
    />
  )
}