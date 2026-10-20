// Reglas de contraseña del servidor (user.validator.js). Se revisan aquí
// antes de enviar para decirle al dueño exactamente qué le falta, en vez de
// un error genérico del servidor.
export const MIN_PASSWORD_LENGTH = 12
const MAX_PASSWORD_BYTES = 72

const RULES = [
  { id: 'length', label: `Al menos ${MIN_PASSWORD_LENGTH} caracteres`, test: (v) => v.length >= MIN_PASSWORD_LENGTH },
  { id: 'lower', label: 'Una letra minúscula', test: (v) => /[a-z]/.test(v) },
  { id: 'upper', label: 'Una letra mayúscula', test: (v) => /[A-Z]/.test(v) },
  { id: 'digit', label: 'Un número', test: (v) => /\d/.test(v) },
  { id: 'symbol', label: 'Un símbolo (por ejemplo ! ? # $ -)', test: (v) => /[^A-Za-z0-9]/.test(v) },
  {
    id: 'bytes',
    label: 'Máximo 72 bytes',
    test: (v) => new TextEncoder().encode(v).length <= MAX_PASSWORD_BYTES,
  },
]

// Devuelve cada regla con `ok` true/false, en el orden en que se muestran.
export function checkPassword(value) {
  const text = typeof value === 'string' ? value : ''
  return RULES.map(({ id, label, test }) => ({ id, label, ok: test(text) }))
}

export function isStrongPassword(value) {
  return checkPassword(value).every((rule) => rule.ok)
}