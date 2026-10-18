import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Al navegar a otra página, React Router conserva el scroll anterior y el
// visitante aterriza a media página. Solo reacciona al cambio de ruta: el
// cambio de categoría en el menú (?category=) no mueve la pantalla.
export default function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}