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
npm start        # node --env-file=.env src/server.js
npm test         # node --test "tests/**/*.test.js" -> 323 tests, no MySQL needed
node --test tests/unit/auth.me.test.js          # single file
node --test --test-name-pattern="stale" tests/unit/auth.me.test.js
node --env-file=.env node_modules/knex/bin/cli.js migrate:latest   # knex CLI (see env note)
node --env-file=.env database/scripts/create-initial-admin.js
node --env-file=.env src/database/test-connection.js

# frontend (always cd frontend first)
npm run dev      # proxies /api -> http://localhost:3000 (vite.config.js)
npm run build
npm run lint
```

- There is **no** lint/format/typecheck script for the server, and **no** test runner for the frontend.
- `frontend/npm run lint` **currently fails with 8 pre-existing errors** (`react-hooks/set-state-in-effect` in 5 Admin managers + `pages/Menu.jsx`, `react-refresh/only-export-components` in `context/AuthContext.jsx` and `context/SettingsContext.jsx`). Baseline is red — don't treat it as your regression, and don't refactor those files unless asked.
- No npm script exists for migrations or `database/scripts/*`; use the `node --env-file=.env` forms above.

## Environment gotchas

- `server/src/config/env.js` parses, validates and `Object.freeze`s **all** config at require time and throws on anything missing/invalid (JWT secrets ≥32 chars and must differ, TTL must match `^\d+[smhd]$`, `YOUTUBE_TOKEN_ENCRYPTION_KEY` must be exactly 32 bytes hex/base64, `GOOGLE_REDIRECT_URI` must be HTTPS unless `localhost` in non-production, `IMAGEKIT_URL_ENDPOINT` must be exactly `https://ik.imagekit.io/<id>`). Copy `server/.env.example` to `server/.env`; it is gitignored.
- **Knex CLI does not load `.env` itself** and `knexfile.js` requires `src/config/env`, so bare `npx knex ...` fails. Always prefix `node --env-file=.env`. `knexfile.js` only defines a `development` environment.
- `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` (≥12 chars) are required by `database/scripts/create-initial-admin.js` but are missing from `.env.example`.
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
- **No CORS middleware exists.** Dev relies on the Vite `/api` proxy; cross-origin in production must be handled at the proxy/infra layer. Don't add a CORS dependency casually.
- Auth chain: `authenticate` (verifies bearer JWT, sets `request.auth`) -> `requireActiveUser` (re-reads the user, sets `request.currentUser`, returns `AUTHENTICATION_STALE` when the token role no longer matches the DB role) -> `authorize-roles` (role gate). Rate limiters are applied per-route from `src/middlewares/rate-limit.middleware.js`, `media-rate-limit.middleware.js`, `youtube-rate-limit.middleware.js`.
- Naming is inconsistent on purpose: `modules/photos/photos.*` is plural while every other module is singular (`announcement.*`, `category.*`, `media.*`, `video.*`, `settings.*`, `user.*`). Use the singular pattern for new modules.
- **Video thumbnails (`videos.thumbnail_source`)**: `YOUTUBE_DEFAULT` vs `CUSTOM`. This is what stops the `GET /admin/videos/:videoId/status` poll from reverting a hand-picked thumbnail: when it is `CUSTOM` the service passes `thumbnailUrl: undefined` and the repository drops it from the `UPDATE`. Any administrative `thumbnailUrl` override flips the marker to `CUSTOM` automatically. `PUT /api/admin/videos/:videoId/thumbnail` (raw `image/jpeg`/`image/png` body, max 10 MiB) and `DELETE` to restore YouTube's own. The persisted URL comes from the `thumbnails.set` **response**, never a follow-up read, because of provider propagation delay. The `youtube.upload` scope already covers this, so no new OAuth consent.
- YouTube rejects **WebP** in `thumbnails.set` even though the ImageKit pipeline accepts it. The browser must emit JPEG.
- Migrations: timestamped CommonJS files in `server/database/migrations/`, tracked in a `knex_migrations` table. 16 files currently. Never edit an applied migration — add a new one.

## Frontend architecture and conventions

- `src/api/client.js` is the only place that calls `fetch`. Use `api.get/post/patch/delete/upload/putBinary` with paths **without** the `/api` prefix (it is prepended). It holds the access token in memory, sends `credentials: 'include'`, and does single-flight auto-refresh-and-retry once on 401. `authApi` bypasses retry for login/refresh/logout. Do not add another fetch call site.
- Image uploads are **direct to ImageKit**, three steps: `POST /admin/media/upload-auth` -> browser `POST` to `upload.uploadUrl` -> `POST /admin/media/confirm` with the `fileId`. See `src/utils/mediaUpload.js`. The file never goes through the API. `MEDIA_UPLOAD_TARGETS` on the server is `categories | products | announcements | photos` — there is no `videos` target, so video thumbnails are *not* ImageKit-backed.
- Video uploads POST the raw `File` to `/admin/videos/upload` with `X-Video-Title` / `X-Video-Description` headers, not FormData. Thumbnails go to `PUT /admin/videos/:id/thumbnail` as a raw `image/jpeg` body (not FormData either), and only once `uploadStatus === 'READY'`.
- Nothing in the frontend resizes **ImageKit** images; only video thumbnails are downscaled (see `imageResize.js` below).
- `api.upload` is POST-only. `PUT` of a raw binary body (the YouTube thumbnail route) goes through `api.putBinary`. Both send `Content-Type: file.type` and the browser sets `Content-Length`, so never set it by hand.
- Video thumbnails live in **YouTube**, not ImageKit. `src/utils/imageResize.js` downscales any browser-decodable image to a centre-cropped 1280x720 JPEG before upload, because the provider rejects WebP and an oversized original is wasted bytes. Never send the picked file untouched; you never control which format a phone produces.
- `VideoThumbnailField` owns the resize + preview and takes a ready `File`; `VideoManager` owns the request. A custom thumbnail can only be applied once `uploadStatus === 'READY'`, so on a fresh upload it is sent after `waitUntilReady()` resolves and a failure there must not block publishing the video.
- `src/utils/cacheBuster.js` appends a version query to provider image URLs. A custom YouTube thumbnail replaces the bytes behind the *same* `i.ytimg.com` URL, so without it visitors keep seeing the previous frame from cache. The public video DTO has no `updatedAt`, so `mergeFeed` passes `createdAt` as the version signal.
- `MediaPicker` (in `components/Admin/MediaPicker/`) is the single image field for categories, products, announcements and day-to-day photos. It takes the `useStagedImage()` object as a prop (`image={image} isBusy={...}`) and offers three sources: none, an existing file from `/admin/media`, or a new local upload. It loads the gallery from its toggle click handler, not an effect, and caches the result — don't "fix" that into a `useEffect`, it reintroduces the `react-hooks/set-state-in-effect` error.
- Reuse relies on `imageMediaId` being a foreign key, not a copy: the same ImageKit file can back many rows at zero extra storage. `useStagedImage().pickExisting(media)` handles that path; `select(file)` handles new uploads and `image.file` vs `image.existingId` in the manager's `handleSubmit` decides which one gets uploaded.
- `withSettingsFallback()` in `api/client.js` overlays `/settings` onto hardcoded Spanish defaults; extend that object when adding a settings field.
- Auth lives in `src/context/AuthContext.jsx` (+ `SettingsContext.jsx`) consumed in `src/App.jsx`; routes are `/`, `/menu`, `/dia-a-dia`, `/nosotros`, `/contacto`, `/administracion`. The refresh token is HttpOnly — never move it to JS state.
- Styling is hand-written CSS colocated next to the component (`Component.jsx` + `Component.css`); no Tailwind, CSS modules, or Prettier. Frontend uses no semicolons and single quotes; the server uses double quotes and semicolons. Match the file you're editing.

## Testing

- `server/tests/unit/*.test.js` uses `node:test` + `node:assert/strict` only (no dev test framework). It runs without MySQL because every file declares its own `TEST_ENVIRONMENT` object, assigns it into `process.env` **before** requiring `src/app`, and mocks `src/database/pool`.
- Naming: `*-public.test.js`, `*-admin-core.test.js` (service-level), `*-admin-routes.test.js` (HTTP-level), plus one file per middleware.
- Route tests `app.listen(0)` and hit the real app over `fetch`.
- New endpoints ship with a matching public/admin test; new error codes get a test. Full suite is ~8s, so run it before claiming done.

## Docs

`docs/frontend-integration.md` (~59 KB, Spanish) is the authoritative API contract — full endpoint map, error catalog, auth/refresh flows, upload flows, React integration guide. There is no OpenAPI/Swagger file. **Its audit numbers go stale** — verify the test and migration counts against `npm test` and the migrations directory rather than trusting the prose. Keep the doc updated when endpoints or error codes change.

## Operational gotchas

- `videos.thumbnail_source` (`YOUTUBE_DEFAULT` / `CUSTOM`) was added by migration `20260928093000`. Dropping that column is a **partial rollback**: the status poll would start overwriting hand-picked thumbnails again. Revert the code and the column together, never one alone.
- `videos.thumbnail_source` is a knex-managed ENUM. Changing the allowed values means `changeTable` with the new enum definition, and MySQL recreates the column type.
- The thumbnail route has a per-IP request limit but no per-IP byte limit, so 10 MiB × 20 requests is the worst case per window. Fine for authenticated admins; worth remembering before exposing it more widely.
- Provider quota: `thumbnails.set` costs ~50 units against YouTube's 10,000/day. No quota metric is recorded, so a retry loop could exhaust the day. Watch the logs.

## Git

Default branch is `master`. No CI, no hooks, no PR tooling. Backend commits follow Conventional Commits (`feat:`, `chore:`, `docs:`); recent frontend commits are free-form Spanish ("Frontend v#"). Recent frontend history is large single commits — prefer small, focused ones.
