import { useEffect, useRef, useState } from 'react'
import { api } from '../../../api/client'
import { uploadVideoThumbnail, revertVideoThumbnail } from '../../../utils/mediaUpload'
import ThumbnailImage from '../../ThumbnailImage/ThumbnailImage'
import VideoThumbnailField from './VideoThumbnailField'
import './VideoManager.css'

const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024
// 60 polls at 10s is the same 10 minute wait the old 75-at-8s pair
// intended, at 20% fewer provider calls. The ceiling is deliberately
// kept under YOUTUBE_STATUS_MAX_REQUESTS: polling past it would turn
// the friendly "still processing" message into a 429.
const POLL_INTERVAL_MS = 10000
const MAX_POLLS = 60
// A failed poll must not abort the whole wait, because the video may
// already be processed. After this many consecutive failures the wait
// degrades to TIMEOUT instead of surfacing a misleading upload error.
const MAX_CONSECUTIVE_POLL_FAILURES = 3
// Cadence used to advance upload_status on rows the browser is not
// actively polling.
const STATUS_REFRESH_INTERVAL_MS = 20000
// Fallos seguidos del refresco antes de avisarle al admin. Uno suelto se
// reintenta solo en el siguiente tic y solo haria ruido.
const MAX_REFRESH_FAILURES_BEFORE_REPORTING = 3

// Revokes a preview URL only when it is the one currently tracked, so
// clearing the form can never revoke a newer preview.
function releaseObjectUrl(url, ref) {
  if (!url || !ref.current || ref.current !== url) {
    return
  }
  URL.revokeObjectURL(url)
  ref.current = null
}

const STATUS_LABELS = {
  PENDING: 'En cola',
  UPLOADING: 'Subiendo',
  PROCESSING: 'Procesando en YouTube',
  READY: 'Listo',
  FAILED: 'Falló',
  DELETED: 'Eliminado de YouTube',
}

// READY is the only other terminal state. DELETED means the remote
// resource is gone, so the status endpoint answers 410 VIDEO_REMOTE_DELETED
// for good: polling it again could never succeed and would keep spending
// the quota that a video still processing needs.
const TERMINAL_UPLOAD_STATUSES = new Set(['READY', 'DELETED'])

