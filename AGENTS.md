# AGENTS.md

## Repo shape

Not a workspace. Root `package.json` is literally `{}` — never install or run anything from the repo root.
Two independent npm projects:

- `server/` — Express 5 REST API, **CommonJS**, requires Node `>=24 <25`. Raw SQL via `mysql2` pool (no ORM, no Prisma).
- `frontend/` — Vite 8 + React 19, **ESM**, plain JavaScript (no TypeScript).

Dead ends: root `README.md` is empty, `frontend/README.md` is the untouched Vite template, `client/`, `server/prisma/` and `server/migrations/` are empty leftover directories. Ignore them. The root `.gitignore` mentions `prisma/dev.db` but Prisma is not a dependency.

## Commands

```bash
# server (always cd server first)
npm run dev      # nodemon --env-file=.env src/server.js, port 3000
npm start        # node --env-file-if-exists=.env src/server.js
npm test         # node --test "tests/**/*.test.js" -> 546 tests, no MySQL needed
node --test tests/unit/auth.me.test.js          # single file
node --test --test-name-pattern="stale" tests/unit/auth.me.test.js
node --env-file=.env node_modules/knex/bin/cli.js migrate:latest   # knex CLI (see env note)
node --env-file=.env database/scripts/create-initial-admin.js
node --env-file=.env src/database/test-connection.js

# frontend (always cd frontend first)
npm run dev      # proxies /api -> http://localhost:3000 (vite.config.js)
npm run build    # minifies CSS with lightningcss; see the CSS comment gotcha
npm run lint
npm test         # vitest run -> 34 tests in 3 files, no browser needed
```

- `start` uses `--env-file-if-exists` (Node ≥24) so it boots **both** with a `.env` file and with variables injected by systemd/Docker/PM2. `dev` and `test` are unchanged and still hard-require `.env`.
- There is **no** lint/format/typecheck script for the server. The frontend has **vitest** (`@testing-library/react` + `jsdom`, declared per file with `// @vitest-environment jsdom`); `npm test` is the runner. jsdom does not load images, so a broken thumbnail is simulated with `fireEvent.error(img)`.
- `frontend/npm run lint` **currently fails with 8 pre-existing errors** (`react-hooks/set-state-in-effect` in 5 Admin managers + `pages/Menu.jsx`, `react-refresh/only-export-components` in `context/AuthContext.jsx` and `context/SettingsContext.jsx`). Baseline is red — don't treat it as your regression, and don't refactor those files unless asked.
- **CSS comments must use `/* */`.** A `//` comment in a `.css` file compiles under Vite's dev transform but kills `npm run build` with `lightningcss minify: Invalid empty selector`, because lightningcss does not accept the non-standard syntax. This is the one failure mode where dev passes and prod does not, so always run `npm run build` after touching a stylesheet.
- No npm script exists for migrations or `database/scripts/*`; use the `node --env-file=.env` forms above.

## Environment gotchas

- `server/src/config/env.js` parses, validates and `Object.freeze`s **all** config at require time and throws on anything missing/invalid (JWT secrets ≥32 chars and must differ, TTL must match `^\d+[smhd]$`, `YOUTUBE_TOKEN_ENCRYPTION_KEY` must be exactly 32 bytes hex/base64, `GOOGLE_REDIRECT_URI` must be HTTPS unless `localhost` in non-production, `IMAGEKIT_URL_ENDPOINT` must be exactly `https://ik.imagekit.io/<id>`). Copy `server/.env.example` to `server/.env`; it is gitignored.
- **Knex CLI does not load `.env` itself** and `knexfile.js` requires `src/config/env`, so bare `npx knex ...` fails. Always prefix `node --env-file=.env`.
- `knexfile.js` defines **both** `development` and `production` from one shared `connection`/`migrations` object (via `createEnvironmentConfig()`), so `migrate:latest` resolves with `NODE_ENV=production`. Note `knex` is a **runtime dependency**, not a devDependency, so `npm ci --omit=dev` still ships the CLI.
- `TRUST_PROXY` is optional and only accepts an **integer ≥ 0** (hops). Empty/absent leaves Express' default (no proxy trust, so `request.ip` is the socket address). `true`, `false`, `*`, `loopback` and IP lists are **rejected at startup** on purpose: they trust a client-supplied `X-Forwarded-For` and let anyone mint a fresh rate-limit bucket per request. Set it to `1` behind a single reverse proxy, otherwise every visitor shares one login quota (8 per 15 min site-wide).
- `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` (≥12 chars) are read only by `database/scripts/create-initial-admin.js`; `RESET_ADMIN_EMAIL` / `RESET_ADMIN_PASSWORD` only by `database/scripts/reset-admin-password.js`. None are needed to boot the server and none are read by `env.js` — all four are now documented in `.env.example`, commented out.
- `frontend/.env.development` / `.env.production` are gitignored by the root `.env.*` rule, so a fresh clone has no `VITE_API_BASE_URL`. That's fine: `api/client.js` falls back to `''`, requests go to relative `/api`, and the Vite proxy handles it.

