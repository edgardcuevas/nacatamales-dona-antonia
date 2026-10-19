import { describe, it, expect } from 'vitest'
import { imageSrcSet, optimizeImage } from './imageUrl'

const URL_IK = 'https://ik.imagekit.io/abc123/nacatamales/foto.jpg'

describe('optimizeImage', () => {
  it('agrega la transformación de ancho a una URL de ImageKit', () => {
    expect(optimizeImage(URL_IK, 640)).toBe(`${URL_IK}?tr=w-640,q-80,f-auto`)
  })

  it('respeta una query que ya existe', () => {
    expect(optimizeImage(`${URL_IK}?updatedAt=1`, 400)).toBe(
      `${URL_IK}?updatedAt=1&tr=w-400,q-80,f-auto`
    )
  })

  it('no toca una URL que ya trae su transformación', () => {
    const url = `${URL_IK}?tr=w-100`
    expect(optimizeImage(url, 640)).toBe(url)
  })

  it('no toca URLs de otros servidores ni valores vacíos', () => {
    expect(optimizeImage('https://i.ytimg.com/vi/x/hq.jpg', 640)).toBe('https://i.ytimg.com/vi/x/hq.jpg')
    expect(optimizeImage(null, 640)).toBeNull()
    expect(optimizeImage(undefined, 640)).toBeUndefined()
  })

  it('ignora un ancho inválido', () => {
    expect(optimizeImage(URL_IK, 0)).toBe(URL_IK)
    expect(optimizeImage(URL_IK, NaN)).toBe(URL_IK)
  })
})

describe('imageSrcSet', () => {
  it('arma el srcSet con un descriptor de ancho por tamaño', () => {
    expect(imageSrcSet(URL_IK, [400, 800])).toBe(
      `${URL_IK}?tr=w-400,q-80,f-auto 400w, ${URL_IK}?tr=w-800,q-80,f-auto 800w`
    )
  })

  it('devuelve undefined si la URL no es de ImageKit', () => {
    expect(imageSrcSet('https://example.com/a.jpg', [400])).toBeUndefined()
  })
})