function isPollableStatus(uploadStatus) {
  return !TERMINAL_UPLOAD_STATUSES.has(uploadStatus)
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

function describeThumbnailError(error) {
  if (
    error.code === 'YOUTUBE_NOT_CONNECTED' ||
    error.code === 'YOUTUBE_REAUTH_REQUIRED' ||
    error.code === 'YOUTUBE_CHANNEL_MISMATCH'
  ) {
    return 'La cuenta de YouTube no está conectada. Avisale al administrador del sitio para que la reconecte.'
  }
  if (error.code === 'VIDEO_THUMBNAIL_NOT_READY') {
    return 'YouTube todavía está procesando el video. Cambiá la miniatura cuando esté listo.'
  }
  if (error.code === 'YOUTUBE_THUMBNAIL_NOT_PERMITTED') {
    return 'Este canal de YouTube no puede cambiar esa miniatura.'
  }
  if (
    error.code === 'INVALID_VIDEO_THUMBNAIL_TYPE' ||
    error.code === 'INVALID_VIDEO_THUMBNAIL_IMAGE' ||
    error.code === 'INVALID_VIDEO_THUMBNAIL'
  ) {
    return 'YouTube no aceptó la imagen. Probá con una JPG.'
  }
  if (
    error.code === 'INVALID_VIDEO_THUMBNAIL_SIZE' ||
    error.code === 'VIDEO_THUMBNAIL_SIZE_REQUIRED'
  ) {
    return 'La miniatura pesa demasiado. Probá con una imagen más chica.'
  }
  if (
    error.code === 'YOUTUBE_THUMBNAIL_RATE_LIMITED' ||
    error.status === 429
  ) {
    return 'YouTube limitó los cambios de miniatura. Esperá un momento e intentá de nuevo.'
  }
  if (error.code === 'VIDEO_PROVIDER_NOT_YOUTUBE') {
    return 'Este video no es de YouTube, así que no admite miniatura propia.'
  }
  if (error.code === 'VIDEO_NOT_FOUND') {
    return 'Ese video ya no existe.'
  }
  if (error.code === 'YOUTUBE_THUMBNAIL_FAILED' || error.code === 'YOUTUBE_PROVIDER_ERROR') {
    return 'YouTube no pudo cambiar la miniatura. Intentá de nuevo en unos minutos.'
  }
  if (error instanceof TypeError) {
    return 'Se cortó la conexión al cambiar la miniatura. Revisá tu internet.'
  }
  return 'No se pudo cambiar la miniatura.'
}

// Publicar exige dos cosas en el servidor: isActive=true lanza 410 si el
// recurso remoto ya no existe y 409 si el video aun no esta READY. Ocultar,
// en cambio, siempre se acepta.
function describePublishError(error) {
  if (error.code === 'VIDEO_REMOTE_DELETED') {
    return 'Ese video ya no existe en YouTube, así que no se puede publicar.'
  }
  if (error.code === 'VIDEO_NOT_READY') {
    return 'YouTube todavía está procesando el video. Podés publicarlo cuando aparezca "Listo".'
  }
  if (error instanceof TypeError) {
    return 'Se cortó la conexión al cambiar el estado del video. Revisá tu internet.'
  }
  return 'No se pudo cambiar el estado del video.'
}

function describeRefreshError(error, video) {
  if (error.code === 'VIDEO_REMOTE_DELETED') {
    return `"${video.title}" ya no existe en YouTube. Dejamos de consultarlo hasta que actualices la página.`
  }
  if (error.status === 429) {
    return 'YouTube está limitando las consultas de estado. La lista se sigue actualizando, pero más despacio.'
  }
  if (error instanceof TypeError) {
    return 'Se cortó la conexión al consultar el estado de los videos. Revisá tu internet.'
  }
  return `No se pudo consultar el estado de "${video.title}" en YouTube. La lista se sigue actualizando.`
}

export default function VideoManager({ navigate = (url) => window.location.assign(url) } = {}) {
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
  // Vive fuera del efecto porque cada loadVideos() vuelve a crear el
  // intervalo: un cursor local al efecto reiniciaría en cero y siempre
  // preguntaría por la misma primera fila.
  const pendingCursorRef = useRef(0)
  // Fallos consecutivos del refresco automatico. El bucle no se detiene
  // por uno suelto (eso se reintenta solo en el siguiente tic), pero un
  // 410 o un 429 sostenidos tienen que verse: sin esto el admin mira una
  // fila congelada en "Procesando en YouTube" sin ninguna pista.
  const refreshFailuresRef = useRef(0)
  // Filas que el servidor ya declaro perdidas durante esta sesion. Un 410
  // no viene del proveedor (mapYoutubeError nunca lo produce) sino del
  // estado DELETED en la base, asi que la respuesta no va a cambiar: la
  // fila se deja de consultar igual que una ya marcada DELETED.
  const remotelyGoneIdsRef = useRef(new Set())
  // Guardas de reentrada para las dos peticiones caras. El boton ya se
  // deshabilita con isBusy, pero eso depende de un re-render; el ref
  // cierra la ventana entre el clic y ese re-render, igual que ya hace
  // reconnectInFlightRef para la reconexion de YouTube.
  const uploadInFlightRef = useRef(false)
  const rowThumbnailInFlightRef = useRef(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [reconnectErrorMessage, setReconnectErrorMessage] = useState(null)
  const reconnectInFlightRef = useRef(false)

  // Thumbnail chosen in the form. It is a File already downscaled to
  // 1280x720 JPEG, ready to send once the video reaches READY.
  const [thumbnailFile, setThumbnailFile] = useState(null)
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState(null)
  const thumbnailObjectUrlRef = useRef(null)

  // Row-level thumbnail editor for videos that are already stored.
  const [rowThumbnail, setRowThumbnail] = useState(null)
  const rowThumbnailObjectUrlRef = useRef(null)
  const [revertingVideoId, setRevertingVideoId] = useState(null)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      releaseObjectUrl(thumbnailObjectUrlRef.current, thumbnailObjectUrlRef)
      releaseObjectUrl(rowThumbnailObjectUrlRef.current, rowThumbnailObjectUrlRef)
    }
  }, [])

  // Declara antes del efecto que la invoca: el hoisting de las funciones
  // lo resolveria en runtime, pero el lint lo marca como acceso antes de
  // declaracion, y ademas su ubicacion aqui es lo natural porque forma
  // parte del bucle de refresco.
  function reportRefreshFailure(error, video) {
    refreshFailuresRef.current += 1

    if (error.code === 'VIDEO_REMOTE_DELETED') {
      remotelyGoneIdsRef.current.add(video.id)
    }

    if (
      refreshFailuresRef.current < MAX_REFRESH_FAILURES_BEFORE_REPORTING
    ) {
      return
    }

    setErrorMessage(describeRefreshError(error, video))
  }

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

  // The row badge renders upload_status straight from the database, and
  // "Cambiar miniatura" only appears once the video is READY. Without
  // this the row would sit on "Procesando en YouTube" forever whenever
  // the upload poll ends before YouTube finishes. Only pollable videos
  // are polled, so the loop stops on its own once nothing is in flight.
  //
  // DELETED is excluded here and not merely after the fact: its status
  // endpoint answers 410 for good, so a DELETED row would otherwise keep
  // this timer alive forever, refreshing a list that can never change
  // and spending quota no other video can use.
  //
  // It stays paused while an upload is in progress: waitUntilReady is
  // already polling that same video every 10s, and running both loops
  // would spend 135 requests per window against a 120 ceiling.
  //
  // Both loops share the single status rate-limit store (120 per 15 min),
  // and waitUntilReady can already spend 60 of them, so this one spends a
  // flat amount whatever the backlog is. POLL_INTERVAL_MS, MAX_POLLS and
  // MAX_CONSECUTIVE_POLL_FAILURES stay where they are: how long the panel
  // takes to say "Listo" is a UX decision, not a quota one.
  useEffect(() => {
    const pendingVideos = videos.filter(
      (video) =>
        isPollableStatus(video.uploadStatus) &&
        !remotelyGoneIdsRef.current.has(video.id)
    )

    if (pendingVideos.length === 0 || stage !== 'idle') {
      return
    }

    let cancelled = false

    const timer = setInterval(() => {
      if (cancelled || !isMountedRef.current) {
        return
      }

      // Una sola fila por tic, en round-robin, y no todas a la vez.
      // Preguntar a todas multiplicaba el gasto por el número de
      // pendientes: con tres filas esperando y una subida que ya había
      // agotado sus 60 intentos, la ventana de 15 minutos se pasaba del
      // techo de 120 y la siguiente subida se comía el 429. Con una fila
      // por tic el gasto deja de depender de cuántas haya, y ninguna fila
      // se queda sin revisar porque el cursor es circular.
      const video = pendingVideos[pendingCursorRef.current % pendingVideos.length]
      pendingCursorRef.current += 1

      // El.then de exito y el de fallo van en la misma llamada para que el
      // contador se reinicie SOLO cuando la consulta fue bien. Poner la
      // reiniciacion en un .then aparte la ejecutaria tambien tras un
      // fallo (el catch devuelve null y deja la promesa resuelta), y el
      // contador jamas llegaria al umbral.
      api
        .get(`/admin/videos/${video.id}/status`)
        .then(
          () => {
            refreshFailuresRef.current = 0
          },
          (error) => {
            if (isMountedRef.current) {
              reportRefreshFailure(error, video)
            }
          }
        )
        .then(() => {
          // La lista se recarga igual: el fallo fue del status, no del
          // listado, y el resto de las filas pudo haber cambiado.
          if (!cancelled && isMountedRef.current) {
            loadVideos()
          }
        })
    }, STATUS_REFRESH_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [videos, stage])

  const isBusy = stage !== 'idle'

  async function handleReconnectYouTube() {
    if (reconnectInFlightRef.current) {
      return
    }

    reconnectInFlightRef.current = true
    setIsReconnecting(true)
    setReconnectErrorMessage(null)

    try {
      const data = await api.get('/admin/youtube/connect')
      const authorizationUrl = data?.authorizationUrl
      if (typeof authorizationUrl !== 'string' || authorizationUrl.trim() === '') {
        throw new Error('Invalid authorization URL')
      }

      const parsedUrl = new URL(authorizationUrl)
      if (
        parsedUrl.protocol !== 'https:' ||
        parsedUrl.host !== 'accounts.google.com' ||
        parsedUrl.username !== '' ||
        parsedUrl.password !== ''
      ) {
        throw new Error('Invalid authorization URL')
      }

      if (isMountedRef.current) {
        navigate(authorizationUrl)
      }
    } catch {
      if (isMountedRef.current) {
        setReconnectErrorMessage(
          'No se pudo iniciar la reconexión de YouTube. Revisá tu conexión e intentá de nuevo.'
        )
      }
    } finally {
      reconnectInFlightRef.current = false
      if (isMountedRef.current) {
        setIsReconnecting(false)
      }
    }
  }

  function releaseThumbnailPreview() {
    releaseObjectUrl(thumbnailObjectUrlRef.current, thumbnailObjectUrlRef)
  }

  function releaseRowThumbnailPreview() {
    releaseObjectUrl(rowThumbnailObjectUrlRef.current, rowThumbnailObjectUrlRef)
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setFile(null)
    setFileInputKey((key) => key + 1)
    setEditingId(null)
    setErrorMessage(null)
    releaseThumbnailPreview()
    setThumbnailFile(null)
    setThumbnailPreviewUrl(null)
  }

  function handleThumbnailSelected(scaledFile) {
    releaseThumbnailPreview()
    const objectUrl = URL.createObjectURL(scaledFile)
    thumbnailObjectUrlRef.current = objectUrl
    setThumbnailFile(scaledFile)
    setThumbnailPreviewUrl(objectUrl)
  }

  function handleThumbnailRemoved() {
    releaseThumbnailPreview()
    setThumbnailFile(null)
    setThumbnailPreviewUrl(null)
  }

  // Row editor state is kept in one object so the preview URL and the
  // staged file can never disagree.
  function openRowThumbnail(video) {
    releaseRowThumbnailPreview()
    setRowThumbnail({
      ...video,
      pendingFile: null,
      previewUrl: null,
    })
  }

  function closeRowThumbnail() {
    releaseRowThumbnailPreview()
    setRowThumbnail(null)
  }

  function handleRowThumbnailSelected(scaledFile) {
    releaseRowThumbnailPreview()
    const objectUrl = URL.createObjectURL(scaledFile)
    rowThumbnailObjectUrlRef.current = objectUrl
    setRowThumbnail((current) =>
      current
        ? { ...current, pendingFile: scaledFile, previewUrl: objectUrl }
        : current
    )
  }

  function handleRowThumbnailRemoved() {
    releaseRowThumbnailPreview()
    setRowThumbnail((current) =>
      current
        ? { ...current, pendingFile: null, previewUrl: null }
        : current
    )
  }

  async function handleRowThumbnailSubmit() {
    if (rowThumbnailInFlightRef.current || !rowThumbnail?.pendingFile) {
      return
    }

    const videoId = rowThumbnail.id
    rowThumbnailInFlightRef.current = true
    setErrorMessage(null)
    setInfoMessage(null)
    setStage('saving')

    try {
      await uploadVideoThumbnail(videoId, rowThumbnail.pendingFile)
      closeRowThumbnail()
      loadVideos()
      if (isMountedRef.current) {
        setInfoMessage('La miniatura se actualizó en YouTube y en el sitio.')
      }
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(describeThumbnailError(error))
      }
    } finally {
      rowThumbnailInFlightRef.current = false
      if (isMountedRef.current) {
        setStage('idle')
      }
    }
  }

  async function handleRevertThumbnail(video) {
    setErrorMessage(null)
    setInfoMessage(null)
    setRevertingVideoId(video.id)

    try {
      await revertVideoThumbnail(video.id)
      loadVideos()
      if (isMountedRef.current) {
        setInfoMessage('Se restauró la miniatura que elige YouTube.')
      }
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(describeThumbnailError(error))
      }
    } finally {
      if (isMountedRef.current) {
        setRevertingVideoId(null)
      }
    }
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
    let consecutiveFailures = 0

    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      if (!isMountedRef.current) {
        return 'ABANDONED'
      }

      let result
      try {
        result = await api.get(`/admin/videos/${videoId}/status`)
        consecutiveFailures = 0
      } catch {
        // Keep waiting: a rate limit or a dropped connection says
        // nothing about the provider state. Only a sustained failure
        // ends the wait, and it ends in TIMEOUT so the caller always
        // reaches a defined branch.
        consecutiveFailures += 1
        if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
          return 'TIMEOUT'
        }
      }

      if (result?.uploadStatus === 'READY' || result?.uploadStatus === 'FAILED') {
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
    if (uploadInFlightRef.current) {
      return
    }

    if (!file) {
      setErrorMessage('Elegí un video en formato MP4.')
      return
    }

    const title = form.title.trim()
    const description = form.description.trim()

    uploadInFlightRef.current = true
    setInfoMessage(null)
    setErrorMessage(null)
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

      // Captured before resetForm() clears the staged thumbnail, and
      // released together with the form preview.
      const selectedThumbnail = thumbnailFile
      const selectedThumbnailPreviewUrl = thumbnailPreviewUrl

      resetForm()
      loadVideos()

      if (isMountedRef.current) {
        setStage('processing')
      }

      const finalStatus = await waitUntilReady(video.id)

      if (finalStatus === 'READY') {
        // A custom thumbnail can only be applied to a processed video,
        // so it happens here and never before. A failure here must not
        // block publishing the video itself.
        if (selectedThumbnail) {
          releaseObjectUrl(selectedThumbnailPreviewUrl, thumbnailObjectUrlRef)
          try {
            await uploadVideoThumbnail(video.id, selectedThumbnail)
          } catch (error) {
            if (isMountedRef.current) {
              setErrorMessage(describeThumbnailError(error))
            }
          }
        }

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
      } else if (finalStatus === 'TIMEOUT' || finalStatus === 'ABANDONED') {
        // ABANDONED means the component went away mid-wait, so this
        // rarely renders, but leaving it unhandled made the branch
        // fall through silently. The list refreshes pending rows on its
        // own now, and the thumbnail editor unlocks once READY.
        if (isMountedRef.current) {
          setInfoMessage('YouTube todavía está procesando el video. La lista va a actualizarse sola; cuando aparezca "Listo" podés cambiar la miniatura.')
        }
      }

      loadVideos()
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(describeUploadError(error))
      }
    } finally {
      uploadInFlightRef.current = false
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
    } catch (error) {
      setErrorMessage(describePublishError(error))
    }
  }

  async function refreshStatus(video) {
    setErrorMessage(null)

    // The button is already hidden for a terminal row, but the handler is
    // the second consumer of that same rule and it must not be reachable
    // for a video whose remote resource no longer exists.
    if (!isPollableStatus(video.uploadStatus)) {
      setErrorMessage('Ese video ya no está pendiente, así que no hay estado que consultar.')
      return
    }

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
        <div className="video-manager__reconnect">
          <button
            type="button"
            className="btn btn--outline"
            onClick={handleReconnectYouTube}
            disabled={isBusy || isReconnecting}
          >
            {isReconnecting ? 'Conectando…' : 'Reconectar YouTube'}
          </button>
          {reconnectErrorMessage && (
            <p className="admin-error" role="alert">
              {reconnectErrorMessage}
            </p>
          )}
        </div>

        {!editingId && (
          <div className="admin-field">
            <span>Archivo de video (MP4, máximo 2 GB)</span>
            <input key={fileInputKey} type="file" accept="video/mp4" onChange={handleFileChange} disabled={isBusy} />
            {file && <small className="video-manager__file-info">{file.name}</small>}
          </div>
        )}

          {!editingId && (
          <div className="admin-field">
            <span>Miniatura (opcional)</span>
            <VideoThumbnailField
              previewUrl={thumbnailPreviewUrl}
              file={thumbnailFile}
              onFileSelected={handleThumbnailSelected}
              onRemove={thumbnailPreviewUrl ? handleThumbnailRemoved : null}
              isBusy={isBusy}
            />
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
          // A deleted row is terminal, so every action that waits on
          // YouTube stays hidden: its status endpoint would only ever
          // answer 410 and its thumbnail is already gone.
          const isPending = isPollableStatus(video.uploadStatus)
          return (
            <div className="video-row" key={video.id}>
              <div className="video-row__thumb">
                {video.thumbnailUrl && (
                  <ThumbnailImage
                    key={video.thumbnailUrl}
                    src={video.thumbnailUrl}
                    alt={video.title}
                  />
                )}
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
                {(video.isActive || isReady) && (
                  <button type="button" className="btn-link" onClick={() => togglePublished(video)}>
                    {video.isActive ? 'Ocultar' : 'Publicar'}
                  </button>
                )}
                {isPending && (
                  <button type="button" className="btn-link" onClick={() => refreshStatus(video)}>
                    Actualizar estado
                  </button>
                )}
                {isReady && rowThumbnail?.id !== video.id && (
                  <button type="button" className="btn-link" onClick={() => openRowThumbnail(video)}>
                    Cambiar miniatura
                  </button>
                )}
                {isReady && video.thumbnailSource === 'CUSTOM' && rowThumbnail?.id !== video.id && (
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => handleRevertThumbnail(video)}
                    disabled={revertingVideoId === video.id}
                  >
                    {revertingVideoId === video.id ? 'Restaurando…' : 'Usar la de YouTube'}
                  </button>
                )}
              </div>

              {rowThumbnail?.id === video.id && (
                <div className="video-row__thumbnail-editor">
                  <VideoThumbnailField
                    previewUrl={rowThumbnail.previewUrl || video.thumbnailUrl}
                    file={rowThumbnail.pendingFile}
                    onFileSelected={handleRowThumbnailSelected}
                    onRemove={rowThumbnail.previewUrl ? handleRowThumbnailRemoved : null}
                    isBusy={isBusy}
                    canRevert={video.thumbnailSource === 'CUSTOM'}
                    isReverting={revertingVideoId === video.id}
                    onRevert={() => handleRevertThumbnail(video)}
                  />
                  <div className="video-row__thumbnail-actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={handleRowThumbnailSubmit}
                      disabled={isBusy || !rowThumbnail.pendingFile}
                    >
                      {stage === 'saving' ? 'Guardando…' : 'Guardar miniatura'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--outline"
                      onClick={closeRowThumbnail}
                      disabled={isBusy}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}