## Server architecture and conventions

Feature modules live in `server/src/modules/<name>/` with a fixed layering:

```
x.routes.js (public)  +  x.admin.routes.js  ->  x.controller.js  ->  x.service.js  ->  x.repository.js
                                              x.validator.js  +  x.constants.js
```

- Every file ends with a named-export object; no default exports.
- **Validators are middleware.** They parse/validate and attach typed values to the request (`request.categoryId`, `request.categoryInput`, `request.categoryListQuery`, ...). Controllers read only those properties, never `request.params`/`request.body` directly. Validator must be listed before the controller in the route chain.
- **All responses go through `successResponse(response, status, data, message)` / `errorResponse(response, status, code, message)`** (`src/shared/http-response.js`) producing `{success, message, data}` or `{success:false, error:{code, message}}`. There is no `errors` array; clients branch on `error.code`.
- Throw `new AppError(statusCode, "SCREAMING_SNAKE_CODE", message)` (`src/errors/app-error.js`). Anything else is swallowed into a 500 `INTERNAL_SERVER_ERROR`. Error codes are part of the public contract — keep them stable.
- Repositories build parameterized SQL strings against the shared `mysql2` pool. Never interpolate user input; `Object.hasOwn` whitelist lookups guard `ORDER BY`.
- Express `json()` limit is `100kb`, but `POST /api/admin/videos/upload` takes a raw streamed `video/mp4` body with `X-Video-Title` / `X-Video-Description` headers — not JSON, not FormData.
- **No CORS middleware exists.** Dev relies on the Vite `/api` proxy; cross-origin in production must be handled at the proxy/infra layer. Don't add a CORS dependency casually. The decided production topology is **single domain behind a reverse proxy**, so no CORS is required and the `SameSite=None; Secure` refresh cookie works as-is.
- **Health endpoints:** `GET /api/health` is a static liveness probe (no database access). `GET /api/health/ready` is the readiness probe: it runs `SELECT 1` through the pool with a short timeout and answers `200` or `503 SERVICE_UNAVAILABLE`. A `200` from `/api/health` alone does **not** prove the database is reachable.
- **Observability:** `error.middleware.js` logs a single sanitized line for any `AppError` with `statusCode >= 500` (code, status, message, method, path **without** query string, and `cause` only as text). AppErrors below 500 are never logged, and request bodies/headers/cookies/tokens are never logged. Keep any new logging to that same shape.
- Auth chain: `authenticate` (verifies bearer JWT, sets `request.auth`) -> `requireActiveUser` (re-reads the user, sets `request.currentUser`, returns `AUTHENTICATION_STALE` when the token role no longer matches the DB role) -> `authorize-roles` (role gate). Rate limiters are applied per-route from `src/middlewares/rate-limit.middleware.js`, `media-rate-limit.middleware.js`, `youtube-rate-limit.middleware.js`. All of them key on `request.ip`, so `TRUST_PROXY` decides whether they see real client addresses or a single shared proxy address. The stores are process-local `Map`s, and each store is swept for expired entries at most once per `PRUNE_INTERVAL_MS`.
- Naming is inconsistent on purpose: `modules/photos/photos.*` is plural while every other module is singular (`announcement.*`, `category.*`, `media.*`, `video.*`, `settings.*`, `user.*`). Use the singular pattern for new modules.
- **Video thumbnails (`videos.thumbnail_source`)**: `YOUTUBE_DEFAULT` vs `CUSTOM`. This is what stops the `GET /admin/videos/:videoId/status` poll from reverting a hand-picked thumbnail: when it is `CUSTOM` the service passes `thumbnailUrl: undefined` and the repository drops it from the `UPDATE`. Any administrative `thumbnailUrl` override flips the marker to `CUSTOM` automatically. `PUT /api/admin/videos/:videoId/thumbnail` (raw `image/jpeg`/`image/png` body, max 10 MiB) and `DELETE` to restore YouTube's own. The persisted URL comes from the `thumbnails.set` **response**, never a follow-up read, because of provider propagation delay. The `youtube.upload` scope already covers this, so no new OAuth consent.
- YouTube rejects **WebP** in `thumbnails.set` even though the ImageKit pipeline accepts it. The browser must emit JPEG.
- Migrations: timestamped CommonJS files in `server/database/migrations/`, tracked in a `knex_migrations` table. 17 files currently. Never edit an applied migration — add a new one.

