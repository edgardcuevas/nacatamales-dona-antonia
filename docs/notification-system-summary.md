# Resumen del sistema de notificaciones Web Push

Implementación completa y verificada (server + frontend + docs). Todas las
pruebas pasan: server 611 tests, frontend 155 tests, build OK.

## 1. Objetivo

Avisar al teléfono del visitante cuando se publica un aviso ("announcement"),
sin app ni servicio de terceros, usando Web Push estándar (VAPID + service
worker). Feature **opcional**: sin claves VAPID el servidor arranca igual y el
frontend nunca ofrece la suscripción.

## 2. Stack y dependencias

- Server: Express 5, CommonJS, Node >=24 <25, MySQL via `mysql2` (sin ORM).
- Paquete nuevo: `web-push@^3.6.7` (único importador: `push.provider.js`).
- Frontend: Vite 8 + React 19, ESM, sin TS.
- Sin CORS (topología single-domain detrás de proxy).

## 3. Modelo de datos

### Tabla `push_subscriptions` (migración `20261024120000`)
- `id`, `endpoint` (TEXT), `endpoint_hash` VARCHAR(64) UNIQUE (SHA-256 del
  endpoint, porque la URL supera el límite de índice de MySQL), `p256dh`,
  `auth`, `user_agent`, `failure_count`, `last_success_at`, `last_failure_at`,
  `created_at`, `updated_at`.
- Índices: `endpoint_hash` (unique), `updated_at`.

### Columna `announcements.notified_at` (migración `20261024120500`)
- TIMESTAMP NULL, índice `(is_active, notified_at)`.
- Backfill: todos los avisos activos existentes reciben `notified_at = NOW()`
  para que habilitar push no dispare una ráfaga histórica.

## 4. Configuración (`src/config/env.js`)

Variables opcionales (las tres o ninguna): `WEB_PUSH_PUBLIC_KEY`,
`WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`. Validadores dedicados para cada una
(longitud de claves, formato `mailto:`/`https:` del subject). Si falta alguna,
`env.webPush.enabled === false` y el servidor arranca normal. Las claves VAPID
son permanentes: rotarlas invalida todas las suscripciones.

## 5. Módulo backend `src/modules/notification/`

Arquitectura estándar del repo: `*.routes` → controller → service → repository,
con validators como middleware.

| Archivo | Responsabilidad |
|---|---|
| `notification.constants.js` | `SEND_BATCH_SIZE=20`, `MAX_FAILURES_BEFORE_DELETE=10`, límites de truncado del payload (título 80, body 140), icono/badge/tag/url. |
| `notification.validator.js` | Validación de suscripción (endpoint HTTPS + allowlist de hosts push: Google, Mozilla, Microsoft, Apple para evitar SSRF), claves p256dh/auth, unsubscribe. |
| `notification.repository.js` | `upsertSubscription` (por `endpoint_hash`), `deleteSubscriptionByEndpoint`, `listSubscriptions`, `markSubscriptionSuccess`, `registerSubscriptionFailure` (incrementa y borra al llegar a 10), `deleteSubscriptionById`, `countSubscriptions`. |
| `push.provider.js` | Único importador de `web-push`; expone `sendNotification(subscription, payload)` para que los tests mockeen por propiedad. |
| `notification.service.js` | `getPublicKeyConfig`, `subscribe`, `unsubscribe`, `getSubscriptionStats`, `dispatchAnnouncement` (lotes de 20 con `Promise.allSettled`), `notifyAnnouncementIfVisible` (claim atómico), `notifyAnnouncementInBackground` (fire-and-forget), `resendAnnouncement`, `buildNotificationPayload`, `isAnnouncementVisible`. |
| `notification.controller.js` | Handlers HTTP. |
| `notification.routes.js` | Rutas públicas: `GET /public-key`, `POST /subscriptions`, `POST /subscriptions/unsubscribe`, con `pushSubscriptionRateLimiter` (30/15 min por IP). |
| `notification.admin.routes.js` | `GET /stats` (ADMIN/EDITOR). |
| `notification.scheduler.js` | `startNotificationScheduler` (tick 60 s, `unref()`, skip de solapamiento, tick inmediato al arrancar), `stopNotificationScheduler`, `runNotificationSchedulerTick`. |

