// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ThumbnailImage from './ThumbnailImage'

const MAXRES = 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg'
const HIGH = 'https://i.ytimg.com/vi/abc123/hqdefault.jpg'

// jsdom no descarga imagenes, asi que el 404 se dispara a mano. Es justo
// lo que el navegador hace cuando i.ytimg.com responde 404.
function breakTheImage() {
  fireEvent.error(screen.getByAltText('Miniatura'))
}

function currentSrc() {
  return screen.getByAltText('Miniatura').getAttribute('src')
}

function placeholder() {
  return document.querySelector('.thumbnail-image__placeholder')
}

describe('ThumbnailImage', () => {
  afterEach(() => {
    cleanup()
  })

  it('degrada maxresdefault a hqdefault una sola vez', () => {
    render(<ThumbnailImage src={MAXRES} alt="Miniatura" />)

    expect(currentSrc()).toBe(MAXRES)

    breakTheImage()

    expect(currentSrc()).toBe(HIGH)
  })

  it('no vuelve a pedir la variante original si la de reemplazo falla', () => {
    render(<ThumbnailImage src={MAXRES} alt="Miniatura" />)

    breakTheImage()
    expect(currentSrc()).toBe(HIGH)

    // Tras el segundo fallo no queda ninguna <img>: un terceiro evento
    // no puede devolverla a maxresdefault ni encadenar otra peticion.
    breakTheImage()
    expect(screen.queryByAltText('Miniatura')).toBeNull()
    expect(placeholder()).toBeTruthy()

    fireEvent.error(document.querySelector('div'))
    expect(screen.queryByAltText('Miniatura')).toBeNull()
  })

  it('conserva la version de cache al degradar la variante', () => {
    const versioned = `${MAXRES}?v=1759000000000`
    render(<ThumbnailImage src={versioned} alt="Miniatura" />)

    breakTheImage()

    expect(currentSrc()).toBe('https://i.ytimg.com/vi/abc123/hqdefault.jpg?v=1759000000000')
  })

  it('cae al placeholder sin reintentar cuando la URL no es de YouTube', () => {
    render(<ThumbnailImage src="https://ik.imagekit.io/abc/foto.jpg" alt="Miniatura" />)

    breakTheImage()

    expect(screen.queryByAltText('Miniatura')).toBeNull()
    expect(placeholder()).toBeTruthy()
  })

  it('no hace nada con una imagen que carga bien', () => {
    const { container } = render(
      <ThumbnailImage
        src={HIGH}
        alt="Miniatura"
        className="video-row__thumb-img"
      />
    )

    expect(currentSrc()).toBe(HIGH)
    expect(container.querySelector('img').className).toBe('video-row__thumb-img')
    expect(placeholder()).toBeNull()
  })

  it('reutiliza el placeholder que le pasa cada superficie', () => {
    render(
      <ThumbnailImage src={MAXRES} alt="Miniatura" placeholderClassName="dia-post__placeholder" />
    )

    expect(placeholder()).toBeNull()

    // Tras un solo fallo todavia queda una <img>: la de reemplazo.
    breakTheImage()
    expect(placeholder()).toBeNull()

    breakTheImage()
    expect(placeholder().className).toContain('dia-post__placeholder')
    expect(placeholder().className).toContain('thumbnail-image__placeholder')
  })

  it('vuelve a intentar cuando la URL de origen cambia', () => {
    const { rerender } = render(<ThumbnailImage src={MAXRES} alt="Miniatura" />)
    breakTheImage()
    breakTheImage()
    expect(screen.queryByAltText('Miniatura')).toBeNull()

    // El key del llamador monta un componente nuevo, que es lo que
    // reinicia el intento cuando la lista trae otra miniatura.
    rerender(<ThumbnailImage key="otra" src={HIGH} alt="Miniatura" />)

    expect(currentSrc()).toBe(HIGH)
  })
})