// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ScheduleBadge from './ScheduleBadge'

describe('ScheduleBadge', () => {
  afterEach(() => {
    cleanup()
  })

  it('no pulsa por defecto', () => {
    // El horario puede no ser legible. En ese caso useOpenNow devuelve
    // null y el badge debe quedarse callado, no afirmar nada.
    render(<ScheduleBadge text="L-V 8:00-17:00" color="ROJO" />)
    expect(screen.getByText('L-V 8:00-17:00').className).not.toContain('schedule-badge--open')
  })

  it('pulsa cuando se confirma que esta abierto', () => {
    render(<ScheduleBadge text="L-V 8:00-17:00" color="ROJO" isOpen />)
    expect(screen.getByText('L-V 8:00-17:00').className).toContain('schedule-badge--open')
  })

  it('combina el pulso con la variante sobre fondo oscuro', () => {
    render(<ScheduleBadge text="L-V 8:00-17:00" color="ROJO" onDark isOpen />)
    const clase = screen.getByText('L-V 8:00-17:00').className
    expect(clase).toContain('schedule-badge--on-dark')
    expect(clase).toContain('schedule-badge--open')
  })

  it('conserva la clase que le pasa el consumidor', () => {
    render(<ScheduleBadge text="L-V 8:00-17:00" color="ROJO" className="hero__eyebrow" />)
    expect(screen.getByText('L-V 8:00-17:00').className).toContain('hero__eyebrow')
  })
})