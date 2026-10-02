import { useEffect, useState } from 'react'
import { api } from '../../../api/client'
import './MediaLibrary.css'

async function safeList(path) {
  try {
    return await api.get(path)
  } catch {
    return null
  }
}

// Las fotos de "Día a día" no devuelven image.id, solo la URL; por eso
// se resuelve el id comparando contra la URL de cada imagen de la galería.
function registerUsage(usage, items, label, nameKey, idByUrl) {
  ;(items || []).forEach((item) => {
    const mediaId =
      item.imageMediaId ?? item.image?.id ?? idByUrl.get(item.image?.url)
    if (!mediaId) {
      return
    }
    const entry = `${label}: ${item[nameKey] || item.title || item.caption || `#${item.id}`}`
    usage[mediaId] = usage[mediaId] ? [...usage[mediaId], entry] : [entry]
  })
}

export default function MediaLibrary() {
  const [mediaItems, setMediaItems] = useState([])
  const [usageByMediaId, setUsageByMediaId] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  function load() {
    setIsLoading(true)
    setErrorMessage(null)

    Promise.all([
      api.get('/admin/media?limit=100'),
      safeList('/admin/categories?limit=100'),
      safeList('/admin/products?limit=100'),
      safeList('/admin/announcements?limit=100'),
      safeList('/admin/photos?limit=100'),
    ])
      .then(([mediaData, categoriesData, productsData, announcementsData, photosData]) => {
        const media = mediaData.media || []
        setMediaItems(media)

        const idByUrl = new Map(media.map((item) => [item.secureUrl, item.id]))
        const usage = {}
        registerUsage(usage, categoriesData?.categories, 'Categoría', 'name', idByUrl)
        registerUsage(usage, productsData?.products, 'Producto', 'name', idByUrl)
        registerUsage(usage, announcementsData?.announcements, 'Anuncio', 'title', idByUrl)
        registerUsage(usage, photosData?.photos, 'Foto de día a día', 'caption', idByUrl)
        setUsageByMediaId(usage)
      })
      .catch(() => setErrorMessage('No se pudo cargar la galería de medios.'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleDelete(mediaId) {
    setDeletingId(mediaId)
    setErrorMessage(null)

    try {
      await api.delete(`/admin/media/${mediaId}`)
      load()
    } catch (error) {
      if (error.code === 'MEDIA_IN_USE') {
        setErrorMessage('Esa imagen está en uso y no se puede borrar. Quitala primero de donde se está usando.')
      } else {
        setErrorMessage('No se pudo borrar la imagen.')
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="media-library">
      {errorMessage && <p className="admin-error">{errorMessage}</p>}

      {isLoading && <p className="admin-loading-inline">Cargando galería…</p>}

      {!isLoading && mediaItems.length === 0 && (
        <p className="admin-empty-inline">Todavía no subiste ninguna imagen.</p>
      )}

      <div className="media-library__grid">
        {mediaItems.map((item) => {
          const usage = usageByMediaId[item.id]
          return (
            <div className="media-card" key={item.id}>
              <div className="media-card__thumb">
                <img src={item.secureUrl} alt={item.altText || 'Imagen subida'} />
              </div>
              <div className="media-card__body">
                {usage ? (
                  <ul className="media-card__usage">
                    {usage.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="media-card__unused">Sin usar</span>
                )}
                <button
                  type="button"
                  className="btn-link media-card__delete"
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                >
                  {deletingId === item.id ? 'Borrando…' : 'Borrar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}