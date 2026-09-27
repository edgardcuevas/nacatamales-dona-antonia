import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSettings } from '../context/SettingsContext'
import { api } from '../api/client'
import { Icon } from '../components/icons/Icons'
import '../styles/Menu.css'

function whatsappHref(whatsappNumber, productName) {
  if (!whatsappNumber) {
    return null
  }
  const text = encodeURIComponent(`Hola, quiero pedir: ${productName}`)
  return `https://wa.me/${whatsappNumber}?text=${text}`
}

export default function Menu() {
  const { settings } = useSettings()
  const [searchParams, setSearchParams] = useSearchParams()
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [isLoadingCategories, setIsLoadingCategories] = useState(true)
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  const activeSlug = searchParams.get('category')

  useEffect(() => {
    let isMounted = true

    api
      .get('/categories')
      .then((data) => {
        if (!isMounted) return
        const categoryList = data.categories || []
        setCategories(categoryList)

        const hasActive = categoryList.some((category) => category.slug === activeSlug)
        if (!hasActive && categoryList.length > 0) {
          setSearchParams({ category: categoryList[0].slug }, { replace: true })
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('No se pudo cargar el menú. Intenta recargar la página.')
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
    setIsLoadingProducts(true)

    api
      .get(`/products?category=${activeSlug}&limit=50`)
      .then((data) => {
        if (isMounted) {
          setProducts(data.products || [])
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('No se pudieron cargar los productos de esta categoría.')
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingProducts(false)
      })

    return () => {
      isMounted = false
    }
  }, [activeSlug])

  function handleSelectCategory(slug) {
    setSearchParams({ category: slug })
  }

  return (
    <div className="menu-page">
      <div className="menu-page__header">
        <span className="section-head__tag">
          <Icon name="corn" /> Nuestro menú
        </span>
        <h1>Nacatamales y más</h1>
        <p>Elegí una categoría para ver lo que preparamos.</p>
      </div>

      {errorMessage && <p className="menu-page__error">{errorMessage}</p>}

      {!isLoadingCategories && categories.length === 0 && !errorMessage && (
        <p className="menu-page__empty">Todavía no hay categorías cargadas en el menú.</p>
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

      {isLoadingProducts && <p className="menu-page__loading">Cargando…</p>}

      {!isLoadingProducts && activeSlug && products.length === 0 && (
        <p className="menu-page__empty">Todavía no hay productos en esta categoría.</p>
      )}

      {!isLoadingProducts && products.length > 0 && (
        <div className="menu-grid">
          {products.map((product) => {
            const waHref = whatsappHref(settings.whatsappNumber, product.name)
            return (
              <div className="menu-card" key={product.id}>
                <div className="menu-card__thumb">
                  {product.image?.url ? (
                    <img src={product.image.url} alt={product.image.altText || product.name} />
                  ) : (
                    <Icon name="tamal" />
                  )}
                  {!product.isAvailable && <span className="menu-card__sold-out">Agotado</span>}
                </div>
                <div className="menu-card__body">
                  <h3>{product.name}</h3>
                  {product.description && <p>{product.description}</p>}
                  <div className="menu-card__footer">
                    <span className="price-pill">C$ {product.price}</span>
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
        </div>
      )}
    </div>
  )
}