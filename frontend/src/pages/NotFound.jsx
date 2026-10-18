import { Link } from 'react-router-dom'
import { Icon } from '../components/icons/Icons'
import usePageTitle from '../hooks/usePageTitle'

export default function NotFound() {
  usePageTitle('Página no encontrada')

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