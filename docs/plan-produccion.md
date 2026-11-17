# Plan de producción — Nacatamales de Doña Antonia

> **Estado:** propuesta aprobada con ajustes (16/11/2026). Este documento es el
> plan vivo: se marca aquí, no en la conversación.
>
> **Leyenda:** `[ ]` pendiente · `[x]` hecho · `[~]` bloqueado / no aplica
>
> **Línea base medida el 16/11/2026:** backend **908 tests / 0 fallos**
> (`cd server && npm test`, 13,5 s) · frontend **204 tests / 27 archivos / 0 fallos**
> (`cd frontend && npm test`) · **22 migraciones** · Node **v24.21.0**
> (`requestTimeout=300000`, `headersTimeout=60000`, `keepAliveTimeout=5000`).
>
> **Reglas vigentes:** no se reabre el asistente de IA (es un agregado) ni el flujo
> de YouTube (fijo; los problemas de reconexión desaparecen con dominio oficial).
> Todo cambio en `server/` es **REQUIERE APROBACIÓN** y espera a que aterricen los
> 8 archivos que el otro agente tiene hoy en curso (`git status`). Orden: de menor
> a mayor riesgo, dominio oficial al final.

---

## 0. Cambios respecto a la versión anterior

| # | Ajuste pedido | Qué cambió en el plan | Etapa |
|---|---|---|---|
| 1 | **No se puede validar "por IP" con `NODE_ENV=production`** | Se elimina el smoke "por IP". Se añade **Etapa 4.0** con subdominio temporal gratuito (DuckDNS) + HTTPS real desde el inicio. Cookie `Secure`, CSP, `SameSite`, `Origin`, OAuth y panel se validan **solo ahí**. Se documenta qué queda imposible de probar por IP (nada de navegador). | 4.0, 4.1, 5 |
| 2 | **Reuse detection: carrera de pestañas** | El frontend serializa el refresh entre pestañas con **Web Locks** (`navigator.locks`) + fallback. El `409 REFRESH_TOKEN_RACE` y `ROTATION_GRACE_MS = 30 s` se mantienen como red de seguridad; el reintento espera **400 ms** y hace **máximo 2 intentos**. Tests nuevos con y sin Web Locks. | 8 (+ cliente) |
| 3 | **HSTS anulado por `add_header` en `location`** | `Strict-Transport-Security` se mueve a `snippets/seguridad.conf` (junto a CSP, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) y se incluye en **cada** location que declare `add_header`. Se añade tabla "qué emite cada location" y un `curl -I` por location en la validación. | 5 |
| 4 | **Fallo silencioso del sitemap** | Verificación con `curl -I /sitemap.xml` y `/robots.txt` exigiendo `application/xml` y `text/plain` (no `text/html`). `location` explícitas con `default_type`. Nueva bandera **`REQUIRE_SITE_URL=1`** que **hace fallar** el build de despliegue si falta `VITE_SITE_URL`; el build local sigue avisando y no rompe. | 2 y 5 |
| 5 | **Faltantes de la Etapa 4** | Usuario de despliegue sin root, SSH solo con llave, fail2ban, `unattended-upgrades`, swap si el VPS es pequeño. **Cálculo real de la subida de video** (2 GiB): el límite duro no es Nginx, es `requestTimeout` de Node (300 s). Backups con credenciales en archivo `600` (`--defaults-extra-file`). | 4.1 |
| 6 | **Tope del Map del límite por cuenta** | `createRateLimiter` gana `maxEntries` (10 000) con desalojo FIFO; el sweep de 30 s queda acotado. El bloqueo de la dueña se marca como **decisión de negocio pendiente**, con la alternativa de no implementarlo. | 6 |
| 7 | **`clearRefreshTokenCookie` con las mismas opciones** | **Verificado**: usa `getRefreshTokenCookieOptions()` (`auth.controller.js:48-53`), así que `path`/`sameSite`/`secure` son idénticos por construcción. Se añade test que fija `SameSite=Strict` + `Path=/api/auth` + valor vacío en el `Set-Cookie` de logout. | 7 |
| 8 | **Acción no técnica** | Nueva **Etapa 10**: reclamar/crear el Google Business Profile con los datos listos (nombre, dirección, horario, teléfono, fotos) y consistencia NAP con el sitio. | 10 |

---

## 1. Resumen ejecutivo

### 1.1 Estado real de cada hallazgo (verificado en código)

| # | Hallazgo | Estado | Evidencia |
|---|---|---|---|
| A | Cookie refresh `SameSite=None` en producción | Confirmado | `server/src/modules/auth/auth.controller.js:24-31` (línea 28) |
| B | Sin detección de reutilización | Confirmado | `server/src/modules/auth/auth-session.service.js:80-170` (rama 103-110) |
| C | Frontend sin CSP/HSTS | Confirmado con matiz | `helmet()` solo cubre `/api` (`app.js:109`); helmet 8 ya emite HSTS en respuestas de `/api`, pero el **documento HTML** no tiene cabeceras |
| D | `og:image` relativa, sin robots/sitemap/canonical/JSON-LD | Confirmado | `frontend/index.html:29-48`; no hay `public/robots.txt` ni `public/sitemap.xml`; `usePageTitle.js:6-13` solo cambia el título |
| E | Secretos y archivos de desarrollo | **Parcialmente incorrecto** | **Sí existe `.gitignore` raíz** (48 líneas) y ya cubre `.env`, `.env.*`, `verify-*.js/txt`, `client_secret_*.json`. `git log --all` nunca añadió un `.env`. Falta `server/.gitignore`, exclusión de despliegue y tabla de rotación |
| F | Rate limiter en memoria | Confirmado | `rate-limit.middleware.js:3-6,21-27,119-137` |
| G | Cambio de logo | Confirmado con corrección | `hero.png`, `icons.svg`, `react.svg`, `vite.svg` **sin referencias**; el logo visible es `symbol id="icon-badge"` + texto (`Header.jsx:36-42`) |
| H | Despliegue en VPS | Confirmado | No existe ningún `*.service`, `ecosystem*`, `nginx*` ni `Dockerfile` |

