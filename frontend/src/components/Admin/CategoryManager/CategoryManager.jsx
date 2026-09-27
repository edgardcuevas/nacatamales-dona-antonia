import { useEffect, useRef, useState } from 'react'
import { api } from '../../../api/client'
import { uploadImage } from '../../../utils/mediaUpload'
import ImageUploader from '../ImageUploader/ImageUploader'
import './CategoryManager.css'

const EMPTY_FORM = {
  name: '',
  description: '',
  sortOrder: 0,
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export default function CategoryManager() {
  const [categories, setCategories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  const [imageFile, setImageFile] = useState(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null)
  const [existingImageId, setExistingImageId] = useState(null)
  const objectUrlRef = useRef(null)

  function loadCategories() {
    setIsLoading(true)
    api
      .get('/admin/categories?limit=100')
      .then((data) => setCategories(data.categories || []))
      .catch(() => setErrorMessage('No se pudieron cargar las categorías.'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    loadCategories()
  }, [])

  function clearLocalPreview() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  function resetForm() {
    clearLocalPreview()
    setForm(EMPTY_FORM)
    setEditingId(null)
    setImageFile(null)
    setImagePreviewUrl(null)
    setExistingImageId(null)
    setErrorMessage(null)
  }

  function startEdit(category) {
    clearLocalPreview()
    setForm({
      name: category.name,
      description: category.description || '',
      sortOrder: category.sortOrder,
    })
    setEditingId(category.id)
    setImageFile(null)
    setImagePreviewUrl(category.image?.url || null)
    setExistingImageId(category.image?.id || null)
    setErrorMessage(null)
  }

  function handleFileSelected(file) {
    clearLocalPreview()
    const objectUrl = URL.createObjectURL(file)
    objectUrlRef.current = objectUrl
    setImageFile(file)
    setImagePreviewUrl(objectUrl)
  }

  function handleRemoveImage() {
    clearLocalPreview()
    setImageFile(null)
    setImagePreviewUrl(null)
    setExistingImageId(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage(null)
    setIsSaving(true)

    try {
      let imageMediaId = existingImageId

      if (imageFile) {
        const media = await uploadImage('categories', imageFile, form.name.trim())
        imageMediaId = media.id
      }

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() === '' ? null : form.description.trim(),
        sortOrder: Number(form.sortOrder) || 0,
        imageMediaId,
      }

      if (!editingId) {
        payload.slug = slugify(form.name.trim())
      }

      if (editingId) {
        await api.patch(`/admin/categories/${editingId}`, payload)
      } else {
        await api.post('/admin/categories', payload)
      }

      resetForm()
      loadCategories()
    } catch (error) {
      if (error.code === 'CATEGORY_SLUG_ALREADY_EXISTS' || error.code === 'CATEGORY_NAME_ALREADY_EXISTS') {
        setErrorMessage('Ya existe una categoría con ese nombre. Probá con otro.')
      } else if (error.code === 'IMAGE_UPLOAD_FAILED') {
        setErrorMessage('No se pudo subir la imagen. Intenta de nuevo.')
      } else {
        setErrorMessage('No se pudo guardar la categoría.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleStatus(category) {
    try {
      await api.patch(`/admin/categories/${category.id}/status`, {
        isActive: !category.isActive,
      })
      loadCategories()
    } catch {
      setErrorMessage('No se pudo cambiar el estado de la categoría.')
    }
  }

  return (
    <div className="category-manager">
      <form className="category-manager__form" onSubmit={handleSubmit}>
        <h3>{editingId ? 'Editar categoría' : 'Nueva categoría'}</h3>

        <label className="admin-field">
          <span>Nombre</span>
          <input
            type="text"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
        </label>

        <label className="admin-field">
          <span>Descripción (opcional)</span>
          <textarea
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            rows={2}
          />
        </label>

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
          <ImageUploader
            previewUrl={imagePreviewUrl}
            onFileSelected={handleFileSelected}
            onRemove={imagePreviewUrl ? handleRemoveImage : null}
            isBusy={isSaving}
          />
        </div>

        {errorMessage && <p className="admin-error">{errorMessage}</p>}

        <div className="category-manager__form-actions">
          <button type="submit" className="btn btn--primary" disabled={isSaving}>
            {isSaving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear categoría'}
          </button>
          {editingId && (
            <button type="button" className="btn btn--outline" onClick={resetForm}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="category-manager__list">
        {isLoading && <p className="admin-loading-inline">Cargando categorías…</p>}

        {!isLoading && categories.length === 0 && <p className="admin-empty-inline">Todavía no hay categorías.</p>}

        {categories.map((category) => (
          <div className="category-row" key={category.id}>
            <div className="category-row__thumb">
              {category.image?.url && <img src={category.image.url} alt={category.name} />}
            </div>
            <div className="category-row__body">
              <strong>{category.name}</strong>
              {category.description && <span>{category.description}</span>}
            </div>
            <span className={category.isActive ? 'status-pill status-pill--active' : 'status-pill'}>
              {category.isActive ? 'Activa' : 'Inactiva'}
            </span>
            <div className="category-row__actions">
              <button type="button" className="btn-link" onClick={() => startEdit(category)}>
                Editar
              </button>
              <button type="button" className="btn-link" onClick={() => toggleStatus(category)}>
                {category.isActive ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}