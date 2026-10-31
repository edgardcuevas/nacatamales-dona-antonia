import { useEffect, useRef, useState } from 'react'
import { api } from '../../../api/client'
import { useAuth } from '../../../context/useAuth'
import AssistantMarkdown from './AssistantMarkdown'
import { describeActionChange } from './assistantFormat'
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
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(null)
  const [lastSubmitted, setLastSubmitted] = useState('')

  const inFlightRef = useRef(false)
  const confirmInFlightRef = useRef(false)
  const cancelInFlightRef = useRef(false)
  const composerRef = useRef(null)
  const listRef = useRef(null)
  const abortControllerRef = useRef(null)
  const isNearBottomRef = useRef(true)

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
          '/admin/assistant/conversations?limit=20',
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
    if (listRef.current && isNearBottomRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (!pendingAction?.expiresAt) {
      return undefined
    }

    const tick = () => {
      const remaining = new Date(pendingAction.expiresAt).getTime() - Date.now()
      setSecondsLeft(Math.max(0, Math.ceil(remaining / 1000)))
    }
    const timeout = setTimeout(tick, 0)
    const interval = setInterval(tick, 1000)
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [pendingAction?.expiresAt])

  function handleMessagesScroll() {
    const element = listRef.current
    if (!element) {
      return
    }
    const near =
      element.scrollHeight - element.scrollTop - element.clientHeight < 80
    isNearBottomRef.current = near
    setShowScrollButton(!near)
  }

  function scrollToBottom() {
    const element = listRef.current
    if (!element) {
      return
    }
    element.scrollTop = element.scrollHeight
    isNearBottomRef.current = true
    setShowScrollButton(false)
  }

  async function loadConversation(conversationId) {
    setErrorMessage(null)
    setPendingAction(null)
    try {
      const data = await api.get(
        `/admin/assistant/conversations/${conversationId}/messages?limit=50`,
      )
      setActiveId(conversationId)
      setMessages(data.messages || [])
      isNearBottomRef.current = true
      setShowScrollButton(false)
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
    isNearBottomRef.current = true
    setShowScrollButton(false)
    composerRef.current?.focus()
  }

  function appendAssistantOutcome(content) {
    setMessages((previous) => [
      ...previous,
      { role: 'assistant', content },
    ])
  }

  async function submitMessage(text) {
    if (text === '' || inFlightRef.current) {
      return
    }

    setLastSubmitted(text)
    inFlightRef.current = true
    setIsSending(true)
    setErrorMessage(null)
    const streamId = `assistant-stream-${Date.now()}`
    let streamedText = ''
    const controller = new AbortController()
    abortControllerRef.current = controller

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
              signal: controller.signal,
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
      if (error?.name !== 'AbortError') {
        setMessages((previous) =>
          previous.filter((message) => message.streamId !== streamId),
        )
        setErrorMessage(describeError(error))
      }
    } finally {
      inFlightRef.current = false
      setIsSending(false)
      abortControllerRef.current = null
      composerRef.current?.focus()
    }
  }

  function handleSend(event) {
    event?.preventDefault?.()
    submitMessage(input.trim())
  }

  function handleRetry() {
    if (lastSubmitted) {
      submitMessage(lastSubmitted)
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort()
  }

  async function handleCopy(text) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      }
    } catch {
      /* ignore: clipboard may be unavailable in some browsers */
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  function handleInputChange(event) {
    setInput(event.target.value)
    const element = event.target
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`
  }

  async function handlePendingActionDecision(kind) {
    if (!pendingAction?.token) {
      return
    }

    if (confirming || cancelling) {
      return
    }

    if (kind === 'confirm') {
      confirmInFlightRef.current = true
      setConfirming(true)
    } else {
      cancelInFlightRef.current = true
      setCancelling(true)
    }
    setErrorMessage(null)

    try {
      const method = kind === 'confirm' ? 'confirm' : 'cancel'
      const data = await api.post(
        `/admin/assistant/actions/${pendingAction.token}/${method}`,
        {},
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
      if (kind === 'confirm') {
        confirmInFlightRef.current = false
        setConfirming(false)
      } else {
        cancelInFlightRef.current = false
        setCancelling(false)
      }
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
  const hasSidebar = conversations.length > 0

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
          className="btn btn--outline assistant-chat__new"
          onClick={startNewConversation}
          disabled={isSending}
        >
          Nueva conversación
        </button>
      </header>

      <div
        className={
          hasSidebar
            ? 'assistant-chat__body assistant-chat__body--with-sidebar'
            : 'assistant-chat__body'
        }
      >
        {hasSidebar && (
          <nav
            className="assistant-chat__conversations assistant-chat__sidebar"
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

        <div className="assistant-chat__main">
          <div
            className="assistant-chat__messages"
            ref={listRef}
            role="log"
            aria-live="polite"
            aria-label="Mensajes del asistente"
            onScroll={handleMessagesScroll}
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
                <span
                  className="assistant-chat__avatar"
                  aria-hidden="true"
                >
                  {message.role === 'user'
                    ? (user?.email?.charAt(0).toUpperCase() || 'V')
                    : 'A'}
                </span>
                <div className="assistant-chat__message-body">
                  <span className="assistant-chat__role">
                    {message.role === 'user' ? 'Vos' : 'Asistente'}
                  </span>
                  <div className="assistant-chat__content">
                    {message.role === 'assistant' ? (
                      <AssistantMarkdown content={message.content} />
                    ) : (
                      message.content
                    )}
                  </div>
                  {message.role === 'assistant' && (
                    <button
                      type="button"
                      className="assistant-chat__copy"
                      onClick={() => handleCopy(message.content)}
                    >
                      Copiar
                    </button>
                  )}
                  {message.createdAt && (
                    <time className="assistant-chat__time">
                      {formatTime(message.createdAt)}
                    </time>
                  )}
                </div>
              </article>
            ))}
            {isSending &&
              !messages.some(
                (message) =>
                  message.role === 'assistant' && message.streamId,
              ) && (
                <article className="assistant-chat__message assistant-chat__message--assistant">
                  <span
                    className="assistant-chat__avatar"
                    aria-hidden="true"
                  >
                    A
                  </span>
                  <div className="assistant-chat__message-body">
                    <span className="assistant-chat__role">Asistente</span>
                    <p className="assistant-chat__content assistant-chat__content--typing">
                      <span className="assistant-chat__dot" />
                      <span className="assistant-chat__dot" />
                      <span className="assistant-chat__dot" />
                    </p>
                  </div>
                </article>
              )}
          </div>

          {showScrollButton && (
            <button
              type="button"
              className="assistant-chat__scroll-bottom"
              onClick={scrollToBottom}
            >
              Ir al final
            </button>
          )}

          {prunedId !== null && (
            <p className="assistant-chat__pruned" role="status">
              Se eliminó la conversación más antigua para mantener el límite de
              20 conversaciones.
            </p>
          )}

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
                    {pendingAction.changes.map((change, index) => {
                      const described = describeActionChange(
                        change,
                        pendingAction.target?.type,
                      )
                      if (!described) {
                        return null
                      }
                      return (
                        <li key={`${change.field || 'change'}-${index}`}>
                          {described.label}: {described.from} → {described.to}
                        </li>
                      )
                    })}
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

              {secondsLeft !== null &&
                !isActionExpired(pendingAction.expiresAt) && (
                  <p className="assistant-chat__pending-countdown">
                    Vence en {secondsLeft}s
                  </p>
                )}

              <div className="assistant-chat__pending-actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => handlePendingActionDecision('confirm')}
                  disabled={
                    confirming ||
                    cancelling ||
                    isActionExpired(pendingAction.expiresAt)
                  }
                >
                  {confirming ? 'Confirmando…' : 'Confirmar'}
                </button>
                <button
                  type="button"
                  className="btn btn--outline assistant-chat__pending-cancel"
                  onClick={() => handlePendingActionDecision('cancel')}
                  disabled={
                    confirming ||
                    cancelling ||
                    isActionExpired(pendingAction.expiresAt)
                  }
                >
                  {cancelling ? 'Cancelando…' : 'Cancelar'}
                </button>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="assistant-chat__error-block">
              <p className="assistant-chat__error" role="alert">
                {errorMessage}
              </p>
              {lastSubmitted && (
                <button
                  type="button"
                  className="btn btn--outline assistant-chat__retry"
                  onClick={handleRetry}
                  disabled={isSending}
                >
                  Reintentar
                </button>
              )}
            </div>
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
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={2}
              maxLength={2000}
              disabled={isSending}
              placeholder="Escribí tu consulta…"
            />
            <div className="assistant-chat__composer-footer">
              <span className="assistant-chat__counter">
                {input.trim().length} / 2000
              </span>
              <div className="assistant-chat__composer-actions">
                {isSending && status?.capabilities?.supportsStreaming && (
                  <button
                    type="button"
                    className="btn btn--outline"
                    onClick={handleStop}
                  >
                    Detener
                  </button>
                )}
                <button
                  type="submit"
                  className="btn btn--primary assistant-chat__send"
                  disabled={isSending || input.trim() === ''}
                >
                  {isSending ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}