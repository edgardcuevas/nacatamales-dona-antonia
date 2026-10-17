// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import Reveal from './Reveal'

describe('Reveal', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('muestra el contenido si el navegador no tiene IntersectionObserver', () => {
    // Un navegador antiguo sin observer no puede avisar del cruce. Si el
    // bloque se quedara en opacidad 0, todo el contenido del sitio seria
    // invisible ahi. getByTestId lanza si no existe: eso ya es la
    // asercion de que el nodo esta montado.
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<Reveal data-testid="caja">hola</Reveal>)
    const el = screen.getByTestId('caja')
    expect(el.textContent).toBe('hola')
    expect(el.className).toContain('reveal--visible')
  })

  it('anade la clase de visibilidad cuando el elemento entra en pantalla', () => {
    const observar = vi.fn()
    class FakeObserver {
      constructor(cb) {
        this.cb = cb
      }
      observe(node) {
        observar(node)
        // Se entrega el cruce de inmediato, como haria el navegador.
        this.cb([{ isIntersecting: true, target: node }])
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver)

    render(<Reveal data-testid="caja">hola</Reveal>)
    expect(screen.getByTestId('caja').className).toContain('reveal--visible')
  })

  it('deja de observar el elemento una vez revelado', () => {
    const unobserve = vi.fn()
    class FakeObserver {
      constructor(cb) {
        this.cb = cb
      }
      observe(node) {
        this.cb([{ isIntersecting: true, target: node }])
      }
      unobserve(node) {
        unobserve(node)
      }
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver)

    render(<Reveal data-testid="caja">hola</Reveal>)
    // Sin once, el observer seguiria vigilando y el elemento volveria
    // a ocultarse al subir, que es un parpadeo que solo molesta.
    expect(unobserve).toHaveBeenCalledTimes(1)
  })

  it('conserva las clases que le pasan y aplica el escalonado', () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    render(
      <Reveal className="menu-teaser" delay={60} data-testid="caja">
        hola
      </Reveal>
    )
    const el = screen.getByTestId('caja')
    expect(el.className).toContain('menu-teaser')
    expect(el.style.transitionDelay).toBe('60ms')
  })
})