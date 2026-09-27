export const SCHEDULE_COLOR_STYLES = {
  ROJO: { background: 'var(--color-rojo)', color: '#fff' },
  AMARILLO: { background: 'var(--color-amarillo)', color: 'var(--color-cafe-oscuro)' },
  VERDE: { background: 'var(--color-verde)', color: '#fff' },
  CAFE: { background: 'var(--color-cafe-claro)', color: '#fff' },
}

export function getScheduleColorStyle(color) {
  return SCHEDULE_COLOR_STYLES[color] || SCHEDULE_COLOR_STYLES.AMARILLO
}