## 6. Integración con announcements

- `announcement.repository.js`: añadido `notified_at` a las columnas seleccionadas + funciones `claimAnnouncementNotification(announcementId)`, `markAnnouncementNotified(announcementId)`, `listAnnouncementsAwaitingNotification({limit})`.
- `claimAnnouncementNotification`: `UPDATE announcements SET notified_at = CURRENT_TIMESTAMP WHERE id = ? AND notified_at IS NULL AND is_active = 1 AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)`. Devuelve `true` solo si `affectedRows === 1` (claim atómico).
- `announcement.service.changeAnnouncementStatus`: al activar, llama a `notificationService.notifyAnnouncementInBackground(announcementId)` (fire-and-forget). Al ocultar, no envía.
- `toAdminAnnouncement` expone `notifiedAt` (ISO string).
- `announcement.admin.routes.js`: añadido `POST /:announcementId/notify` → `resendAnnouncementController`.

## 7. Endpoints

### Públicos
- `GET /api/notifications/public-key` → `{ enabled, publicKey }` (nunca la privada).
- `POST /api/notifications/subscriptions` (201) → guarda/actualiza suscripción.
- `POST /api/notifications/subscriptions/unsubscribe` → elimina por endpoint.

### Admin (ADMIN/EDITOR)
- `GET /api/admin/notifications/stats` → `{ enabled, subscriptions }`.
- `POST /api/admin/announcements/:announcementId/notify` → reenvío manual.

## 8. Flujo de envío

1. **Al publicar**: `changeAnnouncementStatus(isActive=true)` dispara `notifyAnnouncementInBackground` → `notifyAnnouncementIfVisible` reclama la fila (`claimAnnouncementNotification`) y, si la gana, despacha. Si el aviso está programado para el futuro, el claim falla (`starts_at > now`) y `notified_at` queda NULL.
2. **Scheduler**: cada 60 s busca avisos activos, visibles y con `notified_at IS NULL` y los despacha cuando llega su `startsAt`.
3. **Reenvío manual**: `resendAnnouncement` valida visibilidad (`409 ANNOUNCEMENT_NOT_VISIBLE` si oculto/programado/vencido), aplica un cooldown de 30 s (`409 RESEND_TOO_SOON`), marca `notified_at` y despacha.
4. **Dispatch**: lotes de 20 con `Promise.allSettled`; 404/410 borran la fila; otros errores incrementan `failure_count` (borrado al llegar a 10). Fallo de push nunca revierte la publicación ni bloquea la respuesta.

Idempotencia: el claim atómico `UPDATE ... WHERE notified_at IS NULL` antes de despachar garantiza que dos peticiones concurrentes no envíen dos veces. Nunca se cambió por `SELECT` + `UPDATE`.

## 9. Seguridad

- Endpoints de suscripción públicos pero rate-limited (30/15 min por IP) y con allowlist de hosts push (anti-SSRF).
- `endpoint_hash` SHA-256 como clave única (la URL no cabe en índice MySQL).
- `POST /unsubscribe` en vez de `DELETE` porque `api.delete` del cliente no acepta body y el endpoint es demasiado largo para query string.
- Sin CORS (single-domain).
- Logs solo contadores, nunca endpoints/claves/user agents.

## 10. Frontend

