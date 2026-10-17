import { useEffect, useRef, useState } from 'react'

/**
 * Revela un elemento cuando entra en pantalla, una sola vez.
 *
 * Por que IntersectionObserver y no un listener de scroll: un listener
 * obliga a recalcular posiciones en cada scroll de cada elemento, y con
 * las listas de productos y el feed eso son decenas de medidas por
 * frame. El observer entrega el trabajo al navegador y solo avisa de los
 * cruces.
 *
 * `once` es importante: sin el, el elemento volveria a ocultarse al
 * subir y el efecto seria un parpadeo que solo molesta. Una vez
 * revelado, se olvida del elemento (`unobserve`) y deja de costear.
 *
 * `reduced` sale de prefers-reduced-motion: si el sistema pide menos
 * movimiento, el elemento se marca como visible de inmediato y no se
 * anima. El bloque global de index.css ya pone las duraciones a cero,
 * pero eso solo evita la transicion: sin esto el elementoArrancaria
 * en oculto y se quedaria ahi si el observer no llega a disparar.
 */
export default function useReveal({ once = true, threshold = 0.15, rootMargin = '0px 0px -8% 0px' } = {}) {
  const ref = useRef(null)

  // Sin IntersectionObserver (navegador antiguo, o jsdom en pruebas) el
  // elemento arranca VISIBLE. Va en el inicializador de estado y no en el
  // efecto a proposito: un setState sincrono dentro del efecto dispara un
  // segundo render en cascada, que es justo lo que eslint-plugin-react-hooks
  // marca. Contenido invisible es peor que contenido sin animar.
  const [isVisible, setIsVisible] = useState(
    () => typeof IntersectionObserver === 'undefined'
  )

  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true)
            if (once) {
              observer.unobserve(entry.target)
            }
          } else if (!once) {
            setIsVisible(false)
          }
        }
      },
      { threshold, rootMargin }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [once, threshold, rootMargin])

  return [ref, isVisible]
}