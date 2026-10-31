// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import AssistantMarkdown from './AssistantMarkdown'

afterEach(() => {
  cleanup()
})

describe('AssistantMarkdown', () => {
  it('renderiza un parrafo simple', () => {
    render(<AssistantMarkdown content="Hola mundo" />)
    expect(screen.getByText('Hola mundo')).toBeTruthy()
  })

  it('devuelve null para contenido vacio', () => {
    const { container } = render(<AssistantMarkdown content="" />)
    expect(container.firstChild).toBeNull()
  })

  it('renderiza listas sin orden y ordenadas', () => {
    const { container } = render(
      <AssistantMarkdown content={'- Uno\n- Dos\n\n1. A\n2. B'} />,
    )
    expect(container.querySelectorAll('ul li')).toHaveLength(2)
    expect(container.querySelectorAll('ol li')).toHaveLength(2)
    expect(screen.getByText('Uno')).toBeTruthy()
    expect(screen.getByText('Dos')).toBeTruthy()
    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.getByText('B')).toBeTruthy()
  })

  it('aplica negrita e inline code', () => {
    const { container } = render(
      <AssistantMarkdown content="Texto **negrita** y `codigo`" />,
    )
    expect(container.querySelector('strong')?.textContent).toBe('negrita')
    expect(container.querySelector('code')?.textContent).toBe('codigo')
  })

  it('no inyecta HTML del modelo', () => {
    const { container } = render(
      <AssistantMarkdown content={'<img src=x onerror=alert(1)>\n<script>alert(1)</script>'} />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeTruthy()
  })

  it('preserva el texto desconocido como texto plano', () => {
    const { container } = render(
      <AssistantMarkdown content={'**roto\nsin cerrar'} />,
    )
    expect(container.textContent).toContain('roto')
    expect(container.textContent).toContain('sin cerrar')
  })
})