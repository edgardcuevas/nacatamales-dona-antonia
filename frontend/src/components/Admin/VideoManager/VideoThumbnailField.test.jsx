// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import VideoThumbnailField from './VideoThumbnailField'

const ALT = 'Vista previa de la miniatura'

function renderField(overrides = {}) {
  const props = {
    previewUrl: null,
    file: null,
    onFileSelected: vi.fn(),
    onRemove: null,
    isBusy: false,
    ...overrides,
  }
  render(<VideoThumbnailField {...props} />)
  return props
}

describe('VideoThumbnailField', () => {
  afterEach(() => {
    cleanup()
  })

  it('degrada una miniatura remota que responde 404', () => {
    renderField({ previewUrl: 'https://i.ytimg.com/vi/abc/maxresdefault.jpg' })

    expect(screen.getByAltText(ALT).getAttribute('src')).toContain('maxresdefault.jpg')

    fireEvent.error(screen.getByAltText(ALT))

    expect(screen.getByAltText(ALT).getAttribute('src')).toBe(
      'https://i.ytimg.com/vi/abc/hqdefault.jpg'
    )
  })

  it('deja el contenedor con su fondo cuando ninguna variante carga', () => {
    renderField({ previewUrl: 'https://i.ytimg.com/vi/abc/maxresdefault.jpg' })

    fireEvent.error(screen.getByAltText(ALT))
    fireEvent.error(screen.getByAltText(ALT))

    expect(screen.queryByAltText(ALT)).toBeNull()
    expect(document.querySelector('.thumbnail-image__placeholder')).toBeTruthy()
  })

  it('sigue siendo usable despues de una miniatura rota', () => {
    renderField({
      previewUrl: 'https://i.ytimg.com/vi/abc/maxresdefault.jpg',
      onRemove: vi.fn(),
    })

    fireEvent.error(screen.getByAltText(ALT))
    fireEvent.error(screen.getByAltText(ALT))

    // El editor no se bloquea: tanto elegir como quitar siguen
    // disponibles aunque la imagen ya no se pueda mostrar.
    const elegir = screen.getByRole('button', { name: /Elegir miniatura|Cambiar miniatura/ })
    expect(elegir.disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Quitar' }).disabled).toBe(false)
  })

  it('no toca una vista previa local', () => {
    const previewUrl = 'blob:http://localhost/1234'
    renderField({ previewUrl })

    expect(screen.getByAltText(ALT).getAttribute('src')).toBe(previewUrl)
    expect(document.querySelector('.thumbnail-image__placeholder')).toBeNull()
  })
})