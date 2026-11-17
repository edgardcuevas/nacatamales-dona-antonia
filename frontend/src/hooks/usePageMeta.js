import { useEffect } from 'react'
import { useSettings } from '../context/useSettings'
import { absoluteUrl } from '../utils/siteUrl'

// Un solo hook para todo lo que cambia por pagina. El titulo es lo unico que
// se ve en la pestaña; el resto existe para Google y para las vistas previas
// que si ejecutan JS (WhatsApp y Facebook no lo hacen: solo leen el HTML
// estatico de index.html, y eso se resuelve en el build).

function findMeta(attribute, key) {
  return document.head.querySelector(`meta[${attribute}="${key}"]`)
}

function readContent(element) {
  return element ? element.getAttribute('content') : null
}

function writeMeta(attribute, key, content) {
  const existing = findMeta(attribute, key)

  if (content === null) {
    if (existing) {
      existing.remove()
    }
    return
  }

  const element = existing || document.head.appendChild(document.createElement('meta'))
  element.setAttribute(attribute, key)
  element.setAttribute('content', content)
}

function writeCanonical(href) {
  let link = document.head.querySelector('link[rel="canonical"]')

  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'canonical')
    document.head.appendChild(link)
  }

  link.setAttribute('href', href)
}

export default function usePageMeta({ title = null, description = null, noindex = false } = {}) {
  const { settings } = useSettings()
  const businessName = settings.businessName

  useEffect(() => {
    // El estado previo se toma antes de escribir para poder restaurarlo al
    // desmontar: si no, al volver de /menu a / quedaría el canonical de /menu.
    const previous = {
      title: document.title,
      canonical: document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
      description: readContent(findMeta('name', 'description')),
      ogTitle: readContent(findMeta('property', 'og:title')),
      ogDescription: readContent(findMeta('property', 'og:description')),
      ogUrl: readContent(findMeta('property', 'og:url')),
      robots: readContent(findMeta('name', 'robots')),
    }

    const pageTitle = title ? `${title} · ${businessName}` : businessName
    // window.location y no useLocation: el canonical no debe arrastrar la
    // query string (?category=tamales es la misma pagina que /menu).
    const pageUrl = absoluteUrl(window.location.pathname)

    document.title = pageTitle
    writeMeta('property', 'og:title', pageTitle)
    writeMeta('property', 'og:url', pageUrl)
    writeMeta('property', 'og:description', description)
    writeMeta('name', 'description', description)
    // noindex,follow: la pagina no se indexa pero sus enlaces siguen contando.
    writeMeta('name', 'robots', noindex ? 'noindex,follow' : null)
    writeCanonical(pageUrl)

    return () => {
      document.title = previous.title
      writeMeta('name', 'description', previous.description)
      writeMeta('property', 'og:title', previous.ogTitle)
      writeMeta('property', 'og:description', previous.ogDescription)
      writeMeta('property', 'og:url', previous.ogUrl)
      writeMeta('name', 'robots', previous.robots)

      const link = document.head.querySelector('link[rel="canonical"]')
      if (previous.canonical === null) {
        if (link) {
          link.remove()
        }
      } else if (link) {
        link.setAttribute('href', previous.canonical)
      }
    }
  }, [title, description, noindex, businessName])
}
