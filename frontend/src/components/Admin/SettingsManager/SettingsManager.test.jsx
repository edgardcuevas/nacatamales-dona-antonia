// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const get = vi.fn()
const patch = vi.fn()
const refreshSettings = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../api/client', () => ({
  api: { get: (...args) => get(...args), patch: (...args) => patch(...args) },
}))
vi.mock('../../../context/useSettings', () => ({
  useSettings: () => ({ refreshSettings }),
}))

import SettingsManager from './SettingsManager'

const SETTINGS = {
  businessName: 'Nacatamales de Doña Antonia',
  tagline: 'Hecho como en casa',
  whatsappNumber: '50588887777',
  facebookUrl: null,
  instagramUrl: null,
  address: null,
  latitude: null,
  longitude: null,
  scheduleText: 'Jueves a Domingo · 5:00 AM – 9:00 PM',
  scheduleColor: 'AMARILLO',
  fritangaScheduleText: null,
  fritangaScheduleColor: 'ROJO',
  storyText: null,
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SettingsManager', () => {
  it('carga la configuración y la guarda con null en los campos vacíos', async () => {
    get.mockResolvedValue({ settings: SETTINGS })
    patch.mockResolvedValue({ settings: SETTINGS })

    render(<SettingsManager />)
    const whatsapp = await screen.findByDisplayValue('50588887777')
    fireEvent.change(whatsapp, { target: { value: '+505 8888 1111' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    const [path, payload] = patch.mock.calls[0]
    expect(path).toBe('/admin/settings')
    expect(payload.whatsappNumber).toBe('50588881111')
    expect(payload.facebookUrl).toBeNull()
    expect(payload.latitude).toBeNull()
    expect(payload.storyText).toBeNull()
    await waitFor(() => expect(refreshSettings).toHaveBeenCalled())
    expect(await screen.findByText(/Cambios guardados/)).toBeTruthy()
  })

  it('no envía nada si el WhatsApp es inválido', async () => {
    get.mockResolvedValue({ settings: SETTINGS })
    render(<SettingsManager />)
    const whatsapp = await screen.findByDisplayValue('50588887777')
    fireEvent.change(whatsapp, { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText(/WhatsApp debe llevar código de país/)).toBeTruthy()
    expect(patch).not.toHaveBeenCalled()
  })

  it('exige latitud y longitud juntas', async () => {
    get.mockResolvedValue({ settings: SETTINGS })
    render(<SettingsManager />)
    const lat = await screen.findByPlaceholderText('12.1364')
    fireEvent.change(lat, { target: { value: '12.13' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText(/latitud y la longitud juntas/)).toBeTruthy()
    expect(patch).not.toHaveBeenCalled()
  })

  
  it('saca la ubicación de un enlace de Google Maps y la guarda', async () => {
    get.mockResolvedValue({ settings: SETTINGS })
    patch.mockResolvedValue({ settings: SETTINGS })
    render(<SettingsManager />)

    const link = await screen.findByPlaceholderText('Pega aquí el enlace')
    fireEvent.change(link, {
      target: {
        value: 'https://www.google.com/maps/place/X/@12.1364,-86.2514,17z/data=!3d12.1371!4d-86.252',
      },
    })
    expect(await screen.findByText(/Ubicación detectada/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect(patch.mock.calls[0][1].latitude).toBe(12.1371)
    expect(patch.mock.calls[0][1].longitude).toBe(-86.252)
  })

  it('avisa si el enlace es corto y no trae ubicación', async () => {
    get.mockResolvedValue({ settings: SETTINGS })
    render(<SettingsManager />)

    const link = await screen.findByPlaceholderText('Pega aquí el enlace')
    fireEvent.change(link, { target: { value: 'https://maps.app.goo.gl/abc123' } })

    expect(await screen.findByText(/enlace corto/)).toBeTruthy()
    expect(patch).not.toHaveBeenCalled()
  })
})