import { describe, it, expect } from 'vitest'
import { parseSchedule, isOpenNow } from './openNow'

// Nicaragua es UTC-6 sin horario de verano, asi que una hora de Managua
// es una hora UTC mas 6. Los instantes de abajo estan escritos en UTC y
// los comentarios dicen a que hora local caen, que es lo que decide.

describe('parseSchedule', () => {
  it('interpreta el formato por defecto del sitio', () => {
    const s = parseSchedule('Jueves a Domingo · 5:00 AM – 9:00 PM')
    expect(s).not.toBeNull()
    expect([...s.days].sort()).toEqual([0, 4, 5, 6]) // dom, jue, vie, sab
    expect(s.open).toBe(5 * 60) // 300
    expect(s.close).toBe(21 * 60) // 1260
    expect(s.overnight).toBe(false)
  })

  it('quita acentos de los nombres de dia', () => {
    const s = parseSchedule('Miércoles a Viernes · 8:00 AM – 5:00 PM')
    expect([...s.days].sort()).toEqual([3, 4, 5]) // mie, jue, vie
  })

  it('interpreta abreviaturas de rango (l-v)', () => {
    const s = parseSchedule('L-V · 7:00 AM – 6:00 PM')
    expect([...s.days].sort()).toEqual([1, 2, 3, 4, 5]) // lun a vie
  })

  it('interpreta formato 24h sin AM/PM', () => {
    const s = parseSchedule('Lunes a Viernes · 09:00 - 18:00')
    expect(s.open).toBe(9 * 60)
    expect(s.close).toBe(18 * 60)
  })

  it('detecta un horario que cruza la medianoche', () => {
    const s = parseSchedule('Viernes a Sábado · 10:00 PM – 2:00 AM')
    expect(s.overnight).toBe(true)
  })

  it('devuelve null si el texto no es un horario', () => {
    expect(parseSchedule('Cuando quieras')).toBeNull()
    expect(parseSchedule('')).toBeNull()
    expect(parseSchedule(null)).toBeNull()
  })

  it('devuelve null antes que adivinar un dia ambiguo (M = martes/miercoles)', () => {
    expect(parseSchedule('L, M, X · 8:00 AM – 5:00 PM')).toBeNull()
  })

  it('devuelve null si las horas no son dos', () => {
    expect(parseSchedule('Lunes a Viernes · manana')).toBeNull()
  })
})

describe('isOpenNow', () => {
  const horario = parseSchedule('Jueves a Domingo · 5:00 AM – 9:00 PM')

  it('abre dentro del rango y en un dia de la semana (jueves 12:00 Managua)', () => {
    // 2026-03-19 es jueves. 18:00 UTC = 12:00 Managua.
    expect(isOpenNow(horario, new Date('2026-03-19T18:00:00Z'))).toBe(true)
  })

  it('cierra en un dia fuera del rango (lunes 12:00 Managua)', () => {
    // 2026-03-16 es lunes.
    expect(isOpenNow(horario, new Date('2026-03-16T18:00:00Z'))).toBe(false)
  })

  it('cierra antes de la hora de apertura (jueves 3:00 Managua)', () => {
    // 09:00 UTC = 03:00 Managua.
    expect(isOpenNow(horario, new Date('2026-03-19T09:00:00Z'))).toBe(false)
  })

  it('cierra despues de la hora de cierre (jueves 22:00 Managua)', () => {
    // viernes 04:00 UTC = jueves 22:00 Managua.
    expect(isOpenNow(horario, new Date('2026-03-20T04:00:00Z'))).toBe(false)
  })

  it('usa la hora de Managua, no la del visitante', () => {
    // viernes 05:00 UTC. Mal leido como UTC seria viernes 05:00 = abierto.
    // Bien leido en Managua es jueves 23:00 = cerrado. Que de false prueba
    // que la conversion de zona esta aplicada.
    expect(isOpenNow(horario, new Date('2026-03-20T05:00:00Z'))).toBe(false)
  })

  it('no pulsa si no se pudo interpretar el horario', () => {
    expect(isOpenNow(parseSchedule('Mk ultra'), new Date())).toBeNull()
    expect(isOpenNow(null, new Date())).toBeNull()
  })

  it('cruza la medianoche: sabado 1:00 sigue siendo la noche del viernes', () => {
    const noche = parseSchedule('Viernes a Sábado · 10:00 PM – 2:00 AM')
    // 2026-03-21 es sabado; 07:00 UTC = 01:00 Managua del sabado.
    expect(isOpenNow(noche, new Date('2026-03-21T07:00:00Z'))).toBe(true)
  })

  it('cruza la medianoche: lunes 1:00 no arrastra el sabado', () => {
    const noche = parseSchedule('Viernes a Sábado · 10:00 PM – 2:00 AM')
    // 2026-03-23 es lunes; 07:00 UTC = 01:00 Managua del lunes.
    expect(isOpenNow(noche, new Date('2026-03-23T07:00:00Z'))).toBe(false)
  })
})


