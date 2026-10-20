import { describe, it, expect } from 'vitest'
import { checkPassword, isStrongPassword } from './password'

describe('isStrongPassword', () => {
  it('acepta una contraseña que cumple todo', () => {
    expect(isStrongPassword('Nacatamal#2026x')).toBe(true)
  })

  it('rechaza si falta alguna regla', () => {
    expect(isStrongPassword('nacatamal#2026x')).toBe(false) // sin mayúscula
    expect(isStrongPassword('NACATAMAL#2026X')).toBe(false) // sin minúscula
    expect(isStrongPassword('Nacatamal#abcdef')).toBe(false) // sin número
    expect(isStrongPassword('Nacatamal2026xx')).toBe(false) // sin símbolo
    expect(isStrongPassword('Nac#2026')).toBe(false) // corta
  })

  it('rechaza más de 72 bytes y valores no texto', () => {
    expect(isStrongPassword(`Aa1#${'ñ'.repeat(40)}`)).toBe(false)
    expect(isStrongPassword(undefined)).toBe(false)
  })
})

describe('checkPassword', () => {
  it('marca cuáles reglas faltan', () => {
    const failed = checkPassword('abc').filter((rule) => !rule.ok).map((rule) => rule.id)
    expect(failed).toEqual(['length', 'upper', 'digit', 'symbol'])
  })
})