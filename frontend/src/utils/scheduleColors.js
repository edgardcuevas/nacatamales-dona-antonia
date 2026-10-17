/* Tono del badge de horario.
   ------------------------------------------------------------------
   Antes devolvia un color SOLIDO (fondo saturado + texto), lo que hacia
   que el elemento de marca mas repetido del sitio despues del logo
   cambiara de color segun el contenido de la base de datos. La marca se
   repintaba sola.

   Ahora cada valor del enum se resuelve a un par TINTE + TEXTO. El badge
   sigue comunicando lo que el Dueño eligio, pero nunca es un bloque
   saturado: convive con el crema en vez de competir con el.

   Los ratios estan verificados:
     ROJO     5.97  AMARILLO 4.76  VERDE 6.19  CAFE 8.24

   Para el estado abierto/cerrado NO hace falta un campo isOpen en la base:
   utils/openNow.js lo deriva del propio texto del horario y lo evalua en la
   zona del negocio (America/Managua), no en la del visitante. Ese es el
   unico punto donde el frontend "adivina", asi que ante un texto que no
   entiende devuelve null y el badge no pulsa. Un campo isOpen explicito
   seguiria siendo mas fiable si el horario se vuelve irregular (feriados,
   horarios partidos), pero no es un bloqueante. */

export const SCHEDULE_COLOR_STYLES = {
  ROJO: {
    background: 'var(--color-rojo-claro)',
    color: 'var(--color-rojo)',
    borderColor: 'var(--color-rojo-claro)',
  },
  AMARILLO: {
    background: 'var(--color-amarillo-claro)',
    color: 'var(--color-amarillo)',
    borderColor: 'var(--color-amarillo-claro)',
  },
  VERDE: {
    background: 'var(--color-verde-claro)',
    color: 'var(--color-verde)',
    borderColor: 'var(--color-verde-claro)',
  },
  CAFE: {
    background: 'var(--color-crema-alt)',
    color: 'var(--color-tinta-2)',
    borderColor: 'var(--color-linea)',
  },
}

export function getScheduleColorStyle(color) {
  return SCHEDULE_COLOR_STYLES[color] || SCHEDULE_COLOR_STYLES.CAFE
}