describe('dias de la semana (regresion del desfase de un dia)', () => {
  const horario = parseSchedule('Jueves a Domingo · 5:00 AM – 9:00 PM')

  it('el miercoles esta cerrado', () => {
    // 2026-03-18 es miercoles; 18:00 UTC = 12:00 Managua.
    expect(isOpenNow(horario, new Date('2026-03-18T18:00:00Z'))).toBe(false)
  })

  it('el domingo esta abierto', () => {
    // 2026-03-22 es domingo; 18:00 UTC = 12:00 Managua.
    expect(isOpenNow(horario, new Date('2026-03-22T18:00:00Z'))).toBe(true)
  })

  it('el lunes sigue cerrado', () => {
    expect(isOpenNow(horario, new Date('2026-03-23T18:00:00Z'))).toBe(false)
  })
})

describe('horarios con varios tramos', () => {
  const texto = 'Jueves a Sábado de 5:00 am - 9:00 pm, domingos de 5:00 am a 10:00 am'

  it('entiende el horario con dos tramos', () => {
    const s = parseSchedule(texto)
    expect(s).not.toBeNull()
    expect(s.segments).toHaveLength(2)
    expect([...s.segments[0].days].sort()).toEqual([4, 5, 6])
    expect([...s.segments[1].days]).toEqual([0])
  })

  it('jueves 12:00 abierto; domingo 9:00 abierto; domingo 12:00 cerrado', () => {
    const s = parseSchedule(texto)
    expect(isOpenNow(s, new Date('2026-03-19T18:00:00Z'))).toBe(true) // jue 12:00
    expect(isOpenNow(s, new Date('2026-03-22T15:00:00Z'))).toBe(true) // dom 09:00
    expect(isOpenNow(s, new Date('2026-03-22T18:00:00Z'))).toBe(false) // dom 12:00
  })

  it('lunes a miercoles esta cerrado', () => {
    const s = parseSchedule(texto)
    expect(isOpenNow(s, new Date('2026-03-16T18:00:00Z'))).toBe(false) // lun
    expect(isOpenNow(s, new Date('2026-03-18T18:00:00Z'))).toBe(false) // mie
  })

  it('acepta " y " entre tramos y plurales', () => {
    const s = parseSchedule('Lunes a viernes 8am-5pm y sabados 8am-12pm')
    expect(s.segments).toHaveLength(2)
  })

  it('una lista de dias con comas sigue siendo un solo tramo', () => {
    const s = parseSchedule('Lunes, miércoles, viernes · 5:00 AM – 9:00 PM')
    expect(s.segments).toBeUndefined()
    expect([...s.days].sort()).toEqual([1, 3, 5])
  })

  it('un tramo sin hora invalida todo el horario', () => {
    expect(parseSchedule('Lunes a viernes 8am-5pm, domingos cerrado')).toBeNull()
  })
})