import { useEffect, useState } from 'react'
import { api } from '../../../api/client'
import { useSettings } from '../../../context/useSettings'
import useOpenNow from '../../../hooks/useOpenNow'
import { parseSchedule } from '../../../utils/openNow'
import ScheduleBadge from '../../ScheduleBadge/ScheduleBadge'
import { extractCoordinates, isShortMapsLink, mapsEmbedUrl, mapsSearchUrl } from '../../../utils/mapsLink'
import './SettingsManager.css'

const COLOR_OPTIONS = [
  { value: 'ROJO', label: 'Rojo' },
  { value: 'AMARILLO', label: 'Amarillo' },
  { value: 'VERDE', label: 'Verde' },
  { value: 'CAFE', label: 'Café' },
]

const SCHEDULE_EXAMPLE = 'Jueves a Domingo · 5:00 AM – 9:00 PM'
const SCHEDULE_EXAMPLE_MULTI = 'Jueves a Sábado 5:00 AM - 9:00 PM, Domingo 5:00 AM - 10:00 AM'

// Mismos límites que settings.constants.js del servidor.
const LIMITS = {
  businessName: 150,
  tagline: 255,
  address: 255,
  scheduleText: 255,
  fritangaScheduleText: 255,
  storyText: 4000,
  url: 500,
}

const FIELD_ERRORS = {
  INVALID_BUSINESS_NAME: 'El nombre del negocio no es válido.',
  INVALID_TAGLINE: 'El lema es demasiado largo.',
  INVALID_WHATSAPP_NUMBER: 'El WhatsApp debe llevar código de país y solo números (por ejemplo 50588887777).',
  INVALID_FACEBOOK_URL: 'El enlace de Facebook debe empezar con https://',
  INVALID_INSTAGRAM_URL: 'El enlace de Instagram debe empezar con https://',
  INVALID_ADDRESS: 'La dirección es demasiado larga.',
  INVALID_LATITUDE: 'La latitud no es válida (entre -90 y 90).',
  INVALID_LONGITUDE: 'La longitud no es válida (entre -180 y 180).',
  INVALID_SCHEDULE_TEXT: 'El horario no es válido.',
  INVALID_FRITANGA_SCHEDULE_TEXT: 'El horario de fritanga no es válido.',
  INVALID_STORY_TEXT: 'La historia es demasiado larga.',
  INVALID_SCHEDULE_COLOR: 'Elegí un color para el horario.',
  INVALID_FRITANGA_SCHEDULE_COLOR: 'Elegí un color para el horario de fritanga.',
}

function toForm(settings) {
  return {
    businessName: settings.businessName ?? '',
    tagline: settings.tagline ?? '',
    whatsappNumber: settings.whatsappNumber ?? '',
    facebookUrl: settings.facebookUrl ?? '',
    instagramUrl: settings.instagramUrl ?? '',
    address: settings.address ?? '',
    latitude: settings.latitude ?? '',
    longitude: settings.longitude ?? '',
    scheduleText: settings.scheduleText ?? '',
    scheduleColor: settings.scheduleColor || 'AMARILLO',
    fritangaScheduleText: settings.fritangaScheduleText ?? '',
    fritangaScheduleColor: settings.fritangaScheduleColor || 'ROJO',
    storyText: settings.storyText ?? '',
  }
}

