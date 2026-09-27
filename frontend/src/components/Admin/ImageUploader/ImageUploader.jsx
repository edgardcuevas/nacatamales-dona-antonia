import { useRef } from 'react'
import { Icon } from '../../icons/Icons'
import './ImageUploader.css'

export default function ImageUploader({ previewUrl, onFileSelected, onRemove, isBusy }) {
  const inputRef = useRef(null)

  function handleChange(event) {
    const file = event.target.files?.[0]
    if (file) {
      onFileSelected(file)
    }
    event.target.value = ''
  }

  return (
    <div className="image-uploader">
      <div className={`image-uploader__preview ${previewUrl ? 'image-uploader__preview--filled' : ''}`}>
        {previewUrl ? <img src={previewUrl} alt="Vista previa" /> : <Icon name="tamal" />}
      </div>
      <div className="image-uploader__actions">
        <button
          type="button"
          className="btn btn--outline"
          onClick={() => inputRef.current?.click()}
          disabled={isBusy}
        >
          {previewUrl ? 'Cambiar imagen' : 'Elegir imagen'}
        </button>
        {previewUrl && onRemove && (
          <button type="button" className="btn-link" onClick={onRemove} disabled={isBusy}>
            Quitar imagen
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={handleChange}
        />
        <span className="image-uploader__hint">Se sube recién al guardar el formulario.</span>
      </div>
    </div>
  )
}