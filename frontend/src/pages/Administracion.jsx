import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import LoginForm from '../components/Admin/LoginForm/LoginForm'
import CategoryManager from '../components/Admin/CategoryManager/CategoryManager'
import ProductManager from '../components/Admin/ProductManager/ProductManager'
import AnnouncementManager from '../components/Admin/AnnouncementManager/AnnouncementManager'
import FeedManager from '../components/Admin/FeedManager/FeedManager'
import MediaLibrary from '../components/Admin/MediaLibrary/MediaLibrary'
import '../styles/Administracion.css'

const SECTIONS = [
  { key: 'categories', label: 'Categorías', description: 'Organiza el menú por secciones.', available: true },
  { key: 'products', label: 'Productos', description: 'Agrega, edita precios y disponibilidad.', available: true },
  { key: 'announcements', label: 'Anuncios', description: 'Publica alertas y promociones.', available: true },
  { key: 'feed', label: 'Día a día', description: 'Sube fotos y videos del local.', available: true },
  {
    key: 'media',
    label: 'Galería de fotos',
    description: 'Mirá dónde se usa cada imagen subida y borrá las que no necesités.',
    available: true,
  },
  {
    key: 'settings',
    label: 'Configuración del sitio',
    description: 'Horario, WhatsApp, redes y ubicación.',
    available: false,
  },
]

const SECTION_COMPONENTS = {
  categories: CategoryManager,
  products: ProductManager,
  announcements: AnnouncementManager,
  feed: FeedManager,
  media: MediaLibrary,
}

export default function Administracion() {
  const { isAuthenticated, isLoading, user, logout } = useAuth()
  const [activeSection, setActiveSection] = useState(null)

  if (isLoading) {
    return <div className="admin-loading">Cargando…</div>
  }

  if (!isAuthenticated) {
    return <LoginForm />
  }

  const ActiveComponent = activeSection ? SECTION_COMPONENTS[activeSection] : null
  const activeSectionMeta = SECTIONS.find((section) => section.key === activeSection)

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard__header">
        <div>
          <h1>{activeSectionMeta ? activeSectionMeta.label : 'Panel de administración'}</h1>
          <p>Sesión iniciada como {user.email}</p>
        </div>
        <div className="admin-dashboard__header-actions">
          {activeSection && (
            <button type="button" className="btn btn--outline" onClick={() => setActiveSection(null)}>
              ← Volver
            </button>
          )}
          <button type="button" className="btn btn--outline" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </div>

      {ActiveComponent ? (
        <ActiveComponent />
      ) : (
        <div className="admin-dashboard__grid">
          {SECTIONS.map((section) => (
            <button
              type="button"
              key={section.key}
              className="admin-dashboard__card"
              onClick={() => section.available && setActiveSection(section.key)}
              disabled={!section.available}
            >
              <h3>{section.label}</h3>
              <p>{section.description}</p>
              {!section.available && <span className="admin-dashboard__soon">Próximamente</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}