## Frontend architecture and conventions

- `src/api/client.js` is the only place that calls `fetch`. Use `api.get/post/patch/delete/upload/putBinary` with paths **without** the `/api` prefix (it is prepended). It holds the access token in memory, sends `credentials: 'include'`, and does single-flight auto-refresh-and-retry once on 401. `authApi` bypasses retry for login/refresh/logout. Do not add another fetch call site.
- Image uploads are **direct to ImageKit**, three steps: `POST /admin/media/upload-auth` -> browser `POST` to `upload.uploadUrl` -> `POST /admin/media/confirm` with the `fileId`. See `src/utils/mediaUpload.js`. The file never goes through the API. `MEDIA_UPLOAD_TARGETS` on the server is `categories | products | announcements | photos` — there is no `videos` target, so video thumbnails are *not* ImageKit-backed.
- Video uploads POST the raw `File` to `/admin/videos/upload` with `X-Video-Title` / `X-Video-Description` headers, not FormData. Thumbnails go to `PUT /admin/videos/:id/thumbnail` as a raw `image/jpeg` body (not FormData either), and only once `uploadStatus === 'READY'`.
- Nothing in the frontend resizes **ImageKit** images; only video thumbnails are downscaled (see `imageResize.js` below).
- `api.upload` is POST-only. `PUT` of a raw binary body (the YouTube thumbnail route) goes through `api.putBinary`. Both send `Content-Type: file.type` and the browser sets `Content-Length`, so never set it by hand.
- Video thumbnails live in **YouTube**, not ImageKit. `src/utils/imageResize.js` downscales any browser-decodable image to a centre-cropped 1280x720 JPEG before upload, because the provider rejects WebP and an oversized original is wasted bytes. Never send the picked file untouched; you never control which format a phone produces.
- **`components/ThumbnailImage/` is the only image renderer for a YouTube thumbnail.** `i.ytimg.com` has no `maxresdefault.jpg` for a video YouTube never rendered at 720p, and one set through `thumbnails.set` answers 404 until the CDN publishes it. The component degrades `maxresdefault` -> `hqdefault` -> a placeholder div, and it is the single reason the codebase has no `<img onError>`. Callers must pass `key={baseUrl}` so a changed thumbnail remounts and retries. Two invariants: the degrade is driven by an attempt **counter**, not a boolean (a boolean cannot go from "degraded" to "gave up"), and the variant regex uses a **lookahead** (`(?=\?|$)`) because a consuming pattern would eat the `?` of the `?cb=` cache-buster query.
- `VideoThumbnailField` owns the resize + preview and takes a ready `File`; `VideoManager` owns the request. A custom thumbnail can only be applied once `uploadStatus === 'READY'`, so on a fresh upload it is sent after `waitUntilReady()` resolves and a failure there must not block publishing the video.
- `src/utils/cacheBuster.js` appends a version query to provider image URLs. A custom YouTube thumbnail replaces the bytes behind the *same* `i.ytimg.com` URL, so without it visitors keep seeing the previous frame from cache. `mergeFeed` passes `updatedAt` as the version signal — `createdAt` never moves once the row exists, so it could not invalidate anything. **The parameter name is part of the contract with the provider, not a detail:** `i.ytimg.com` reserves `v` and answers **404** when its value is a large number, which is exactly what an epoch in milliseconds is. That silently broke every public thumbnail while the admin panel kept working, because `VideoManager` renders the stored URL verbatim and never goes through the buster. Never rename `cb` back to `v`; `frontend/src/utils/cacheBuster.test.js` guards it.
- `MediaPicker` (in `components/Admin/MediaPicker/`) is the single image field for categories, products, announcements and day-to-day photos. It takes the `useStagedImage()` object as a prop (`image={image} isBusy={...}`) and offers three sources: none, an existing file from `/admin/media`, or a new local upload. It loads the gallery from its toggle click handler, not an effect, and caches the result — don't "fix" that into a `useEffect`, it reintroduces the `react-hooks/set-state-in-effect` error.
- Reuse relies on `imageMediaId` being a foreign key, not a copy: the same ImageKit file can back many rows at zero extra storage. `useStagedImage().pickExisting(media)` handles that path; `select(file)` handles new uploads and `image.file` vs `image.existingId` in the manager's `handleSubmit` decides which one gets uploaded.
- `withSettingsFallback()` in `api/client.js` overlays `/settings` onto hardcoded Spanish defaults; extend that object when adding a settings field.
- Auth lives in `src/context/AuthContext.jsx` (+ `SettingsContext.jsx`) consumed in `src/App.jsx`; routes are `/`, `/menu`, `/dia-a-dia`, `/nosotros`, `/contacto`, `/administracion`. The refresh token is HttpOnly — never move it to JS state.
- Styling is hand-written CSS colocated next to the component (`Component.jsx` + `Component.css`); no Tailwind, CSS modules, or Prettier. Frontend uses no semicolons and single quotes; the server uses double quotes and semicolons. Match the file you're editing.

