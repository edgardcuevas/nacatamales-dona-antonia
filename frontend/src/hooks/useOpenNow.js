import { useEffect, useMemo, useState } from 'react'
import { parseSchedule, isOpenNow } from '../utils/openNow'

/* Frecuencia de reconsulta. El horario no cambia de minuto en minuto, asi
   que un minuto es suficiente: por debajo solo se gasta CPU en repintar un
   badge que va a decir exactamente lo mismo. */
const REFRESH_MS = 60 * 1000

/**
 * ¿Esta el negocio abierto ahora mismo?
 *
 * Devuelve `true`, `false` o `null`. El `null` es una decision de
 * producto, no un descuido: significa "el horario no se pudo entender", y
 * el badge no pulsa. Preferimos no afirmar nada a afirmar mal.
 *
 * El estado no se guarda en un useEffect porque el calculo depende del
 * reloj: se recalcula en cada render que dispara un cambio de minuto.
 * El `tick` existe solo para forzar esos renders.
 *
 * @param {string} scheduleText Texto libre del horario, tal cual lo edita el dueño.
 * @returns {boolean|null}
 */
export default function useOpenNow(scheduleText) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    // Si el horario no es legible no hay nada que seguir: cero
    // temporizadores, que es ademas el caso por defecto cuando el campo
    // esta vacio.
    if (!parseSchedule(scheduleText)) {
      return undefined
    }
    const id = setInterval(() => setTick((n) => n + 1), REFRESH_MS)
    return () => clearInterval(id)
  }, [scheduleText])

  // El memo depende de `tick` para invalidarse cuando pasa el minuto. No
  // participa del calculo, asi que se referencia explicitamente: eslint lo
  // detectaria como dependencia innecesaria y lo quitaria, que es
  // justamente lo que rompe el refresco.
  return useMemo(() => {
    void tick
    return isOpenNow(parseSchedule(scheduleText), new Date())
  }, [scheduleText, tick])
}