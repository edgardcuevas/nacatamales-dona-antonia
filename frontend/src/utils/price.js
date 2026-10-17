// Formateo de precio para la carta.
//
// El precio llega de la base de datos como texto y ProductManager lo
// valida con un patron que admite hasta 2 decimales con punto
// (ver ProductManager.jsx: `form.price.trim().replace(',', '.')`).
// Formateamos a la region's CLDR: es-NI usa coma de miles y punto
// decimal, que es lo que espera quien esta mirando la carta.

const integerFormat = new Intl.NumberFormat('es-NI', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const decimalFormat = new Intl.NumberFormat('es-NI', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatPrice(value) {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  // Se ignoran cualquier caracter que no sea digito o punto para no
  // romper con un valor inesperado: el precio jamas debe romper la carta.
  const cleaned = String(value).replace(/[^\d.]/g, '')
  if (cleaned === '' || cleaned === '.') {
    return ''
  }

  const numeric = Number(cleaned)
  if (!Number.isFinite(numeric)) {
    return String(value)
  }

  return Number.isInteger(numeric) ? integerFormat.format(numeric) : decimalFormat.format(numeric)
}