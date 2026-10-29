import { useEffect, useRef, useState } from 'react'
import { api } from '../../../api/client'
import { useAuth } from '../../../context/useAuth'
import './AssistantChat.css'

const SUGGESTIONS_BY_ROLE = {
  ADMIN: [
    '¿Cuál es la configuración actual del horario?',
    '¿Cuántos productos tengo?',
    '¿Qué avisos están activos?',
    'Muéstrame los videos ocultos.',
  ],
  EDITOR: [
    '¿Cuál es la configuración actual del horario?',
    '¿Cuántos productos tengo?',
    '¿Qué avisos están activos?',
    'Muéstrame los videos ocultos.',
  ],
}

const ERROR_MESSAGES = {
  ASSISTANT_DISABLED: 'El asistente está desactivado en este sitio.',
  ASSISTANT_CONVERSATION_NOT_FOUND:
    'Esa conversación ya no existe. Empezá una nueva.',
  ASSISTANT_CONVERSATION_FULL:
    'Esta conversación llegó al límite de 100 mensajes. Empezá una nueva.',
  ASSISTANT_TIMEOUT:
    'El asistente tardó demasiado. Intentá de nuevo.',
  ASSISTANT_PROVIDER_ERROR:
    'No se pudo generar una respuesta. Intentá de nuevo.',
  ASSISTANT_STREAM_INTERRUPTED:
    'La respuesta se interrumpió. Intentá de nuevo.',
  RATE_LIMIT_EXCEEDED:
    'Hiciste demasiadas consultas. Esperá un momento.',
}

function describeError(error) {
  if (error?.code && ERROR_MESSAGES[error.code]) {
    return ERROR_MESSAGES[error.code]
  }
  return error?.message || 'Ocurrió un error. Intentá de nuevo.'
}

