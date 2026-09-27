import { Link } from 'react-router-dom'
import { useSettings } from '../context/SettingsContext'
import { Icon } from '../components/icons/Icons'
import '../styles/Nosotros.css'

export default function Nosotros() {
  const { settings } = useSettings()

  return (
    <div className="nosotros-page">
      <section className="nosotros-hero">
        <span className="section-head__tag section-head__tag--left">Nuestra historia</span>
        <h1>Tradición y sabor casero</h1>
        {settings.storyText.split('\n').filter(Boolean).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </section>

      <section className="nosotros-quote">
        <p>"¡Si de un buen nacatamal quieres disfrutar, a nosotros debes visitar!"</p>
      </section>

      <section className="nosotros-values">
        <div className="nosotros-value">
          <Icon name="leaf" />
          <h3>Ingredientes frescos</h3>
          <p>Compramos y preparamos cada día, sin dejar nada de un día para otro.</p>
        </div>
        <div className="nosotros-value">
          <Icon name="pot" />
          <h3>Receta de familia</h3>
          <p>La misma receta tradicional, cuidada con años de experiencia.</p>
        </div>
        <div className="nosotros-value">
          <Icon name="grill" />
          <h3>Atención directa</h3>
          <p>Nos conocés por nuestro nombre, no somos una cadena más.</p>
        </div>
      </section>

      <section className="nosotros-cta">
        <h2>¿Ya se te antojó?</h2>
        <Link className="btn btn--primary" to="/menu">
          Ver el menú
        </Link>
      </section>
    </div>
  )
}