## Testing

- `server/tests/unit/*.test.js` uses `node:test` + `node:assert/strict` only (no dev test framework). It runs without MySQL because every file declares its own `TEST_ENVIRONMENT` object, assigns it into `process.env` **before** requiring `src/app`, and mocks `src/database/pool`.
- Naming: `*-public.test.js`, `*-admin-core.test.js` (service-level), `*-admin-routes.test.js` (HTTP-level), plus one file per middleware.
- Route tests `app.listen(0)` and hit the real app over `fetch`.
- New endpoints ship with a matching public/admin test; new error codes get a test. Full suite is ~10s (546 tests), so run it before claiming done.
- `frontend` tests are vitest colocated next to the component (`VideoManager.test.jsx`, `VideoThumbnailField.test.jsx`, `ThumbnailImage.test.jsx`). They `vi.mock('../../../api/client')` wholesale, so any new `api.*` call a component makes must be added to the mock or the test sees `undefined`. Fake timers drive the polling loops: assert on *which paths were requested*, counting `/admin/videos/:id/status` separately from the `PATCH` of the same name, or a duplicated poll can pass unnoticed.

## Docs

`docs/frontend-integration.md` (~59 KB, Spanish) is the authoritative API contract — full endpoint map, error catalog, auth/refresh flows, upload flows, React integration guide. There is no OpenAPI/Swagger file. **Its audit numbers go stale** — verify the test and migration counts against `npm test` and the migrations directory rather than trusting the prose. Keep the doc updated when endpoints or error codes change.

## Operational gotchas

