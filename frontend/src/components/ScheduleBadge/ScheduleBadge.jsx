import { getScheduleColorStyle } from '../../utils/scheduleColors'
import { Icon } from '../icons/Icons'
import './ScheduleBadge.css'

export default function ScheduleBadge({ icon = 'leaf', text, color, className = '' }) {
  if (!text) {
    return null
  }

  const style = getScheduleColorStyle(color)

  return (
    <span
      className={`schedule-badge ${className}`.trim()}
      style={{ background: style.background, color: style.color }}
    >
      <Icon name={icon} />
      {text}
    </span>
  )
}