import { useEffect, useRef, useState } from 'react'
import {
  ImageResizeError,
  THUMBNAIL_LIMITS,
  resizeImageForThumbnail,
} from '../../../utils/imageResize'
import './VideoThumbnailField.css'

const SOURCE_ACCEPT = 'image/png,image/jpeg,image/webp'

const RESIZE_ERRORS = {
  'unsupported-type': 'Elegí una imagen JPG, PNG o WebP.',
  'source-too-large': 'Esa imagen es demasiado grande. Elegí una más liviana.',
  unreadable: 'No se pudo leer la imagen. Probá con otra.',
  undecodable: 'El navegador no pudo abrir esa imagen. Probá con una JPG o PNG.',
  'canvas-unavailable': 'Este navegador no permite escalar la imagen. Actualizalo o usá una JPG.',
  'encode-failed': 'No se pudo preparar la imagen. Probá con otra.',
}

// The thumbnail lives inside YouTube, not in the media library, so this
// field only offers a local file. Images are downscaled to 1280x720 JPEG
// before upload because the provider rejects WebP and oversized sources.
export default function VideoThumbnailField({
  previewUrl,
  file,
  onFileSelected,
  onRemove,
  isBusy,
  isReverting,
  canRevert,
  onRevert,
}) {
  const [errorMessage, setErrorMessage] = useState(null)
  const [isResizing, setIsResizing] = useState(false)
  const inputRef = useRef(null)
  const isMountedRef = useRef(true)

  // Derived on every render instead of stored: it only depends on the
  // file, and keeping it in state would need an effect.
  const sizeLabel = file
    ? `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB · ${THUMBNAIL_LIMITS.targetWidth}×${THUMBNAIL_LIMITS.targetHeight}`
    : null

  useEffect(() => {
    // Re-armed on every mount, not just initialized: StrictMode runs
    // setup -> cleanup -> setup in development, so a cleanup-only
    // effect leaves this ref permanently false and the field silently
    // rejects every picked file.
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  async function handleChange(event) {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) {
      return
    }

    setErrorMessage(null)
    setIsResizing(true)

    try {
      const scaled = await resizeImageForThumbnail(selected)
      if (!isMountedRef.current) {
        return
      }
      onFileSelected(scaled, selected)
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }
      setErrorMessage(
        RESIZE_ERRORS[error instanceof ImageResizeError ? error.message : ''] ||
          'No se pudo preparar la imagen. Probá con otra.'
      )
    } finally {
      if (isMountedRef.current) {
        setIsResizing(false)
      }
    }
  }

  const isBusyAll = isBusy || isResizing

  return (
    <div className="video-thumbnail-field">
      <div className="video-thumbnail-field__row">
        <div className={`video-thumbnail-field__preview ${previewUrl ? 'video-thumbnail-field__preview--filled' : ''}`}>
          {previewUrl && <img src={previewUrl} alt="Vista previa de la miniatura" />}
        </div>

        <div className="video-thumbnail-field__actions">
          <div className="video-thumbnail-field__buttons">
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => inputRef.current?.click()}
              disabled={isBusyAll}
            >
              {isResizing
                ? 'Preparando imagen…'
                : previewUrl
                  ? 'Cambiar miniatura'
                  : 'Elegir miniatura'}
            </button>

            {previewUrl && onRemove && (
              <button
                type="button"
                className="btn-link"
                onClick={onRemove}
                disabled={isBusyAll}
              >
                Quitar
              </button>
            )}

            {canRevert && (
              <button
                type="button"
                className="btn-link"
                onClick={onRevert}
                disabled={isBusyAll || isReverting}
              >
                {isReverting ? 'Restaurando…' : 'Usar la de YouTube'}
              </button>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={SOURCE_ACCEPT}
            onChange={handleChange}
            disabled={isBusyAll}
            hidden
          />

          {sizeLabel && <span className="video-thumbnail-field__size">{sizeLabel}</span>}

          <span className="video-thumbnail-field__hint">
            Se muestra en Día a día y en YouTube. La escalamos a 1280×720 para no subir el archivo original.
          </span>
        </div>
      </div>

      {errorMessage && <p className="admin-error">{errorMessage}</p>}
    </div>
  )
}
