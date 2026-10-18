/* ¿Está abierto ahora?
   --------------------------------------------------------------------------
   El badge de horario recibia el texto libre del dueño ("Jueves a Domingo ·
   5:00 AM – 9:00 PM") y no podia saber si en este instante el negocio esta
   abierto. scheduleColors.js documenta que un campo isOpen de verdad necesita
   backend + migracion; esto lo resuelve en el FRONTEND sin tocar la base,
   parseando el texto.

   La regla que gobierna todo el archivo: ante la duda, `null`. Un `null`
   significa "no se que el estado" y el badge NO pulsa. Un `false` significa
   "se que esta cerrado". Nunca devolvemos true sin haber entendido el
   formato, porque un "estamos abiertos" en falso es un dano comercial real
   (el cliente viene y no hay quien le atienda). Ante cualquier ambigüedad
   preferimos callar antes que mentir.
*/

/* El negocio esta en Nicaragua. El horario se evalua en SU zona, no en la del
   visitante: alguien de Madrid que lea el sitio a las 3 de la tarde quiere
   saber si those are open in Managua, no en Espana. */
export const TIME_ZONE = 'America/Managua'

/* 0 = domingo ... 6 = sabado, igual que Date.prototype.getDay y que el
   `dow` que devuelve localParts. Antes esta tabla empezaba en lunes (lunes
   = 0) mientras localParts empezaba en domingo, y todo el horario quedaba
   corrido un dia: "Jueves a Domingo" marcaba abierto el miercoles y cerrado
   el domingo. */
const DIAS = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
}

/* Abreviaturas de un dia. 'm' se omite a proposito: es ambigua (martes o
   miercoles) y adivinar el dia equivocado es peor que no saber nada. */
const DIAS_CORTOS = { l: 1, j: 4, v: 5, s: 6, d: 0 }

const TODOS_DIAS = () => new Set([0, 1, 2, 3, 4, 5, 6])

function norm(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // quita acentos: miercoles, sabado
    .replace(/[–—−]/g, '-') // guiones tipograficos
    .replace(/\s+/g, ' ')
    .trim()
}

function rango(a, b) {
  const dias = new Set()
  if (a === b) {
    dias.add(a)
    return dias
  }
  // Un rango que envuelve el domingo (vie -> dom) recorre dando la vuelta.
  for (let d = a; d !== (b + 1) % 7; d = (d + 1) % 7) {
    dias.add(d)
    if (dias.size > 7) break
  }
  return dias
}

function parseDias(texto) {
  // Se aceptan las formas con que se escribe a mano: "los domingos de",
  // "sabados", "jueves a sabado de".
  const parte = texto
    .replace(/^(los|las|el|la)\s+/, '')
    .replace(/\s+de$/, '')
    .replace(/\b(domingo|sabado)s\b/g, '$1')
    .trim()

  if (!parte) return TODOS_DIAS()

  // "todos los dias", "todos", "de lunes a domingo" (el "a domingo" lo
  // cubre el rango de abajo, pero "todos" se comprueba primero).
  if (/todos/.test(parte)) return TODOS_DIAS()

  // Rango con palabra completa: "jueves a domingo", "lunes a viernes".
  const rangoLargo = parte.match(/([a-z]+)\s+a\s+([a-z]+)/)
  if (rangoLargo) {
    const a = DIAS[rangoLargo[1]]
    const b = DIAS[rangoLargo[2]]
    if (a === undefined || b === undefined) return null
    return rango(a, b)
  }

  // Rango abreviado: "l-v", "s-d".
  const rangoCorto = parte.match(/^([a-z])-([a-z])$/)
  if (rangoCorto) {
    const a = DIAS_CORTOS[rangoCorto[1]]
    const b = DIAS_CORTOS[rangoCorto[2]]
    if (a === undefined || b === undefined) return null
    return rango(a, b)
  }

  // Dia unico, nombre completo.
  if (DIAS[parte] !== undefined) return new Set([DIAS[parte]])

  // Dia unico, abreviatura (sin 'm').
  if (parte.length === 1 && DIAS_CORTOS[parte] !== undefined) {
    return new Set([DIAS_CORTOS[parte]])
  }

  // Lista: "lunes, miercoles, viernes" o "l, j, v".
  const tokens = parte.split(/[,/]| y /).map((t) => t.trim()).filter(Boolean)
  if (tokens.length > 1) {
    const dias = new Set()
    for (const t of tokens) {
      const n = DIAS[t] !== undefined ? DIAS[t] : DIAS_CORTOS[t]
      if (n === undefined) return null
      dias.add(n)
    }
    return dias
  }

  return null
}

const TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i

