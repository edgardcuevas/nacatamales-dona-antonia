import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSettings } from '../context/useSettings'
import { api } from '../api/client'
import { Icon } from '../components/icons/Icons'
import Reveal from '../components/Reveal/Reveal'
import { formatPrice } from '../utils/price'
import { imageSrcSet, optimizeImage } from '../utils/imageUrl'
import '../styles/Menu.css'
import usePageTitle from '../hooks/usePageTitle'

function whatsappHref(whatsappNumber, productName) {
  if (!whatsappNumber) {
    return null
  }
  const text = encodeURIComponent(`Hola, quiero pedir: ${productName}`)
  return `https://wa.me/${whatsappNumber}?text=${text}`
}

export default function Menu() {
  const { settings } = useSettings()
  usePageTitle('Menú')
  const [searchParams, setSearchParams] = useSearchParams()
  const [categories, setCategories] = useState([])
  // Se guarda junto al slug al que pertenece: así "cargando" se deduce
  // (slug activo distinto del cargado) sin llamar setState dentro del efecto.
  const [productsState, setProductsState] = useState({ slug: null, items: [] })
  const [isLoadingCategories, setIsLoadingCategories] = useState(true)
  // Each effect owns its own message so a later success in the other
  // one cannot wipe an error the user still needs to read.
  const [categoryError, setCategoryError] = useState(null)
  const [productsError, setProductsError] = useState(null)
  const errorMessage = categoryError || productsError

  const activeSlug = searchParams.get('category')
    const isLoadingProducts = Boolean(activeSlug) && productsState.slug !== activeSlug
  const products = productsState.slug === activeSlug ? productsState.items : []

  useEffect(() => {
    let isMounted = true

    api
      .get('/categories')
      .then((data) => {
        if (!isMounted) return
        const categoryList = data.categories || []
        setCategories(categoryList)
        setCategoryError(null)

        const hasActive = categoryList.some((category) => category.slug === activeSlug)
        if (!hasActive && categoryList.length > 0) {
          setSearchParams({ category: categoryList[0].slug }, { replace: true })
        }
      })
      .catch(() => {
        if (isMounted) {
          setCategoryError('No se pudo cargar el menú. Intenta recargar la página.')
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingCategories(false)
      })

    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!activeSlug) {
      return
    }

    let isMounted = true

    api
      .get(`/products?category=${activeSlug}&limit=50`)
      .then((data) => {
        if (isMounted) {
          setProductsState({ slug: activeSlug, items: data.products || [] })
          setProductsError(null)
        }
      })
      .catch(() => {
        if (isMounted) {
          // Marcar el slug como resuelto evita quedarse en "Cargando…".
          setProductsState({ slug: activeSlug, items: [] })
          setProductsError('No se pudieron cargar los productos de esta categoría.')
        }
      })

    return () => {
      isMounted = false
    }
  }, [activeSlug])

  function handleSelectCategory(slug) {
    setSearchParams({ category: slug })
  }

  const activeCategory = categories.find((category) => category.slug === activeSlug)

  return (
    <div className="menu-page">
      <div className="menu-page__header">
        <span className="section-head__tag">
          <Icon name="corn" /> Nuestro menú
        </span>
        <h1>Nacatamales y más</h1>
        <p>Elegí una categoría para ver lo que preparamos.</p>
      </div>

      {activeCategory && (
        <div
          className="menu-page__category-banner"
                    style={
            activeCategory.image?.url
              ? { backgroundImage: `url(${optimizeImage(activeCategory.image.url, 1200)})` }
              : undefined
          }
        >
          <div className="menu-page__category-banner-overlay">
            <h2>{activeCategory.name}</h2>
            {activeCategory.description && <p>{activeCategory.description}</p>}
          </div>
        </div>
      )}

      {errorMessage && <p className="menu-page__error">{errorMessage}</p>}

      {!isLoadingCategories && categories.length === 0 && !errorMessage && (
        <div className="empty-state">
          <Icon name="tamal" />
          <strong>Todavía no hay categorías en el menú</strong>
          <p>Estamos organizando la carta. Pregunta por WhatsApp qué hay hoy y te lo preparo.</p>
        </div>
      )}

      {categories.length > 0 && (
        <div className="menu-tabs">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={
                category.slug === activeSlug ? 'menu-tab menu-tab--active' : 'menu-tab'
              }
              onClick={() => handleSelectCategory(category.slug)}
            >
              {category.name}
            </button>
          ))}
        </div>
      )}

      {isLoadingProducts && (
        <div className="menu-grid" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <div className="skeleton skeleton--card" key={index} />
          ))}
        </div>
      )}

      {!isLoadingProducts && activeSlug && products.length === 0 && (
        <div className="empty-state">
          <Icon name="tamal" />
          <strong>Todavía no hay productos en esta categoría</strong>
          <p>Estamos envolviendo más. Vuelve en un rato o pregunta por WhatsApp qué hay hoy.</p>
        </div>
      )}

      {!isLoadingProducts && activeSlug && products.length > 0 && (
        <Reveal className="menu-grid">
          {products.map((product) => {
            const waHref = whatsappHref(settings.whatsappNumber, product.name)
            return (
              <div className="menu-card" key={product.id}>
                <div className="menu-card__thumb">
                  {product.image?.url ? (
                    <img
                      src={optimizeImage(product.image.url, 640)}
                      srcSet={imageSrcSet(product.image.url, [400, 640, 960])}
                      sizes="(min-width: 960px) 360px, 100vw"
                      alt={product.image.altText || product.name}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <Icon name="tamal" />
                  )}
                  {!product.isAvailable && <span className="menu-card__sold-out">Agotado</span>}
                </div>
                <div className="menu-card__body">
                  <h3>{product.name}</h3>
                  {product.description && <p>{product.description}</p>}
                  <div className="menu-card__footer">
                    <span className="price">
                      <span className="price__currency">C$</span>
                      {formatPrice(product.price)}
                    </span>
                    {waHref && product.isAvailable && (
                      <a
                        className="menu-card__order"
                        href={waHref}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Pedir ${product.name} por WhatsApp`}
                      >
                        <Icon name="chat" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </Reveal>
      )}
    </div>
  )
}