function formatTime(value) {
  if (!value) {
    return ''
  }
  try {
    return new Date(value).toLocaleTimeString('es-NI', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function formatActionDate(value) {
  if (!value) {
    return 'Sin vencimiento'
  }

  try {
    return new Date(value).toLocaleString('es-NI', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return 'Sin vencimiento'
  }
}

function isActionExpired(expiresAt) {
  if (!expiresAt) {
    return false
  }

  try {
    return new Date(expiresAt).getTime() <= Date.now()
  } catch {
    return false
  }
}

export default function AssistantChat() {
  const { user } = useAuth()
  const role = user?.role === 'EDITOR' ? 'EDITOR' : 'ADMIN'

  const [status, setStatus] = useState(null)
  const [statusError, setStatusError] = useState(null)
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [pendingAction, setPendingAction] = useState(null)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [prunedId, setPrunedId] = useState(null)

  const inFlightRef = useRef(false)
  const confirmInFlightRef = useRef(false)
  const cancelInFlightRef = useRef(false)
  const composerRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setStatusError(null)

      try {
        const data = await api.get('/admin/assistant/status')
        if (cancelled) {
          return
        }
        setStatus(data)

        if (!data.enabled) {
          setIsLoading(false)
          return
        }

        const list = await api.get(
          '/admin/assistant/conversations?limit=20'
        )
        if (cancelled) {
          return
        }
        setConversations(list.conversations || [])
      } catch (error) {
        if (!cancelled) {
          setStatusError(describeError(error))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  async function loadConversation(conversationId) {
    setErrorMessage(null)
    setPendingAction(null)
    try {
      const data = await api.get(
        `/admin/assistant/conversations/${conversationId}/messages?limit=50`
      )
      setActiveId(conversationId)
      setMessages(data.messages || [])
    } catch (error) {
      setErrorMessage(describeError(error))
    }
  }

  function startNewConversation() {
    setActiveId(null)
    setMessages([])
    setPendingAction(null)
    setInput('')
    setErrorMessage(null)
    setPrunedId(null)
    composerRef.current?.focus()
  }

  function appendAssistantOutcome(content) {
    setMessages((previous) => [
      ...previous,
      { role: 'assistant', content },
    ])
  }

  async function handleSend(event) {
    event?.preventDefault?.()

    const text = input.trim()
    if (text === '' || inFlightRef.current) {
      return
    }

    inFlightRef.current = true
    setIsSending(true)
    setErrorMessage(null)
    const streamId = `assistant-stream-${Date.now()}`
    let streamedText = ''

    setMessages((previous) => [
      ...previous,
      { role: 'user', content: text, streamId },
    ])

    try {
      const requestBody = {
        conversationId: activeId ?? undefined,
        message: text,
      }
      const data = status?.capabilities?.supportsStreaming
        ? await api.streamPost(
            '/admin/assistant/messages/stream',
            requestBody,
            {
              onTextChunk: (chunk) => {
                streamedText += chunk
                setMessages((previous) => {
                  const streamIndex = previous.findIndex(
                    (message) =>
                      message.streamId === streamId &&
                      message.role === 'assistant',
                  )

                  if (streamIndex === -1) {
                    return [
                      ...previous,
                      {
                        role: 'assistant',
                        content: streamedText,
                        streamId,
                      },
                    ]
                  }

                  return previous.map((message, index) =>
                    index === streamIndex
                      ? { ...message, content: streamedText }
                      : message,
                  )
                })
              },
            },
          )
        : await api.post('/admin/assistant/messages', requestBody)

      if (activeId === null) {
        setActiveId(data.conversation.id)
        setConversations((previous) => [
          {
            id: data.conversation.id,
            title: data.conversation.title || text,
            createdAt: null,
            updatedAt: null,
          },
          ...previous,
        ])
      }

      setMessages((previous) => [
        ...previous.filter((message) => message.streamId !== streamId),
        { role: 'user', content: text },
        data.reply,
      ])
      setPendingAction(data.pendingAction || null)
      setInput('')

      if (data.prunedConversationId) {
        setPrunedId(data.prunedConversationId)
      }
    } catch (error) {
      setMessages((previous) =>
        previous.filter((message) => message.streamId !== streamId),
      )
      setErrorMessage(describeError(error))
    } finally {
      inFlightRef.current = false
      setIsSending(false)
      composerRef.current?.focus()
    }
  }

  async function handlePendingActionDecision(kind) {
    if (!pendingAction?.token) {
      return
    }

    const inFlightRefForKind =
      kind === 'confirm' ? confirmInFlightRef : cancelInFlightRef

    if (inFlightRefForKind.current) {
      return
    }

    inFlightRefForKind.current = true
    setErrorMessage(null)

    try {
      const method = kind === 'confirm' ? 'confirm' : 'cancel'
      const data = await api.post(
        `/admin/assistant/actions/${pendingAction.token}/${method}`,
        {}
      )

      if (kind === 'confirm') {
        const result = data?.result
        const isAvailable = result?.isAvailable
        const targetLabel = result?.target?.label || pendingAction.target?.label
        const message =
          isAvailable === true
            ? `La acción quedó confirmada: ${targetLabel} está disponible.`
            : isAvailable === false
              ? `La acción quedó confirmada: ${targetLabel} está no disponible.`
              : 'La acción quedó confirmada.'

        appendAssistantOutcome(message)
      } else {
        appendAssistantOutcome('La acción quedó cancelada.')
      }

      setPendingAction(null)
    } catch (error) {
      setErrorMessage(describeError(error))
    } finally {
      inFlightRefForKind.current = false
    }
  }

  function handleSuggestion(suggestion) {
    setInput(suggestion)
    composerRef.current?.focus()
  }

  if (isLoading) {
    return (
      <section className="assistant-chat assistant-chat--loading">
        <p>Cargando el asistente…</p>
      </section>
    )
  }

  if (statusError) {
    return (
      <section className="assistant-chat assistant-chat--error">
        <p role="alert">{statusError}</p>
      </section>
    )
  }

  if (!status?.enabled) {
    return (
      <section className="assistant-chat assistant-chat--disabled">
        <h2>Asistente desactivado</h2>
        <p>
          El asistente no está configurado en este sitio. Avisale al
          administrador si lo necesitás.
        </p>
      </section>
    )
  }

  const suggestions = SUGGESTIONS_BY_ROLE[role] || SUGGESTIONS_BY_ROLE.ADMIN

  return (
    <section className="assistant-chat">
      <header className="assistant-chat__header">
        <div>
          <h2>Asistente</h2>
          <p className="assistant-chat__notice">
            Consulta horarios y catálogos, y puede preparar cambios en
            productos, avisos, videos y categorías. Los cambios solo se
            aplican cuando los confirmás.
          </p>
        </div>
        <button
          type="button"
          className="assistant-chat__new"
          onClick={startNewConversation}
          disabled={isSending}
        >
          Nueva conversación
        </button>
      </header>

      {conversations.length > 0 && (
        <nav
          className="assistant-chat__conversations"
          aria-label="Conversaciones anteriores"
        >
          <ul>
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  className={
                    conversation.id === activeId
                      ? 'assistant-chat__conversation assistant-chat__conversation--active'
                      : 'assistant-chat__conversation'
                  }
                  onClick={() => loadConversation(conversation.id)}
                  disabled={isSending}
                >
                  {conversation.title || 'Sin título'}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {prunedId !== null && (
        <p className="assistant-chat__pruned" role="status">
          Se eliminó la conversación más antigua para mantener el límite de
          20 conversaciones.
        </p>
      )}

      <div
        className="assistant-chat__messages"
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="Mensajes del asistente"
      >
        {messages.length === 0 && (
          <p className="assistant-chat__empty">
            Empezá una conversación o elegí una sugerencia.
          </p>
        )}
        {messages.map((message, index) => (
          <article
            key={`${message.streamId || message.role}-${index}`}
            className={`assistant-chat__message assistant-chat__message--${message.role}`}
          >
            <span className="assistant-chat__role">
              {message.role === 'user' ? 'Vos' : 'Asistente'}
            </span>
            <p className="assistant-chat__content">
              {message.content}
            </p>
            {message.createdAt && (
              <time className="assistant-chat__time">
                {formatTime(message.createdAt)}
              </time>
            )}
          </article>
        ))}
      </div>

      {pendingAction && (
        <div
          className="assistant-chat__pending"
          role="status"
          aria-live="polite"
        >
          <h3>Confirmación pendiente</h3>
          <p className="assistant-chat__pending-summary">
            {pendingAction.summary || 'Hay una acción pendiente.'}
          </p>

          <dl className="assistant-chat__pending-meta">
            <div>
              <dt>Objetivo</dt>
              <dd>{pendingAction.target?.label || 'Objetivo no disponible'}</dd>
            </div>
            <div>
              <dt>Vence</dt>
              <dd>{formatActionDate(pendingAction.expiresAt)}</dd>
            </div>
          </dl>

          {pendingAction.changes?.length > 0 && (
            <div className="assistant-chat__pending-section">
              <h4>Cambio</h4>
              <ul>
                {pendingAction.changes.map((change, index) => (
                  <li key={`${change.field || 'change'}-${index}`}>
                    {change.field || 'campo'}: {String(change.from)} →{' '}
                    {String(change.to)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pendingAction.warnings?.length > 0 && (
            <div className="assistant-chat__pending-section assistant-chat__pending-section--warning">
              <h4>Advertencias</h4>
              <ul>
                {pendingAction.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {isActionExpired(pendingAction.expiresAt) && (
            <p className="assistant-chat__pending-expired">
              La confirmación venció. Pedila de nuevo.
            </p>
          )}

          <div className="assistant-chat__pending-actions">
            <button
              type="button"
              onClick={() => handlePendingActionDecision('confirm')}
              disabled={
                confirmInFlightRef.current ||
                cancelInFlightRef.current ||
                isActionExpired(pendingAction.expiresAt)
              }
            >
              {confirmInFlightRef.current ? 'Confirmando…' : 'Confirmar'}
            </button>
            <button
              type="button"
              className="assistant-chat__pending-cancel"
              onClick={() => handlePendingActionDecision('cancel')}
              disabled={
                confirmInFlightRef.current ||
                cancelInFlightRef.current ||
                isActionExpired(pendingAction.expiresAt)
              }
            >
              {cancelInFlightRef.current ? 'Cancelando…' : 'Cancelar'}
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <p className="assistant-chat__error" role="alert">
          {errorMessage}
        </p>
      )}

      <div className="assistant-chat__suggestions">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="assistant-chat__suggestion"
            onClick={() => handleSuggestion(suggestion)}
            disabled={isSending}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form
        className="assistant-chat__composer"
        onSubmit={handleSend}
      >
        <label className="assistant-chat__composer-label" htmlFor="assistant-input">
          Mensaje
        </label>
        <textarea
          id="assistant-input"
          ref={composerRef}
          className="assistant-chat__input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={2}
          maxLength={2000}
          disabled={isSending}
          placeholder="Escribí tu consulta…"
        />
        <button
          type="submit"
          className="assistant-chat__send"
          disabled={isSending || input.trim() === ''}
        >
          {isSending ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
    </section>
  )
}
