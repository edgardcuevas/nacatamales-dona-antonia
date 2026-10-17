import { getScheduleColorStyle } from '../../utils/scheduleColors'
import { Icon } from '../icons/Icons'
import './ScheduleBadge.css'

export default function ScheduleBadge({
  icon = 'reloj',
  text,
  color,
  className = '',
  onDark = false,
  isOpen = false,
}) {
  if (!text) {
    return null
  }

  // Sobre fondo oscuro (banda de fritanga) el tint se perderia, asi que se
  // fuerza la variante clara. Se resuelve con una clase y no con !important
  // en Home.css: un !important aqui ganaba a cualquier override posterior.
  const tone = onDark
    ? { background: 'rgba(255,255,255,0.16)', color: '#fff', borderColor: 'transparent' }
    : getScheduleColorStyle(color)

  // El pulso es puramente visual: solo se activa si el hook confirmo que
  // esta abierto. `null` (horario ilegible) deja la clase fuera, que es el
  // comportamiento por defecto y el que evita afirmar algo que no sabemos.
  const classes = [
    'schedule-badge',
    onDark ? 'schedule-badge--on-dark' : '',
    isOpen ? 'schedule-badge--open' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span
      className={classes}
      style={{ background: tone.background, color: tone.color, borderColor: tone.borderColor }}
    >
      <Icon name={icon} />
      {text}
    </span>
  )
}