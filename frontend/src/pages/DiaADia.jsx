import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { Icon } from '../components/icons/Icons'
import Reveal from '../components/Reveal/Reveal'
import ThumbnailImage from '../components/ThumbnailImage/ThumbnailImage'
import { mergeFeed } from '../utils/feed'
import { withCacheBuster } from '../utils/cacheBuster'
import { imageSrcSet, optimizeImage } from '../utils/imageUrl'
import '../styles/DiaADia.css'
import usePageTitle from '../hooks/usePageTitle'

export default function DiaADia() {
  const [items, setItems] = useState([])
  usePageTitle('Día a día')
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

      {isLoading && (
        <div aria-hidden="true">
          {[0, 1].map((index) => (
            <div className="dia-post-skeleton" key={index}>
              <div className="skeleton skeleton--dia-media" />
              <div className="dia-post-skeleton__body">
                <div className="skeleton skeleton--title" />
                <div className="skeleton skeleton--text" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && !errorMessage && (
        <div className="empty-state">
          <Icon name="tamal" />
          <strong>Todavía no hay publicaciones</strong>
          <p>Aquí vas a ver cómo se cocina todo: el vapor, el local, el día a día.</p>
        </div>
      )}

      <Reveal className="dia-feed">
        {items.map((item) => (
          <article className="dia-post" key={item.id}>
            <div className="dia-post__media">
              {item.type === 'photo' && item.imageUrl && (
                <img
                  src={optimizeImage(item.imageUrl, 800)}
                  srcSet={imageSrcSet(item.imageUrl, [480, 800, 1200])}
                  sizes="(min-width: 640px) 640px, 100vw"
                  alt={item.altText || item.caption || 'Foto del local'}
                  loading="lazy"
                  decoding="async"
                />
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
                    // visitors keep seeing the previous frame. ThumbnailImage
                    // cae a hqdefault si esa variante no existe, de modo que
                    // un 404 de maxresdefault no quede como imagen rota.
                    <ThumbnailImage
                      key={item.thumbnailUrl}
                      src={withCacheBuster(item.thumbnailUrl, item.thumbnailVersion)}
                      placeholderClassName="dia-post__placeholder"
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
      </Reveal>
    </div>
  )
}