function toMinutos(h, m, meridiem) {
  const minuto = m ? parseInt(m, 10) : 0
  if (meridiem) {
    let hh = h % 12
    if (/^p/i.test(meridiem.trim())) hh += 12
    return hh * 60 + minuto
  }
  // Sin AM/PM se asume 24h ("17:00 - 21:00").
  return h * 60 + minuto
}

function parseHoras(parte) {
  if (!parte) return null
  const global = new RegExp(TIME_RE.source, 'gi')
  const encontradas = []
  let m
  while ((m = global.exec(parte)) !== null) {
    encontradas.push({ h: parseInt(m[1], 10), m: m[2], mer: m[3] })
  }
  // Exactamente dos: apertura y cierre. Tres o mas significa un formato
  // partido que no soportamos -> null antes que inventarnos un rango.
  if (encontradas.length !== 2) return null

  const open = toMinutos(encontradas[0].h, encontradas[0].m, encontradas[0].mer)
  const close = toMinutos(encontradas[1].h, encontradas[1].m, encontradas[1].mer)
  if (open > 24 * 60 || close > 24 * 60) return null
  // overnight: cierra mas temprano de lo que abre (22:00 - 02:00).
  return { open, close, overnight: close <= open }
}

// Reparte el texto en tramos. Cada tramo termina donde aparece su hora; lo
// que no trae hora (los dias de una lista) se pega al tramo siguiente:
//   "lunes, miercoles, viernes · 5:00 AM - 9:00 PM"  -> 1 tramo
//   "lunes a sabado 5am-9pm, domingos 5am-10am"       -> 2 tramos
function dividirTramos(t) {
  const tramos = []
  let pendiente = ''
  for (const pieza of t.split(/[;,]| y /)) {
    const limpia = pieza.trim()
    if (!limpia) continue
    pendiente = pendiente ? `${pendiente}, ${limpia}` : limpia
    if (/\d/.test(limpia)) {
      tramos.push(pendiente)
      pendiente = ''
    }
  }
  // Sobro texto sin hora: se deja como tramo para que falle y devuelva null.
  if (pendiente) tramos.push(pendiente)
  return tramos
}

/**
 * Convierte el texto de horario en un objeto evaluable.
 * Un solo tramo: {days, open, close, overnight}. Varios tramos:
 * {segments: [ ...mismo objeto por tramo ]}.
 * @returns {object|null}
 */
export function parseSchedule(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return null

  const tramos = dividirTramos(norm(texto))
  if (tramos.length === 0) return null

  const segments = []
  for (const tramo of tramos) {
    const segmento = parseTramo(tramo)
    if (!segmento) return null
    segments.push(segmento)
  }

  return segments.length === 1 ? segments[0] : { segments }
}

function parseTramo(t) {

  // Separador explicito "·" (el formato por defecto del sitio).
  let diaParte
  let horaParte
  const sep = t.indexOf('·')
  if (sep !== -1) {
    // El trim no es cosmetico: al cortar en el separador cada mitad se
    // queda con el espacio de al lado, y "l-v " ya no matchea el rango
    // abreviado.
    diaParte = t.slice(0, sep).trim()
    horaParte = t.slice(sep + 1).trim()
  } else {
    // Sin "·": los dias quedan antes del primer token de hora.
    const primero = TIME_RE.exec(t)
    if (!primero) return null
    diaParte = t.slice(0, primero.index).trim()
    horaParte = t.slice(primero.index).trim()
  }

  const days = parseDias(diaParte)
  const horas = parseHoras(horaParte)
  if (days === null || horas === null) return null
  return { days, ...horas }
}

/** Dia de la semana (0-6) y minutos desde medianoche en la zona del negocio. */
function localParts(fecha, tz) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha)
  const get = (tipo) => partes.find((p) => p.type === tipo)?.value
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  let hora = parseInt(get('hour'), 10)
  if (hora === 24) hora = 0 // algunas implementaciones devuelven 24
  return {
    dow: wd[get('weekday')],
    minutes: hora * 60 + parseInt(get('minute'), 10),
  }
}

/**
 * ¿Abierto en este instante?
 * @returns {boolean|null} null = no se pudo determinar (no pulsar).
 */
export function isOpenNow(schedule, ahora = new Date()) {
  if (!schedule) return null
    if (schedule.segments) {
    return schedule.segments.some((tramo) => isOpenNow(tramo, ahora))
  }
  const { dow, minutes } = localParts(ahora, TIME_ZONE)

  if (schedule.overnight) {
    // Tramo vespertino del dia listado.
    if (minutes >= schedule.open) return schedule.days.has(dow)
    // Tramo madrugador: pertenece al horario del dia ANTERIOR.
    if (minutes < schedule.close) return schedule.days.has((dow + 6) % 7)
    return false
  }

  return schedule.days.has(dow) && minutes >= schedule.open && minutes < schedule.close
}