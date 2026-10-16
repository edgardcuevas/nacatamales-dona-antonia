// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { api } from '../../../api/client'
import VideoManager from './VideoManager'

vi.mock('../../../api/client', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
    upload: vi.fn(),
  },
}))

vi.mock('../../../utils/mediaUpload', () => ({
  uploadVideoThumbnail: vi.fn(),
  revertVideoThumbnail: vi.fn(),
}))

vi.mock('./VideoThumbnailField', () => ({
  default: () => null,
}))

const VALID_AUTHORIZATION_URL =
  'https://accounts.google.com/o/oauth2/v2/auth?state=mock-state'

function getConnectCalls() {
  return api.get.mock.calls.filter(([path]) => path === '/admin/youtube/connect')
}

describe('VideoManager YouTube reconnection', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.get.mockResolvedValue({ videos: [] })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the reconnect button without requesting an authorization URL on mount', async () => {
    render(<VideoManager />)

    expect(screen.getByRole('button', { name: 'Reconectar YouTube' })).toBeTruthy()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(getConnectCalls()).toHaveLength(0)
  })

  it('makes exactly one authenticated-client GET on click and navigates the current tab', async () => {
    const navigate = vi.fn()
    api.get.mockImplementation((path) =>
      path === '/admin/youtube/connect'
        ? Promise.resolve({ authorizationUrl: VALID_AUTHORIZATION_URL })
        : Promise.resolve({ videos: [] })
    )
    render(<VideoManager navigate={navigate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reconectar YouTube' }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(VALID_AUTHORIZATION_URL))
    expect(getConnectCalls()).toHaveLength(1)
    expect(getConnectCalls()[0][0]).toBe('/admin/youtube/connect')
  })

  it('disables the button and prevents duplicate requests while pending', async () => {
    let resolveRequest
    api.get.mockImplementation((path) => {
      if (path === '/admin/youtube/connect') {
        return new Promise((resolve) => {
          resolveRequest = resolve
        })
      }
      return Promise.resolve({ videos: [] })
    })
    const navigate = vi.fn()
    render(<VideoManager navigate={navigate} />)
    const button = screen.getByRole('button', { name: 'Reconectar YouTube' })

    fireEvent.click(button)
    fireEvent.click(button)

    expect(button.disabled).toBe(true)
    expect(button.textContent).toBe('Conectando…')
    expect(getConnectCalls()).toHaveLength(1)

    resolveRequest({ authorizationUrl: VALID_AUTHORIZATION_URL })
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
  })

  it.each([
    ['missing authorizationUrl', {}],
    ['empty authorizationUrl', { authorizationUrl: ' ' }],
    ['non-HTTPS authorizationUrl', { authorizationUrl: 'http://accounts.google.com/oauth' }],
    ['different host', { authorizationUrl: 'https://accounts.google.com.evil.test/oauth' }],
    ['different port', { authorizationUrl: 'https://accounts.google.com:8443/oauth' }],
  ])('rejects %s without navigating', async (_label, response) => {
    const navigate = vi.fn()
    api.get.mockImplementation((path) =>
      path === '/admin/youtube/connect'
        ? Promise.resolve(response)
        : Promise.resolve({ videos: [] })
    )
    render(<VideoManager navigate={navigate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reconectar YouTube' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'No se pudo iniciar la reconexión de YouTube.'
    )
    expect(navigate).not.toHaveBeenCalled()
  })

  it('shows a sanitized API error and re-enables the button', async () => {
    const navigate = vi.fn()
    api.get.mockImplementation((path) =>
      path === '/admin/youtube/connect'
        ? Promise.reject(new Error('sensitive response detail'))
        : Promise.resolve({ videos: [] })
    )
    render(<VideoManager navigate={navigate} />)
    const button = screen.getByRole('button', { name: 'Reconectar YouTube' })

    fireEvent.click(button)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'No se pudo iniciar la reconexión de YouTube.'
    )
    expect(screen.queryByText('sensitive response detail')).toBeNull()
    expect(button.disabled).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})

const STATUS_REFRESH_INTERVAL_MS = 20000

function makeVideo(overrides) {
  return {
    id: 1,
    title: 'Video de prueba',
    description: null,
    thumbnailUrl: null,
    thumbnailSource: 'YOUTUBE_DEFAULT',
    isActive: false,
    uploadStatus: 'PROCESSING',
    privacyStatus: 'UNLISTED',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// El GET de estado se separa del PATCH del mismo nombre porque sólo el
// primero pregunta a YouTube. Contarlos por separado evita que una
// prueba pueda pasar por alto un poll duplicado.
function statusCalls() {
  return api.get.mock.calls
    .map(([path]) => path)
    .filter((path) => typeof path === 'string' && path.endsWith('/status'))
}

function videoListCalls() {
  return api.get.mock.calls.filter(
    ([path]) => typeof path === 'string' && path.startsWith('/admin/videos?')
  )
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function renderWithVideos(videos) {
  api.get.mockResolvedValue({ videos })
  render(<VideoManager />)
  await flush()
}

describe('VideoManager estados terminales', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.patch.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('consulta el estado de un video pendiente y nunca el de uno eliminado', async () => {
    await renderWithVideos([
      makeVideo({ id: 1, uploadStatus: 'DELETED' }),
      makeVideo({ id: 2, uploadStatus: 'PROCESSING' }),
    ])

    await act(async () => {
      vi.advanceTimersByTime(STATUS_REFRESH_INTERVAL_MS)
    })

    expect(statusCalls()).toEqual(['/admin/videos/2/status'])
  })

  it('no emite ninguna consulta cuando la única fila esta eliminada', async () => {
    await renderWithVideos([makeVideo({ id: 1, uploadStatus: 'DELETED' })])

    await act(async () => {
      vi.advanceTimersByTime(STATUS_REFRESH_INTERVAL_MS * 2)
    })

    expect(statusCalls()).toHaveLength(0)
    // El intervalo nunca arranca, así que tampoco recarga la lista.
    expect(videoListCalls()).toHaveLength(1)
  })

  it('muestra la etiqueta en espanol y nunca el valor crudo del enum', async () => {
    await renderWithVideos([makeVideo({ id: 1, uploadStatus: 'DELETED' })])

    expect(screen.getByText(/Eliminado de YouTube/)).toBeTruthy()
    expect(screen.queryByText(/DELETED/)).toBeNull()
  })

  it('oculta las acciones que esperan a YouTube en una fila eliminada', async () => {
    await renderWithVideos([makeVideo({ id: 1, uploadStatus: 'DELETED' })])

    expect(screen.queryByRole('button', { name: 'Actualizar estado' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cambiar miniatura' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Usar la de YouTube' })).toBeNull()
  })

  it('mantiene intactas las acciones de una fila lista', async () => {
    await renderWithVideos([
      makeVideo({ id: 1, uploadStatus: 'READY', thumbnailSource: 'CUSTOM' }),
    ])

    expect(screen.getByRole('button', { name: 'Cambiar miniatura' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Usar la de YouTube' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Actualizar estado' })).toBeNull()
  })

  it('no convierte un fallo de estado en una rafaga de reintentos', async () => {
    await renderWithVideos([makeVideo({ id: 1, uploadStatus: 'PROCESSING' })])

    // El status siempre falla. El bucle debe seguir su cadencia normal,
    // sin reintentar el mismo video dentro del mismo tick.
    api.get.mockImplementation((path) =>
      path.endsWith('/status')
        ? Promise.reject(Object.assign(new Error('gone'), { status: 410 }))
        : Promise.resolve({ videos: [makeVideo({ id: 1, uploadStatus: 'PROCESSING' })] })
    )

    await act(async () => {
      vi.advanceTimersByTime(STATUS_REFRESH_INTERVAL_MS * 2)
    })

    expect(statusCalls()).toEqual([
      '/admin/videos/1/status',
      '/admin/videos/1/status',
    ])
  })

  it('el gasto por ventana no crece con el numero de filas pendientes', async () => {
    // Con diez filas esperando, quince minutos de refresco automático no
    // pueden pasar de la mitad del techo de 120. Es la propiedad que
    // protege el presupuesto que waitUntilReady necesita despues, y lo
    // que falla es justamente esto al pedir todas las filas a la vez.
    const many = Array.from({ length: 10 }, (_, index) =>
      makeVideo({ id: index + 1, uploadStatus: 'PROCESSING' })
    )
    await renderWithVideos(many)

    const tics = Math.floor((15 * 60_000) / STATUS_REFRESH_INTERVAL_MS) - 1
    for (let tick = 0; tick < tics; tick += 1) {
      await act(async () => {
        vi.advanceTimersByTime(STATUS_REFRESH_INTERVAL_MS)
      })
    }

    // Una peticion por tic, no diez, y las diez filas siguen cubriéndose.
    expect(statusCalls().length).toBe(tics)
    expect(new Set(statusCalls()).size).toBe(10)
    expect(statusCalls().length).toBeLessThanOrEqual(45)
  })

  it('ofrece Publicar solo cuando el servidor lo aceptaria', async () => {
    // Publicar exige READY (409) y recurso remoto vivo (410). Ocultar
    // siempre se acepta, asi que una fila activa siempre ofrece algo.
    await renderWithVideos([
      makeVideo({ id: 1, uploadStatus: 'DELETED' }),
      makeVideo({ id: 2, uploadStatus: 'DELETED', title: 'Ya activo', isActive: true }),
      makeVideo({ id: 3, uploadStatus: 'PROCESSING' }),
      makeVideo({ id: 4, uploadStatus: 'READY' }),
      makeVideo({ id: 5, uploadStatus: 'READY', isActive: true, title: 'Publicado' }),
    ])

    expect(screen.getByRole('button', { name: 'Publicar' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Ocultar' })).toHaveLength(2)
  })

  it('explica por que no se pudo publicar en vez de un error generico', async () => {
    api.patch.mockRejectedValue(
      Object.assign(new Error('gone'), { code: 'VIDEO_REMOTE_DELETED', status: 410 })
    )
    await renderWithVideos([makeVideo({ id: 1, uploadStatus: 'READY' })])

    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }))
    await flush()

    expect(screen.getByText(/ya no existe en YouTube/)).toBeTruthy()
    expect(screen.queryByText('No se pudo cambiar el estado del video.')).toBeNull()
  })

  it('distingue un video que aun se procesa de uno que no existe', async () => {
    api.patch.mockRejectedValue(
      Object.assign(new Error('pending'), { code: 'VIDEO_NOT_READY', status: 409 })
    )
    await renderWithVideos([makeVideo({ id: 1, uploadStatus: 'READY' })])

    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }))
    await flush()

    expect(screen.getByText(/todavía está procesando/)).toBeTruthy()
  })

  it('avisa cuando el refresco automatico falla de forma sostenida', async () => {
    await renderWithVideos([makeVideo({ id: 1, uploadStatus: 'PROCESSING' })])

    api.get.mockImplementation((path) =>
      path.endsWith('/status')
        ? Promise.reject(
            Object.assign(new Error('busy'), { code: 'YOUTUBE_STATUS_RATE_LIMITED', status: 429 })
          )
        : Promise.resolve({ videos: [makeVideo({ id: 1, uploadStatus: 'PROCESSING' })] })
    )

    // Un fallo suelto no debe ensuciar la interfaz: se reintenta solo en
    // el siguiente tic.
    await act(async () => {
      vi.advanceTimersByTime(STATUS_REFRESH_INTERVAL_MS)
    })
    expect(screen.queryByText(/limitando las consultas/)).toBeNull()

    // Tres seguidos si: ahi el admin tiene que enterarse, porque si no
    // solo ve una fila congelada en "Procesando en YouTube".
    await act(async () => {
      vi.advanceTimersByTime(STATUS_REFRESH_INTERVAL_MS * 2)
    })
    expect(screen.getByText(/limitando las consultas/)).toBeTruthy()
  })

  it('deja de consultar una fila que el servidor declara perdida', async () => {
    await renderWithVideos([makeVideo({ id: 1, uploadStatus: 'PROCESSING' })])

    api.get.mockImplementation((path) =>
      path.endsWith('/status')
        ? Promise.reject(
            Object.assign(new Error('gone'), { code: 'VIDEO_REMOTE_DELETED', status: 410 })
          )
        : Promise.resolve({ videos: [makeVideo({ id: 1, uploadStatus: 'PROCESSING' })] })
    )

    await act(async () => {
      vi.advanceTimersByTime(STATUS_REFRESH_INTERVAL_MS * 5)
    })

    expect(screen.getByText(/ya no existe en YouTube/)).toBeTruthy()
    // La fila sigue viniendo como PROCESSING desde la base, asi que sin
    // esto se volveria a consultar para siempre con la misma respuesta.
    const callsAfterFirst410 = statusCalls().length
    await act(async () => {
      vi.advanceTimersByTime(STATUS_REFRESH_INTERVAL_MS * 5)
    })
    expect(statusCalls().length).toBe(callsAfterFirst410)
  })

  it('no sube dos veces el mismo archivo con un doble clic', async () => {
    api.upload.mockResolvedValue({ video: { id: 7 } })
    api.get.mockResolvedValue({ videos: [] })

    render(<VideoManager />)
    await flush()

    fireEvent.change(document.querySelector('input[type="file"]'), {
      target: {
        files: [new File(['x'], 'video.mp4', { type: 'video/mp4' })],
      },
    })

    // El boton se deshabilita con isBusy, pero eso depende de un
    // re-render: tres envios en el mismo tick lo esquivan. fireEvent
    // sobre el form evita la validacion nativa del input required.
    const form = document.querySelector('.video-manager__form')
    fireEvent.submit(form)
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(api.upload).toHaveBeenCalledTimes(1)
  })

  it('degrada la miniatura de la fila en vez de dejar la imagen rota', async () => {
    await renderWithVideos([
      makeVideo({
        id: 1,
        uploadStatus: 'READY',
        thumbnailUrl: 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg',
      }),
    ])

    const image = screen.getByAltText('Video de prueba')
    expect(image.getAttribute('src')).toContain('maxresdefault.jpg')

    fireEvent.error(image)

    expect(screen.getByAltText('Video de prueba').getAttribute('src')).toBe(
      'https://i.ytimg.com/vi/abc123/hqdefault.jpg'
    )
  })
})