function orNull(value) {
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

function parseCoordinate(value, min, max, label) {
  const text = String(value).trim().replace(',', '.')
  if (text === '') {
    return { value: null }
  }
  const number = Number(text)
  if (!Number.isFinite(number) || number < min || number > max) {
    return { error: `La ${label} debe ser un número entre ${min} y ${max}.` }
  }
  return { value: number }
}

function isHttpUrl(value) {
  return value.startsWith('http://') || value.startsWith('https://')
}

// Devuelve { payload } listo para el PATCH, o { error } con el motivo.
function buildPayload(form) {
  const businessName = form.businessName.trim()
  if (!businessName) {
    return { error: 'Escribí el nombre del negocio.' }
  }

  const whatsappNumber = String(form.whatsappNumber).replace(/\D/g, '')
  if (whatsappNumber.length < 8 || whatsappNumber.length > 20) {
    return { error: FIELD_ERRORS.INVALID_WHATSAPP_NUMBER }
  }

  const scheduleText = form.scheduleText.trim()
  if (!scheduleText) {
    return { error: 'Escribí el horario general.' }
  }

  const facebookUrl = orNull(form.facebookUrl)
  if (facebookUrl && !isHttpUrl(facebookUrl)) {
    return { error: FIELD_ERRORS.INVALID_FACEBOOK_URL }
  }
  const instagramUrl = orNull(form.instagramUrl)
  if (instagramUrl && !isHttpUrl(instagramUrl)) {
    return { error: FIELD_ERRORS.INVALID_INSTAGRAM_URL }
  }

  const latitude = parseCoordinate(form.latitude, -90, 90, 'latitud')
  if (latitude.error) return { error: latitude.error }
  const longitude = parseCoordinate(form.longitude, -180, 180, 'longitud')
  if (longitude.error) return { error: longitude.error }
  if ((latitude.value === null) !== (longitude.value === null)) {
    return { error: 'Para mostrar el mapa hacen falta la latitud y la longitud juntas.' }
  }

  return {
    payload: {
      businessName,
      tagline: orNull(form.tagline),
      whatsappNumber,
      facebookUrl,
      instagramUrl,
      address: orNull(form.address),
      latitude: latitude.value,
      longitude: longitude.value,
      scheduleText,
      scheduleColor: form.scheduleColor,
      fritangaScheduleText: orNull(form.fritangaScheduleText),
      fritangaScheduleColor: form.fritangaScheduleColor,
      storyText: orNull(form.storyText),
    },
  }
}

function ColorSelect({ value, onChange, disabled }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
      {COLOR_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export default function SettingsManager() {
  const { refreshSettings } = useSettings()
  const [form, setForm] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
    const [mapsInput, setMapsInput] = useState('')
  const [mapsFeedback, setMapsFeedback] = useState(null)

  useEffect(() => {
    let isMounted = true

    api
      .get('/admin/settings')
      .then((data) => {
        if (isMounted) setForm(toForm(data.settings))
      })
      .catch(() => {
        if (isMounted) setErrorMessage('No se pudo cargar la configuración. Intenta recargar la página.')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }))
    setSuccessMessage(null)
  }

    // El dueño pega el enlace de Google Maps (o las coordenadas) y de ahí se
  // sacan la latitud y la longitud: no tiene que escribirlas a mano.
  function handleMapsInput(value) {
    setMapsInput(value)

    if (!value.trim()) {
      setMapsFeedback(null)
      return
    }

    const coordinates = extractCoordinates(value)
    if (coordinates) {
      setField('latitude', String(coordinates.latitude))
      setField('longitude', String(coordinates.longitude))
      setMapsFeedback({ ok: true })
    } else {
      setMapsFeedback({ ok: false, isShort: isShortMapsLink(value) })
    }
  }

  function clearLocation() {
    setField('latitude', '')
    setField('longitude', '')
    setMapsInput('')
    setMapsFeedback(null)
  }
  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    const { payload, error } = buildPayload(form)
    if (error) {
      setErrorMessage(error)
      return
    }

    setIsSaving(true)
    try {
      const data = await api.patch('/admin/settings', payload)
      setForm(toForm(data.settings))
      await refreshSettings().catch(() => {
        // El guardado ya salió bien; si esta recarga falla, se verá al refrescar.
      })
      setSuccessMessage('Cambios guardados. Ya se ven en el sitio.')
    } catch (saveError) {
      if (saveError.status === 429) {
        setErrorMessage('Demasiados intentos. Espera unos minutos e intenta de nuevo.')
      } else {
        setErrorMessage(FIELD_ERRORS[saveError.code] || 'No se pudieron guardar los cambios. Intenta de nuevo.')
      }
    } finally {
      setIsSaving(false)
    }
  }

    const hasLocation =
    Boolean(form) &&
    String(form.latitude).trim() !== '' &&
    String(form.longitude).trim() !== '' &&
    Number.isFinite(Number(form.latitude)) &&
    Number.isFinite(Number(form.longitude))

  if (isLoading) {
    return <p className="admin-loading-inline">Cargando configuración…</p>
  }

  if (!form) {
    return errorMessage ? <p className="admin-error">{errorMessage}</p> : null
  }

  return (
    <form className="settings-manager" onSubmit={handleSubmit} noValidate>
      <fieldset className="settings-manager__group" disabled={isSaving}>
        <legend>El negocio</legend>

        <label className="admin-field">
          <span>Nombre del negocio</span>
          <input
            type="text"
            value={form.businessName}
            maxLength={LIMITS.businessName}
            onChange={(event) => setField('businessName', event.target.value)}
          />
        </label>

        <label className="admin-field">
          <span>Lema (opcional)</span>
          <input
            type="text"
            value={form.tagline}
            maxLength={LIMITS.tagline}
            onChange={(event) => setField('tagline', event.target.value)}
          />
        </label>

        <label className="admin-field">
          <span>Nuestra historia (opcional)</span>
          <textarea
            rows={6}
            value={form.storyText}
            maxLength={LIMITS.storyText}
            onChange={(event) => setField('storyText', event.target.value)}
          />
          <small className="settings-manager__hint">
            Cada salto de línea es un párrafo nuevo. {form.storyText.length}/{LIMITS.storyText}
          </small>
        </label>
      </fieldset>

      <fieldset className="settings-manager__group" disabled={isSaving}>
        <legend>Contacto y redes</legend>

        <label className="admin-field">
          <span>WhatsApp</span>
          <input
            type="tel"
            inputMode="numeric"
            value={form.whatsappNumber}
            onChange={(event) => setField('whatsappNumber', event.target.value)}
            placeholder="50588887777"
          />
          <small className="settings-manager__hint">
            Con código de país y sin espacios ni signos. Nicaragua empieza con 505.
          </small>
        </label>

        <label className="admin-field">
          <span>Facebook (opcional)</span>
          <input
            type="url"
            value={form.facebookUrl}
            maxLength={LIMITS.url}
            onChange={(event) => setField('facebookUrl', event.target.value)}
            placeholder="https://facebook.com/..."
          />
        </label>

        <label className="admin-field">
          <span>Instagram (opcional)</span>
          <input
            type="url"
            value={form.instagramUrl}
            maxLength={LIMITS.url}
            onChange={(event) => setField('instagramUrl', event.target.value)}
            placeholder="https://instagram.com/..."
          />
        </label>
      </fieldset>

      <fieldset className="settings-manager__group" disabled={isSaving}>
        <legend>Horarios</legend>

        <label className="admin-field">
          <span>Horario general</span>
          <input
            type="text"
            value={form.scheduleText}
            maxLength={LIMITS.scheduleText}
            onChange={(event) => setField('scheduleText', event.target.value)}
            placeholder={SCHEDULE_EXAMPLE}
          />
                    <small className="settings-manager__hint">
            Si tienes horarios distintos, sepáralos con coma. Ejemplo: {SCHEDULE_EXAMPLE_MULTI}
          </small>
        </label>
        <div className="admin-field">
          <span>Color del horario</span>
          <ColorSelect value={form.scheduleColor} onChange={(value) => setField('scheduleColor', value)} />
        </div>
        <SchedulePreview text={form.scheduleText} color={form.scheduleColor} icon="reloj" checkOpen />

        <label className="admin-field">
          <span>Horario de fritanga (opcional)</span>
          <input
            type="text"
            value={form.fritangaScheduleText}
            maxLength={LIMITS.fritangaScheduleText}
            onChange={(event) => setField('fritangaScheduleText', event.target.value)}
            placeholder="Viernes a Domingo · 5:00 PM – 10:00 PM"
          />
          <small className="settings-manager__hint">Si lo dejas vacío, no se muestra.</small>
        </label>
        <div className="admin-field">
          <span>Color del horario de fritanga</span>
          <ColorSelect
            value={form.fritangaScheduleColor}
            onChange={(value) => setField('fritangaScheduleColor', value)}
          />
        </div>
        <SchedulePreview text={form.fritangaScheduleText} color={form.fritangaScheduleColor} icon="grill" />
      </fieldset>

            <fieldset className="settings-manager__group" disabled={isSaving}>
        <legend>Ubicación</legend>

        <label className="admin-field">
          <span>Dirección (opcional)</span>
          <input
            type="text"
            value={form.address}
            maxLength={LIMITS.address}
            onChange={(event) => setField('address', event.target.value)}
          />
        </label>

        <div className="settings-manager__map">
          <span className="settings-manager__map-title">Ubicación en el mapa</span>
          <ol className="settings-manager__steps">
            <li>Toca “Buscar mi negocio en Google Maps”. Se abre en otra pestaña.</li>
            <li>Elige tu negocio en los resultados.</li>
            <li>Copia la dirección de la barra del navegador (empieza con https://www.google.com/maps) y pégala abajo.</li>
          </ol>

          <a
            className="btn btn--outline settings-manager__map-button"
            href={mapsSearchUrl(`${form.businessName} ${form.address}`.trim())}
            target="_blank"
            rel="noreferrer"
          >
            Buscar mi negocio en Google Maps
          </a>

          <label className="admin-field">
            <span>Enlace de Google Maps</span>
            <input
              type="text"
              value={mapsInput}
              onChange={(event) => handleMapsInput(event.target.value)}
              placeholder="Pega aquí el enlace"
              autoComplete="off"
            />
          </label>

          <div role="status">
            {mapsFeedback?.ok && (
              <small className="settings-manager__hint settings-manager__hint--ok">
                Ubicación detectada. Recuerda guardar los cambios.
              </small>
            )}
            {mapsFeedback && !mapsFeedback.ok && (
              <small className="settings-manager__hint settings-manager__hint--warn">
                {mapsFeedback.isShort
                  ? 'Ese es un enlace corto y no trae la ubicación. Ábrelo en el navegador y copia la dirección completa de la barra.'
                  : 'No encontré la ubicación en ese enlace. Copia la dirección completa de la barra del navegador cuando tu negocio esté seleccionado.'}
              </small>
            )}
          </div>

          {hasLocation && (
            <div className="settings-manager__map-preview">
              <iframe
                src={mapsEmbedUrl(Number(form.latitude), Number(form.longitude))}
                title="Vista previa de la ubicación"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <button type="button" className="btn-link" onClick={clearLocation}>
                Quitar ubicación
              </button>
            </div>
          )}

          <details className="settings-manager__manual">
            <summary>Escribir las coordenadas a mano</summary>
            <div className="settings-manager__row">
              <label className="admin-field">
                <span>Latitud</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.latitude}
                  onChange={(event) => setField('latitude', event.target.value)}
                  placeholder="12.1364"
                />
              </label>
              <label className="admin-field">
                <span>Longitud</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.longitude}
                  onChange={(event) => setField('longitude', event.target.value)}
                  placeholder="-86.2514"
                />
              </label>
            </div>
          </details>
        </div>
      </fieldset>

      <div role="alert">{errorMessage && <p className="admin-error">{errorMessage}</p>}</div>
      <div role="status">{successMessage && <p className="settings-manager__success">{successMessage}</p>}</div>

      <div className="settings-manager__actions">
        <button type="submit" className="btn btn--primary" disabled={isSaving}>
          {isSaving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}

// Vista previa tal como la verá el visitante. Para el horario general avisa
// si el texto no se entiende: en ese caso el sitio no puede decir "Abierto
// ahora" (ver utils/openNow.js).
function SchedulePreview({ text, color, icon, checkOpen = false }) {
  const isOpen = useOpenNow(checkOpen ? text : '')

  if (!text.trim()) {
    return null
  }

  const understood = Boolean(parseSchedule(text))

  return (
    <div className="settings-manager__preview">
      <span className="settings-manager__preview-label">Así se verá:</span>
      <ScheduleBadge icon={icon} text={text.trim()} color={color} isOpen={isOpen} />
      {checkOpen && !understood && (
        <small className="settings-manager__hint settings-manager__hint--warn">
        El horario se mostrará tal cual, pero no se entiende para marcar “Abierto ahora”. Escribe los días y las horas así: {SCHEDULE_EXAMPLE}
        </small>
      )}
    </div>
  )
}