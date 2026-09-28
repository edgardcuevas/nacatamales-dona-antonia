import { useEffect, useState } from 'react'
import { api } from '../../../api/client'
import { uploadImage } from '../../../utils/mediaUpload'
import { useStagedImage } from '../../../hooks/useStagedImage'
import ImageUploader from '../ImageUploader/ImageUploader'
import './ProductManager.css'

const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/

const EMPTY_FORM = {
  name: '',
  categoryId: '',
  price: '',
  description: '',
  sortOrder: 0,
  isAvailable: true,
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export default function ProductManager() {
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [filterCategoryId, setFilterCategoryId] = useState('')
  const image = useStagedImage()

  function loadProducts() {
    setIsLoading(true)
    const query = filterCategoryId ? `&categoryId=${filterCategoryId}` : ''
    api
      .get(`/admin/products?limit=100${query}`)
      .then((data) => setProducts(data.products || []))
      .catch(() => setErrorMessage('No se pudieron cargar los productos.'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    api
      .get('/admin/categories?limit=100')
      .then((data) => setCategories(data.categories || []))
      .catch(() => setErrorMessage('No se pudieron cargar las categorías.'))
  }, [])

  useEffect(() => {
    loadProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCategoryId])

  const selectableCategories = categories.filter(
    (category) => category.isActive || String(category.id) === form.categoryId
  )

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setErrorMessage(null)
    image.reset()
  }

  function startEdit(product) {
    setForm({
      name: product.name,
      categoryId: String(product.categoryId),
      price: product.price ?? '',
      description: product.description || '',
      sortOrder: product.sortOrder,
      isAvailable: product.isAvailable,
    })
    setEditingId(product.id)
    setErrorMessage(null)
    image.load(product.image)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage(null)

    const price = form.price.trim().replace(',', '.')

    if (!form.categoryId) {
      setErrorMessage('Elegí una categoría para el producto.')
      return
    }

    if (price !== '' && !PRICE_PATTERN.test(price)) {
      setErrorMessage('El precio debe ser un número, por ejemplo 60 o 60.50.')
      return
    }

    setIsSaving(true)

    try {
      let imageMediaId = image.existingId

      if (image.file) {
        const media = await uploadImage('products', image.file, form.name.trim())
        imageMediaId = media.id
      }

      const payload = {
        categoryId: Number(form.categoryId),
        name: form.name.trim(),
        description: form.description.trim() === '' ? null : form.description.trim(),
        price: price === '' ? null : price,
        sortOrder: Number(form.sortOrder) || 0,
        imageMediaId,
      }

      if (editingId) {
        await api.patch(`/admin/products/${editingId}`, payload)
      } else {
        payload.slug = slugify(form.name.trim())
        payload.isAvailable = form.isAvailable
        await api.post('/admin/products', payload)
      }

      resetForm()
      loadProducts()
    } catch (error) {
      if (error.code === 'PRODUCT_NAME_ALREADY_EXISTS' || error.code === 'PRODUCT_SLUG_ALREADY_EXISTS') {
        setErrorMessage('Ya existe un producto con ese nombre. Probá con otro.')
      } else if (error.code === 'CATEGORY_INACTIVE') {
        setErrorMessage('Esa categoría está inactiva. Activala primero o elegí otra.')
      } else if (error.code === 'INVALID_PRODUCT_PRICE') {
        setErrorMessage('El precio no es válido. Usá un número como 60 o 60.50.')
      } else if (error.code === 'IMAGE_UPLOAD_FAILED') {
        setErrorMessage('No se pudo subir la imagen. Intenta de nuevo.')
      } else {
        setErrorMessage('No se pudo guardar el producto.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleAvailability(product) {
    try {
      await api.patch(`/admin/products/${product.id}/availability`, {
        isAvailable: !product.isAvailable,
      })
      loadProducts()
    } catch {
      setErrorMessage('No se pudo cambiar la disponibilidad del producto.')
    }
  }

  async function toggleStatus(product) {
    try {
      await api.patch(`/admin/products/${product.id}/status`, {
        isActive: !product.isActive,
      })
      loadProducts()
    } catch {
      setErrorMessage('No se pudo cambiar el estado del producto.')
    }
  }

  return (
    <div className="product-manager">
      <form className="product-manager__form" onSubmit={handleSubmit}>
        <h3>{editingId ? 'Editar producto' : 'Nuevo producto'}</h3>

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
          <span>Categoría</span>
          <select
            value={form.categoryId}
            onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))}
            required
          >
            <option value="">Elegí una categoría…</option>
            {selectableCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.isActive ? '' : ' (inactiva)'}
              </option>
            ))}
          </select>
        </label>

        {categories.length > 0 && categories.every((category) => !category.isActive) && (
          <p className="admin-error">Todas tus categorías están inactivas. Activá al menos una para crear productos.</p>
        )}

        <label className="admin-field">
          <span>Precio en córdobas (opcional)</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Ej: 60 o 60.50"
            value={form.price}
            onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
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

        {!editingId && (
          <label className="product-manager__checkbox">
            <input
              type="checkbox"
              checked={form.isAvailable}
              onChange={(event) => setForm((prev) => ({ ...prev, isAvailable: event.target.checked }))}
            />
            <span>Disponible desde el inicio</span>
          </label>
        )}

        <div className="admin-field">
          <span>Imagen (opcional)</span>
          <ImageUploader
            previewUrl={image.previewUrl}
            onFileSelected={image.select}
            onRemove={image.previewUrl ? image.remove : null}
            isBusy={isSaving}
          />
        </div>

        {errorMessage && <p className="admin-error">{errorMessage}</p>}

        <div className="product-manager__form-actions">
          <button type="submit" className="btn btn--primary" disabled={isSaving}>
            {isSaving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear producto'}
          </button>
          {editingId && (
            <button type="button" className="btn btn--outline" onClick={resetForm}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="product-manager__list-header">
        <h3>Tus productos</h3>
        <select
          className="product-manager__filter"
          value={filterCategoryId}
          onChange={(event) => setFilterCategoryId(event.target.value)}
        >
          <option value="">Todas las categorías</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="product-manager__list">
        {isLoading && <p className="admin-loading-inline">Cargando productos…</p>}

        {!isLoading && products.length === 0 && <p className="admin-empty-inline">Todavía no hay productos.</p>}

        {products.map((product) => (
          <div className="product-row" key={product.id}>
            <div className="product-row__thumb">
              {product.image?.url && <img src={product.image.url} alt={product.name} />}
            </div>
            <div className="product-row__body">
              <strong>{product.name}</strong>
              <span>
                {product.category?.name}
                {product.price ? ` · C$ ${product.price}` : ''}
              </span>
            </div>
            <div className="product-row__pills">
              <span className={product.isActive ? 'status-pill status-pill--active' : 'status-pill'}>
                {product.isActive ? 'Visible' : 'Oculto'}
              </span>
              <span className={product.isAvailable ? 'status-pill status-pill--active' : 'status-pill'}>
                {product.isAvailable ? 'Disponible' : 'Agotado'}
              </span>
            </div>
            <div className="product-row__actions">
              <button type="button" className="btn-link" onClick={() => startEdit(product)}>
                Editar
              </button>
              <button type="button" className="btn-link" onClick={() => toggleAvailability(product)}>
                {product.isAvailable ? 'Marcar agotado' : 'Marcar disponible'}
              </button>
              <button type="button" className="btn-link" onClick={() => toggleStatus(product)}>
                {product.isActive ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}