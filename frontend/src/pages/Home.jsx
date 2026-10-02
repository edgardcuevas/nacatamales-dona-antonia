import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSettings } from '../context/SettingsContext'
import { api } from '../api/client'
import { Icon } from '../components/icons/Icons'
import ScheduleBadge from '../components/ScheduleBadge/ScheduleBadge'
import AnnouncementsBanner from '../components/AnnouncementsBanner/AnnouncementsBanner'
import { mergeFeed } from '../utils/feed'
import { withCacheBuster } from '../utils/cacheBuster'
import './../styles/Home.css'

function whatsappHref(whatsappNumber, message) {
  if (!whatsappNumber) {
    return null
  }
  const text = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${whatsappNumber}${text}`
}

export default function Home() {
  const { settings } = useSettings()
  const [categories, setCategories] = useState([])
  const [featuredProducts, setFeaturedProducts] = useState([])
  const [feedItems, setFeedItems] = useState([])

  useEffect(() => {
    let isMounted = true

    api
      .get('/categories')
      .then(async (data) => {
        const categoryList = data.categories || []
        if (!isMounted) return
        setCategories(categoryList)

        const firstCategory = categoryList[0]
        if (firstCategory) {
          const productsData = await api.get(
            `/products?category=${firstCategory.slug}&available=true&limit=3`
          )
          if (isMounted) {
            setFeaturedProducts(productsData.products || [])
          }
        }
      })
      .catch(() => {
        // Si falla, la sección de menú simplemente no se muestra.
      })

    Promise.all([api.get('/videos'), api.get('/photos')])
      .then(([videosData, photosData]) => {
        if (isMounted) {
          setFeedItems(mergeFeed(videosData.videos, photosData.photos).slice(0, 3))
        }
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [])

    // Se detecta por slug o por nombre: si el dueño renombra la categoría
  // ("Fritanga", "Fritangas"...), la franja de portada no desaparece.
  const fritangaCategory = categories.find((category) =>
    /fritanga/i.test(`${category.slug} ${category.name}`),
  )
  const waOrderHref = whatsappHref(
    settings.whatsappNumber,
    `Hola, quiero hacer un pedido de ${settings.businessName}`
  )

  return (
    <div>
      <header className="hero">
        <div className="hero__inner">
          <div className="hero__copy">
            <ScheduleBadge
              icon="leaf"
              text={settings.scheduleText}
              color={settings.scheduleColor}
              className="hero__eyebrow"
            />
            <h1>
              ¡Si de un buen <em>nacatamal</em> quieres disfrutar,<br />a nosotros debes visitar!
            </h1>
            <p className="hero__lead">{settings.tagline}</p>
            <div className="hero__actions">
              {waOrderHref && (
                <a className="btn btn--primary" href={waOrderHref} target="_blank" rel="noreferrer">
                  <Icon name="chat" /> Hacer pedido
                </a>
              )}
              <Link className="btn btn--ghost" to="/menu">
                Ver menú
              </Link>
            </div>
          </div>
          <div className="hero__art" aria-hidden="true">
            <div className="hero__plate" />
            <Icon name="tamal" className="hero__tamal" />
          </div>
        </div>
        <div className="hero__strip">
          <div className="hero__strip-item">
            <Icon name="leaf" /> Ingredientes frescos cada día
          </div>
          <div className="hero__strip-item">
            <Icon name="pot" /> Receta tradicional de familia
          </div>
          <div className="hero__strip-item">
            <Icon name="grill" /> Fritanga los fines de semana
          </div>
        </div>
      </header>

      <AnnouncementsBanner />

      {featuredProducts.length > 0 && (
        <section className="menu-teaser">
          <div className="section-head">
            <span className="section-head__tag">
              <Icon name="corn" /> Nuestro menú
            </span>
            <h2>Lo que se cocina hoy</h2>
            <p>Cada nacatamal se envuelve a mano en hoja de plátano y se cocina a fuego lento.</p>
          </div>
          <div className="menu-teaser__cards">
            {featuredProducts.map((product) => (
              <div className="product-card" key={product.id}>
                <div className="product-card__thumb">
                  {product.image?.url ? (
                    <img src={product.image.url} alt={product.image.altText || product.name} />
                  ) : (
                    <Icon name="tamal" />
                  )}
                </div>
                <div className="product-card__body">
                  <h3>{product.name}</h3>
                  {product.description && <p>{product.description}</p>}
                  <div className="product-card__price-row">
                    <span className="price-pill">C$ {product.price}</span>
                    {!product.isAvailable && <span className="sold-out-pill">Agotado</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="section-cta">
            <Link className="btn btn--outline" to="/menu">
              Ver menú completo
            </Link>
          </div>
        </section>
      )}

      {fritangaCategory && (
        <section className="fritanga-band">
          <Icon name="grill" className="fritanga-band__icon" />
          <div>
            <h2>También hacemos fritanga</h2>
            {settings.fritangaScheduleText ? (
              <ScheduleBadge
                icon="grill"
                text={settings.fritangaScheduleText}
                color={settings.fritangaScheduleColor}
                className="fritanga-band__schedule"
              />
            ) : (
              <p>Algunos días encendemos la cocina para ofrecer nuestra fritanga tradicional.</p>
            )}
          </div>
          <Link className="btn btn--ghost-light" to={`/menu?category=${fritangaCategory.slug}`}>
            Ver fritanga
          </Link>
        </section>
      )}

      {feedItems.length > 0 && (
        <section className="dia-a-dia-teaser">
          <div className="section-head">
            <span className="section-head__tag">
              <Icon name="play" /> Día a día
            </span>
            <h2>Así se vive en el local</h2>
          </div>
          <div className="dia-a-dia-teaser__grid">
            {feedItems.map((item) => (
              <Link key={item.id} to="/dia-a-dia" className="video-thumb">
                {(item.thumbnailUrl || item.imageUrl) ? (
                  // Same reason as in DiaADia: a custom YouTube thumbnail
                  // replaces the bytes behind the identical i.ytimg.com
                  // URL, so without a version the teaser keeps serving
                  // the previous frame while the full page already
                  // shows the new one.
                  <img
                    src={withCacheBuster(item.thumbnailUrl || item.imageUrl, item.thumbnailVersion)}
                    alt={item.title || item.caption || 'Publicación'}
                  />
                ) : (
                  <div className="video-thumb__placeholder" />
                )}
                {item.type === 'video' && <Icon name="play" className="video-thumb__play" />}
                <span className="video-thumb__title">{item.title || item.caption}</span>
              </Link>
            ))}
          </div>
          <div className="section-cta">
            <Link className="btn btn--outline" to="/dia-a-dia">
              Ver todo
            </Link>
          </div>
        </section>
      )}

      <section className="historia-teaser">
        <div className="historia-teaser__copy">
          <span className="section-head__tag section-head__tag--left">Nuestra historia</span>
          <h2>Tradición y sabor casero</h2>
          <p>
            Somos un pequeño negocio familiar, con años de tradición en la preparación de nacatamales
            y fritanga. Cada plato lo hacemos con el mismo cariño de siempre.
          </p>
          <Link className="btn btn--outline" to="/nosotros">
            Conocer más
          </Link>
        </div>
      </section>
    </div>
  )
}