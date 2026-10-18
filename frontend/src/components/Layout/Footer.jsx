import { useSettings } from '../../context/useSettings'
import ScheduleBadge from '../ScheduleBadge/ScheduleBadge'
import useOpenNow from '../../hooks/useOpenNow'
import { formatWhatsappNumber } from '../../utils/phone'
import './Footer.css'

function mapsHref(latitude, longitude) {
  if (latitude === null || longitude === null) {
    return null
  }
  return `https://www.google.com/maps?q=${latitude},${longitude}`
}

export default function Footer() {
  const { settings } = useSettings()
  // Un solo pulso en el pie: el horario general. El de fritanga lleva su
  // propio texto y no se mezcla con el principal.
  const estaAbierto = useOpenNow(settings.scheduleText)
  const mapHref = mapsHref(settings.latitude, settings.longitude)
  const hasSocials = Boolean(settings.facebookUrl || settings.instagramUrl)

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        {/* Unica aparicion del detalle de hoja en todo el sitio.
            Divide el contenido del pie sin ser un filete mas. */}
        <div className="leaf-rule" aria-hidden="true" />

        <div className="site-footer__grid">
          <div>
            <h4>{settings.businessName}</h4>
            <p>{settings.tagline}</p>
          </div>
          <div>
            <h4>Horario</h4>
            <ScheduleBadge
              icon="reloj"
              text={settings.scheduleText}
              color={settings.scheduleColor}
              onDark
              isOpen={estaAbierto}
            />
            {settings.fritangaScheduleText && (
              <div className="site-footer__schedule-secondary">
                <ScheduleBadge
                  icon="grill"
                  text={settings.fritangaScheduleText}
                  color={settings.fritangaScheduleColor}
                  onDark
                />
              </div>
            )}
          </div>
          <div>
            <h4>Visítanos</h4>
            {settings.whatsappNumber && (
              <p>
                WhatsApp:{' '}
                <a href={`https://wa.me/${settings.whatsappNumber}`} target="_blank" rel="noreferrer">
                  {formatWhatsappNumber(settings.whatsappNumber)}
                </a>
              </p>
            )}
            {settings.address && (
              <p>
                {mapHref ? (
                  <a href={mapHref} target="_blank" rel="noreferrer">
                    {settings.address}
                  </a>
                ) : (
                  settings.address
                )}
              </p>
            )}
            {hasSocials && (
              <p className="site-footer__socials">
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
              </p>
            )}
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