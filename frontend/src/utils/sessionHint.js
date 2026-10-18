// Marca local de "este navegador tuvo una sesión de administración".
//
// No es un secreto ni una credencial (la sesión real vive en una cookie
// httpOnly que JavaScript no puede leer): solo sirve para saber si vale la
// pena preguntarle al servidor por ella. Sin esta marca, cada visitante
// anónimo disparaba un POST /auth/refresh en cada carga, que además está
// limitado a 30 por 5 minutos por IP.
const KEY = 'nacatamales:admin-session'

export function hasSessionHint() {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setSessionHint() {
  try {
    window.localStorage.setItem(KEY, '1')
  } catch {
    // Sin almacenamiento (modo privado): la sesión funciona igual, solo que
    // al recargar habrá que iniciar sesión de nuevo.
  }
}

export function clearSessionHint() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nada que limpiar.
  }
}