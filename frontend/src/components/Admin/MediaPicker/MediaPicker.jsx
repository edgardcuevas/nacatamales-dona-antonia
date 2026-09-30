import { useState } from 'react'
import { api } from '../../../api/client'
import { Icon } from '../../icons/Icons'
import './MediaPicker.css'

// Reusing an already stored image keeps the ImageKit account from
// growing: imageMediaId is a foreign key, so the same file can be
// shared by many records without duplicating storage.
export default function MediaPicker({ image, isBusy }) {
  const [gallery, setGallery] = useState({
    isOpen: false,
    items: null,
    isLoading: false,
    errorMessage: null,
  })
  const [search, setSearch] = useState('')

  // Loaded from the click handler instead of an effect: the gallery is
  // only fetched when the editor actually opens it, and the list is
  // cached so reopening it costs nothing.
  function toggleGallery() {
    const willOpen = !gallery.isOpen
    setGallery((current) => ({ ...current, isOpen: willOpen }))

    if (!willOpen || gallery.isLoading) {
      return
    }

    if (gallery.items !== null) {
      return
    }

    setGallery((current) => ({
      ...current,
      isLoading: true,
      errorMessage: null,
    }))

    api
      .get('/admin/media?limit=100&isActive=true&sortBy=createdAt&sortOrder=desc')
      .then((data) => {
        setGallery((current) => ({
          ...current,
          items: data.media || [],
        }))
      })
      .catch(() => {
        setGallery((current) => ({
          ...current,
          errorMessage: 'No se pudo cargar la galería de imágenes.',
        }))
      })
      .finally(() => {
        setGallery((current) => ({ ...current, isLoading: false }))
      })
  }

  function handleFileChange(event) {
    const selected = event.target.files?.[0]
    if (selected) {
      image.select(selected)
    }
    event.target.value = ''
  }

  function chooseFromGallery(media) {
    image.pickExisting(media)
    setGallery((current) => ({ ...current, isOpen: false }))
  }

  const normalizedSearch = search.trim().toLowerCase()
  const galleryItems = gallery.items ?? []
  const visibleItems = normalizedSearch
    ? galleryItems.filter((item) => {
        const haystack = `${item.publicId || ''} ${item.altText || ''}`.toLowerCase()
        return haystack.includes(normalizedSearch)
      })
    : galleryItems

  return (
    <div className="media-picker">
      <div className="media-picker__row">
        <div className={`media-picker__preview ${image.previewUrl ? 'media-picker__preview--filled' : ''}`}>
          {image.previewUrl ? <img src={image.previewUrl} alt="Vista previa" /> : <Icon name="tamal" />}
        </div>

        <div className="media-picker__actions">
          <div className="media-picker__buttons">
            <button
              type="button"
              className="btn btn--outline"
              onClick={toggleGallery}
              disabled={isBusy}
            >
              {gallery.isOpen ? 'Cerrar galería' : 'Elegir de la galería'}
            </button>

            <label className="media-picker__upload">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                disabled={isBusy}
                hidden
              />
              {image.previewUrl ? 'Subir otra imagen' : 'Subir desde el dispositivo'}
            </label>
          </div>

          {image.previewUrl && (
            <button type="button" className="btn-link" onClick={image.remove} disabled={isBusy}>
              Quitar imagen
            </button>
          )}

          <span className="media-picker__hint">
            {image.file
              ? 'Se sube al guardar.'
              : image.existingId
                ? 'Ya está en la galería: no se vuelve a subir.'
                : 'Sin imagen, o elegí una de la galería.'}
          </span>
        </div>
      </div>

      {gallery.isOpen && (
        <div className="media-picker__gallery">
          {gallery.isLoading && <p className="admin-loading-inline">Cargando galería…</p>}

          {gallery.errorMessage && (
            <div className="media-picker__gallery-error">
              <p className="admin-error">{gallery.errorMessage}</p>
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => {
                  setGallery((current) => ({ ...current, items: null }))
                  toggleGallery()
                }}
                disabled={isBusy}
              >
                Reintentar
              </button>
            </div>
          )}

          {!gallery.isLoading && !gallery.errorMessage && galleryItems.length === 0 && (
            <p className="admin-empty-inline">
              Todavía no hay imágenes en la galería. Subí una desde el dispositivo.
            </p>
          )}

          {!gallery.isLoading && galleryItems.length > 0 && (
            <>
              <input
                type="search"
                className="media-picker__search"
                placeholder="Buscar por nombre o descripción…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                disabled={isBusy}
              />

              {visibleItems.length === 0 ? (
                <p className="admin-empty-inline">Ninguna imagen coincide con la búsqueda.</p>
              ) : (
                <div className="media-picker__grid">
                  {visibleItems.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`media-picker__item ${image.existingId === item.id ? 'media-picker__item--selected' : ''}`}
                      onClick={() => chooseFromGallery(item)}
                      disabled={isBusy}
                    >
                      <img src={item.secureUrl} alt={item.altText || 'Imagen de la galería'} />
                      {item.altText && <span>{item.altText}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