### 1.2 NO VERIFICADO (y por qué)

| Tema | Motivo |
|---|---|
| Contenido de `server/.env`, `.env.test`, `.env.verify` | No se leen secretos. Solo se confirmó existencia, tamaño y que git los ignora |
| Nginx / SO / systemd / certbot del VPS | Sin acceso al servidor; el repo no tiene configuración |
| Dominio real, DNS, apex vs `www` | No existe todavía |
| Crawlers de WhatsApp/Facebook | Sin URL pública. Es seguro que **no ejecutan JS**: solo ven el HTML estático |
| **Google OAuth con el subdominio DuckDNS** | Se puede probar el flujo (modo *Testing* con el admin como *test user*), pero no se puede garantizar desde el repo que la consola no exija verificar el dominio para los *scopes* sensibles de YouTube al publicar |
| Logo del cliente | No entregado |
| Consola de Google Cloud, Google Business Profile | Fuera del repo |
| `og-image.png` sin transparencia/bandas | Solo se verificaron 1200×630 y 262 KB |
| Trabajo del agente de backend | 8 archivos modificados/sin commitear en `server/` y `docs/` (`git status`) |

### 1.3 Orden de etapas

```
1  Higiene de secretos            (docs/gitignore, 0 código)
2  SEO y metadatos                (frontend, sin dominio)
3  Logo                           (assets, cuando el cliente entregue)
4.0 Subdominio temporal + HTTPS   (DuckDNS + Let's Encrypt)
4.1 Base del VPS                  (SSH, firewall, MySQL, systemd, backups)
5  Nginx: cabeceras, CSP, proxy   (verificado sobre 4.0)
6  Límite por cuenta              (backend, bajo)      ← aprobación
7  Cookie SameSite + Origin       (backend, medio)     ← aprobación
8  Reuse detection + Web Locks    (backend, alto)      ← aprobación
9  Dominio oficial                (DNS, certs, OAuth, OG final)
10 Google Business Profile        (no técnica, cliente)
```

---

## 2. Plan por etapas

### Etapa 1 — Higiene de secretos y artefactos (hallazgo E)

**Objetivo:** que nada de la máquina de desarrollo llegue al VPS ni al repositorio, y tener la rotación escrita antes de tocar producción.

- [ ] Confirmar el estado: `git ls-files | Select-String '\.env'` → solo `server/.env.example`; `git check-ignore -v server/.env server/.env.test server/.env.verify`; `git log --all --diff-filter=A --name-only | Select-String '^server/\.env'` → vacío.
- [ ] Crear `server/.gitignore` (espejo del bloque raíz: `.env`, `.env.*`, `!.env.example`, `verify-*.js`, `verify-*.txt`). **REQUIERE APROBACIÓN.**
- [ ] Crear `frontend/.env.example` con `VITE_SITE_URL=` y `VITE_API_BASE_URL=` comentado (producción va **sin** `VITE_API_BASE_URL`: mismo origen).
- [ ] Escribir la lista de exclusión de despliegue: `server/.env*` (salvo `.env.example`), `server/.env.test*`, `server/.env.verify`, `server/verify-*.js`, `server/verify-out.txt`, `frontend/.env.development`, `frontend/.env.production`, `node_modules/`, `dist/`, `.git/`, `.vscode/`.

**Tabla de rotación (orden y efecto)**

| Orden | Clave | Efecto | Cuándo |
|---|---|---|---|
| 1 | `DB_PASSWORD` | Reinicio; verificar `/api/health/ready` | Antes de abrir |
| 2 | `JWT_ACCESS_TOKEN_SECRET` + `JWT_REFRESH_TOKEN_SECRET` (≥32, distintas) | **Cierra todas las sesiones** al instante | Antes de abrir, sin nadie logueado |
| 3 | `IMAGEKIT_PRIVATE_KEY` (+ `PUBLIC_KEY` si se regenera el par) | Solo firmas nuevas. **No cambiar `IMAGEKIT_URL_ENDPOINT`**: romperías todas las URLs guardadas | Antes de abrir |
| 4 | `GOOGLE_CLIENT_SECRET` (y `CLIENT_ID` si se crea otro cliente) | Obliga a **reconectar YouTube**; con `CLIENT_ID` nuevo hay que registrar el redirect URI | Antes de abrir |
| 5 | `YOUTUBE_TOKEN_ENCRYPTION_KEY` | El refresh token cifrado (AES-256-GCM) **no descifra** → reconectar | **Antes de la primera conexión**, o aceptar reconexión |
| 6 | `GEMINI_API_KEY` / `NVIDIA_API_KEY` | Solo el asistente (si falta, queda apagado y la API arranca) | Cuando convenga |
| 7 | `WEB_PUSH_*` (VAPID) | **Invalida todas las suscripciones**; se limpian al recibir 404/410 | Antes de anunciar el sitio |
| 8 | `INITIAL_ADMIN_*` / `RESET_ADMIN_*` | Solo scripts one-shot; borrar del entorno tras usarlas | Alta del admin |

- [ ] Registrar la tabla en este documento (hecho) y revisarla en la Etapa 9.

**Terminado cuando:** `git status` limpio de artefactos, `git check-ignore` cubre los archivos locales, y las suites siguen en 908/204.

---

