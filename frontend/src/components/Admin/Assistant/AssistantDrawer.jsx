import { useEffect, useRef, useState } from 'react'
import { api } from '../../../api/client'
import AssistantChat from './AssistantChat'
import './AssistantDrawer.css'

export default function AssistantDrawer({ activeSection }) {
  const [status, setStatus] = useState(null)
  const [statusLoaded, setStatusLoaded] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)
  const fabRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    api
      .get('/admin/assistant/status')
      .then((data) => {
        if (!cancelled) {
          setStatus(data)
          setStatusLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatusLoaded(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        fabRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }
    const timeout = setTimeout(() => {
      const input = document.querySelector(
        '.assistant-drawer__panel textarea#assistant-input',
      )
      input?.focus()
    }, 50)
    return () => clearTimeout(timeout)
  }, [isOpen])

  // La seccion "Asistente" ya monta su propio chat: no duplicamos.
  if (activeSection === 'assistant') {
    return null
  }

  if (!statusLoaded || !status?.enabled) {
    return null
  }

  function open() {
    setHasOpened(true)
    setIsOpen(true)
  }

  function close() {
    setIsOpen(false)
    fabRef.current?.focus()
  }

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className="assistant-drawer__fab"
        onClick={open}
        disabled={isOpen}
        aria-expanded={isOpen}
        aria-label="Abrir asistente"
      >
        Asistente
      </button>

      {hasOpened && (
        <div
          className="assistant-drawer__overlay"
          hidden={!isOpen}
          aria-hidden={!isOpen}
        >
          <aside
            className="assistant-drawer__panel"
            role="dialog"
            aria-modal="false"
            aria-label="Asistente"
            hidden={!isOpen}
          >
            <header className="assistant-drawer__header">
              <h2>Asistente</h2>
              <button
                type="button"
                className="btn btn--outline"
                onClick={close}
              >
                Cerrar
              </button>
            </header>
            <div className="assistant-drawer__body">
              <AssistantChat />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}