- **`DELETED` is terminal and must never be polled.** `videos.upload_status` also carries `DELETED` (set by the remote-deletion tooling), `listVideos` does not filter it, so it reaches the admin panel. Its status endpoint answers `410 VIDEO_REMOTE_DELETED` forever, so `VideoManager` filters with `isPollableStatus()` (`TERMINAL_UPLOAD_STATUSES = {READY, DELETED}`) and hides every action that waits on YouTube. **Never write a `uploadStatus !== 'READY'` filter** — that is what produced an unbounded 410 loop that kept the refresh timer alive forever and burned quota no other video could use. `STATUS_LABELS` must carry a Spanish label for every enum member, or the raw English value leaks into the UI.
- **Publishing a video requires `uploadStatus === 'READY'`, and only hiding is always allowed.** `changeVideoStatus` throws `410 VIDEO_REMOTE_DELETED` when activating a deleted row and `409 VIDEO_NOT_READY` when activating anything that is not READY, so both conditions collapse to `isReady`. The publish button renders under `video.isActive || isReady`: a `DELETED` or `PROCESSING` row still offers *Ocultar* if it is currently active (that is a legitimate local operation), but never offers *Publicar* for a request the server is guaranteed to refuse. `togglePublished` maps both codes through `describePublishError` instead of one generic message.
- **The status refresh loop polls ONE row per tick, round-robin.** It used to fan out with `Promise.all` over every pending row, which multiplied the per-window cost by the backlog: with 3 pending rows plus one upload that had already burned its 60 `MAX_POLLS`, the 15-minute window peaked at 132 against the 120 ceiling and the *next* upload ate the 429. The cursor lives in a `useRef` because `loadVideos()` recreates the effect on every tick, so an effect-local cursor would reset to zero and always ask about the first row. The budget is now flat (74/120) whether there is 1 pending row or 10. Don't restore the fan-out, and don't lower `POLL_INTERVAL_MS` / `MAX_POLLS` / `MAX_CONSECUTIVE_POLL_FAILURES` to "save quota": how long the panel takes to say "Listo" is a UX decision, and `waitUntilReady` alone can already spend 60 of the 120.
- **A sustained refresh failure must be visible, but a single one must not.** The status loop counts consecutive failures in `refreshFailuresRef` and only reports at `MAX_REFRESH_FAILURES_BEFORE_REPORTING`; a lone blip self-heals on the next tick and would only be noise. Two traps: the counter must be reset in the `.then(onOk, onError)` pair, **not** in a trailing `.then`, because a `.catch` that returns `null` leaves the promise fulfilled and a trailing reset would also run after a failure, so the threshold would never be reached; and a `410` means the row is terminal *for this session* (`remotelyGoneIdsRef`), so stop asking about it — `mapYoutubeError` never emits 410, the only source is `assertRemoteVideoAvailable` reading `DELETED` from the database, so the answer can never change. Otherwise the row stays `PROCESSING` in the list and the loop re-asks forever, which is the DELETED-loop bug wearing a different hat.
- **Guard the two expensive requests with an in-flight ref, not only with `isBusy`.** `disabled={isBusy}` depends on a re-render, so submits dispatched in the same tick slip through. `handleReconnectYouTube` already did this with `reconnectInFlightRef`; `handleUploadSubmit` and `handleRowThumbnailSubmit` use `uploadInFlightRef` / `rowThumbnailInFlightRef` for the same reason. A 2 GB upload or a `thumbnails.set` call is too expensive to lose to a double click.
- `videos.thumbnail_source` (`YOUTUBE_DEFAULT` / `CUSTOM`) was added by migration `20260928093000`. Dropping that column is a **partial rollback**: the status poll would start overwriting hand-picked thumbnails again. Revert the code and the column together, never one alone.
- `videos.thumbnail_source` is a knex-managed ENUM. Changing the allowed values means `changeTable` with the new enum definition, and MySQL recreates the column type.
- The thumbnail route has a per-IP request limit but no per-IP byte limit, so 10 MiB × 20 requests is the worst case per window. Fine for authenticated admins; worth remembering before exposing it more widely.
- Provider quota: `thumbnails.set` costs ~50 units against YouTube's 10,000/day. No quota metric is recorded, so a retry loop could exhaust the day. Watch the logs.
- **`videos.updated_at` has no `ON UPDATE CURRENT_TIMESTAMP`.** Every write must set `updated_at = CURRENT_TIMESTAMP` by hand; `updateVideoById`, `updateVideoStatusById` and `updateVideoProcessingStatus` all do. Adding an `UPDATE videos` that forgets it silently freezes the public `updatedAt` that the thumbnail cache-busting depends on, with no error and only a stale image in visitors' browsers. `tests/unit/video-updated-at-guard.test.js` fails CI on that regression — do not "fix" it by loosening the guard.
- `getVideoStatus` skips the `UPDATE` entirely when `uploadStatus`, `privacyStatus` and `thumbnailUrl` all match what is stored, so polling no longer churns `updated_at`. The `CUSTOM` case (where `thumbnailUrl` is sent as `undefined`) must keep counting as *no change*; if it ever did, polling would both churn `updated_at` and risk reverting an editorial thumbnail.
- `tests/unit/video-thumbnail.test.js` verifies the CUSTOM case through that skip: it asserts **zero** `updateVideoProcessingStatus` calls plus a returned DTO that still carries `thumbnailSource: "CUSTOM"` and the stored URL, even though the provider offered a different frame. If the skip ever regresses and starts writing again, that test fails — don't reintroduce the old "capture the UPDATE input" shape, which contradicts the no-op-when-unchanged rule.
- `rate-limit.middleware.js` sweeps its store for expired entries **at most once per 30 s** (`PRUNE_INTERVAL_MS`), not on every request, because a full walk per request is O(n) and `TRUST_PROXY` makes the key space grow with the number of visitors. The sweep is memory hygiene only: `rateLimit` treats an entry whose `resetAt <= now` as absent when reading it, so limiting stays exact regardless of when the sweep last ran. Never make correctness depend on the sweep having happened.
- **Deleting a publication must never touch the `media` row.** `DELETE /api/admin/{categories,products,announcements,photos}/:id` is a plain `DELETE FROM <tabla> WHERE id = ?`. The image row survives on purpose: that is what frees it, because `MEDIA_IN_USE` is a **live `COUNT(*)`** over `categories`, `products`, `announcements` and `photos` (`media.repository.js` `countMediaReferences`), not a counter stored in `media`. Writing to `media` while deleting (deactivating it, soft-deleting the publication, or deleting the media row) would break that chain. `tests/unit/media-reference-guard.test.js` fails CI on the regression and also checks that no migration adds a cached counter column to `media`.
- **`products.category_id` is `ON DELETE RESTRICT`.** `deleteCategory` counts the products first and answers `409 CATEGORY_HAS_PRODUCTS` (the message carries the count) instead of letting MySQL's errno 1451 become a generic 500. It also maps 1451 defensively, because a product can be inserted between the count and the `DELETE`.
- **The gallery is paginated.** `MediaLibrary` loads 100 media per page with a "Ver más imágenes" button and reads **all** pages of the four usage lists, so a product on page 2 does not make its image look "Sin usar" and then fail with 409. If a usage list cannot be loaded, the card says "Uso no verificado" — never "Sin usar", because the server's 409 is the truth.