### Etapa 2 — SEO, canonical, robots/sitemap, noindex y JSON-LD (hallazgo D)

**Objetivo:** vista previa correcta en WhatsApp y 5 páginas públicas con metadatos para Google, sin duplicar datos del negocio.

- [ ] Plugin local en `frontend/vite.config.js` (`transformIndexHtml`) que sustituya `__SITE_URL__` en `og:image`, `og:url` y `<link rel="canonical">`. **No usar `%VITE_SITE_URL%`** (Vite deja el token literal si falta y publica una URL rota sin error).
- [ ] **Aviso suave por defecto**: si falta `VITE_SITE_URL`, el build local **no rompe** (deja URLs relativas) y emite `console.warn`.
- [ ] **Bandera de despliegue**: con `REQUIRE_SITE_URL=1`, el plugin **lanza error** y el build falla si falta `VITE_SITE_URL`. Comando de despliegue:
  ```powershell
  $env:REQUIRE_SITE_URL='1'; $env:VITE_SITE_URL='https://DOMINIO'; npm run build
  ```
- [ ] `frontend/src/utils/siteUrl.js`: `SITE_URL = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/+$/,'')` (runtime; tolera el olvido de la variable).
- [ ] Convertir `usePageTitle.js` (6-13) en `usePageMeta({ title, description, noindex })` que actualice `meta[name=description]`, `og:title`, `og:description`, `og:url`, `link[rel=canonical]` y limpie al desmontar. Actualizar llamadas: `Home.jsx:29`, `Menu.jsx:22`, `DiaADia.jsx:14`, `Nosotros.jsx:10`, `Contacto.jsx:26`, `Administracion.jsx:68`, `NotFound.jsx:6`.
- [ ] **Generar** `robots.txt` y `sitemap.xml` en `dist/` desde el plugin (no en `public/`: `<loc>` debe ser absoluto). 5 URLs públicas, `Disallow: /administracion`, línea `Sitemap:`. Si falta `VITE_SITE_URL`, **no se emiten** y avisa.
- [ ] **`/administracion` con `noindex`** por dos vías: `usePageMeta({ noindex: true })` en `Administracion.jsx:68` y `X-Robots-Tag` en Nginx (Etapa 5).
- [ ] `frontend/src/components/StructuredData/StructuredData.jsx` montado en `Layout.jsx:11`: un único `<script type="application/ld+json" id="site-jsonld">` con `Restaurant`, `name`, `url`, `image`, `telephone`, `address`, `geo`, `sameAs`, `hasMenu` — **solo** los campos presentes en settings. **Sin `openingHoursSpecification`**: `scheduleText` es texto libre; inventarlo es peor que omitirlo.

**Nota honesta:** WhatsApp y Facebook **no ejecutan JS**. El único OG que verán es el estático de `index.html`. Lo dinámico es para Google.

**Terminado cuando:** el build de despliegue falla sin `VITE_SITE_URL`, con la variable genera OG/canonical absolutos y `sitemap.xml`/`robots.txt`, y el panel expone `noindex`.

**Verificación**
```powershell
cd frontend
npm run build                                  # sin variable: aviso, no rompe
$env:REQUIRE_SITE_URL='1'; npm run build       # debe FALLAR
$env:VITE_SITE_URL='https://ejemplo.test'; npm run build
Select-String dist/index.html -Pattern 'og:image|og:url|canonical'
Get-Content dist/robots.txt; Get-Content dist/sitemap.xml
npm test                                       # 204 + nuevos
```
Tras desplegar (Etapa 5/9), el fallo silencioso se caza así:
```bash
curl -sI https://DOMINIO/sitemap.xml | grep -i content-type   # application/xml
curl -sI https://DOMINIO/robots.txt  | grep -i content-type   # text/plain
```
Si el fallback de la SPA devuelve `text/html` con 200, el sitemap no se generó.

**Tests:** `usePageMeta.test.jsx` (título, description, canonical, noindex, limpieza) y `StructuredData.test.jsx` (un solo script, JSON esperado, ausencia de `openingHoursSpecification`).

---

### Etapa 3 — Logo (hallazgo G) — depende del cliente

| Archivo | Medida / formato | Uso real |
|---|---|---|
| `frontend/public/favicon.svg` | SVG 48×48 | `index.html:16` |
| `frontend/public/apple-touch-icon.png` | 180×180 PNG | `index.html:17` y **fallback del icono de push** (`sw.js:37-38`) |
| `frontend/public/icon-192.png` / `icon-512.png` | 192 y 512 PNG | `manifest.webmanifest:11-24` |
| `frontend/public/og-image.png` | 1200×630 PNG | `index.html:44-47` y JSON-LD `image` |
| `src/components/icons/Icons.jsx` → `symbol id="icon-badge"` | SVG inline 48×48 | `Header.jsx:37` (40 px, 48 px móvil) |
| `index.html:13` + `manifest:9-10` | `theme-color #FFF4DC` | barra del navegador / instalación |
| `src/utils/brand.js` | texto en 2 líneas | `Header.jsx:27` |
| **Sin uso** | `src/assets/hero.png`, `public/icons.svg`, `src/assets/react.svg`, `vite.svg` | restos: borrar, no reemplazar |

- [ ] Pedir al cliente: SVG horizontal + vertical + solo-símbolo; PNG 512/192 transparentes; 180×180 para iOS **con fondo crema opaco**; social 1200×630 (<600 KB, zona segura central); opcional monocromo.
- [ ] Decidir si el logo incluye el nombre: si sí, **quitar el texto** del Header (si no, se duplica).
- [ ] Reemplazar en orden: icon-badge → favicon/apple-touch → manifest + `sw.js` → og-image → `theme-color` (solo si cambia la paleta).
- [ ] Versionar por **nombre de archivo** (`favicon.v2.svg`, `icon-192.v2.png`, `og-image.v2.png`), no por query: hay navegadores que ignoran `?v=` en favicon. Actualizar las 5 referencias.
- [ ] Si cambia la paleta: los tokens están en `frontend/src/index.css` y `styles/base.css` y hay ratios de contraste en `docs/guia-de-marca.md:27-73`. Eso **no es un cambio de logo**: recalcular y presupuestar aparte. La crema `#FFF4DC` está declarada "no se modifica".

