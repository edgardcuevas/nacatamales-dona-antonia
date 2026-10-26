import { useEffect, useRef, useState } from 'react'
import { api } from '../../../api/client'
import './MediaLibrary.css'

const PAGE_SIZE = 100

// Tope de seguridad para las listas de uso. Si alguna crece demasiado,
// se deja de paginar y el uso se marca como "no verificado" en vez de
// decir "Sin usar" cuando en realidad hay algo usando la imagen.
const MAX_USAGE_PAGES = 20

const USAGE_SOURCES = [
  {
    key: 'categories',
    path: '/admin/categories',
    listKey: 'categories',
    label: 'Categoría',
    nameKey: 'name',
  },
  {
    key: 'products',
    path: '/admin/products',
    listKey: 'products',
    label: 'Producto',
    nameKey: 'name',
  },
  {
    key: 'announcements',
    path: '/admin/announcements',
    listKey: 'announcements',
    label: 'Anuncio',
    nameKey: 'title',
  },
  {
    key: 'photos',
    path: '/admin/photos',
    listKey: 'photos',
    label: 'Foto de día a día',
    nameKey: 'caption',
  },
]

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

function buildUsage(mediaItems, usageLists) {
  const idByUrl = new Map(mediaItems.map((item) => [item.secureUrl, item.id]))
  const usage = {}

  for (const source of USAGE_SOURCES) {
    registerUsage(
      usage,
      usageLists?.[source.key],
      source.label,
      source.nameKey,
      idByUrl,
    )
  }

  return usage
}

async function fetchMediaPage(page) {
  const data = await api.get(`/admin/media?limit=${PAGE_SIZE}&page=${page}`)

  return {
    items: data?.media ?? [],
    totalPages: data?.pagination?.totalPages ?? 0,
  }
}

// Trae todas las páginas de una lista administrativa. Si alguna página
// falla, devuelve null: el uso se marca como no verificado en lugar de
// mentir con un "Sin usar" que después el servidor contradice con un 409.
async function fetchAllUsagePages(path, listKey) {
  const items = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    if (page > MAX_USAGE_PAGES) {
      return null
    }

    const data = await api.get(`${path}?limit=${PAGE_SIZE}&page=${page}`)
    items.push(...(data?.[listKey] ?? []))
    totalPages = data?.pagination?.totalPages ?? 1
    page += 1
  }

  return items
}

async function loadUsageLists() {
  const results = await Promise.all(
    USAGE_SOURCES.map(async (source) => {
      try {
        const items = await fetchAllUsagePages(
          source.path,
          source.listKey,
        )
        return {
          key: source.key,
          items: items ?? [],
          complete: items !== null,
        }
      } catch {
        return { key: source.key, items: [], complete: false }
      }
    }),
  )

  const lists = {}
  let complete = true

  for (const result of results) {
    lists[result.key] = result.items
    if (!result.complete) {
      complete = false
    }
  }

  return { lists, complete }
}

export default function MediaLibrary() {
  const [mediaItems, setMediaItems] = useState([])
  const [usageByMediaId, setUsageByMediaId] = useState({})
  const [usageComplete, setUsageComplete] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const usageListsRef = useRef({})

  async function fetchGallery(pageCount = 1) {
    const mediaPages = []
    for (let nextPage = 1; nextPage <= pageCount; nextPage += 1) {
      mediaPages.push(await fetchMediaPage(nextPage))
    }

    const { lists, complete } = await loadUsageLists()
    const items = mediaPages.flatMap((result) => result.items)

    return {
      items,
      lists,
      complete,
      totalPages:
        mediaPages[mediaPages.length - 1]?.totalPages ?? 0,
      page: pageCount,
    }
  }

  function applyGallery(result) {
    usageListsRef.current = result.lists
    setMediaItems(result.items)
    setUsageByMediaId(
      buildUsage(result.items, result.lists)
    )
    setUsageComplete(result.complete)
    setPage(result.page)
    setTotalPages(result.totalPages)
  }

  function load(pageCount = 1) {
    setIsLoading(true)
    setErrorMessage(null)

    fetchGallery(pageCount)
      .then(applyGallery)
      .catch(() => setErrorMessage('No se pudo cargar la galería de medios.'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    fetchGallery(1)
      .then(applyGallery)
      .catch(() => setErrorMessage('No se pudo cargar la galería de medios.'))
      .finally(() => setIsLoading(false))
  }, [])

  async function handleLoadMore() {
    const nextPage = page + 1
    setIsLoadingMore(true)
    setErrorMessage(null)

    try {
      const result = await fetchMediaPage(nextPage)
      const merged = [...mediaItems, ...result.items]

      setMediaItems(merged)
      // El uso se recalcula porque las fotos de "Día a día" se relacionan
      // con la galería por URL: la imagen recién cargada puede ser
      // justamente la de una foto.
      setUsageByMediaId(
        buildUsage(merged, usageListsRef.current),
      )
      setPage(nextPage)
      setTotalPages(result.totalPages)
    } catch {
      setErrorMessage('No se pudieron cargar más imágenes.')
    } finally {
      setIsLoadingMore(false)
    }
  }

  async function handleDelete(mediaId) {
    if (!window.confirm('¿Borrar esta imagen? Esta acción no se puede deshacer.')) {
      return
    }
    setDeletingId(mediaId)
    setErrorMessage(null)

    try {
      await api.delete(`/admin/media/${mediaId}`)
      load(page)
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
                <img
                  src={item.secureUrl}
                  alt={item.altText || 'Imagen subida'}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="media-card__body">
                {usage ? (
                  <ul className="media-card__usage">
                    {usage.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="media-card__unused">
                    {usageComplete ? 'Sin usar' : 'Uso no verificado'}
                  </span>
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

      {!isLoading && page < totalPages && (
        <button
          type="button"
          className="media-library__more"
          onClick={handleLoadMore}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? 'Cargando…' : `Ver más imágenes (${totalPages - page} páginas más)`}
        </button>
      )}
    </div>
  )
}
