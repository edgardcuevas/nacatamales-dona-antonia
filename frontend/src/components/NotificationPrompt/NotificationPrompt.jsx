import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  getPushConfig,
  isIosDevice,
  isPushSupported,
  isStandalone,
  rememberPromptDismissal,
  subscribeToPush,
  syncPushSubscription,
  wasPromptDismissedRecently,
} from '../../utils/push'
import './NotificationPrompt.css'

// No se pregunta al entrar: el visitante primero tiene que ver algo del
// sitio. Veinte segundos o una interacción, lo que llegue antes.
const PROMPT_DELAY_MS = 20_000

function describeActivationError(error) {
  if (error?.code === 'PUSH_NOT_CONFIGURED') {
    return 'Las notificaciones no están disponibles por ahora.'
  }

  return 'No se pudieron activar las notificaciones. Intentá de nuevo.'
}

export default function NotificationPrompt() {
  const { pathname } = useLocation()
  const [mode, setMode] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const primaryButtonRef = useRef(null)

  useEffect(() => {
    if (pathname.startsWith('/administracion')) {
      return undefined
    }

    // En iPhone/iPad sin instalar, Safari puede no exponer PushManager
    // hasta que el sitio se abre desde la pantalla de inicio. Es
    // justamente ahí donde hay que explicar cómo instalarlo, así que
    // este caso no exige isPushSupported().
    const iosNeedsInstall =
      isIosDevice() && !isStandalone()

    if (
      (!isPushSupported() && !iosNeedsInstall) ||
      wasPromptDismissedRecently()
    ) {
      return undefined
    }

    let cancelled = false
    let timer = null
    let nextMode = null

    function cleanupTriggers() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }

      window.removeEventListener('scroll', onTrigger)
      window.removeEventListener('pointerdown', onTrigger)
      window.removeEventListener('keydown', onTrigger)
    }

    function onTrigger() {
      if (cancelled || !nextMode) {
        return
      }

      cleanupTriggers()
      setMode(nextMode)
    }

    getPushConfig()
      .then((config) => {
        if (cancelled || !config?.enabled) {
          return
        }

        // Un permiso ya concedido no se vuelve a pedir: solo se
        // repara la suscripción si el navegador la perdió.
        const permission =
          typeof Notification === 'undefined'
            ? 'default'
            : Notification.permission

        if (permission === 'granted') {
          syncPushSubscription().catch(() => {})
          return
        }

        if (permission === 'denied') {
          return
        }

        nextMode = iosNeedsInstall ? 'ios' : 'ask'

        timer = setTimeout(onTrigger, PROMPT_DELAY_MS)
        window.addEventListener('scroll', onTrigger, {
          passive: true,
        })
        window.addEventListener('pointerdown', onTrigger)
        window.addEventListener('keydown', onTrigger)
      })
      .catch(() => {
        // Sin configuración pública no hay nada que ofrecer.
      })

    return () => {
      cancelled = true
      cleanupTriggers()
    }
  }, [pathname])

  useEffect(() => {
    if (mode) {
      primaryButtonRef.current?.focus()
    }
  }, [mode])

  function dismiss() {
    rememberPromptDismissal()
    setMode(null)
  }

  async function activate() {
    setIsBusy(true)
    setErrorMessage(null)

    try {
      const result = await subscribeToPush()

      if (result.status === 'granted') {
        setMode(null)
        return
      }

      if (result.status === 'denied') {
        setErrorMessage(
          'El navegador bloqueó las notificaciones. Podés habilitarlas desde la configuración del sitio.',
        )
        return
      }

      setErrorMessage(
        'No se activaron las notificaciones. Podés intentarlo de nuevo cuando quieras.',
      )
    } catch (error) {
      setErrorMessage(describeActivationError(error))
    } finally {
      setIsBusy(false)
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      dismiss()
    }
  }

  if (!mode) {
    return null
  }

  return (
    <div className="notification-prompt">
      <div
        className="notification-prompt__backdrop"
        onClick={dismiss}
        aria-hidden="true"
      />
      <div
        className="notification-prompt__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-prompt-title"
        aria-describedby="notification-prompt-description"
        onKeyDown={handleKeyDown}
      >
        <span className="notification-prompt__eyebrow">
          Avisos del negocio
        </span>
        <h2
          className="notification-prompt__title"
          id="notification-prompt-title"
        >
          ¿Querés recibir nuestros avisos?
        </h2>

        {mode === 'ios' ? (
          <div
            className="notification-prompt__body"
            id="notification-prompt-description"
          >
            <p>
              En iPhone o iPad los avisos solo funcionan si agregás el
              sitio a la pantalla de inicio:
            </p>
            <ol className="notification-prompt__steps">
              <li>Tocá el botón Compartir en Safari.</li>
              <li>Elegí “Agregar a pantalla de inicio”.</li>
              <li>Abrí el sitio desde ese ícono y activá los avisos.</li>
            </ol>
          </div>
        ) : (
          <p
            className="notification-prompt__body"
            id="notification-prompt-description"
          >
            Te avisamos cuando haya nacatamales disponibles, promociones
            o cambios de horario. Solo avisos del negocio.
          </p>
        )}

        {errorMessage && (
          <p className="notification-prompt__error" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="notification-prompt__actions">
          {mode === 'ask' ? (
            <>
              <button
                type="button"
                className="btn btn--primary"
                onClick={activate}
                disabled={isBusy}
                ref={primaryButtonRef}
              >
                {isBusy ? 'Activando…' : 'Activar notificaciones'}
              </button>
              <button
                type="button"
                className="btn btn--outline"
                onClick={dismiss}
                disabled={isBusy}
              >
                Ahora no
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={dismiss}
              ref={primaryButtonRef}
            >
              Entendido
            </button>
          )}
        </div>

        <p className="notification-prompt__note">
          Podés desactivarlas cuando quieras desde tu navegador.
        </p>
      </div>
    </div>
  )
}
