// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  getPushConfig: vi.fn(),
  subscribeToPush: vi.fn(),
  syncPushSubscription: vi.fn(),
  wasPromptDismissedRecently: vi.fn(),
  rememberPromptDismissal: vi.fn(),
  pushSupported: true,
  iosDevice: false,
  standalone: false,
}))

vi.mock('../../utils/push', () => ({
  getPushConfig: mocks.getPushConfig,
  subscribeToPush: mocks.subscribeToPush,
  syncPushSubscription: mocks.syncPushSubscription,
  wasPromptDismissedRecently:
    mocks.wasPromptDismissedRecently,
  rememberPromptDismissal:
    mocks.rememberPromptDismissal,
  isPushSupported: () => mocks.pushSupported,
  isIosDevice: () => mocks.iosDevice,
  isStandalone: () => mocks.standalone,
}))

import NotificationPrompt from './NotificationPrompt'

function renderPrompt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NotificationPrompt />
    </MemoryRouter>,
  )
}

async function flushConfig() {
  await act(async () => {
    await Promise.resolve()
  })
}

async function advanceToPrompt() {
  await flushConfig()
  await act(async () => {
    vi.advanceTimersByTime(20_000)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.getPushConfig.mockResolvedValue({
    enabled: true,
    publicKey: 'test-public-key',
  })
  mocks.subscribeToPush.mockResolvedValue({
    status: 'granted',
    subscribed: true,
  })
  mocks.syncPushSubscription.mockResolvedValue(null)
  mocks.wasPromptDismissedRecently.mockReturnValue(false)
  mocks.pushSupported = true
  mocks.iosDevice = false
  mocks.standalone = false

  globalThis.Notification = {
    permission: 'default',
    requestPermission: vi.fn(),
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  delete globalThis.Notification
})

describe('NotificationPrompt', () => {
  it('no pregunta al entrar: espera al temporizador', async () => {
    renderPrompt()
    await flushConfig()

    expect(screen.queryByRole('dialog')).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(20_000)
    })

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'Activar notificaciones',
      }),
    ).toBeTruthy()
  })

  it('activa las notificaciones desde el clic y cierra el modal', async () => {
    renderPrompt()
    await advanceToPrompt()

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Activar notificaciones',
        }),
      )
    })

    expect(mocks.subscribeToPush).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('recuerda el descarte y no vuelve a ofrecerlo', async () => {
    renderPrompt()
    await advanceToPrompt()

    fireEvent.click(
      screen.getByRole('button', { name: 'Ahora no' }),
    )

    expect(
      mocks.rememberPromptDismissal,
    ).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('explica el error cuando el navegador bloquea el permiso', async () => {
    mocks.subscribeToPush.mockResolvedValue({
      status: 'denied',
      subscribed: false,
    })

    renderPrompt()
    await advanceToPrompt()

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Activar notificaciones',
        }),
      )
    })

    expect(
      screen.getByRole('alert').textContent,
    ).toContain('bloqueó las notificaciones')
  })

  it('no se muestra si el servidor no tiene push configurado', async () => {
    mocks.getPushConfig.mockResolvedValue({
      enabled: false,
      publicKey: null,
    })

    renderPrompt()
    await advanceToPrompt()

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('no se muestra si el permiso ya fue negado', async () => {
    globalThis.Notification.permission = 'denied'

    renderPrompt()
    await advanceToPrompt()

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('repara la suscripción en silencio si el permiso ya está concedido', async () => {
    globalThis.Notification.permission = 'granted'

    renderPrompt()
    await advanceToPrompt()

    expect(
      mocks.syncPushSubscription,
    ).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('no aparece en el panel de administración', async () => {
    renderPrompt('/administracion')
    await advanceToPrompt()

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('en iPhone sin instalar muestra los pasos de pantalla de inicio', async () => {
    mocks.iosDevice = true
    mocks.standalone = false

    renderPrompt()
    await advanceToPrompt()

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(
      screen.getByText(/Agregar a pantalla de inicio/),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', {
        name: 'Activar notificaciones',
      }),
    ).toBeNull()
  })

  it('muestra las instrucciones de iOS aunque Safari no exponga PushManager', async () => {
    mocks.pushSupported = false
    mocks.iosDevice = true
    mocks.standalone = false

    renderPrompt()
    await advanceToPrompt()

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(
      screen.getByText(/Agregar a pantalla de inicio/),
    ).toBeTruthy()
  })

  it('en iPhone ya instalado ofrece el permiso normal', async () => {
    mocks.iosDevice = true
    mocks.standalone = true

    renderPrompt()
    await advanceToPrompt()

    expect(
      screen.getByRole('button', {
        name: 'Activar notificaciones',
      }),
    ).toBeTruthy()
  })
})
