// Formateo de los campos y valores que el asistente muestra en su tarjeta
// de confirmacion. El contrato es chico y cerrado: los cambios solo pueden
// tocar `isAvailable` (producto) o `isActive` (aviso, video, categoria).
// Cualquier otra cosa se cae al humanizador generico, para que un campo
// futuro nunca se imprima crudo como `isAvailable: true`.

const ACTIVE_LABELS = Object.freeze({
  announcement: ['Publicado', 'Oculto'],
  video: ['Publicado', 'Oculto'],
  category: ['Visible', 'Oculta'],
  product: ['Activo', 'Inactivo'],
  default: ['Activo', 'Inactivo'],
})

function humanizeField(field) {
  if (typeof field !== 'string' || field.trim() === '') {
    return 'Campo'
  }
  const spaced = field
    .replace(/[_.-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function formatActionField(field) {
  if (field === 'isAvailable') {
    return 'Disponibilidad'
  }
  if (field === 'isActive') {
    return 'Visibilidad'
  }
  return humanizeField(field)
}

function formatActionValue(field, value, targetType) {
  if (field === 'isAvailable') {
    if (value === true) return 'Disponible'
    if (value === false) return 'No disponible'
  }

  if (field === 'isActive') {
    if (value === true || value === false) {
      const type =
        typeof targetType === 'string' ? targetType : 'default'
      const labels = ACTIVE_LABELS[type] || ACTIVE_LABELS.default
      return value ? labels[0] : labels[1]
    }
  }

  if (value === null || value === undefined || value === '') {
    return 'Sin definir'
  }
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No'
  }
  return String(value)
}

function describeActionChange(change, targetType) {
  if (!change || typeof change !== 'object') {
    return null
  }
  const field = typeof change.field === 'string' ? change.field : ''
  return {
    field,
    label: formatActionField(field),
    from: formatActionValue(field, change.from, targetType),
    to: formatActionValue(field, change.to, targetType),
  }
}

function formatRelativeTime(value, now = Date.now()) {
  if (!value) {
    return ''
  }
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) {
    return ''
  }
  const diff = now - time
  if (diff < 60_000) {
    return 'ahora'
  }
  if (diff < 60 * 60_000) {
    return `hace ${Math.floor(diff / 60_000)} min`
  }
  if (diff < 24 * 60 * 60_000) {
    return `hace ${Math.floor(diff / (60 * 60_000))} h`
  }
  if (diff < 48 * 60 * 60_000) {
    return 'ayer'
  }
  if (diff < 7 * 24 * 60 * 60_000) {
    return `hace ${Math.floor(diff / (24 * 60 * 60_000))} días`
  }
  return new Date(time).toLocaleDateString('es-NI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export {
  humanizeField,
  formatActionField,
  formatActionValue,
  describeActionChange,
  formatRelativeTime,
}