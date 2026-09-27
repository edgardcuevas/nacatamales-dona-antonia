import { useAuth } from '../context/AuthContext'
import LoginForm from '../components/Admin/LoginForm/LoginForm'
import '../styles/Administracion.css'

const SECTIONS = [
  { label: 'Categorías', description: 'Organiza el menú por secciones.' },
  { label: 'Productos', description: 'Agrega, edita precios y disponibilidad.' },
  { label: 'Anuncios', description: 'Publica alertas y promociones.' },
  { label: 'Día a día', description: 'Sube fotos y videos del local.' },
  { label: 'Configuración del sitio', description: 'Horario, WhatsApp, redes y ubicación.' },
]

export default function Administracion() {
  const { isAuthenticated, isLoading, user, logout } = useAuth()

  if (isLoading) {
    return <div className="admin-loading">Cargando…</div>
  }

  if (!isAuthenticated) {
    return <LoginForm />
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard__header">
        <div>
          <h1>Panel de administración</h1>
          <p>Sesión iniciada como {user.email}</p>
        </div>
        <button type="button" className="btn btn--outline" onClick={logout}>
          Cerrar sesión
        </button>
      </div>

      <div className="admin-dashboard__grid">
        {SECTIONS.map((section) => (
          <div className="admin-dashboard__card" key={section.label}>
            <h3>{section.label}</h3>
            <p>{section.description}</p>
            <span className="admin-dashboard__soon">Próximamente</span>
          </div>
        ))}
      </div>
    </div>
  )
}