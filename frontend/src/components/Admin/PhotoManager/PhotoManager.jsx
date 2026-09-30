import { useEffect, useState } from 'react'
import { api } from '../../../api/client'
import { uploadImage } from '../../../utils/mediaUpload'
import { useStagedImage } from '../../../hooks/useStagedImage'
import MediaPicker from '../MediaPicker/MediaPicker'
import './PhotoManager.css'

function formatDate(isoString) {
  if (!isoString) {
    return ''
  }
  return new Date(isoString).toLocaleString('es-NI', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function PhotoManager() {
  const [photos, setPhotos] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const [caption, setCaption] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const image = useStagedImage()

  function loadPhotos() {
    setIsLoading(true)
    api
      .get('/admin/photos?limit=100')
      .then((data) => setPhotos(data.photos || []))
      .catch(() => setErrorMessage('No se pudieron cargar las fotos.'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    loadPhotos()
  }, [])

  function resetForm() {
    setCaption('')
    setEditingId(null)
    setErrorMessage(null)
    image.reset()
  }

  function startEdit(photo) {
    setCaption(photo.caption || '')
    setEditingId(photo.id)
    setErrorMessage(null)
    image.load(photo.image)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage(null)

    if (!image.previewUrl) {
      setErrorMessage('Elegí una foto para publicar.')
      return
    }

    setIsSaving(true)

    try {
      const cleanCaption = caption.trim() === '' ? null : caption.trim()
      let imageMediaId

      if (image.file) {
        const media = await uploadImage('photos', image.file, cleanCaption ? cleanCaption.slice(0, 120) : null)
        imageMediaId = media.id
      }

      if (editingId) {
        const payload = { caption: cleanCaption }
        if (imageMediaId) {
          payload.imageMediaId = imageMediaId
        }
        await api.patch(`/admin/photos/${editingId}`, payload)
      } else {
        await api.post('/admin/photos', { caption: cleanCaption, imageMediaId })
      }

      resetForm()
      loadPhotos()
    } catch (error) {
      if (error.code === 'IMAGE_UPLOAD_FAILED') {
        setErrorMessage('No se pudo subir la foto. Intenta de nuevo.')
      } else {
        setErrorMessage('No se pudo guardar la publicación.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(photo) {
    if (!window.confirm('¿Eliminar esta foto? Esta acción no se puede deshacer.')) {
      return
    }

    try {
      await api.delete(`/admin/photos/${photo.id}`)
      if (editingId === photo.id) {
        resetForm()
      }
      loadPhotos()
    } catch {
      setErrorMessage('No se pudo eliminar la foto.')
    }
  }

  return (
    <div className="photo-manager">
      <form className="photo-manager__form" onSubmit={handleSubmit}>
        <h3>{editingId ? 'Editar publicación' : 'Nueva foto'}</h3>

        <div className="admin-field">
          <span>Foto</span>
          <MediaPicker image={image} isBusy={isSaving} />
        </div>

        <label className="admin-field">
          <span>Texto de la publicación (opcional)</span>
          <textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Contá algo sobre esta foto…"
          />
        </label>

        {errorMessage && <p className="admin-error">{errorMessage}</p>}

        <div className="photo-manager__form-actions">
          <button type="submit" className="btn btn--primary" disabled={isSaving}>
            {isSaving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Publicar foto'}
          </button>
          {editingId && (
            <button type="button" className="btn btn--outline" onClick={resetForm}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="photo-manager__list">
        {isLoading && <p className="admin-loading-inline">Cargando fotos…</p>}

        {!isLoading && photos.length === 0 && <p className="admin-empty-inline">Todavía no publicaste fotos.</p>}

        {photos.map((photo) => (
          <div className="photo-row" key={photo.id}>
            <div className="photo-row__thumb">
              {photo.image?.url && <img src={photo.image.url} alt={photo.caption || 'Foto'} />}
            </div>
            <div className="photo-row__body">
              <strong>{photo.caption || 'Sin texto'}</strong>
              <span>{formatDate(photo.createdAt)}</span>
            </div>
            <div className="photo-row__actions">
              <button type="button" className="btn-link" onClick={() => startEdit(photo)}>
                Editar
              </button>
              <button type="button" className="btn-link" onClick={() => handleDelete(photo)}>
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}