**Terminado cuando:** 0 referencias huérfanas, manifest válido en DevTools, push con icono correcto, header sin nombre duplicado.
**Tests:** opcional `manifest-icons.test.js` que verifique que cada `icons[].src` existe en `public/`.

---

### Etapa 4.0 — Subdominio temporal con HTTPS real (nuevo)

**Por qué:** con `NODE_ENV=production` la cookie de refresh sale `Secure` (`auth.controller.js`), el navegador la descarta por HTTP y la sesión se pierde al recargar; además el bloque de Nginx asume certificado. Validar "por IP" solo sirve para `curl`, no para navegador.

- [ ] Crear subdominio gratuito (DuckDNS): `NOMBRE.duckdns.org` → A a la IP del VPS.
- [ ] Actualización automática de la IP: systemd timer cada 5 min con
  `curl -s "https://www.duckdns.org/update?domains=NOMBRE&token=TOKEN&ip="` (el token va en archivo `600`, no en la unidad).
- [ ] Confirmar DNS antes de pedir certificado: `nslookup NOMBRE.duckdns.org`.
- [ ] Instalar Nginx con un `server` mínimo en 80 y obtener certificado con **HTTP-01** (DuckDNS no expone API de TXT):
  ```bash
  certbot certonly --nginx -d NOMBRE.duckdns.org --staging   # primero staging
  certbot certonly --nginx -d NOMBRE.duckdns.org             # luego real
  ```
  Rate limit de Let's Encrypt: 5 certificados duplicados/semana → usar `--staging` hasta que todo esté bien.
- [ ] Timer de renovación con `--deploy-hook "systemctl reload nginx"`; probar `certbot renew --dry-run`.
- [ ] `GOOGLE_REDIRECT_URI=https://NOMBRE.duckdns.org/api/youtube/oauth/callback` en `.env` (necesario para que el proceso arranque en `production`: `env.js:142-174` exige HTTPS).
- [ ] **Probar Google OAuth con el subdominio** en Cloud Console → Credenciales → añadir la URI exacta; app en modo **Testing** con el admin como *test user*; ejecutar "Conectar YouTube".
  - Si Google acepta: adelantas la conexión y la CSP/`Origin` se prueban con el flujo real.
  - Si Google la rechaza (o exige verificar `duckdns.org`, que no es tuyo): **no bloquea nada**. Se deja YouTube **sin conectar** hasta la Etapa 9 y todo lo demás (cookie `Secure`, `SameSite`, `Origin`, panel, subidas a ImageKit, push) se valida igual. Marcar `[~]` en este punto y anotar el motivo.
- [ ] Rebuild con `VITE_SITE_URL=https://NOMBRE.duckdns.org` **solo para validar** el mecanismo de OG/sitemap; se reconstruye en la Etapa 9 con el dominio real.

**Qué NO se puede probar aquí:** vista previa de WhatsApp/Facebook (cachearía la URL temporal: **no compartir el enlace**), indexación/Search Console, HSTS `preload` (nunca), Google Business Profile (usa el dominio final) y cualquier cosa de "producción definitiva".
**Qué sí:** HTTPS, `Secure`, `SameSite=Strict`, `Origin`, CSP en report-only, subida de imagen/video/miniatura, push, panel completo, OAuth de YouTube (si Google lo acepta).

---

### Etapa 4.1 — Base del VPS

- [ ] Node 24.x. `server/`: `npm ci --omit=dev` (knex es dependencia de runtime: el CLI de migraciones sobrevive).
- [ ] **Usuario de despliegue sin root** (`deploy`) + usuario de servicio (`nacatamales`) para el proceso. `sudo` solo para `systemctl`/`nginx`/`certbot`.
- [ ] **SSH solo con llave**: `PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `AllowUsers deploy`.
- [ ] **fail2ban** con jail `sshd` (`maxretry=5`, `bantime=1h`); opcional jail de nginx para 401/429 repetidos.
- [ ] **`unattended-upgrades`** para parches de seguridad; `Automatic-Reboot "false"` (o ventana definida) y aviso por correo.
- [ ] **Swap** si el VPS tiene ≤2 GB de RAM: 2 GB de swap y `vm.swappiness=10`.
- [ ] MySQL 8: base `utf8mb4`, usuario dedicado (no root), `bind-address=127.0.0.1`. Migraciones:
  ```bash
  cd /opt/nacatamales/server
  node --env-file=.env node_modules/knex/bin/cli.js migrate:latest
  node --env-file=.env database/scripts/create-initial-admin.js
  ```
- [ ] `.env` de producción: `NODE_ENV=production`, `PORT=3000`, `TRUST_PROXY=1`, permisos `600`, dueño `nacatamales`.
- [ ] **systemd, una sola instancia**: `Type=simple`, `Restart=always`, `RestartSec=3`, `EnvironmentFile=-/opt/nacatamales/server/.env`, `TimeoutStopSec=15` (el proceso tiene corte forzado a 10 s, `server.js:51-56`), `NoNewPrivileges=true`, `PrivateTmp=true`. **Prohibido** `pm2 -i max` / dos unidades: el rate limiter es por proceso (`rate-limit.middleware.js:119-123`).
- [ ] Firewall: 22 (solo llave), 80, 443. MySQL cerrado al exterior.
- [ ] **Backups con credenciales fuera de la línea de comandos**:
  ```ini
  # /etc/mysql/backup.cnf   (chmod 600, root:root)
  [client]
  user=backup
  password=...
  ```
  ```bash
  mysqldump --defaults-extra-file=/etc/mysql/backup.cnf \
    --single-transaction --routines --triggers BASE | gzip > /var/backups/...
  ```
  `--defaults-extra-file` debe ser **el primer argumento**. Systemd timer nocturno, retención 14–30 días, copia fuera del VPS.
- [ ] **Prueba de restauración** en base scratch + `SELECT COUNT(*)` en `videos`, `announcements`, `auth_sessions`. Sin esto el backup no cuenta.
- [ ] Logs: app a journald, `logrotate` para Nginx, retención 30 días.
- [ ] Monitoreo: `curl -fsS https://HOST/api/health/ready` cada minuto, alerta a 503. **No** usar `/api/health` (liveness estático) para decidir tráfico.
- [ ] Timer mensual `database/scripts/cleanup-auth-sessions.js` (retención 30 días; acota también la ventana de la Etapa 8).

