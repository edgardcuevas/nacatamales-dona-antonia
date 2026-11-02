// Formateo de los campos y valores que el asistente muestra en su tarjeta
// de confirmacion. Los campos conocidos tienen etiqueta y formato propios;
// cualquier otro se cae al humanizador generico, para que un campo futuro
// nunca se imprima crudo como `isAvailable: true`.

const ACTIVE_LABELS = Object.freeze({
  announcement: ['Publicado', 'Oculto'],
  video: ['Publicado', 'Oculto'],
  category: ['Visible', 'Oculta'],
  product: ['Activo', 'Inactivo'],
  photo: ['Publicada', 'Oculta'],
  default: ['Activo', 'Inactivo'],
})

// Mismos valores que AnnouncementManager: el panel y la tarjeta del asistente
// no deben nombrar distinto al mismo tipo de aviso.
const ANNOUNCEMENT_TYPE_LABELS = Object.freeze({
  AVAILABLE: 'Disponible',
  SOLD_OUT: 'Agotado',
  PROMOTION: 'Promoción',
  INFO: 'Aviso',
})

// El mensaje de un aviso tiene hasta 10 000 caracteres; en la tarjeta solo
// cabe una vista previa.
const CONTENT_PREVIEW_CHARS = 240

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toLocaleString('es-NI', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

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
  if (field === 'price') {
    return 'Precio'
  }
  if (field === 'categoryId') {
    return 'Categoría'
  }
  if (field === 'name') {
    return 'Nombre'
  }
  if (field === 'title') {
    return 'Título'
  }
  if (field === 'caption') {
    return 'Leyenda'
  }
  if (field === 'content') {
    return 'Mensaje'
  }
  if (field === 'type') {
    return 'Tipo'
  }
  if (field === 'startsAt') {
    return 'Inicia'
  }
  if (field === 'endsAt') {
    return 'Termina'
  }
  if (field === 'description') {
    return 'Descripción'
  }
  if (field === 'sortOrder') {
    return 'Orden'
  }
  if (field === 'imageMediaId') {
    return 'Imagen'
  }
  if (field === 'productCount') {
    return 'Productos'
  }
  if (field === 'productNames') {
    return 'Nombres'
  }
  if (field === 'productsAvailability') {
    return 'Disponibilidad de los productos'
  }
  if (field === 'productsActive') {
    return 'Visibilidad de los productos'
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

  if (field === 'price') {
    if (value === null || value === undefined) return 'Sin definir'
    const number = Number(value)
    if (Number.isNaN(number)) return String(value)
    return `C$ ${number.toFixed(2)}`
  }

  if (field === 'imageMediaId') {
    if (value === null || value === undefined) return 'Sin imagen'
    return `Imagen #${value}`
  }

  if (field === 'productsAvailability') {
    if (value === true) return 'Disponibles'
    if (value === false) return 'No disponibles'
  }

  if (field === 'productsActive') {
    if (value === true) return 'Visibles'
    if (value === false) return 'Ocultos'
  }

  if (field === 'type') {
    const label = ANNOUNCEMENT_TYPE_LABELS[value]
    if (label) return label
  }

  if (field === 'startsAt' || field === 'endsAt') {
    if (value === null || value === undefined) return 'Sin fecha'
    const formatted = formatDateTime(value)
    if (formatted) return formatted
  }

  if (field === 'content') {
    if (value === null || value === undefined) return 'Sin definir'
    const text = String(value)
    return text.length > CONTENT_PREVIEW_CHARS
      ? `${text.slice(0, CONTENT_PREVIEW_CHARS)}…`
      : text
  }

  if (field === 'caption') {
    if (value === null || value === undefined || value === '') return 'Sin leyenda'
    const text = String(value)
    return text.length > CONTENT_PREVIEW_CHARS
      ? `${text.slice(0, CONTENT_PREVIEW_CHARS)}…`
      : text
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? 'Sin productos' : value.join(', ')
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