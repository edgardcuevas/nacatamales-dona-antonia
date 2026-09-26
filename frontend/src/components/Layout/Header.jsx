import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useSettings } from '../../context/SettingsContext'
import { Icon } from '../icons/Icons'
import './Header.css'

const NAV_LINKS = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/menu', label: 'Nacatamales' },
  { to: '/dia-a-dia', label: 'Día a día' },
  { to: '/nosotros', label: 'Nosotros' },
  { to: '/contacto', label: 'Contacto' },
]

function whatsappHref(whatsappNumber) {
  if (!whatsappNumber) {
    return null
  }
  return `https://wa.me/${whatsappNumber}`
}

export default function Header() {
  const { settings } = useSettings()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const waHref = whatsappHref(settings.whatsappNumber)

  function closeMenu() {
    setIsMenuOpen(false)
  }

  return (
    <nav className="site-header">
      <div className="site-header__bar">
        <NavLink to="/" className="site-header__brand" onClick={closeMenu}>
          <Icon name="badge" className="site-header__badge" />
          <span className="site-header__name">
            NACATAMALES
            <span>DE DOÑA ANTONIA</span>
          </span>
        </NavLink>

        <button
          type="button"
          className="site-header__toggle"
          aria-label={isMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>

        <div className={isMenuOpen ? 'site-header__menu site-header__menu--open' : 'site-header__menu'}>
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={closeMenu}
              className={({ isActive }) =>
                isActive ? 'site-header__link site-header__link--active' : 'site-header__link'
              }
            >
              {link.label}
            </NavLink>
          ))}
          <NavLink to="/administracion" className="site-header__admin" onClick={closeMenu}>
            Administración
          </NavLink>
          {waHref && (
            <a className="site-header__wa site-header__wa--inline" href={waHref} target="_blank" rel="noreferrer">
              <Icon name="chat" /> Pedir por WhatsApp
            </a>
          )}
        </div>

        {waHref && (
          <a className="site-header__wa site-header__wa--desktop" href={waHref} target="_blank" rel="noreferrer">
            <Icon name="chat" /> Pedir por WhatsApp
          </a>
        )}
      </div>
    </nav>
  )
}