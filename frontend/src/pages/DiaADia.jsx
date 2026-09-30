import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { Icon } from '../components/icons/Icons'
import { mergeFeed } from '../utils/feed'
import { withCacheBuster } from '../utils/cacheBuster'
import '../styles/DiaADia.css'

export default function DiaADia() {
  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const [playingId, setPlayingId] = useState(null)

  useEffect(() => {
    let isMounted = true

    Promise.all([api.get('/videos'), api.get('/photos')])
      .then(([videosData, photosData]) => {
        if (isMounted) {
          setItems(mergeFeed(videosData.videos, photosData.photos))
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('No se pudo cargar el contenido de día a día.')
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div className="dia-page">
      <div className="dia-page__header">
        <span className="section-head__tag">
          <Icon name="play" /> Día a día
        </span>
        <h1>Así se vive en el local</h1>
        <p>Fotos y videos reales de cómo preparamos cada nacatamal.</p>
      </div>

      {errorMessage && <p className="dia-page__error">{errorMessage}</p>}

      {!isLoading && items.length === 0 && !errorMessage && (
        <p className="dia-page__empty">Todavía no hay publicaciones.</p>
      )}

      <div className="dia-feed">
        {items.map((item) => (
          <article className="dia-post" key={item.id}>
            <div className="dia-post__media">
              {item.type === 'photo' && item.imageUrl && (
                <img src={item.imageUrl} alt={item.altText || item.caption || 'Foto del local'} />
              )}

              {item.type === 'video' && playingId === item.id && (
                <iframe
                  src={`https://www.youtube.com/embed/${item.externalId}?autoplay=1`}
                  title={item.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              )}

              {item.type === 'video' && playingId !== item.id && (
                <button
                  type="button"
                  className="dia-post__play-trigger"
                  onClick={() => setPlayingId(item.id)}
                  aria-label={`Reproducir ${item.title}`}
                >
                  {item.thumbnailUrl ? (
                    // A custom thumbnail replaces the bytes behind the same
                    // i.ytimg.com URL, so the cache key has to change or
                    // visitors keep seeing the previous frame.
                    <img
                      src={withCacheBuster(item.thumbnailUrl, item.thumbnailVersion)}
                      alt={item.title}
                    />
                  ) : (
                    <div className="dia-post__placeholder" />
                  )}
                  <Icon name="play" className="dia-post__play-icon" />
                </button>
              )}
            </div>

            {(item.title || item.caption) && (
              <div className="dia-post__body">
                {item.title && <h3>{item.title}</h3>}
                {item.caption && <p>{item.caption}</p>}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}