## Notificaciones push (Web Push)

- Feature **opcional**: `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` y `WEB_PUSH_SUBJECT` (las tres o ninguna). Sin ellas la API arranca normal, `GET /api/notifications/public-key` responde `{ enabled: false }` y el frontend no ofrece nada. Rotar las claves VAPID invalida todas las suscripciones.
- `announcements.notified_at` es la marca de idempotencia. Se escribe con `claimAnnouncementNotification` (`UPDATE ... WHERE notified_at IS NULL` y la ventana de visibilidad) **antes** de despachar. No cambies eso por un `SELECT` + `UPDATE`: dos peticiones concurrentes mandarían el aviso dos veces. La migración `20261024120500` hace backfill de los avisos activos existentes para que habilitar push no dispare una ráfaga histórica.
- El envío es **fire-and-forget** desde `changeAnnouncementStatus`: un fallo de push nunca revierte la publicación ni bloquea la respuesta. El scheduler (`notification.scheduler.js`, tick de 60 s, `unref()`) cubre los avisos programados con `startsAt` futuro.
- **El endpoint de suscripción es público y el servidor hace POST a esa URL.** `notification.validator.js` exige HTTPS y una allowlist de hosts push (Google, Mozilla, Microsoft, Apple). Quitar la allowlist convierte el endpoint en un SSRF. El `endpoint_hash` SHA-256 es la clave única porque la URL no cabe en un índice de MySQL.
- `POST /api/notifications/subscriptions/unsubscribe` (no `DELETE`) porque `api.delete` del cliente no acepta body y el endpoint es demasiado largo para la query string.
- `frontend/public/sw.js` **no tiene handler de `fetch`**: no cachea nada. Agregar uno convertiría el sitio en una PWA con assets potencialmente viejos. El proxy debe servir `/sw.js` con `Cache-Control: no-cache`.
- El modal (`NotificationPrompt`) espera 20 s o una interacción, nunca llama a `Notification.requestPermission()` al cargar (Safari exige gesto), y recuerda el “Ahora no” 30 días en `localStorage`. En iOS sin instalar muestra los pasos de “Agregar a pantalla de inicio”; el push de iOS solo existe en standalone (16.4+), y para eso está `public/manifest.webmanifest`.
- Si el permiso ya está concedido pero no hay suscripción, `syncPushSubscription()` la repara en silencio. No vuelvas a mostrar el modal en ese caso.
- Los tests mockean `push.provider.sendNotification` por propiedad (`mock.method`), no la librería `web-push`: el servicio la llama como `pushProvider.sendNotification(...)` a propósito. Los tests con VAPID usan claves de prueba y mockean el repositorio; nunca hay red.
- El reenvío manual (`POST /api/admin/announcements/:id/notify`) solo funciona para avisos activos y vigentes (`409 ANNOUNCEMENT_NOT_VISIBLE`) y está protegido en el panel con `notifyInFlightRef`, no solo con `disabled`.

## Git

Default branch is `master`. No CI, no hooks, no PR tooling. Backend commits follow Conventional Commits (`feat:`, `chore:`, `docs:`); recent frontend commits are free-form Spanish ("Frontend v#"). Recent frontend history is large single commits — prefer small, focused ones.