**Subida de video: el límite real es Node, no Nginx.** Verificado: `validateVideoUpload` asigna `fileStream: request` y `MAX_VIDEO_UPLOAD_BYTES = 2 GiB`; el controller responde **cuando YouTube termina**, así que la petición queda abierta todo el tiempo. Node 24 trae `requestTimeout = 300000` (5 min) para recibir la petición completa → **cualquier subida de más de 5 min muere con 408**.

| Subida del cliente | 200 MiB | 500 MiB | 1 GiB | 2 GiB |
|---|---|---|---|---|
| 5 Mbps | 5,6 min | 14,0 min | 28,6 min | **57,3 min** |
| 10 Mbps | 2,8 min | 7,0 min | 14,3 min | 28,6 min |
| 20 Mbps | 1,4 min | 3,5 min | 7,2 min | 14,3 min |
| 50 Mbps | 0,6 min | 1,4 min | 2,9 min | 5,7 min |

- [ ] **REQUIERE APROBACIÓN** (`server/src/server.js`): subir `server.requestTimeout` a **3 600 000 ms (1 h)** — cubre 2 GiB desde ~4,8 Mbps — o ponerlo a `0` si se confía en los timeouts de Nginx. Mantener `headersTimeout=60000`. Con `requestTimeout=300000` (actual) solo caben ~187 MB a 5 Mbps. Riesgo: un cliente colgado ocupa socket hasta 1 h; mitigado con `client_body_timeout` de Nginx, autenticación y `youtubeUploadRateLimiter`.
- [ ] Nginx: `proxy_read_timeout 3600s` y `proxy_send_timeout 3600s` para `/api/admin/videos/upload` (son **inactividad entre lecturas/escrituras**, no duración total, pero deben cubrir la cola de YouTube tras el último byte).
- [ ] Decisión de producto (no de código): recomendar al cliente videos ≤ **500 MiB** (14 min a 5 Mbps). `MAX_VIDEO_UPLOAD_BYTES` sigue en 2 GiB salvo que se apruebe bajarlo.

**Terminado cuando:** `systemctl status` activo, reinicio tras `kill` verificado, `/api/health/ready`=200, backup generado **y restaurado**, un solo proceso Node (`pgrep -af node`), y una subida real de ~200 MB completa sin 408.

---

### Etapa 5 — Nginx: cabeceras, CSP, caché y proxy (hallazgo C)

**Orígenes externos reales (verificados)**

| Directiva | Origen | Dónde |
|---|---|---|
| `style-src` | `https://fonts.googleapis.com` | `index.html:55-60` |
| `font-src` | `https://fonts.gstatic.com` | ídem |
| `img-src` | `'self' data: blob: https://ik.imagekit.io https://i.ytimg.com` | ImageKit, miniaturas, preview `blob:` (`useStagedImage.js:26`) |
| `connect-src` | `'self' https://upload.imagekit.io` | subida directa a ImageKit (`media.service.js:21,373`) |
| `frame-src` | `https://www.youtube.com https://www.google.com` | `DiaADia.jsx:93`, `Contacto.jsx:126` |
| `worker-src` | `'self'` | `sw.js` (`push.js:49-58`) |
| `style-src-attr` | `'unsafe-inline'` | `Menu.jsx:117`, `App.jsx:22` |
| — | `wa.me`, `google.com/maps` (enlaces) | navegación: no la restringe CSP |

