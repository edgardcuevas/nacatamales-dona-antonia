import { useSettings } from '../../context/SettingsContext'
import './Footer.css'

export default function Footer() {
  const { settings } = useSettings()

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__grid">
          <div>
            <h4>{settings.businessName}</h4>
            <p>{settings.tagline}</p>
          </div>
          <div>
            <h4>Horario</h4>
            <p>{settings.scheduleText}</p>
          </div>
          <div>
            <h4>Visítanos</h4>
            {settings.whatsappNumber && <p>WhatsApp: {settings.whatsappNumber}</p>}
            {settings.address && <p>{settings.address}</p>}
          </div>
        </div>
        <div className="site-footer__bottom">
          <span>© {new Date().getFullYear()} {settings.businessName}</span>
          <span>Todos los derechos reservados</span>
        </div>
      </div>
    </footer>
  )
}