- `src/utils/push.js`: detección de soporte, iOS, standalone, registro SW, `getPushConfig` (cacheado), `subscribeToPush` (pide permiso solo desde gesto), `syncPushSubscription` (dedupe por carga de página, repara en silencio), `unsubscribeFromPush`, helpers de descarte (30 días en `localStorage`).
- `src/components/NotificationPrompt/NotificationPrompt.jsx`: modal propio, espera 20 s o interacción, nunca llama a `Notification.requestPermission()` al cargar, instrucciones iOS si no está instalado. Montado en `Layout`, nunca en `/administracion`.
- `public/sw.js`: solo `push`, `notificationclick`, `pushsubscriptionchange`. **Sin handler de `fetch`** (no PWA offline, no assets viejos). Debe servirse con `Cache-Control: no-cache`.
- `public/manifest.webmanifest` + iconos 192/512 para instalación en iOS (standalone).
- `index.html`: link al manifest + apple meta tags.
- `AnnouncementManager.jsx`: badge "Notificación enviada / Sin notificar" y botón "Notificar/Reenviar" con `notifyInFlightRef` (guard contra double-click). Botón solo para avisos visibles ahora (los programados se envían solos).

## 11. Frontend: flujo de activación

1. Modal espera 20 s o interacción.
2. Clic en "Activar" → `Notification.requestPermission()` (desde gesto).
3. Si concedido: `ensureSubscription` (espera `navigator.serviceWorker.ready`) + `persistSubscription` (POST al backend).
4. Si ya concedido pero sin suscripción: `syncPushSubscription` la repara en silencio, sin modal.
5. Si denegado: no se vuelve a ofrecer.

## 12. Invariantes / guardas (CI)

- `videos.updated_at` manual (no aplica aquí, pero el patrón de "no churn" se replica: `getVideoStatus` skip del UPDATE cuando nada cambió; `CUSTOM` cuenta como no-cambio).
- `media` nunca se toca al borrar publicaciones (`media-reference-guard.test.js`).
- `claimAnnouncementNotification` es condicional (`notified_at IS NULL` + visibilidad) — testeado con SQL guard.
- Scheduler solo selecciona visibles y no notificados — testeado.
- `STATUS_LABELS` / etc. no aplican.

## 13. Operación

- Scheduler: `setInterval` 60 s, `unref()`, arrancado en `startServer()`, detenido en shutdown.
- Con varias instancias del backend, el claim atómico evita envíos duplicados.
- Rotar claves VAPID invalida todas las suscripciones.
- El proxy debe servir `/sw.js` con `Cache-Control: no-cache`.
- Logs de envío solo contadores.

## 14. Tests

- Server: `notification-public.test.js` (feature deshabilitada, allowlist, validators, hash, unsubscribe, dispatch inerte), `notification-send.test.js` (payload acotado, dispatch, 410 removal, fallo transitorio, claim, scheduler), `notification-routes.test.js` (HTTP: public-key, subscribe 201, unsubscribe, stats auth, resend).
- Frontend: `NotificationPrompt.test.jsx` (11 tests: temporizador, activación, descarte, error de bloqueo, deshabilitado, denegado, sync silencioso, admin, iOS con/sin PushManager), `AnnouncementManager.test.jsx` extendido (envío + recarga, reenvío, error no visible, programado sin botón).

## 15. Archivos clave

Backend:
- `server/src/config/env.js` (bloque webPush)
- `server/src/app.js`, `server/src/server.js`
- `server/src/modules/notification/*`
- `server/src/middlewares/push-rate-limit.middleware.js`
- `server/src/modules/announcements/announcement.repository.js`, `announcement.service.js`, `announcement.admin.routes.js`
- `server/database/migrations/20261024120000_create_push_subscriptions.js`
- `server/database/migrations/20261024120500_add_notification_tracking_to_announcements.js`

Frontend:
- `frontend/public/sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`
- `frontend/src/utils/push.js`
- `frontend/src/components/NotificationPrompt/*`
- `frontend/src/components/Layout/Layout.jsx`
- `frontend/src/components/Admin/AnnouncementManager/AnnouncementManager.jsx`, `.css`, `.test.jsx`
- `frontend/index.html`

Docs: `docs/frontend-integration.md` (sección 18), `AGENTS.md` (bloque Web Push).
