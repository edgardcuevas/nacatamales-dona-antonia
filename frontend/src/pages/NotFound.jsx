import { Link } from 'react-router-dom'
import { Icon } from '../components/icons/Icons'
import usePageMeta from '../hooks/usePageMeta'

export default function NotFound() {
  // Un 404 de SPA se sirve con 200 desde Nginx: sin noindex Google podría
  // indexar la página de error como si fuera contenido.
  usePageMeta({
    title: 'Página no encontrada',
    description: 'La página que buscas no existe en Nacatamales de Doña Antonia.',
    noindex: true,
  })

  return (
    <div className="menu-page">
      <div className="empty-state">
        <Icon name="tamal" />
        <strong>No encontramos esta página</strong>
        <p>Puede que el enlace esté mal escrito o que ya no exista.</p>
        <Link className="btn btn--primary" to="/">
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}