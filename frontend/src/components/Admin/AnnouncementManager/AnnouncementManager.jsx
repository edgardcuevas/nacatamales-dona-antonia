import { useEffect, useRef, useState } from 'react'
import { api } from '../../../api/client'
import { uploadImage } from '../../../utils/mediaUpload'
import { useStagedImage } from '../../../hooks/useStagedImage'
import MediaPicker from '../MediaPicker/MediaPicker'
import './AnnouncementManager.css'

const TYPE_LABELS = {
  AVAILABLE: 'Disponible',
  SOLD_OUT: 'Agotado',
  PROMOTION: 'Promoción',
  INFO: 'Aviso',
}

const EMPTY_FORM = {
  title: '',
  content: '',
  type: 'INFO',
  startsAt: '',
  endsAt: '',
  sortOrder: 0,
  publishNow: true,
}

function toLocalInputValue(isoString) {
  if (!isoString) {
    return ''
  }
  const date = new Date(isoString)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function toIsoOrNull(localValue) {
  return localValue ? new Date(localValue).toISOString() : null
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleString('es-NI', { dateStyle: 'medium', timeStyle: 'short' })
}

function getPublicationState(announcement) {
  if (!announcement.isActive) {
    return { label: 'Oculto', className: 'status-pill' }
  }

  const now = Date.now()

  if (announcement.startsAt && new Date(announcement.startsAt).getTime() > now) {
    return { label: 'Programado', className: 'status-pill status-pill--scheduled' }
  }

  if (announcement.endsAt && new Date(announcement.endsAt).getTime() < now) {
    return { label: 'Vencido', className: 'status-pill' }
  }

  return { label: 'Publicado', className: 'status-pill status-pill--active' }
}

function describeSchedule(announcement) {
  if (announcement.startsAt && announcement.endsAt) {
    return `Del ${formatDate(announcement.startsAt)} al ${formatDate(announcement.endsAt)}`
  }
  if (announcement.startsAt) {
    return `Desde el ${formatDate(announcement.startsAt)}`
  }
  if (announcement.endsAt) {
    return `Hasta el ${formatDate(announcement.endsAt)}`
  }
  return 'Sin fechas: se muestra siempre'
}

// El servidor rechaza el reenvío manual de un aviso programado o vencido
// con 409 ANNOUNCEMENT_NOT_VISIBLE. No se ofrece un botón que va a fallar:
// los programados se envían solos cuando llega su fecha.
function isVisibleNow(announcement) {
  if (!announcement.isActive) {
    return false
  }

  const now = Date.now()

  if (
    announcement.startsAt &&
    new Date(announcement.startsAt).getTime() > now
  ) {
    return false
  }

  if (
    announcement.endsAt &&
    new Date(announcement.endsAt).getTime() <= now
  ) {
    return false
  }

  return true
}

export default function AnnouncementManager() {
  const [announcements, setAnnouncements] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [notifyingId, setNotifyingId] = useState(null)
  const image = useStagedImage()
  // disabled={...} depende de un re-render: dos clics en el mismo tick
  // se cuelan. Un envío de push es demasiado caro para perderlo así.
  const notifyInFlightRef = useRef(null)

  function fetchAnnouncements() {
    return api
      .get('/admin/announcements?limit=100&sortBy=createdAt&sortOrder=desc')
      .then((data) => setAnnouncements(data.announcements || []))
      .catch(() => setErrorMessage('No se pudieron cargar los anuncios.'))
      .finally(() => setIsLoading(false))
  }

  function loadAnnouncements() {
    setIsLoading(true)
    fetchAnnouncements()
  }

  useEffect(() => {
    fetchAnnouncements()
  }, [])

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setErrorMessage(null)
    image.reset()
  }

  function startEdit(announcement) {
    setForm({
      title: announcement.title,
      content: announcement.content,
      type: announcement.type,
      startsAt: toLocalInputValue(announcement.startsAt),
      endsAt: toLocalInputValue(announcement.endsAt),
      sortOrder: announcement.sortOrder,
      publishNow: announcement.isActive,
    })
    setEditingId(announcement.id)
    setErrorMessage(null)
    image.load(announcement.image)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage(null)

    if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) {
      setErrorMessage('La fecha de fin debe ser posterior a la de inicio.')
      return
    }

    setIsSaving(true)

    try {
      let imageMediaId = image.existingId

      if (image.file) {
        const media = await uploadImage('announcements', image.file, form.title.trim())
        imageMediaId = media.id
      }

      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        type: form.type,
        startsAt: toIsoOrNull(form.startsAt),
        endsAt: toIsoOrNull(form.endsAt),
        sortOrder: Number(form.sortOrder) || 0,
        imageMediaId,
      }

      if (editingId) {
        await api.patch(`/admin/announcements/${editingId}`, payload)
      } else {
        const created = await api.post('/admin/announcements', payload)

        if (form.publishNow) {
          try {
            await api.patch(`/admin/announcements/${created.announcement.id}/status`, { isActive: true })
          } catch {
            resetForm()
            loadAnnouncements()
            setErrorMessage('El anuncio se creó pero no se pudo publicar. Usá el botón "Publicar" en la lista.')
            return
          }
        }
      }

      resetForm()
      loadAnnouncements()
    } catch (error) {
      if (error.code === 'INVALID_ANNOUNCEMENT_SCHEDULE') {
        setErrorMessage('Las fechas del anuncio no son válidas.')
      } else if (error.code === 'IMAGE_UPLOAD_FAILED') {
        setErrorMessage('No se pudo subir la imagen. Intenta de nuevo.')
      } else {
        setErrorMessage('No se pudo guardar el anuncio.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function togglePublished(announcement) {
    try {
      await api.patch(`/admin/announcements/${announcement.id}/status`, {
        isActive: !announcement.isActive,
      })
      loadAnnouncements()
    } catch {
      setErrorMessage('No se pudo cambiar el estado del anuncio.')
    }
  }

  async function handleNotify(announcement) {
    if (notifyInFlightRef.current !== null) {
      return
    }

    const confirmed = window.confirm(
      announcement.notifiedAt
        ? `¿Enviar de nuevo la notificación de "${announcement.title}"?`
        : `¿Enviar la notificación de "${announcement.title}" ahora?`,
    )

    if (!confirmed) {
      return
    }

    notifyInFlightRef.current = announcement.id
    setNotifyingId(announcement.id)
    setErrorMessage(null)

    try {
      await api.post(`/admin/announcements/${announcement.id}/notify`)
      loadAnnouncements()
    } catch (error) {
      if (error.code === 'ANNOUNCEMENT_NOT_VISIBLE') {
        setErrorMessage(
          'El aviso no está visible ahora mismo: revisá las fechas o publicalo primero.',
        )
      } else if (error.code === 'PUSH_NOT_CONFIGURED') {
        setErrorMessage('Las notificaciones no están configuradas en el servidor.')
      } else if (error.code === 'RESEND_TOO_SOON') {
        setErrorMessage('Esperá unos segundos antes de reenviar este aviso.')
      } else {
        setErrorMessage('No se pudo enviar la notificación.')
      }
    } finally {
      notifyInFlightRef.current = null
      setNotifyingId(null)
    }
  }

  async function handleDelete(announcement) {
    const confirmed = window.confirm(
      `¿Eliminar el anuncio "${announcement.title}"? Esta acción no se puede deshacer.`,
    )

    if (!confirmed) {
      return
    }

    setDeletingId(announcement.id)
    setErrorMessage(null)

    try {
      await api.delete(`/admin/announcements/${announcement.id}`)

      if (editingId === announcement.id) {
        resetForm()
      }

      loadAnnouncements()
    } catch {
      setErrorMessage('No se pudo eliminar el anuncio.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="announcement-manager">
      <form className="announcement-manager__form" onSubmit={handleSubmit}>
        <h3>{editingId ? 'Editar anuncio' : 'Nuevo anuncio'}</h3>

        <label className="admin-field">
          <span>Título</span>
          <input
            type="text"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            required
          />
        </label>

        <label className="admin-field">
          <span>Mensaje</span>
          <textarea
            value={form.content}
            onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
            rows={3}
            required
          />
        </label>

        <label className="admin-field">
          <span>Tipo de anuncio</span>
          <select value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className="announcement-manager__dates">
          <label className="admin-field">
            <span>Mostrar desde (opcional)</span>
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) => setForm((prev) => ({ ...prev, startsAt: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            <span>Mostrar hasta (opcional)</span>
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) => setForm((prev) => ({ ...prev, endsAt: event.target.value }))}
            />
          </label>
        </div>
        <p className="announcement-manager__hint">Si dejás las fechas vacías, el anuncio se muestra sin límite de tiempo.</p>

        <label className="admin-field">
          <span>Orden</span>
          <input
            type="number"
            min="0"
            value={form.sortOrder}
            onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
          />
        </label>

        <div className="admin-field">
          <span>Imagen (opcional)</span>
          <MediaPicker image={image} isBusy={isSaving} />
        </div>

        {!editingId && (
          <label className="announcement-manager__checkbox">
            <input
              type="checkbox"
              checked={form.publishNow}
              onChange={(event) => setForm((prev) => ({ ...prev, publishNow: event.target.checked }))}
            />
            <span>Publicar ahora</span>
          </label>
        )}

        <div className="announcement-manager__preview">
          <span className="announcement-manager__preview-label">Así se verá en el sitio:</span>
          <div className={`announcement announcement--${form.type.toLowerCase()}`}>
            {image.previewUrl && <img className="announcement__image" src={image.previewUrl} alt="" />}
            <span className="announcement__tag">{TYPE_LABELS[form.type]}</span>
            <div className="announcement__body">
              <strong>{form.title || 'Título del anuncio'}</strong>
              <p>{form.content || 'Acá va el mensaje que verán tus clientes.'}</p>
            </div>
          </div>
        </div>

        {errorMessage && <p className="admin-error">{errorMessage}</p>}

        <div className="announcement-manager__form-actions">
          <button type="submit" className="btn btn--primary" disabled={isSaving}>
            {isSaving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear anuncio'}
          </button>
          {editingId && (
            <button type="button" className="btn btn--outline" onClick={resetForm}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <h3 className="announcement-manager__list-title">Tus anuncios</h3>

      <div className="announcement-manager__list">
        {isLoading && <p className="admin-loading-inline">Cargando anuncios…</p>}

        {!isLoading && announcements.length === 0 && <p className="admin-empty-inline">Todavía no hay anuncios.</p>}

        {announcements.map((announcement) => {
          const state = getPublicationState(announcement)
          return (
            <div className="announcement-row" key={announcement.id}>
              <div className="announcement-row__thumb">
                {announcement.image?.url && <img src={announcement.image.url} alt={announcement.title} />}
              </div>
              <div className="announcement-row__body">
                <strong>{announcement.title}</strong>
                <span>
                  {TYPE_LABELS[announcement.type]} · {describeSchedule(announcement)}
                </span>
              </div>
              <span className={state.className}>{state.label}</span>
              {announcement.isActive && (
                <span
                  className={
                    announcement.notifiedAt
                      ? 'announcement-row__notified'
                      : 'announcement-row__notified announcement-row__notified--pending'
                  }
                >
                  {announcement.notifiedAt ? 'Notificación enviada' : 'Sin notificar'}
                </span>
              )}
              <div className="announcement-row__actions">
                {isVisibleNow(announcement) && (
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => handleNotify(announcement)}
                    disabled={notifyingId === announcement.id}
                  >
                    {notifyingId === announcement.id
                      ? 'Enviando…'
                      : announcement.notifiedAt
                        ? 'Reenviar aviso'
                        : 'Notificar'}
                  </button>
                )}
                <button type="button" className="btn-link" onClick={() => startEdit(announcement)}>
                  Editar
                </button>
                <button type="button" className="btn-link" onClick={() => togglePublished(announcement)}>
                  {announcement.isActive ? 'Ocultar' : 'Publicar'}
                </button>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => handleDelete(announcement)}
                  disabled={deletingId === announcement.id}
                >
                  {deletingId === announcement.id ? 'Eliminando…' : 'Eliminar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}