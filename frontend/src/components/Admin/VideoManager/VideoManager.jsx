import { useEffect, useRef, useState } from 'react'
import { api } from '../../../api/client'
import './VideoManager.css'

const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024
const POLL_INTERVAL_MS = 8000
const MAX_POLLS = 75

const STATUS_LABELS = {
  PENDING: 'En cola',
  UPLOADING: 'Subiendo',
  PROCESSING: 'Procesando en YouTube',
  READY: 'Listo',
  FAILED: 'Falló',
}

const EMPTY_FORM = {
  title: '',
  description: '',
  publishNow: true,
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Las cabeceras HTTP solo admiten una línea y caracteres Latin-1 (sin emojis).
function toHeaderSafe(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '')
    .trim()
}

function formatDate(isoString) {
  if (!isoString) {
    return ''
  }
  return new Date(isoString).toLocaleString('es-NI', { dateStyle: 'medium', timeStyle: 'short' })
}

function describeUploadError(error) {
  if (
    error.code === 'YOUTUBE_NOT_CONNECTED' ||
    error.code === 'YOUTUBE_REAUTH_REQUIRED' ||
    error.code === 'YOUTUBE_CHANNEL_MISMATCH'
  ) {
    return 'La cuenta de YouTube no está conectada. Avisale al administrador del sitio para que la reconecte.'
  }
  if (error.code === 'INVALID_VIDEO_FILE_TYPE') {
    return 'Solo se aceptan videos en formato MP4.'
  }
  if (error.code === 'INVALID_VIDEO_FILE_SIZE') {
    return 'El video pesa demasiado (máximo 2 GB).'
  }
  if (error.status === 429) {
    return 'Demasiados intentos seguidos. Esperá un momento e intentá de nuevo.'
  }
  if (error.code === 'YOUTUBE_UPLOAD_FAILED' || error.code === 'YOUTUBE_PROVIDER_ERROR') {
    return 'YouTube no pudo recibir el video. Intentá de nuevo en unos minutos.'
  }
  if (error instanceof TypeError) {
    return 'Se cortó la conexión durante la subida. Revisá tu internet e intentá de nuevo.'
  }
  return 'No se pudo subir el video.'
}

