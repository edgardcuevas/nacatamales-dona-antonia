import { useEffect, useState } from 'react'
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

export default function AnnouncementManager() {
  const [announcements, setAnnouncements] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const image = useStagedImage()

  function loadAnnouncements() {
    setIsLoading(true)
    api
      .get('/admin/announcements?limit=100&sortBy=createdAt&sortOrder=desc')
      .then((data) => setAnnouncements(data.announcements || []))
      .catch(() => setErrorMessage('No se pudieron cargar los anuncios.'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    loadAnnouncements()
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
              <div className="announcement-row__actions">
                <button type="button" className="btn-link" onClick={() => startEdit(announcement)}>
                  Editar
                </button>
                <button type="button" className="btn-link" onClick={() => togglePublished(announcement)}>
                  {announcement.isActive ? 'Ocultar' : 'Publicar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}