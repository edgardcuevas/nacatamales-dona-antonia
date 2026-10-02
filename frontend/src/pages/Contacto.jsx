import { useSettings } from '../context/SettingsContext'
import { Icon } from '../components/icons/Icons'
import ScheduleBadge from '../components/ScheduleBadge/ScheduleBadge'
import { formatWhatsappNumber } from '../utils/phone'
import '../styles/Contacto.css'

function whatsappHref(whatsappNumber) {
  if (!whatsappNumber) {
    return null
  }
  return `https://wa.me/${whatsappNumber}`
}

function mapEmbedSrc(latitude, longitude) {
  if (latitude === null || longitude === null) {
    return null
  }
  return `https://www.google.com/maps?q=${latitude},${longitude}&output=embed`
}

export default function Contacto() {
  const { settings } = useSettings()
  const waHref = whatsappHref(settings.whatsappNumber)
  const mapSrc = mapEmbedSrc(settings.latitude, settings.longitude)

  return (
    <div className="contacto-page">
      <div className="contacto-page__header">
        <span className="section-head__tag">Contáctanos</span>
        <h1>Estamos para servirte</h1>
        <p>Escribinos por WhatsApp o visitanos en el local.</p>
      </div>

      <div className="contacto-cards">
        {waHref && (
          <div className="contacto-card contacto-card--whatsapp">
            <div className="contacto-card__icon-circle">
              <Icon name="chat" />
            </div>
            <div className="contacto-card__whatsapp-body">
              <strong>Escríbenos por WhatsApp</strong>
              <span>{formatWhatsappNumber(settings.whatsappNumber)}</span>
              <a className="contacto-card__cta" href={waHref} target="_blank" rel="noreferrer">
                Escribir ahora <Icon name="chat" />
              </a>
            </div>
          </div>
        )}

        {(settings.facebookUrl || settings.instagramUrl) && (
          <div className="contacto-card contacto-card--socials">
            <strong>También nos encontrás en:</strong>
            <div className="contacto-socials">
              {settings.facebookUrl && (
                <a href={settings.facebookUrl} target="_blank" rel="noreferrer">
                  Facebook
                </a>
              )}
              {settings.instagramUrl && (
                <a href={settings.instagramUrl} target="_blank" rel="noreferrer">
                  Instagram
                </a>
              )}
            </div>
          </div>
        )}

        <div className="contacto-card">
          <Icon name="pot" />
          <div>
            <strong>Horario general</strong>
            <ScheduleBadge icon="pot" text={settings.scheduleText} color={settings.scheduleColor} />
          </div>
        </div>

        {settings.fritangaScheduleText && (
          <div className="contacto-card">
            <Icon name="grill" />
            <div>
              <strong>Horario de fritanga</strong>
              <ScheduleBadge icon="grill" text={settings.fritangaScheduleText} color={settings.fritangaScheduleColor} />
            </div>
          </div>
        )}

        {settings.address && (
          <div className="contacto-card">
            <Icon name="pin" />
            <div>
              <strong>Nuestra ubicación</strong>
              <span>{settings.address}</span>
            </div>
          </div>
        )}
      </div>

      {mapSrc && (
        <div className="contacto-map">
          <iframe
            src={mapSrc}
            title="Ubicación de Nacatamales de Doña Antonia"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      )}
    </div>
  )
}