export default function VideoManager() {
  const [videos, setVideos] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const [infoMessage, setInfoMessage] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [file, setFile] = useState(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [stage, setStage] = useState('idle')
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  function loadVideos() {
    api
      .get('/admin/videos?limit=100&sortBy=createdAt&sortOrder=desc')
      .then((data) => {
        if (isMountedRef.current) {
          setVideos(data.videos || [])
        }
      })
      .catch(() => {
        if (isMountedRef.current) {
          setErrorMessage('No se pudieron cargar los videos.')
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setIsLoading(false)
        }
      })
  }

  useEffect(() => {
    loadVideos()
  }, [])

  const isBusy = stage !== 'idle'

  function resetForm() {
    setForm(EMPTY_FORM)
    setFile(null)
    setFileInputKey((key) => key + 1)
    setEditingId(null)
    setErrorMessage(null)
  }

  function startEdit(video) {
    setForm({
      title: video.title,
      description: video.description || '',
      publishNow: video.isActive,
    })
    setFile(null)
    setEditingId(video.id)
    setErrorMessage(null)
    setInfoMessage(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleFileChange(event) {
    const selected = event.target.files?.[0] || null
    setErrorMessage(null)

    if (selected && selected.type !== 'video/mp4') {
      setErrorMessage('Solo se aceptan videos en formato MP4.')
      setFile(null)
      setFileInputKey((key) => key + 1)
      return
    }

    if (selected && selected.size > MAX_VIDEO_BYTES) {
      setErrorMessage('El video pesa demasiado (máximo 2 GB).')
      setFile(null)
      setFileInputKey((key) => key + 1)
      return
    }

    setFile(selected)
  }

  async function waitUntilReady(videoId) {
    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      if (!isMountedRef.current) {
        return 'ABANDONED'
      }

      const result = await api.get(`/admin/videos/${videoId}/status`)

      if (result.uploadStatus === 'READY' || result.uploadStatus === 'FAILED') {
        return result.uploadStatus
      }

      await sleep(POLL_INTERVAL_MS)
    }

    return 'TIMEOUT'
  }

  async function handleEditSubmit() {
    setStage('saving')
    try {
      await api.patch(`/admin/videos/${editingId}`, {
        title: form.title.trim(),
        description: form.description.trim() === '' ? null : form.description.trim(),
      })
      resetForm()
      loadVideos()
    } catch {
      setErrorMessage('No se pudieron guardar los cambios.')
    } finally {
      setStage('idle')
    }
  }

  async function handleUploadSubmit() {
    if (!file) {
      setErrorMessage('Elegí un video en formato MP4.')
      return
    }

    const title = form.title.trim()
    const description = form.description.trim()

    setInfoMessage(null)
    setStage('uploading')

    try {
      const safeTitle = toHeaderSafe(title) || 'Video'
      const safeDescription = toHeaderSafe(description)
      const headers = { 'X-Video-Title': safeTitle }
      if (safeDescription) {
        headers['X-Video-Description'] = safeDescription
      }

      const { video } = await api.upload('/admin/videos/upload', file, headers)

      const titleNeedsFix = safeTitle !== title
      const descriptionNeedsFix = description !== '' && safeDescription !== description
      if (titleNeedsFix || descriptionNeedsFix) {
        const fix = { title }
        if (description !== '') {
          fix.description = description
        }
        await api.patch(`/admin/videos/${video.id}`, fix)
      }

      resetForm()
      loadVideos()

      if (isMountedRef.current) {
        setStage('processing')
      }

      const finalStatus = await waitUntilReady(video.id)

      if (finalStatus === 'READY') {
        if (form.publishNow) {
          await api.patch(`/admin/videos/${video.id}/status`, { isActive: true })
        }
        if (isMountedRef.current) {
          setInfoMessage(
            form.publishNow
              ? 'Tu video ya está listo y publicado en el sitio.'
              : 'Tu video ya está listo. Publicalo desde la lista cuando quieras.'
          )
        }
      } else if (finalStatus === 'FAILED') {
        if (isMountedRef.current) {
          setErrorMessage('YouTube no pudo procesar el video. Probá con otro archivo MP4.')
        }
      } else if (finalStatus === 'TIMEOUT') {
        if (isMountedRef.current) {
          setInfoMessage('YouTube todavía está procesando el video. Usá "Actualizar estado" en la lista más tarde.')
        }
      }

      loadVideos()
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(describeUploadError(error))
      }
    } finally {
      if (isMountedRef.current) {
        setStage('idle')
      }
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage(null)

    if (editingId) {
      handleEditSubmit()
    } else {
      handleUploadSubmit()
    }
  }

  async function togglePublished(video) {
    try {
      await api.patch(`/admin/videos/${video.id}/status`, { isActive: !video.isActive })
      loadVideos()
    } catch {
      setErrorMessage('No se pudo cambiar el estado del video.')
    }
  }

  async function refreshStatus(video) {
    setErrorMessage(null)
    try {
      await api.get(`/admin/videos/${video.id}/status`)
      loadVideos()
    } catch {
      setErrorMessage('No se pudo consultar el estado del video en YouTube.')
    }
  }

  return (
    <div className="video-manager">
      <form className="video-manager__form" onSubmit={handleSubmit}>
        <h3>{editingId ? 'Editar video' : 'Nuevo video'}</h3>

        {!editingId && (
          <div className="admin-field">
            <span>Archivo de video (MP4, máximo 2 GB)</span>
            <input key={fileInputKey} type="file" accept="video/mp4" onChange={handleFileChange} disabled={isBusy} />
            {file && <small className="video-manager__file-info">{file.name}</small>}
          </div>
        )}

        <label className="admin-field">
          <span>Título</span>
          <input
            type="text"
            value={form.title}
            maxLength={150}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            disabled={isBusy}
            required
          />
        </label>

        <label className="admin-field">
          <span>Texto de la publicación (opcional)</span>
          <textarea
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            rows={3}
            placeholder="Contá algo sobre este video…"
            disabled={isBusy}
          />
        </label>

        {!editingId && (
          <label className="video-manager__checkbox">
            <input
              type="checkbox"
              checked={form.publishNow}
              onChange={(event) => setForm((prev) => ({ ...prev, publishNow: event.target.checked }))}
              disabled={isBusy}
            />
            <span>Publicar cuando esté listo</span>
          </label>
        )}

        {stage === 'uploading' && (
          <div className="video-manager__progress">
            <div className="video-manager__progress-bar" />
            <p>Subiendo el video a YouTube. Puede tardar varios minutos, no cierres esta página.</p>
          </div>
        )}

        {stage === 'processing' && (
          <div className="video-manager__progress">
            <div className="video-manager__progress-bar" />
            <p>YouTube está procesando el video. Se publicará automáticamente al terminar.</p>
          </div>
        )}

        {infoMessage && <p className="video-manager__info">{infoMessage}</p>}
        {errorMessage && <p className="admin-error">{errorMessage}</p>}

        <div className="video-manager__form-actions">
          <button type="submit" className="btn btn--primary" disabled={isBusy}>
            {stage === 'uploading'
              ? 'Subiendo…'
              : stage === 'processing'
                ? 'Procesando…'
                : stage === 'saving'
                  ? 'Guardando…'
                  : editingId
                    ? 'Guardar cambios'
                    : 'Subir video'}
          </button>
          {editingId && (
            <button type="button" className="btn btn--outline" onClick={resetForm} disabled={isBusy}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="video-manager__list">
        {isLoading && <p className="admin-loading-inline">Cargando videos…</p>}

        {!isLoading && videos.length === 0 && <p className="admin-empty-inline">Todavía no subiste videos.</p>}

        {videos.map((video) => {
          const isReady = video.uploadStatus === 'READY'
          return (
            <div className="video-row" key={video.id}>
              <div className="video-row__thumb">
                {video.thumbnailUrl && <img src={video.thumbnailUrl} alt={video.title} />}
              </div>
              <div className="video-row__body">
                <strong>{video.title}</strong>
                <span>
                  {formatDate(video.createdAt)}
                  {!isReady && ` · ${STATUS_LABELS[video.uploadStatus] || video.uploadStatus}`}
                </span>
              </div>
              <span className={video.isActive ? 'status-pill status-pill--active' : 'status-pill'}>
                {video.isActive ? 'Publicado' : 'Oculto'}
              </span>
              <div className="video-row__actions">
                <button type="button" className="btn-link" onClick={() => startEdit(video)}>
                  Editar
                </button>
                <button type="button" className="btn-link" onClick={() => togglePublished(video)}>
                  {video.isActive ? 'Ocultar' : 'Publicar'}
                </button>
                {!isReady && (
                  <button type="button" className="btn-link" onClick={() => refreshStatus(video)}>
                    Actualizar estado
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}