**Corrección de HSTS:** `Strict-Transport-Security` va **dentro** de `snippets/seguridad.conf`, igual que CSP, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy`. Cualquier `location` que declare su propio `add_header` **anula** los del `server`, así que incluye el snippet. `expires` **no** anula la herencia.

```nginx
# /etc/nginx/snippets/seguridad.conf
# Todas las cabeceras de seguridad, incluida HSTS, en un solo sitio.
add_header Strict-Transport-Security "max-age=300; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=(), usb=()" always;
add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://ik.imagekit.io https://i.ytimg.com; media-src 'self'; connect-src 'self' https://upload.imagekit.io; frame-src https://www.youtube.com https://www.google.com; worker-src 'self'; manifest-src 'self'; upgrade-insecure-requests" always;
```

```nginx
# /etc/nginx/sites-available/nacatamales
server {
    listen 80;
    listen [::]:80;
    server_name HOST www.HOST;

    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://HOST$request_uri; }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name www.HOST;
    ssl_certificate     /etc/letsencrypt/live/HOST/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/HOST/privkey.pem;
    return 301 https://HOST$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name HOST;

    ssl_certificate     /etc/letsencrypt/live/HOST/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/HOST/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    server_tokens off;
    root /var/www/nacatamales/dist;
    index index.html;

    # Herencia: las locations SIN add_header propio heredan estas 5.
    include /etc/nginx/snippets/seguridad.conf;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml application/manifest+json;

    # Assets con hash: cache larga (add_header propio -> repetir snippet)
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        include /etc/nginx/snippets/seguridad.conf;
    }

    # Documento y service worker: no-cache sin add_header (expires no anula herencia)
    location = /index.html { expires -1; }
    location = /sw.js      { expires -1; }
    location = /manifest.webmanifest { expires 1h; }

    # Tipos explícitos: si el archivo falta, el fallback SPA devolvería html
    location = /sitemap.xml { default_type application/xml; }
    location = /robots.txt  { default_type text/plain; }

    location ~* ^/(favicon|icon-|apple-touch-icon|og-image) { expires 1d; }

    # Panel: noindex también para crawlers sin JS
    location = /administracion {
        add_header X-Robots-Tag "noindex, nofollow" always;
        include /etc/nginx/snippets/seguridad.conf;
        try_files /index.html =404;
    }

    # API: un add_header propio corta la herencia a propósito.
    # helmet ya emite su CSP y su HSTS; dos CSP en la misma respuesta confunden.
    location /api/ {
        add_header X-Content-Type-Options "nosniff" always;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        client_max_body_size 25m;   # miniatura 10 MiB + margen
    }

    # Subida de video: body crudo hasta 2 GiB, sin buffer en disco
    location = /api/admin/videos/upload {
        add_header X-Content-Type-Options "nosniff" always;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 2048m;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Qué emite realmente cada location** (HSTS = `Strict-Transport-Security`)

| Location | `add_header` propio | HSTS | CSP | `nosniff` | `Referrer`/`Permissions` | Extra | `Cache-Control` |
|---|---|---|---|---|---|---|---|
| `/assets/` | sí (Cache-Control) | sí (snippet) | sí | sí | sí | — | `public, max-age=31536000, immutable` |
| `= /index.html` | no | **sí (heredado)** | sí | sí | sí | — | `no-cache` (`expires -1`) |
| `= /sw.js` | no | **sí (heredado)** | sí | sí | sí | — | `no-cache` |
| `= /manifest.webmanifest` | no | sí | sí | sí | sí | — | `max-age=3600` |
| iconos / `og-image` | no | sí | sí | sí | sí | — | `max-age=86400` |
| `= /administracion` | sí (X-Robots-Tag) | sí (snippet) | sí | sí | sí | `X-Robots-Tag: noindex` | `no-cache` |
| `= /sitemap.xml` | no (solo `default_type`) | sí | sí | sí | sí | `application/xml` | — |
| `= /robots.txt` | no (solo `default_type`) | sí | sí | sí | sí | `text/plain` | — |
| `/api/` | sí (`nosniff`) | **no** (helmet) | **no** (helmet) | sí | no | — | — |
| `= /api/.../upload` | sí (`nosniff`) | **no** (helmet) | **no** (helmet) | sí | no | timeouts largos | — |
| `/` (fallback SPA) | no | **sí (heredado)** | sí | sí | sí | — | — |
| `server` 80 | no | no | no | no | no | solo 301/ACME | — |

**Validación**
- [ ] `nginx -t`.
- [ ] **CSP en `Content-Security-Policy-Report-Only` 24 h**: recorrer Inicio, Menú, Día a día, Nosotros, Contacto y el panel logueado → consola **sin violaciones**. Luego pasar a bloqueo.
- [ ] `curl -I` **por cada location** (una línea por fila de la tabla):
  ```bash
  curl -sI https://HOST/                  # HSTS, CSP, nosniff, Referrer, Permissions
  curl -sI https://HOST/index.html        # + Cache-Control: no-cache
  curl -sI https://HOST/assets/<hash>.js  # + immutable
  curl -sI https://HOST/sw.js             # no-cache
  curl -sI https://HOST/manifest.webmanifest
  curl -sI https://HOST/favicon.svg
  curl -sI https://HOST/administracion    # x-robots-tag + no-cache
  curl -sI https://HOST/sitemap.xml       # application/xml
  curl -sI https://HOST/robots.txt        # text/plain
  curl -sI https://HOST/api/health        # sin CSP duplicada; HSTS de helmet
  ```
- [ ] Funcional: fuentes (Network 200), miniaturas YouTube, mapa, subida de imagen, **subida de video real** (>200 MB), miniatura, push (SW hace `fetch` a `/api/notifications/*`), y `frame-ancestors 'none'` con un HTML local que intente embeber.
- [ ] HSTS: empezar en `max-age=300`; subir 86400 → 31536000 **solo** con el dominio final y todo HTTPS. **Sin `preload`.**
- [ ] `admin_policy` / `www` → apex: verificar que `Origin` y `SameSite=Strict` no se rompen con el host canónico.

**Riesgo:** alto si se aplica la CSP a ciegas (de ahí report-only). El error clásico es un `location` con `add_header` que olvida el `include` y borra HSTS/CSP de ese path: la tabla de arriba es el checklist.
**Reversa:** guardar el `sites-enabled` anterior; `nginx -t && systemctl reload nginx`. HSTS es lo único difícil de deshacer → `max-age=300` al inicio.

---

## 3. REQUIERE APROBACIÓN (backend)

> Todo lo de esta sección vive en `server/`. **No empezar** hasta que aterricen los 8 archivos que el otro agente tiene en curso. Orden interno: 6 → 7 → 8.

### Etapa 6 — Límite por cuenta + tope del Map (hallazgo F)

- [ ] **Tope de entradas**: `createRateLimiter` (`rate-limit.middleware.js:57-117`) gana `maxEntries` (10 000) y desaloja la entrada más antigua (`Map` conserva orden de inserción) al insertar una clave nueva con el store lleno. Así el `pruneExpiredEntries` de 30 s queda acotado y un atacante no puede hacer crecer el Map inventando correos.
- [ ] **Limiter por email** en `/login`: 5 fallos / 15 min por `email` normalizado (`trim().toLowerCase()`), contando **solo 401** (middleware con `res.on('finish')`, sin tocar la lógica de login).
- [ ] Aplicarlo en `auth.routes.js:24-28` después del limiter por IP.
- [ ] **Riesgo = decisión de negocio pendiente**: un atacante puede **bloquear a la dueña** 15 min a propósito. Mitigación: ventana corta, solo 401, nunca bloqueo permanente. **Alternativa: no implementarlo** y documentar el riesgo aceptado. Marcar la decisión antes de codificar.

**Verificación:** 6 fallos a la misma cuenta desde 2 IPs → 429 en el 6.º; login correcto desde otra IP antes del umbral funciona; emails distintos no comparten bucket.
**Tests:** `auth-login-account-limit.test.js` (inyectando `now`/`store`, sin MySQL): 5 fallos → 429; un acierto no consume cupo; normalización; el 429 no revela si el email existe. Y un test de `maxEntries`: con el store lleno, la clave nueva entra y la más antigua sale, sin crecer.

### Etapa 7 — Cookie `SameSite=Strict` + validación de Origin (hallazgo A)

- [ ] `auth.controller.js:24-31`: `sameSite: "strict"` fijo (se mantienen `httpOnly`, `secure: env.isProduction`, `path: "/api/auth"`).
- [ ] **No tocar `youtube.controller.js:13-20`**: `youtube_oauth_state` **debe seguir en `Lax`** porque el callback llega como navegación de nivel superior desde Google. Con `Strict` **rompes la conexión de YouTube**.
- [ ] Middleware nuevo `validate-same-origin.middleware.js`, solo en `/refresh` y `/logout` (`auth.routes.js:29-34`): si hay `Origin`, debe coincidir con `req.protocol + "://" + req.get("host")`; si no, `Referer`; si no hay ninguno, permitir (curl/tests). Rechazo `403 INVALID_ORIGIN`. Sin variable nueva: se deriva del `Host`.
- [ ] **No** borrar la cookie en el 401 de refresh (una carrera mataría la cookie nueva de la otra pestaña).
- [ ] **`clearRefreshTokenCookie` ya usa las mismas opciones** (`auth.controller.js:48-53` llama a `getRefreshTokenCookieOptions()`), así que `path`/`sameSite`/`secure` coinciden por construcción. Se fija con un test.

**Verificación:** DevTools → Cookies: `refreshToken` `Strict`, `Secure`, `HttpOnly`, `Path=/api/auth`. Sesión que aguanta 15 min y refresca sola. Cross-site `fetch(.../api/auth/refresh,{credentials:'include'})` → 401. Reconectar YouTube para probar el `Lax`.
**Tests:** en `auth-security.test.js:432-460` añadir `SameSite=Strict`; nuevos `Origin` correcto/ajeno/ausente, `Referer` ajeno, y **logout** con `refreshToken=;` + `Path=/api/auth` + `SameSite=Strict`; test que fije `SameSite=Lax` en la cookie de OAuth de YouTube. `Secure` se cubre con el patrón de spawn de `trust-proxy.test.js` (`env` está congelado al importar).

### Etapa 8 — Reuse detection + serialización en el cliente (hallazgo B)

**Servidor** (`auth-session.service.js`, `renewAuthSession`, 80-170; sin migración):

- [ ] Orden de ramas tras `findSessionByRefreshTokenHash`: (1) no existe o `user_id` ajeno → 401; (2) expirada → 401 (**sin alarma**); (3) `revoked_at !== null` → lógica nueva.
- [ ] `ROTATION_GRACE_MS = 30_000`: dentro de la ventana → **no revocar nada** y `409 REFRESH_TOKEN_RACE` (carrera). Fuera → **replay real**: `revokeAllActiveSessionsByUserId(currentSession.user_id)`, **una** línea de log saneada (evento, `userId`, `sessionId`; nunca token ni cabeceras) y `401 INVALID_REFRESH_TOKEN`. Si el revoke falla, responder 401 igual.
- [ ] Mapear `AUTH_SESSION_ROTATION_CONFLICT` (catch 148-157) **también a 409**, no a 401: es la mitad más probable de la carrera.
- [ ] Clave de revocación = `currentSession.user_id`, nunca el `sub` del JWT por sí solo.
- [ ] **Fuera de alcance**: columna `token_family_id`/`rotated_to` (migración extra). Para 1–3 admins, revocar todas las sesiones del usuario es correcto.

**Cliente** (`frontend/src/api/client.js`, `refreshAccessToken` ~132-149):

- [ ] Serializar entre pestañas con **Web Locks**:
  ```js
  const REFRESH_LOCK = 'nacatamales-auth-refresh'
  const REFRESH_RACE_RETRY_MS = 400
  const REFRESH_RACE_MAX_ATTEMPTS = 2
  ```
  `navigator.locks.request(name, { signal }, task)` si existe (Chrome/Edge 69+, Firefox 96+, Safari 15.4+); **fallback** al `refreshPromise` actual si no existe o lanza. `AbortController` con ~10 s para que una pestaña colgada no bloquee a las demás.
- [ ] Dentro del lock, la pestaña que espera envía la **cookie nueva** que dejó la otra → casi nunca hay 409.
- [ ] Si aun así llega `409 REFRESH_TOKEN_RACE`: **esperar 400 ms** y reintentar, **máximo 2 intentos**; `sessionExpiredHandler` **no** se llama (solo reacciona a 401/403, líneas 173-179).

**Tests**
- [ ] Servidor: partir `auth-security.test.js:581-629` en (a) carrera con `revoked_at = now` → 409 y **cero** revocaciones; (b) replay con `revoked_at` fuera de la ventana → 401 y revocación **una vez con `7`**. Nuevos: replay mata una segunda sesión válida; `user_id` ajeno no dispara revocación masiva; conflicto de rotación → 409; revoke que lanza → sigue 401.
- [ ] Cliente: dos refresh concurrentes con lock falso → **nunca hay dos peticiones en vuelo** a la vez (contador `inFlightMax === 1`); sin `navigator.locks` → se permite concurrencia y el 409 reintenta a los 400 ms (fake timers) como máximo 2 veces; `sessionExpiredHandler` no se llama en 409.
- [ ] `docs/frontend-integration.md`: añadir `409 REFRESH_TOKEN_RACE` y `403 INVALID_ORIGIN`.

**Verificación manual:** dos pestañas con el panel y `JWT_ACCESS_TOKEN_TTL=1m` **solo en staging** → ninguna expulsa. Reusar un refresh viejo con curl pasado el minuto → 401 y todas las sesiones cerradas.

---

### Etapa 9 — Dominio oficial (al final)

- [ ] DNS A/AAAA → VPS; host canónico (apex) y `301` desde `www` (para no romper `SameSite=Strict` ni `Origin`).
- [ ] `certbot --nginx -d DOMINIO -d www.DOMINIO`; `certbot renew --dry-run`; timer con deploy-hook.
- [ ] `GOOGLE_REDIRECT_URI=https://DOMINIO/api/youtube/oauth/callback` + registrar la URI en Google Cloud + **reconectar YouTube** (aquí desaparecen los problemas de reconexión; el flujo no se toca).
- [ ] `VITE_SITE_URL=https://DOMINIO` con `REQUIRE_SITE_URL=1` → build → desplegar `dist/` (canonical, OG, sitemap reales).
- [ ] HSTS 300 → 86400 → 31536000 (sin `preload`).
- [ ] Validaciones: enlace por WhatsApp (tarjeta), `curl -A facebookexternalhit https://DOMINIO/` (OG), Search Console + sitemap, `/administracion` no indexable, `curl -I` de sitemap/robots con su `Content-Type`.
- [ ] **No** definir `VITE_API_BASE_URL` (mismo origen; no hay CORS en el servidor → el sitio se rompería).
- [ ] **No** cambiar `IMAGEKIT_URL_ENDPOINT` (rompería todas las URLs de `media`).

---

### Etapa 10 — Google Business Profile (no técnica, cliente)

- [ ] Reclamar o crear el perfil en Google Business Profile con:
  - nombre exacto del negocio (igual que `settings.businessName`);
  - categoría principal (p. ej. restaurante nicaragüense) y secundarias;
  - dirección exacta (igual que `settings.address`) y zona de servicio si aplica;
  - teléfono = `settings.whatsappNumber` (formato internacional);
  - horario **idéntico** a `settings.scheduleText` (razón extra para estructurarlo en el futuro);
  - sitio web = dominio final;
  - fotos: logo, portada, interior, platos (mismas de ImageKit).
- [ ] Verificación (postal/video según Google) y pedir reseñas a clientes frecuentes.
- [ ] Consistencia **NAP** (nombre, dirección, teléfono) entre sitio, GBP, Facebook e Instagram.

Es lo que más influye en la búsqueda local; no depende de código.

---

## 4. Riesgos y orden de reversa

| Etapa | Riesgo principal | Reversa |
|---|---|---|
| 1 Secretos | `!.env.example` mal puesto | `git checkout .gitignore` |
| 2 SEO | Metadatos duplicados / descripción pegada | Revertir commit (sin estado) |
| 3 Logo | Referencia huérfana (favicon/push/manifest) | Restaurar 5 archivos + 5 referencias |
| 4.0 DuckDNS | Google rechaza el host para OAuth; certificado mal emitido | Dejar YouTube para la Etapa 9; borrar el subdominio; `--staging` evita rate limits |
| 4.1 VPS | Pérdida de datos en migración/backup | Restaurar dump; `systemctl disable --now` |
| 4.1 timeouts | 408 por `requestTimeout` corto; o socket colgado 1 h | Volver a 300 s; `client_body_timeout` en Nginx |
| 5 Nginx | CSP bloquea fuente/iframe/upload; `add_header` que anula cabeceras | CSP en report-only → reload con la config anterior; HSTS corto |
| 6 Límite por cuenta | Bloqueo de la dueña | Quitar el limiter de la ruta (1 línea) |
| 7 SameSite/Origin | Refresh/logout fallan si el host no es único | `sameSite` a `lax`; quitar el middleware de las 2 rutas |
| 8 Reuse | Cierres de sesión falsos con 2 pestañas | Subir `ROTATION_GRACE_MS`, mapear conflicto a 401, o revertir (sin migración) |
| 9 Dominio | Certificado/OAuth mal configurado | Volver al host anterior; reconectar YouTube |
| 10 GBP | Datos inconsistentes con el sitio | Editar el perfil (no hay código) |

**Transversal:** ninguna etapa de este plan requiere migración nueva. Si alguien propone `token_family_id`, es otra discusión y lleva migración propia.

---

## 5. Bloques de código exactos

Se entregan con ruta, contexto y contenido literal **cuando se pase a ejecución**, etapa por etapa. Este documento fija qué se cambia, por qué, el riesgo y cómo se verifica; no es el parche.
