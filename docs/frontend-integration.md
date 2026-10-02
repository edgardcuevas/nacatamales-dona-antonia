# Backend API — Guía definitiva para frontend React

**Estado del documento:** contrato vigente del backend  
**Base conceptual:** `/api`  
**Formato:** JSON salvo uploads binarios  
**OpenAPI:** no existe un archivo OpenAPI/Swagger en el repositorio; este documento es la especificación Markdown equivalente.

> Esta guía describe el comportamiento real del backend. No contiene claves, tokens, secretos ni valores de `.env`.

---

## 1. Auditoría y alcance

> Los números de esta sección son el **snapshot histórico** de la auditoría original
> (2026-01). Están congelados a propósito para no falsear ese registro. El **estado verificado
> actual** está en [§16 bis](#16-bis-estado-verificado-del-backend).

La auditoría realizada antes de documentar confirmó:

- `npm test`: **323 pruebas aprobadas, 0 fallidas**.
- `npm audit`: **0 vulnerabilidades**.
- Migraciones: **16 completadas, 0 pendientes**.
- Conexión MySQL: verificada.
- YouTube OAuth: verificado con una conexión real.
- ImageKit: integración configurada y verificada por pruebas; el media store contiene únicamente proveedor `IMAGEKIT`.

### Cambios de contrato posteriores a esa auditoría

Todos **aditivos**. Ningún campo, ruta, forma de respuesta ni código de error existente cambió de
nombre, tipo ni valor, y **el frontend en producción actual sigue funcionando sin cambios**.

| Cambio | Dónde | Para qué |
|---|---|---|
| `updatedAt` en el DTO público de video | [§11.1](#111-dto-publico) | Señal de versión para romper la caché de la miniatura de YouTube |
| `image.id` en fotos | [§6](#6-dtos-de-imagen), [§17](#17-fotos-dia-a-dia) | Saber qué imagen está en uso y reutilizarla de la galería |
| `GET /api/health/ready` | [§3.1](#31-salud) | Saber si la base de datos responde de verdad |
| `503 SERVICE_UNAVAILABLE` | [§13.1](#131-errores-http-globales) | **Único código de error nuevo.** Solo lo devuelve el readiness |
| `TRUST_PROXY` | [§2.7](#27-configuracion-de-proxy-trust_proxy) | Que el rate limiter vea la IP real detrás del proxy |
| Documentación del módulo `photos` | [§17](#17-fotos-dia-a-dia) | El módulo no estaba documentado |

La documentación cubre:

- Auth y sesiones.
- Usuarios administrativos.
- Categorías públicas y administrativas.
- Productos públicos y administrativos.
- Disponibilidad de productos.
- Avisos públicos y administrativos.
- Media e ImageKit Upload.
- Videos públicos, administrativos y YouTube Upload.
- YouTube OAuth.
- Errores, rate limiting y guía de integración React.

---

## 2. Convenciones generales

### 2.1 URL base

En desarrollo, el backend se ejecuta normalmente en:

```text
http://localhost:3000
```

Todos los endpoints siguientes son relativos a:

```text
http://localhost:3000/api
```

En producción, usar el dominio HTTPS configurado para el servicio.

### 2.2 CORS

El backend no tiene middleware CORS habilitado. El frontend debe consumirlo mediante:

- mismo origen;
- reverse proxy con `/api` reenviado al backend; o
- una configuración de infraestructura que ya resuelva CORS fuera de esta aplicación.

No se deben enviar claves de ImageKit, Google o tokens de proveedor desde el frontend.

**Topología decidida:** mismo dominio con reverse proxy. No se requiere CORS y la cookie
`refreshToken` (`SameSite=None; Secure`) funciona sin configuración adicional. La variable
`TRUST_PROXY` (ver [§2.7](#27-configuracion-de-proxy-trust_proxy)) sí es obligatoria en ese escenario.

### 2.3 Envoltura de respuestas

Éxito:

```json
{
  "success": true,
  "message": "Human-readable message",
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "STABLE_ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

No hay un campo `errors` array. El frontend debe clasificar la respuesta usando `error.code`.

### 2.4 Convenciones de datos

- IDs de base de datos: enteros positivos.
- Booleanos: `true` o `false`, nunca `"true"` como DTO.
- Fechas: strings ISO 8601 en respuestas administrativas y de schedule.
- Valores opcionales: `null` cuando el backend no tiene valor.
- Precios: **siempre string decimal**, por ejemplo `"125.00"` o `null`.
- `image`: objeto de imagen activa o `null`.
- `imageMediaId`: entero positivo o `null`.
- Los DTOs públicos no exponen contraseñas, hashes, tokens, claves privadas ni metadatos internos del proveedor.

### 2.5 Paginación administrativa y productos

Los endpoints paginados usan:

```json
{
  "page": 1,
  "limit": 20,
  "totalItems": 42,
  "totalPages": 3
}
```

- `page`: begins en `1`.
- `limit`: begins en `20`.
- `limit` máximo: `100`.
- Las categorías públicas, avisos públicos y videos públicos no aceptan paginación.

### 2.6 JSON y límite de Express

El middleware `express.json()` tiene un límite de `100kb` para cuerpos JSON. Esto no aplica al body binario de YouTube Upload, que se procesa como stream.

### 2.7 Configuración de proxy (`TRUST_PROXY`)

Variable de entorno **opcional**. No afecta al contrato HTTP: es configuración del servidor y el
frontend no puede leerla ni cambiarla.

Todos los rate limiters agrupan por `request.ip`. Si la API se publica detrás de un reverse proxy
sin configurar esto, `request.ip` es la dirección del proxy y **todos los visitantes comparten un
único cupo**: los 8 intentos de login por 15 minutos pasarían a ser 8 para todo el sitio, y
cualquier cliente podría agotar el cupo de los administradores legítimos.

| Valor | Comportamiento |
|---|---|
| Ausente o vacío | No se configura nada. `request.ip` es la dirección del socket (comportamiento por defecto). |
| `0` | No se confía en ningún proxy. Equivalente a dejarlo vacío. |
| `1` | Se confía en **un** proxy. Es el valor para un único nginx/Caddy/balanceador. |
| `2`, `3`, … | Se confía en esa cantidad de saltos, de derecha a izquierda en `X-Forwarded-For`. |

Solo se aceptan enteros `>= 0`. **Cualquier otro valor hace que el servidor no arranque**, incluidos
`true`, `false`, `*`, `loopback` y listas de IP.

Motivo de la restricción: Express acepta esas formas, pero confían en el `X-Forwarded-For` que envía
el cliente. Con `trust proxy: true` cualquier visitante podría mandar esa cabecera con una IP
inventada y obtener un cupo nuevo de rate limiter en cada petición, anulando la protección por
completo. Un número de saltos obliga a que el proxy sobrescriba la cabecera.

Ejemplo con un solo proxy inverso:

```text
TRUST_PROXY=1
```

> Si el proxy no está exactamente en el número de saltos declarado, el resultado es que se confía de
> menos (el proxy no se ve, todos comparten cupo) o de más (un cliente puede inyectar un salto extra
> y falsear la IP). Conviene verificarlo tras desplegar.

### 2.8 Logging de errores del servidor

Todo `AppError` con `status >= 500` deja **una línea** en el log del servidor:

```text
Server error: code=VIDEO_STATUS_PERSISTENCE_FAILED status=500 method=GET path=/api/admin/videos/3/status message="The YouTube video status could not be recorded"
```

Reglas, útiles si se_revisiona o se ingestan logs:

- Solo se registran `5xx`. Los `4xx` son tráfico normal y **no** se registran, para no generar ruido.
- Se registra `error.code`, `error.statusCode`, método y ruta. **La query string nunca se registra.**
- `error.cause` se añade solo si es un `Error`, y solo su texto.
- **Nunca** se registran cuerpo de la petición, cabeceras, cookies ni tokens.
- Los errores que no son `AppError` mantienen el log preexistente `Unhandled request error: <error>`.

Esto no cambia ninguna respuesta HTTP: solo añade visibilidad a fallos que antes eran invisibles.

---

## 3. Mapa completo de endpoints

### 3.1 Salud

| Método | Ruta | Auth | Descripción |
|---|---|---:|---|
| GET | `/api/health` | No | Estado de la aplicación (no consulta la base de datos) |
| GET | `/api/health/ready` | No | Estado de la aplicación **y** de la base de datos |

#### `GET /api/health`

Liveness. Respuesta estática, **nunca consulta la base de datos**. Solo confirma que el proceso
atiende peticiones HTTP.

Response `200`:

```json
{
  "success": true,
  "message": "API is running",
  "data": { "status": "UP" }
}
```

> Un `200` aquí **no demuestra** que el sistema pueda atender una petición real: responde igual con
> MySQL caído, con la pool agotada o con credenciales inválidas.

#### `GET /api/health/ready`

Readiness. Ejecuta `SELECT 1` sobre el pool con un timeout de **2 s**.

> ### ⚠️ Configurar el health check del balanceador aquí
>
> El health check de tráfico del balanceador, del orquestador o del supervisor **debe apuntar a
> `GET /api/health/ready`**, y **nunca** a `GET /api/health`.
>
> | Endpoint | Consulta MySQL | Uso correcto |
> |---|:---:|---|
> | `GET /api/health/ready` | Sí | **Health check de tráfico.** Decide si la instancia recibe peticiones |
> | `GET /api/health` | No | Solo comprobación de que el proceso está vivo (liveness). Para reinicios y monitorización del proceso |
>
> Si el balanceador sondea `/api/health`, cada vez que MySQL está caído la instancia seguirá
> recibiendo tráfico porque responde `200`, y cada una de esas peticiones fallará con
> `500 INTERNAL_SERVER_ERROR` para el visitante. Con el readiness configurado, la instancia sale de
> rotación en ≤2 s en lugar de servir errores.

Response `200`:

```json
{
  "success": true,
  "message": "API and database are ready",
  "data": { "status": "READY" }
}
```

Response `503` cuando la base de datos falla o no responde dentro de 2 s:

```json
{
  "success": false,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "The database is not available"
  }
}
```

Notas:

- **Nuevo y aditivo.** `GET /api/health` no cambia de comportamiento.
- No requiere autenticación ni consume cupo de rate limiting.
- El motivo real (host, puerto, mensaje del driver) se registra en el log del servidor y **nunca**
  se devuelve en la respuesta.
- Con una cola de conexión saturada, `pool.execute` puede quedarse esperando indefinidamente; por eso
  la comprobación se_envuelve en un timeout y no depende de un timeout de sentencia de MySQL.

### 3.2 Auth

| Método | Ruta | Auth | Rol |
|---|---|---:|---|
| POST | `/api/auth/login` | No | Público |
| POST | `/api/auth/refresh` | Cookie `refreshToken` | Público |
| POST | `/api/auth/logout` | No | Público |
| POST | `/api/auth/logout-all` | Bearer | Usuario activo |
| GET | `/api/auth/me` | Bearer | Usuario activo |

### 3.3 Usuarios

Todos requieren `ADMIN` activo.

| Método | Ruta |
|---|---|
| GET | `/api/admin/users` |
| POST | `/api/admin/users` |
| GET | `/api/admin/users/:userId` |
| PATCH | `/api/admin/users/:userId/role` |
| PATCH | `/api/admin/users/:userId/status` |
| PATCH | `/api/admin/users/:userId/password` |
| DELETE | `/api/admin/users/:userId/sessions` |

### 3.4 Categorías

Públicas:

| Método | Ruta |
|---|---|
| GET | `/api/categories` |
| GET | `/api/categories/:slug` |

Administrativas (`ADMIN` o `EDITOR`):

| Método | Ruta |
|---|---|
| GET | `/api/admin/categories` |
| POST | `/api/admin/categories` |
| GET | `/api/admin/categories/:categoryId` |
| PATCH | `/api/admin/categories/:categoryId` |
| PATCH | `/api/admin/categories/:categoryId/status` |

### 3.5 Productos

Públicos:

| Método | Ruta |
|---|---|
| GET | `/api/products` |
| GET | `/api/products/:slug` |

Administrativos (`ADMIN` o `EDITOR`):

| Método | Ruta |
|---|---|
| GET | `/api/admin/products` |
| POST | `/api/admin/products` |
| GET | `/api/admin/products/:productId` |
| PATCH | `/api/admin/products/:productId` |
| PATCH | `/api/admin/products/:productId/status` |
| PATCH | `/api/admin/products/:productId/availability` |

### 3.6 Avisos

Públicos:

| Método | Ruta |
|---|---|
| GET | `/api/announcements` |

Administrativos (`ADMIN` o `EDITOR`):

| Método | Ruta |
|---|---|
| GET | `/api/admin/announcements` |
| POST | `/api/admin/announcements` |
| GET | `/api/admin/announcements/:announcementId` |
| PATCH | `/api/admin/announcements/:announcementId` |
| PATCH | `/api/admin/announcements/:announcementId/status` |

### 3.7 Media / ImageKit

Todos requieren `ADMIN` o `EDITOR` activo.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/media` | Listar media |
| GET | `/api/admin/media/:mediaId` | Obtener media |
| PATCH | `/api/admin/media/:mediaId` | Actualizar `altText` |
| PATCH | `/api/admin/media/:mediaId/status` | Activar/desactivar media |
| POST | `/api/admin/media/upload-auth` | Obtener parámetros temporales de ImageKit |
| POST | `/api/admin/media/confirm` | Confirmar archivo en ImageKit y registrarlo |
| DELETE | `/api/admin/media/:mediaId` | Eliminar archivo no referenciado |

### 3.8 Videos

Públicos:

| Método | Ruta |
|---|---|
| GET | `/api/videos` |
| GET | `/api/videos/:videoId` |

Administrativos (`ADMIN` o `EDITOR`):

| Método | Ruta |
|---|---|
| GET | `/api/admin/videos` |
| POST | `/api/admin/videos` |
| GET | `/api/admin/videos/:videoId` |
| PATCH | `/api/admin/videos/:videoId` |
| PATCH | `/api/admin/videos/:videoId/status` |
| POST | `/api/admin/videos/upload` |
| GET | `/api/admin/videos/:videoId/status` |

### 3.9 YouTube OAuth

| Método | Ruta | Auth | Rol |
|---|---|---:|---|
| GET | `/api/admin/youtube/connect` | Bearer | `ADMIN` |
| GET | `/api/admin/youtube/status` | Bearer | `ADMIN` |
| GET | `/api/youtube/oauth/callback` | State + cookie | Continuación OAuth |

### 3.10 Fotos (día a día)

Detalle completo en [§17. Fotos](#17-fotos-dia-a-dia).

Públicos:

| Método | Ruta |
|---|---|
| GET | `/api/photos` |
| GET | `/api/photos/:photoId` |

Administrativos (`ADMIN` o `EDITOR`):

| Método | Ruta |
|---|---|
| GET | `/api/admin/photos` |
| POST | `/api/admin/photos` |
| GET | `/api/admin/photos/:photoId` |
| PATCH | `/api/admin/photos/:photoId` |
| DELETE | `/api/admin/photos/:photoId` |

---

## 4. Autenticación y sesiones

## 4.1 Modelo de tokens

- **Access token:** JWT corto, devuelto en JSON. El frontend debe enviarlo como:
  ```http
  Authorization: Bearer <accessToken>
  ```
- **Refresh token:** JWT largo, no devuelto en JSON. Se entrega únicamente en cookie HttpOnly:
  ```text
  refreshToken
  ```
- La cookie tiene `Path=/api/auth`.
- En producción usa `Secure` y `SameSite=None`.
- En desarrollo usa `SameSite=Lax` y no requiere `Secure`.
- El access token no se storagea en cookie.
- El refresh token se rota en cada refresh.
- No guardar el refresh token en `localStorage`, `sessionStorage` ni estado visible de React.

### Flujo de sesión

```text
POST /api/auth/login
  ↓
accessToken en memoria + refreshToken en cookie HttpOnly
  ↓
GET /api/auth/me
  ↓
accessToken expira
  ↓
POST /api/auth/refresh con cookie
  ↓
nuevo accessToken + refresh token rotado
```

## 4.2 `POST /api/auth/login`

**Auth:** no requiere token.

### Request

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "email": "admin@example.com",
  "password": "strong-password"
}
```

Campos:

- `email`: string no vacío. Se normaliza a minúsculas.
- `password`: string no vacío.

### Response `200`

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "email": "admin@example.com",
      "role": "ADMIN"
    },
    "accessToken": "<JWT>"
  }
}
```

La respuesta también establece la cookie HttpOnly `refreshToken`.

### Errores

| HTTP | Código | Significado |
|---:|---|---|
| 400 | `INVALID_LOGIN_INPUT` | Body ausente, no objeto o inválido |
| 400 | `INVALID_EMAIL` | Email vacío o no string |
| 400 | `INVALID_PASSWORD` | Password vacío o no string |
| 401 | `INVALID_CREDENTIALS` | Email/password incorrectos |
| 403 | `USER_INACTIVE` | Cuenta desactivada |
| 429 | `RATE_LIMIT_EXCEEDED` | Límite de login excedido |

**Rate limit:** 8 requests por IP cada 15 minutos. El store es local al proceso.

## 4.3 `POST /api/auth/refresh`

**Auth:** cookie `refreshToken`.

No enviar el refresh token en JSON ni en `Authorization`.

### Request

```http
POST /api/auth/refresh
```

Sin body requerido.

### Response `200`

```json
{
  "success": true,
  "message": "Session renewed successfully",
  "data": {
    "user": {
      "id": 1,
      "email": "admin@example.com",
      "role": "ADMIN"
    },
    "accessToken": "<NEW_JWT>"
  }
}
```

Se reemplaza la cookie `refreshToken` por la nueva sesión rotada.

### Errores

| HTTP | Código | Significado |
|---:|---|---|
| 401 | `REFRESH_TOKEN_REQUIRED` | Cookie ausente |
| 401 | `INVALID_REFRESH_TOKEN` | Cookie inválida, expirada, revocada o reutilizada |
| 403 | `USER_INACTIVE` | La cuenta ya no está activa |
| 429 | `RATE_LIMIT_EXCEEDED` | Límite de refresh excedido |

**Rate limit:** 30 requests por IP cada 5 minutos.

## 4.4 `POST /api/auth/logout`

**Auth:** no requiere Authorization. Revoca la sesión si existe cookie.

### Response `200`

```json
{
  "success": true,
  "message": "Logout successful",
  "data": null
}
```

La cookie se limpia. La operación es idempotente: no tener cookie también devuelve éxito.

## 4.5 `POST /api/auth/logout-all`

**Auth:** `Authorization: Bearer <accessToken>` y usuario activo.

No requiere body. El body, si se envía, no se usa para identificar al usuario.

### Response `200`

```json
{
  "success": true,
  "message": "All sessions closed successfully",
  "data": null
}
```

Revoca las sesiones refresh del usuario y limpia la cookie actual. Los access tokens ya emitidos siguen siendo válidos hasta su expiración natural.

### Errores

| HTTP | Código |
|---:|---|
| 401 | `AUTHENTICATION_REQUIRED` |
| 401 | `INVALID_AUTHORIZATION_HEADER` |
| 401 | `INVALID_ACCESS_TOKEN` |
| 401 | `AUTHENTICATED_USER_UNAVAILABLE` |
| 401 | `AUTHENTICATION_STALE` |

## 4.6 `GET /api/auth/me`

**Auth:** Bearer + usuario activo.

### Response `200`

```json
{
  "success": true,
  "message": "Authenticated user retrieved successfully",
  "data": {
    "user": {
      "id": 1,
      "email": "admin@example.com",
      "role": "ADMIN"
    }
  }
}
```

El endpoint no devuelve `isActive`, fechas ni hash de password.

## 4.7 Roles

Solo existen:

```text
ADMIN
EDITOR
```

| Capacidad | ADMIN | EDITOR |
|---|:---:|:---:|
| Auth/me | Sí | Sí |
| Usuarios administrativos | Sí | No |
| Categorías, productos, avisos | Sí | Sí |
| Media/ImageKit | Sí | Sí |
| Videos/YouTube Upload | Sí | Sí |
| YouTube connect/status | Sí | No |

Un `EDITOR` que intenta acceder a administración de usuarios o YouTube OAuth recibe `403 FORBIDDEN`.

---

## 5. Usuarios administrativos

Prefijo:

```text
/api/admin/users
```

Todos requieren `ADMIN` activo.

## 5.1 `GET /api/admin/users`

### Query

| Parámetro | Valores | Default |
|---|---|---|
| `page` | entero `>= 1` | `1` |
| `limit` | entero `1..100` | `20` |
| `role` | `ADMIN`, `EDITOR` | — |
| `isActive` | `true`, `false` | — |
| `email` | email válido; búsqueda parcial | — |
| `sortBy` | `id`, `email`, `role`, `isActive`, `lastLoginAt`, `createdAt`, `updatedAt` | `createdAt` |
| `sortOrder` | `asc`, `desc` | `desc` |

Ejemplo:

```text
GET /api/admin/users?page=1&limit=20&role=EDITOR&isActive=true&sortBy=email&sortOrder=asc
```

### Response

```json
{
  "success": true,
  "message": "Administrative users retrieved successfully",
  "data": {
    "users": [
      {
        "id": 2,
        "email": "editor@example.com",
        "role": "EDITOR",
        "isActive": true,
        "lastLoginAt": "2026-01-01T12:00:00.000Z",
        "passwordChangedAt": "2026-01-01T10:00:00.000Z",
        "createdAt": "2026-01-01T09:00:00.000Z",
        "updatedAt": "2026-01-01T12:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 1,
      "totalPages": 1
    }
  }
}
```

## 5.2 `GET /api/admin/users/:userId`

Devuelve un `AdminUserDTO`.

## 5.3 `POST /api/admin/users`

Request:

```json
{
  "email": "new-user@example.com",
  "password": "StrongPassword1!",
  "role": "EDITOR"
}
```

Password:

- mínimo 12 caracteres;
- máximo 72 bytes UTF-8;
- al menos una minúscula;
- al menos una mayúscula;
- al menos un número;
- al menos un carácter especial.

Response `201`:

```json
{
  "success": true,
  "message": "Administrative user created successfully",
  "data": {
    "user": {
      "id": 3,
      "email": "new-user@example.com",
      "role": "EDITOR",
      "isActive": true,
      "lastLoginAt": null,
      "passwordChangedAt": "2026-01-01T10:00:00.000Z",
      "createdAt": "2026-01-01T09:00:00.000Z",
      "updatedAt": "2026-01-01T10:00:00.000Z"
    }
  }
}
```

No devuelve password ni hash.

## 5.4 `PATCH /api/admin/users/:userId/role`

```json
{
  "role": "ADMIN"
}
```

Actualiza el rol y revoca las sesiones activas del usuario.

## 5.5 `PATCH /api/admin/users/:userId/status`

```json
{
  "isActive": false
}
```

- No se permite desactivar la propia cuenta.
- No se permite dejar cero ADMIN activos.
- Desactivar revoca las sesiones refresh del usuario.

## 5.6 `PATCH /api/admin/users/:userId/password`

```json
{
  "password": "NewStrongPassword1!"
}
```

Response:

```json
{
  "success": true,
  "message": "User password reset successfully",
  "data": null
}
```

Resetea el password y revoca todas las sesiones activas.

## 5.7 `DELETE /api/admin/users/:userId/sessions`

Revoca todas las sesiones refresh del usuario. Es idempotente.

### Errores principales de Users

| HTTP | Código | Mensaje |
|---:|---|---|
| 400 | `INVALID_USER_INPUT` | Invalid user input |
| 400 | `UNEXPECTED_USER_FIELDS` | Unexpected fields are not allowed |
| 400 | `INVALID_USER_ID` | A valid user ID is required |
| 400 | `INVALID_USER_EMAIL` | A valid email is required |
| 400 | `INVALID_USER_PASSWORD` | A strong password of at least 12 characters is required |
| 400 | `INVALID_USER_ROLE` | Invalid user role |
| 400 | `INVALID_USER_STATUS` | A valid active status is required |
| 400 | `INVALID_USER_LIST_QUERY` | Invalid user list query |
| 401 | `AUTHENTICATED_USER_UNAVAILABLE` | The authenticated user is unavailable |
| 401 | `AUTHENTICATION_STALE` | The authentication credentials must be renewed |
| 404 | `USER_NOT_FOUND` | The requested user does not exist |
| 409 | `USER_EMAIL_ALREADY_EXISTS` | A user with this email already exists |
| 409 | `LAST_ACTIVE_ADMIN_REQUIRED` | At least one active ADMIN account must remain |
| 409 | `SELF_DEACTIVATION_NOT_ALLOWED` | You cannot deactivate your own account |

---

## 6. DTOs de imagen

Los DTOs públicos y administrativos usan esta forma:

```json
{
  "id": 12,
  "url": "https://ik.imagekit.io/...",
  "altText": "Descripción accesible",
  "width": 1200,
  "height": 800
}
```

Puede ser `null` si no hay imagen activa o la referencia fue retirada.

- `id`: ID interno de media. **Entero `>= 1`, siempre presente cuando `image` no es `null`.** Es el
  valor que hay que enviar como `imageMediaId` para reutilizar esa misma imagen.
- `url`: URL HTTPS de ImageKit.
- `altText`: texto alternativo o `null`.
- `width`, `height`: enteros o `null`.

El `imageMediaId` solo aparece en DTOs administrativos.

Entidades que exponen este DTO: categorías, productos, avisos y fotos del día a día.

**Excepción — fotos:** en fotos la imagen es **obligatoria**. No se puede crear una foto sin
`imageMediaId` y no se puede poner a `null` al actualizar, así que `image` **nunca** es `null` y
siempre trae los cinco campos. Ver [§17. Fotos](#17-fotos-dia-a-dia).

---

## 7. Categorías

## 7.1 `GET /api/categories`

Público, sin filtros ni paginación.

Solo devuelve categorías con `isActive=true`.

Response `200`:

```json
{
  "success": true,
  "message": "Categories retrieved successfully",
  "data": {
    "categories": [
      {
        "id": 1,
        "name": "Tortillas",
        "slug": "tortillas",
        "description": "Descripción pública",
        "sortOrder": 0,
        "image": {
          "id": 12,
          "url": "https://ik.imagekit.io/...",
          "altText": "Tortillas",
          "width": 1200,
          "height": 800
        }
      }
    ]
  }
}
```

Orden:

```text
sortOrder ASC, name ASC, id ASC
```

## 7.2 `GET /api/categories/:slug`

Devuelve una categoría activa o `404 CATEGORY_NOT_FOUND`.

Slug:

```text
[a-z0-9]+(-[a-z0-9]+)*
```

Máximo 120 caracteres.

## 7.3 Administración

Prefijo:

```text
/api/admin/categories
```

Roles: `ADMIN`, `EDITOR`.

### Listado

`GET /api/admin/categories`

Query:

| Parámetro | Valores | Default |
|---|---|---|
| `page` | `>=1` | `1` |
| `limit` | `1..100` | `20` |
| `isActive` | `true`, `false` | — |
| `name` | nombre, búsqueda parcial | — |
| `sortBy` | `id`, `name`, `slug`, `sortOrder`, `isActive`, `createdAt`, `updatedAt` | `createdAt` |
| `sortOrder` | `asc`, `desc` | `desc` |

### Crear

`POST /api/admin/categories`

```json
{
  "name": "Tortillas",
  "slug": "tortillas",
  "description": "Descripción",
  "sortOrder": 0,
  "imageMediaId": 12
}
```

- `name`: requerido, máximo 100.
- `slug`: requerido, máximo 120, patrón seguro.
- `description`: opcional/null, máximo 500.
- `sortOrder`: entero `0..2147483647`, default `0`.
- `imageMediaId`: entero positivo o `null`.

La imagen, si se envía, debe existir, estar activa y ser `IMAGE`.

### Actualizar

`PATCH /api/admin/categories/:categoryId`

Se envía al menos un campo:

```json
{
  "name": "Tortillas发生了什么",
  "description": null,
  "imageMediaId": null
}
```

Campos permitidos:

```text
name, slug, description, sortOrder, imageMediaId
```

`imageMediaId: null` retira la asociación.

### Estado

`PATCH /api/admin/categories/:categoryId/status`

```json
{
  "isActive": true
}
```

### DTO administrativo

```json
{
  "id": 1,
  "name": "Tortillas",
  "slug": "tortillas",
  "description": "Descripción",
  "sortOrder": 0,
  "imageMediaId": 12,
  "image": {
    "id": 12,
    "url": "https://ik.imagekit.io/...",
    "altText": "Tortillas",
    "width": 1200,
    "height": 800
  },
  "isActive": true,
  "createdAt": "2026-01-01T09:00:00.000Z",
  "updatedAt": "2026-01-01T09:00:00.000Z"
}
```

### Errores principales de Categories

| HTTP | Código | Mensaje |
|---:|---|---|
| 400 | `INVALID_CATEGORY_INPUT` | Invalid category input / Category name and slug are required |
| 400 | `UNEXPECTED_CATEGORY_FIELDS` | Unexpected fields are not allowed |
| 400 | `INVALID_CATEGORY_ID` | A valid category ID is required |
| 400 | `INVALID_CATEGORY_SLUG` | A valid category slug is required |
| 400 | `INVALID_CATEGORY_NAME` | A valid category name is required |
| 400 | `INVALID_CATEGORY_DESCRIPTION` | A valid category description is required |
| 400 | `INVALID_CATEGORY_SORT_ORDER` | A valid category sort order is required |
| 400 | `INVALID_MEDIA_ID` | A valid media ID is required |
| 400 | `INVALID_CATEGORY_LIST_QUERY` | Invalid category list query |
| 400 | `INVALID_CATEGORY_STATUS` | A valid category status is required |
| 404 | `CATEGORY_NOT_FOUND` | The requested category does not exist |
| 404 | `MEDIA_NOT_FOUND` | The requested media does not exist |
| 409 | `CATEGORY_NAME_ALREADY_EXISTS` | A category with this name already exists |
| 409 | `CATEGORY_SLUG_ALREADY_EXISTS` | A category with this slug already exists |
| 409 | `MEDIA_INACTIVE` | The selected media is inactive |
| 400 | `INVALID_MEDIA_RESOURCE_TYPE` | The selected media must be an image |

---

## 8. Productos y disponibilidad

## 8.1 DTO público

```json
{
  "id": 4,
  "name": "Tortilla de maíz",
  "slug": "tortilla-de-maiz",
  "description": "Descripción",
  "price": "125.00",
  "isAvailable": true,
  "sortOrder": 0,
  "image": {
    "id": 12,
    "url": "https://ik.imagekit.io/...",
    "altText": "Tortilla",
    "width": 1200,
    "height": 800
  },
  "category": {
    "id": 1,
    "name": "Tortillas",
    "slug": "tortillas"
  }
}
```

**Regla importante:** `price` siempre es `string` decimal con dos decimales o `null`. Nunca convertirlo a `number` para mostrar o enviar; usar una librería decimal/formatador solo para presentación.

## 8.2 `GET /api/products`

Público, paginado.

### Query

| Parámetro | Valores | Default |
|---|---|---|
| `page` | entero `>=1` | `1` |
| `limit` | `1..100` | `20` |
| `category` | slug de categoría | — |
| `available` | `true`, `false` | — |

Solo devuelve productos que cumplen:

```text
product.isActive = true
category.isActive = true
```

La imagen solo aparece si el media referenciado está activo y es `IMAGE`.

Response:

```json
{
  "success": true,
  "message": "Products retrieved successfully",
  "data": {
    "products": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 0,
      "totalPages": 0
    }
  }
}
```

Orden:

```text
sortOrder ASC, name ASC, id ASC
```

## 8.3 `GET /api/products/:slug`

Devuelve un producto activo cuya categoría también está activa.

## 8.4 Administración de productos

Prefijo:

```text
/api/admin/products
```

Roles: `ADMIN`, `EDITOR`.

### Listado administrativo

Query:

| Parámetro | Valores | Default |
|---|---|---|
| `page` | `>=1` | `1` |
| `limit` | `1..100` | `20` |
| `name` | búsqueda parcial | — |
| `categoryId` | entero positivo | — |
| `isActive` | `true`, `false` | — |
| `isAvailable` | `true`, `false` | — |
| `sortBy` | `id`, `name`, `slug`, `price`, `isAvailable`, `isActive`, `sortOrder`, `createdAt`, `updatedAt` | `createdAt` |
| `sortOrder` | `asc`, `desc` | `desc` |

### Crear

`POST /api/admin/products`

```json
{
  "categoryId": 1,
  "name": "Tortilla de maíz",
  "slug": "tortilla-de-maiz",
  "description": "Descripción",
  "price": "125.00",
  "isAvailable": true,
  "sortOrder": 0,
  "imageMediaId": 12
}
```

Reglas:

- `categoryId`: requerido, categoría activa.
- `name`: requerido, máximo 150.
- `slug`: requerido, máximo 180, patrón seguro.
- `description`: opcional/null, máximo 5,000.
- `price`: `null` o string con hasta 2 decimales; máximo 8 dígitos enteros.
- `isAvailable`: requerido boolean.
- `sortOrder`: default `0`.
- `imageMediaId`: media activa de tipo `IMAGE` o `null`.

### Actualizar

`PATCH /api/admin/products/:productId`

Campos permitidos:

```text
categoryId, name, slug, description, price, sortOrder, imageMediaId
```

Debe enviarse al menos uno.

### Activar/desactivar

`PATCH /api/admin/products/:productId/status`

```json
{
  "isActive": true
}
```

### Disponibilidad

`PATCH /api/admin/products/:productId/availability`

```json
{
  "isAvailable": false
}
```

`isActive` y `isAvailable` son campos separados:

- `isActive`: visibilidad/estado editorial.
- `isAvailable`: disponibilidad comercial.

Un producto activo puede estar no disponible. El filtro público `available=false` devuelve productos activos no disponibles, no productos inactivos.

### DTO administrativo

```json
{
  "id": 4,
  "categoryId": 1,
  "name": "Tortilla de maíz",
  "slug": "tortilla-de-maiz",
  "description": "Descripción",
  "price": "125.00",
  "isAvailable": true,
  "isActive": true,
  "sortOrder": 0,
  "imageMediaId": 12,
  "image": {
    "id": 12,
    "url": "https://ik.imagekit.io/...",
    "altText": "Tortilla",
    "width": 1200,
    "height": 800
  },
  "category": {
    "id": 1,
    "name": "Tortillas",
    "slug": "tortillas"
  },
  "createdAt": "2026-01-01T09:00:00.000Z",
  "updatedAt": "2026-01-01T09:00:00.000Z"
}
```

### Errores principales de Products

| HTTP | Código | Mensaje |
|---:|---|---|
| 400 | `INVALID_PRODUCT_INPUT` | Invalid product input / Category, name, slug and availability are required |
| 400 | `UNEXPECTED_PRODUCT_FIELDS` | Unexpected fields are not allowed |
| 400 | `INVALID_PRODUCT_ID` | A valid product ID is required |
| 400 | `INVALID_PRODUCT_SLUG` | A valid product slug is required |
| 400 | `INVALID_PRODUCT_NAME` | A valid product name is required |
| 400 | `INVALID_PRODUCT_DESCRIPTION` | A valid product description is required |
| 400 | `INVALID_PRODUCT_SORT_ORDER` | A valid product sort order is required |
| 400 | `INVALID_CATEGORY_ID` | A valid category ID is required |
| 400 | `INVALID_PRODUCT_PRICE` | A valid product price is required |
| 400 | `INVALID_PRODUCT_AVAILABILITY` | A valid product availability is required |
| 400 | `INVALID_PRODUCT_STATUS` | A valid product status is required |
| 400 | `INVALID_PRODUCT_LIST_QUERY` | Invalid product list query |
| 404 | `PRODUCT_NOT_FOUND` | The requested product does not exist |
| 404 | `CATEGORY_NOT_FOUND` | The requested category does not exist |
| 404 | `MEDIA_NOT_FOUND` | The requested media does not exist |
| 409 | `CATEGORY_INACTIVE` | The selected category is inactive |
| 409 | `PRODUCT_NAME_ALREADY_EXISTS` | A product with this name already exists |
| 409 | `PRODUCT_SLUG_ALREADY_EXISTS` | A product with this slug already exists |
| 409 | `MEDIA_INACTIVE` | The selected media is inactive |
| 400 | `INVALID_MEDIA_RESOURCE_TYPE` | The selected media must be an image |

---

## 9. Avisos

## 9.1 Tipos

```text
AVAILABLE
SOLD_OUT
PROMOTION
INFO
```

## 9.2 `GET /api/announcements`

Público. Solo acepta el query `type`.

```text
GET /api/announcements?type=PROMOTION
```

Valores de `type`: `AVAILABLE`, `SOLD_OUT`, `PROMOTION`, `INFO`.

No acepta `page`, `limit`, `isActive` ni campos desconocidos.

### Visibilidad pública exacta

Un aviso aparece solo si se cumplen todas estas condiciones:

```text
is_active = 1
AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
```

Por tanto:

- `isActive=false` siempre oculta.
- `startsAt=null`: disponible desde que se activa.
- `startsAt` futura: oculto hasta esa fecha.
- `endsAt=null`: no tiene fecha final.
- `endsAt` pasada: oculto aunque `isActive=true`.
- El límite `endsAt` es exclusivo: se oculta cuando `now >= endsAt`.

### Orden

```text
sortOrder ASC, createdAt DESC, id DESC
```

### DTO público

```json
{
  "id": 8,
  "title": "Promoción",
  "content": "Contenido del aviso",
  "type": "PROMOTION",
  "startsAt": "2026-01-01T10:00:00.000Z",
  "endsAt": "2026-01-31T23:59:00.000Z",
  "sortOrder": 0,
  "image": {
    "id": 12,
    "url": "https://ik.imagekit.io/...",
    "altText": "Promoción",
    "width": 1200,
    "height": 800
  }
}
```

## 9.3 Administración

Prefijo:

```text
/api/admin/announcements
```

Roles: `ADMIN`, `EDITOR`.

### Listado

Query:

| Parámetro | Valores | Default |
|---|---|---|
| `page` | `>=1` | `1` |
| `limit` | `1..100` | `20` |
| `isActive` | `true`, `false` | — |
| `type` | tipo de aviso | — |
| `title` | búsqueda parcial | — |
| `sortBy` | `id`, `title`, `type`, `sortOrder`, `isActive`, `startsAt`, `endsAt`, `createdAt`, `updatedAt` | `createdAt` |
| `sortOrder` | `asc`, `desc` | `desc` |

### Crear

```json
{
  "title": "Promoción",
  "content": "Contenido del aviso",
  "type": "PROMOTION",
  "startsAt": "2026-01-01T10:00:00.000Z",
  "endsAt": "2026-01-31T23:59:00.000Z",
  "sortOrder": 0,
  "imageMediaId": 12
}
```

Reglas:

- `title`: requerido, máximo 150.
- `content`: requerido, máximo 10,000.
- `type`: requerido.
- `startsAt`, `endsAt`: ISO 8601 o `null`.
- `endsAt` debe ser posterior a `startsAt`.
- `endsAt` no puede estar en el pasado al crear/actualizar.
- `sortOrder`: default `0`.
- `imageMediaId`: media activa `IMAGE` o `null`.

### Actualizar

`PATCH /api/admin/announcements/:announcementId`

Campos permitidos:

```text
title, content, type, startsAt, endsAt, sortOrder, imageMediaId
```

Al menos uno.

### Activar/desactivar

`PATCH /api/admin/announcements/:announcementId/status`

```json
{
  "isActive": true
}
```

Antes de activar se vuelve a validar el schedule actual. No se puede activar un aviso cuyo `endsAt` ya venció.

### DTO administrativo

```json
{
  "id": 8,
  "title": "Promoción",
  "content": "Contenido del aviso",
  "type": "PROMOTION",
  "isActive": true,
  "startsAt": "2026-01-01T10:00:00.000Z",
  "endsAt": "2026-01-31T23:59:00.000Z",
  "sortOrder": 0,
  "imageMediaId": 12,
  "image": {
    "id": 12,
    "url": "https://ik.imagekit.io/...",
    "altText": "Promoción",
    "width": 1200,
    "height": 800
  },
  "createdAt": "2026-01-01T09:00:00.000Z",
  "updatedAt": "2026-01-01T09:00:00.000Z"
}
```

### Errores principales de Announcements

| HTTP | Código | Mensaje |
|---:|---|---|
| 400 | `INVALID_ANNOUNCEMENT_INPUT` | Invalid announcement input / Title, content and type are required |
| 400 | `UNEXPECTED_ANNOUNCEMENT_FIELDS` | Unexpected fields are not allowed |
| 400 | `UNEXPECTED_ANNOUNCEMENT_QUERY_FIELDS` | Unexpected query fields are not allowed |
| 400 | `INVALID_ANNOUNCEMENT_ID` | A valid announcement ID is required |
| 400 | `INVALID_ANNOUNCEMENT_TYPE` | A valid announcement type is required |
| 400 | `INVALID_ANNOUNCEMENT_TITLE` | A valid announcement title is required |
| 400 | `INVALID_ANNOUNCEMENT_CONTENT` | Announcement content is required |
| 400 | `INVALID_ANNOUNCEMENT_SCHEDULE` | The announcement schedule is invalid |
| 400 | `INVALID_ANNOUNCEMENT_SORT_ORDER` | A valid announcement sort order is required |
| 400 | `INVALID_MEDIA_ID` | A valid media ID is required |
| 400 | `INVALID_ANNOUNCEMENT_LIST_QUERY` | Invalid announcement list query |
| 400 | `INVALID_ANNOUNCEMENT_STATUS` | A valid announcement status is required |
| 404 | `ANNOUNCEMENT_NOT_FOUND` | The requested announcement does not exist |
| 404 | `MEDIA_NOT_FOUND` | The requested media does not exist |
| 409 | `MEDIA_INACTIVE` | The selected media is inactive |
| 400 | `INVALID_MEDIA_RESOURCE_TYPE` | The selected media must be an image |

---

## 10. Media e ImageKit

Prefijo:

```text
/api/admin/media
```

Roles: `ADMIN`, `EDITOR`.

Media es exclusivamente del proveedor:

```text
provider = IMAGEKIT
resourceType = IMAGE
```

No existe un endpoint público de media.

## 10.1 `GET /api/admin/media`

### Query

| Parámetro | Valores | Default |
|---|---|---|
| `page` | `>=1` | `1` |
| `limit` | `1..100` | `20` |
| `isActive` | `true`, `false` | — |
| `resourceType` | `IMAGE` | — |
| `publicId` | búsqueda parcial | — |
| `sortBy` | `id`, `provider`, `publicId`, `resourceType`, `format`, `bytes`, `width`, `height`, `isActive`, `createdAt`, `updatedAt` | `createdAt` |
| `sortOrder` | `asc`, `desc` | `desc` |

Response:

```json
{
  "success": true,
  "message": "Media retrieved successfully",
  "data": {
    "media": [
      {
        "id": 12,
        "provider": "IMAGEKIT",
        "publicId": "nacatamales-dona-antonia/products/file.jpg",
        "secureUrl": "https://ik.imagekit.io/...",
        "resourceType": "IMAGE",
        "format": "jpg",
        "bytes": 12345,
        "width": 1200,
        "height": 800,
        "altText": "Descripción",
        "isActive": true,
        "createdAt": "2026-01-01T09:00:00.000Z",
        "updatedAt": "2026-01-01T09:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 1,
      "totalPages": 1
    }
  }
}
```

## 10.2 `GET /api/admin/media/:mediaId`

Devuelve un `AdminMediaDTO`.

## 10.3 `PATCH /api/admin/media/:mediaId`

Solo permite cambiar `altText`:

```json
{
  "altText": "Nuevo texto alternativo"
}
```

`altText` máximo 255 caracteres. Se puede enviar `null`.

## 10.4 `PATCH /api/admin/media/:mediaId/status`

```json
{
  "isActive": true
}
```

Desactivar media impide que aparezca en DTOs públicos aunque la entidad conserve la asociación.

## 10.5 `POST /api/admin/media/upload-auth`

### Request

```json
{
  "target": "products"
}
```

Valores de `target`:

```text
categories
products
announcements
```

El backend construye una carpeta controlada:

```text
IMAGEKIT_FOLDER/categories
IMAGEKIT_FOLDER/products
IMAGEKIT_FOLDER/announcements
```

### Response `200`

```json
{
  "success": true,
  "message": "Media upload authorization created successfully",
  "data": {
    "upload": {
      "uploadUrl": "https://upload.imagekit.io/api/v1/files/upload",
      "publicKey": "<IMAGEKIT_PUBLIC_KEY>",
      "urlEndpoint": "https://ik.imagekit.io/<imagekit-id>",
      "folder": "nacatamales-dona-antonia/products",
      "token": "<TEMPORARY_UPLOAD_TOKEN>",
      "expire": 2000000000,
      "signature": "<TEMPORARY_SIGNATURE>",
      "useUniqueFileName": true
    }
  }
}
```

- La private key nunca se devuelve.
- `token`, `signature` y `expire` son temporales.
- La autorización expira en 600 segundos.
- No guardar estos parámetros en estado persistente.

## 10.6 Carga directa a ImageKit

Después de `upload-auth`, el frontend envía el archivo directamente a ImageKit, no al backend.

Endpoint:

```text
POST https://upload.imagekit.io/api/v1/files/upload
```

Usar `multipart/form-data` con los campos entregados por `upload-auth`, incluyendo el archivo seleccionado.

Flujo:

```text
React
  ↓ POST /api/admin/media/upload-auth
Backend
  ↓ uploadUrl + publicKey + folder + token + expire + signature
ImageKit
  ↓ respuesta con fileId y metadatos
React
  ↓ POST /api/admin/media/confirm
Backend valida contra ImageKit
  ↓ MySQL media
media.id
  ↓
PATCH/POST de entidad con imageMediaId
```

## 10.7 `POST /api/admin/media/confirm`

### Request

```json
{
  "fileId": "<IMAGEKIT_FILE_ID>",
  "altText": "Descripción accesible"
}
```

- `fileId`: requerido, string seguro de ImageKit.
- `altText`: opcional/null, máximo 255.

El backend vuelve a consultar ImageKit y valida:

- existencia real del file;
- MIME;
- formato;
- tamaño;
- dimensiones;
- URL HTTPS del endpoint configurado;
- folder exacto controlado;
- ausencia de traversal.

### Formatos permitidos

| MIME | Formatos |
|---|---|
| `image/jpeg` | `jpg`, `jpeg` |
| `image/png` | `png` |
| `image/webp` | `webp` |

### Límites

- Tamaño máximo: **5 MiB** (`5 * 1024 * 1024` bytes).
- Ancho máximo: **6000 px**.
- Alto máximo: **6000 px**.
- Dimensiones: ambas deben ser positivas.

Response `201`:

```json
{
  "success": true,
  "message": "Media confirmed and registered successfully",
  "data": {
    "media": {
      "id": 12,
      "provider": "IMAGEKIT",
      "publicId": "nacatamales-dona-antonia/products/file.jpg",
      "secureUrl": "https://ik.imagekit.io/...",
      "resourceType": "IMAGE",
      "format": "jpg",
      "bytes": 12345,
      "width": 1200,
      "height": 800,
      "altText": "Descripción accesible",
      "isActive": true,
      "createdAt": "2026-01-01T09:00:00.000Z",
      "updatedAt": "2026-01-01T09:00:00.000Z"
    }
  }
}
```

## 10.8 Asociación con entidades

Después de confirmar, usar el `media.id` como `imageMediaId` en:

- categorías;
- productos;
- avisos;
- fotos del día a día.

Ejemplo:

```json
{
  "imageMediaId": 12
}
```

Para retirar la asociación:

```json
{
  "imageMediaId": null
}
```

La entidad solo acepta media activa de tipo `IMAGE`.

## 10.9 `DELETE /api/admin/media/:mediaId`

El backend:

1. bloquea y comprueba el registro;
2. comprueba referencias en categorías, productos, avisos y fotos;
3. desactiva el registro;
4. elimina el archivo en ImageKit;
5. elimina la fila MySQL.

No se permite eliminar media referenciada. `imageMediaId: null` es la forma de retirar asociaciones
en categorías, productos y avisos. **En fotos no existe esa salida:** una foto siempre tiene
imagen, así que para reutilizar el archivo hay que reasignarlo o borrar antes la foto que lo usa.

Response `200`:

```json
{
  "success": true,
  "message": "Media deleted successfully",
  "data": {
    "mediaId": 12,
    "deleted": true
  }
}
```

## 10.10 Errores de Media

| HTTP | Código | Mensaje |
|---:|---|---|
| 400 | `INVALID_MEDIA_INPUT` | Invalid media input / altText is required |
| 400 | `UNEXPECTED_MEDIA_FIELDS` | Unexpected fields are not allowed |
| 400 | `INVALID_MEDIA_ID` | A valid media ID is required |
| 400 | `INVALID_MEDIA_UPLOAD_TARGET` | A valid media upload target is required |
| 400 | `INVALID_MEDIA_FILE_ID` | A valid media file ID is required |
| 400 | `INVALID_MEDIA_RESOURCE_TYPE` | A valid media resource type is required |
| 400 | `INVALID_MEDIA_PUBLIC_ID` | A valid media public ID is required |
| 400 | `INVALID_MEDIA_ALT_TEXT` | A valid media alt text is required |
| 400 | `INVALID_MEDIA_LIST_QUERY` | Invalid media list query |
| 400 | `INVALID_MEDIA_STATUS` | A valid media status is required |
| 400 | `MEDIA_INVALID_TYPE` | The uploaded file is not an allowed image type |
| 400 | `MEDIA_INVALID_FORMAT` | The uploaded file format is not allowed |
| 400 | `MEDIA_TOO_LARGE` | The uploaded file exceeds the maximum allowed size |
| 400 | `MEDIA_DIMENSIONS_EXCEEDED` | The uploaded image exceeds the maximum allowed dimensions |
| 404 | `MEDIA_NOT_FOUND` | The requested media does not exist |
| 404 | `MEDIA_FILE_NOT_FOUND` | The requested media file does not exist |
| 409 | `MEDIA_ALREADY_EXISTS` | This media file is already registered |
| 409 | `MEDIA_IN_USE` | The media resource is currently in use |
| 502 | `MEDIA_UPLOAD_AUTH_FAILED` | The media upload authorization could not be created |
| 502 | `MEDIA_PROVIDER_ERROR` | The media provider could not complete the operation |
| 500 | `MEDIA_OPERATION_FAILED` | The media operation could not be completed |

### Rate limiting de Media

Los stores son independientes y locales al proceso:

| Operación | Ventana | Máximo |
|---|---:|---:|
| Upload Auth | 15 minutos | 20 |
| Confirm | 15 minutos | 30 |
| Delete | 15 minutos | 10 |

Error:

```text
429 RATE_LIMIT_EXCEEDED
```

---

## 11. Videos

## 11.1 DTO público

```json
{
  "id": 2,
  "title": "Video de ejemplo",
  "description": "Descripción",
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "provider": "YOUTUBE",
  "externalId": "VIDEO_ID",
  "thumbnailUrl": "https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg",
  "sortOrder": 0,
  "createdAt": "2026-01-01T09:00:00.000Z",
  "updatedAt": "2026-01-02T10:15:00.000Z"
}
```

Campos del DTO público:

| Campo | Tipo | Notas |
|---|---|---|
| `id` | number | Identificador interno. |
| `title` | string | Título del video. |
| `description` | string \| null | Descripción editorial. |
| `url` | string | URL de YouTube. |
| `provider` | string | Siempre `YOUTUBE`. |
| `externalId` | string | ID del video en YouTube (11 caracteres). |
| `thumbnailUrl` | string \| null | Miniatura vigente. |
| `sortOrder` | number | Orden manual, `>= 0`. |
| `createdAt` | string \| null | ISO 8601. Fecha de creación. |
| `updatedAt` | string \| null | ISO 8601. Última modificación del registro. **Campo nuevo y aditivo.** |

### `updatedAt` como señal de versión de la miniatura

YouTube reemplaza los bytes de la miniatura **detrás de la misma URL** `i.ytimg.com`, y el
admin también la restaura con `DELETE /api/admin/videos/:videoId/thumbnail`. En ambos casos la
URL no cambia, así que el navegador puede seguir mostrando el fotograma anterior desde su
caché. `updatedAt` es la señal que cambia en esos dos casos; `createdAt` nunca se mueve y por
eso no sirve como versión.

Uso recomendado como versión de caché:

```text
thumbnailUrl + "?v=" + updatedAt
```

Notas:

- Es **aditivo**: `GET /api/videos` y `GET /api/videos/:videoId` siguen devolviendo todos los
  campos anteriores con el mismo nombre, tipo y valor. Un cliente que ignore `updatedAt`
  sigue funcionando sin cambios.
- Es la **misma clave y el mismo formato** que ya expone el DTO administrativo, de modo que el
  cliente puede usar un único helper para ambos.
- `updatedAt` cambia con **cualquier** modificación del registro del video (título, orden,
  activación, estado de upload, miniatura), no solo con la miniatura. Es aceptable como señal de
  versión: como máximo provoca una recarga de imagen de más.
- Puede ser `null` solo si el registro no tuviera `updated_at`; el DTO administrativo aplica la
  misma normalización.

### El sondeo de estado ya no mueve `updatedAt` sin motivo

`GET /api/admin/videos/:videoId/status` sincroniza con YouTube y, antes, escribía la fila en
**cada** llamada. Como esa escritura fija `updated_at`, `updatedAt` se movía aunque el proveedor
devolviera exactamente lo mismo que ya estaba guardado, invalidando la caché de miniatura de los
visitantes por el simple hecho de que un admin tuviera abierta la pantalla de detalles.

Ahora el backend **solo escribe cuando algún valor cambió de verdad**. Compara `uploadStatus`,
`privacyStatus` y `thumbnailUrl` contra lo almacenado y, si los tres coinciden, se salta el
`UPDATE` y devuelve **exactamente el mismo DTO**.

Detalles:

- El caso `thumbnail_source = CUSTOM` no cuenta como cambio: en una miniatura personalizada
  `thumbnailUrl` viaja como `undefined` a propósito, así que el sondeo nunca toca esa columna ni
  revierte la elección editorial.
- Los valores se comparan contra los mismos defaults que usa el DTO administrativo
  (`READY`, `UNLISTED`, `null`), de modo que una fila antigua con columnas `null` no genera
  escrituras espurias.
- La **respuesta HTTP no cambia**: el contrato de `GET /api/admin/videos/:videoId/status` es
  idéntico. Lo único que cambia es que ya no se escribe en la base de datos.
- Cada sentencia `UPDATE videos` del repositorio sigue fijando `updated_at` a mano, porque la
  columna **no** tiene `ON UPDATE CURRENT_TIMESTAMP`. Un test deanguardia
  (`video-updated-at-guard.test.js`) falla en CI si alguien añade un `UPDATE` que lo olvide, ya que
  el síntoma sería un error silencioso.

Solo se muestran videos con:

```text
is_active = true
AND upload_status = READY
```

## 11.2 `GET /api/videos`

Público, sin filtros ni paginación.

Orden:

```text
sortOrder ASC, createdAt DESC, id DESC
```

## 11.3 `GET /api/videos/:videoId`

Devuelve un video activo y `READY`; en otro caso responde `404`.

## 11.4 Administración manual

Prefijo:

```text
/api/admin/videos
```

Roles: `ADMIN`, `EDITOR`.

### Listado

Query:

| Parámetro | Valores | Default |
|---|---|---|
| `page` | `>=1` | `1` |
| `limit` | `1..100` | `20` |
| `isActive` | `true`, `false` | — |
| `provider` | `YOUTUBE` | — |
| `title` | búsqueda parcial | — |
| `sortBy` | `id`, `title`, `provider`, `externalId`, `sortOrder`, `isActive`, `uploadStatus`, `privacyStatus`, `createdAt`, `updatedAt` | `createdAt` |
| `sortOrder` | `asc`, `desc` | `desc` |

### Crear manualmente

```json
{
  "title": "Video existente",
  "description": "Descripción",
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "provider": "YOUTUBE",
  "externalId": "VIDEO_ID",
  "thumbnailUrl": "https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg",
  "sortOrder": 0
}
```

- `provider`: solo `YOUTUBE`.
- `externalId`: exactamente 11 caracteres `[A-Za-z0-9_-]`.
- `url`: HTTPS y host YouTube aprobado.
- El ID de la URL debe coincidir con `externalId`.
- `title`: máximo 150.
- `description`: máximo 10,000.
- `thumbnailUrl`: HTTPS o `null`.

### Actualizar

`PATCH /api/admin/videos/:videoId`

Campos permitidos:

```text
title, description, url, provider, externalId, thumbnailUrl, sortOrder
```

Se debe enviar al menos uno. La identidad YouTube se valida también al actualizar.

### Activación local

`PATCH /api/admin/videos/:videoId/status`

```json
{
  "isActive": true
}
```

Un video no puede activarse mientras `uploadStatus != READY`.

### DTO administrativo

```json
{
  "id": 2,
  "title": "Video de ejemplo",
  "description": "Descripción",
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "provider": "YOUTUBE",
  "externalId": "VIDEO_ID",
  "thumbnailUrl": "https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg",
  "sortOrder": 0,
  "isActive": false,
  "uploadStatus": "PROCESSING",
  "privacyStatus": "UNLISTED",
  "createdAt": "2026-01-01T09:00:00.000Z",
  "updatedAt": "2026-01-01T09:00:00.000Z"
}
```

Estados de upload:

```text
PENDING
UPLOADING
PROCESSING
READY
FAILED
```

Privacidad:

```text
PRIVATE
UNLISTED
PUBLIC
```

Las subidas nuevas se crean con `isActive=false` y `privacyStatus=UNLISTED`.

## 11.5 `POST /api/admin/videos/upload`

**Roles:** `ADMIN`, `EDITOR`.

No es `multipart/form-data` y no acepta `FormData`.

### Headers

```http
Authorization: Bearer <accessToken>
Content-Type: video/mp4
Content-Length: <file-size-in-bytes>
X-Video-Title: <title>
X-Video-Description: <optional-description>
```

Reglas:

- `Content-Type` debe ser `video/mp4`.
- `Content-Length` es obligatorio.
- El body es el archivo MP4 binario.
- `X-Video-Title` es obligatorio, máximo 150 caracteres.
- `X-Video-Description` es opcional, máximo 5,000 caracteres.
- El backend verifica la firma MP4 `ftyp` y la longitud real del stream.
- El archivo no se carga completo en memoria.
- El backend inicia una sesión resumible de YouTube y transmite el stream.
- La privacidad enviada a YouTube es `unlisted`.
- `notifySubscribers=false`.

### Límite y timeout

- Tamaño máximo: **2 GiB** (`2147483648` bytes).
- Timeout de inicio de sesión: **30 segundos**.
- Timeout de transferencia: **30 minutos**.

### Ejemplo desde React

```ts
const file = input.files?.[0];

await fetch("/api/admin/videos/upload", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "video/mp4",
    "X-Video-Title": title,
    ...(description
      ? { "X-Video-Description": description }
      : {}),
  },
  body: file,
});
```

No establecer manualmente `Content-Length` si el navegador lo calcula automáticamente a partir de `File`/`Blob`. No usar `FormData`.

### Response `201`

```json
{
  "success": true,
  "message": "Video uploaded successfully",
  "data": {
    "video": {
      "id": 2,
      "title": "Video de ejemplo",
      "description": "Descripción",
      "url": "https://www.youtube.com/watch?v=VIDEO_ID",
      "provider": "YOUTUBE",
      "externalId": "VIDEO_ID",
      "thumbnailUrl": "https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg",
      "thumbnailSource": "YOUTUBE_DEFAULT",
      "sortOrder": 0,
      "isActive": false,
      "uploadStatus": "PROCESSING",
      "privacyStatus": "UNLISTED",
      "createdAt": "2026-01-01T09:00:00.000Z",
      "updatedAt": "2026-01-01T09:00:00.000Z"
    }
  }
}
```

Si la carga se interrumpe antes de crear el registro MySQL, no se inserta un video local. Si YouTube crea el recurso y falla la persistencia, el backend intenta eliminar el recurso remoto.

## 11.6 `GET /api/admin/videos/:videoId/status`

Consulta YouTube cuando el endpoint es llamado y actualiza el registro local.

Response `200`:

```json
{
  "success": true,
  "message": "Video status retrieved successfully",
  "data": {
    "video": {
      "id": 2,
      "externalId": "VIDEO_ID",
      "url": "https://www.youtube.com/watch?v=VIDEO_ID",
      "thumbnailUrl": "https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg",
      "uploadStatus": "READY",
      "privacyStatus": "UNLISTED",
      "isActive": false
    },
    "uploadStatus": "READY",
    "privacyStatus": "UNLISTED"
  }
}
```

El endpoint no debe consultarse en loop aggressively. El frontend puede consultar después de un intervalo prudente y dejar de consultar cuando `READY` o `FAILED`.

Cuando `thumbnailSource` es `CUSTOM`, este endpoint **no** sobrescribe `thumbnailUrl`. Ese es el mecanismo que evita que una miniatura elegida se revierta durante la ventana de propagación de YouTube.

## 11.7 `PUT /api/admin/videos/:videoId/thumbnail`

**Roles:** `ADMIN`, `EDITOR`.

Permite elegir la miniatura que YouTube mostrará para el video. No es `multipart/form-data` y no acepta `FormData`: el body es la imagen binaria, igual que en la subida de video.

### Headers

```http
Authorization: Bearer <accessToken>
Content-Type: image/jpeg | image/png
Content-Length: <file-size-in-bytes>
```

Reglas:

- `Content-Type` debe ser `image/jpeg` o `image/png`. **YouTube no acepta WebP** aunque el pipeline de ImageKit del proyecto sí lo acepte.
- `Content-Length` es obligatorio.
- El body es la imagen binaria.
- El backend verifica la longitud real del stream y no lo carga completo en memoria.
- Solo funciona con videos en `uploadStatus=READY`; mientras tanto devuelve `409 VIDEO_THUMBNAIL_NOT_READY`.
- Solo funciona con `provider=YOUTUBE`.
- El scope `youtube.upload` ya está concedido, por lo que **no requiere reconectar el canal** ni un nuevo consentimiento OAuth.
- Costo de cuota de YouTube: ~50 unidades por llamada.
- La URL persistida es la que devuelve `thumbnails.set`, no una lectura posterior, porque el proveedor puede seguir reportando el frame anterior durante la propagación.

### Límite

- Tamaño máximo: **10 MiB** (`10485760` bytes).
- Timeout: **60 segundos**.

Se recomienda escalar la imagen a 1280×720 en el navegador antes de subirla. Eso reduce el peso a 100-300 KB sin pérdida visible, y evita gastar cuota con originales de 4K que se muestran a 480 px de ancho.

### Response `200`

```json
{
  "success": true,
  "message": "The video thumbnail was updated successfully",
  "data": {
    "video": {
      "id": 2,
      "externalId": "VIDEO_ID",
      "thumbnailUrl": "https://i.ytimg.com/vi/VIDEO_ID/maxresdefault.jpg",
      "thumbnailSource": "CUSTOM",
      "uploadStatus": "READY"
    },
    "thumbnailUrl": "https://i.ytimg.com/vi/VIDEO_ID/maxresdefault.jpg"
  }
}
```

### Ejemplo desde React

```ts
await fetch(`/api/admin/videos/${videoId}/thumbnail`, {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": scaledBlob.type,
  },
  body: scaledBlob,
});
```

## 11.8 `DELETE /api/admin/videos/:videoId/thumbnail`

**Roles:** `ADMIN`, `EDITOR`.

Restaura la miniatura automática de YouTube. Marca `thumbnailSource` como `YOUTUBE_DEFAULT`, lo que permite que `GET /api/admin/videos/:videoId/status` vuelva a refrescar la miniatura en consultas posteriores.

No requiere que el canal esté conectado: si el proveedor no responde, se limpia el marcador `CUSTOM` de todos modos y la URL queda en `null` hasta la próxima sincronización exitosa.

```json
{
  "success": true,
  "message": "The video thumbnail was restored successfully",
  "data": {
    "video": { "id": 2, "thumbnailSource": "YOUTUBE_DEFAULT" },
    "thumbnailUrl": "https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg"
  }
}
```

## 11.9 `thumbnailSource` y el campo `thumbnailUrl` del PATCH

El DTO administrativo de video expone `thumbnailSource`:

| Valor | Significado |
|---|---|
| `YOUTUBE_DEFAULT` | La miniatura es la que YouTube generó. La sincronización de estado puede refrescarla. |
| `CUSTOM` | La miniatura fue elegida a propósito. La sincronización de estado **no** la toca. |

`thumbnailSource` no aparece en el DTO público.

El `PATCH /api/admin/videos/:videoId` acepta `thumbnailUrl`, pero endurecido: solo se admiten hosts de miniatura de YouTube (`i.ytimg.com`, `img.youtube.com`, `yt3.ggpht.com`). Cualquier otro host devuelve `400 INVALID_VIDEO_THUMBNAIL_URL`. Cuando el PATCH incluye `thumbnailUrl`, el backend marca automáticamente `thumbnailSource=CUSTOM`, de modo que la elección sobrevive a la sincronización.

Para cambiar la miniatura de forma soportada conviene usar `PUT /api/admin/videos/:videoId/thumbnail`, que además la aplica dentro de YouTube.

## 11.10 Errores de Videos

| HTTP | Código | Mensaje |
|---:|---|---|
| 400 | `INVALID_VIDEO_INPUT` | Invalid video input |
| 400 | `UNEXPECTED_VIDEO_FIELDS` | Unexpected fields are not allowed |
| 400 | `INVALID_VIDEO_ID` | A valid video ID is required |
| 400 | `INVALID_VIDEO_TITLE` | A valid video title is required |
| 400 | `INVALID_VIDEO_DESCRIPTION` | A valid video description is required |
| 400 | `INVALID_VIDEO_PROVIDER` | Only YOUTUBE is supported |
| 400 | `INVALID_VIDEO_EXTERNAL_ID` | A valid YouTube external ID is required |
| 400 | `INVALID_VIDEO_URL` | A valid HTTPS YouTube URL is required |
| 400 | `VIDEO_URL_ID_MISMATCH` | The YouTube URL and external ID must identify the same video |
| 400 | `INVALID_VIDEO_THUMBNAIL_URL` | A valid YouTube thumbnail URL is required |
| 400 | `INVALID_VIDEO_SORT_ORDER` | A valid video sort order is required |
| 400 | `INVALID_VIDEO_LIST_QUERY` | Invalid video list query |
| 400 | `INVALID_VIDEO_STATUS` | A valid video status is required |
| 400 | `INVALID_VIDEO_FILE_TYPE` | Only MP4 video files are accepted |
| 400 | `VIDEO_FILE_SIZE_REQUIRED` | A valid video file size is required |
| 400 | `INVALID_VIDEO_FILE_SIZE` | The video file size is not allowed |
| 400 | `INVALID_VIDEO_UPLOAD_ENCODING` | Encoded video uploads are not accepted |
| 400 | `VIDEO_PROVIDER_NOT_YOUTUBE` | Only YouTube videos can be checked |
| 400 | `INVALID_VIDEO_THUMBNAIL` | The thumbnail request was rejected by YouTube |
| 400 | `INVALID_VIDEO_THUMBNAIL_TYPE` | Only JPEG and PNG thumbnails are accepted |
| 400 | `INVALID_VIDEO_THUMBNAIL_SIZE` | The thumbnail file size is not allowed |
| 400 | `INVALID_VIDEO_THUMBNAIL_IMAGE` | The image could not be accepted as a YouTube thumbnail |
| 400 | `VIDEO_THUMBNAIL_SIZE_REQUIRED` | A valid thumbnail file size is required |
| 400 | `INVALID_VIDEO_THUMBNAIL_ENCODING` | Encoded thumbnail uploads are not accepted |
| 404 | `VIDEO_NOT_FOUND` | The requested video does not exist |
| 409 | `VIDEO_ALREADY_EXISTS` | A video with this provider and external ID already exists |
| 409 | `VIDEO_NOT_READY` | The video must finish processing before it can be activated |
| 409 | `VIDEO_THUMBNAIL_NOT_READY` | The video must finish processing before its thumbnail can be changed |
| 409 | `YOUTUBE_THUMBNAIL_NOT_PERMITTED` | The connected channel is not allowed to change this thumbnail |
| 429 | `YOUTUBE_THUMBNAIL_RATE_LIMITED` | Too many thumbnail changes were requested for this channel |
| 500 | `VIDEO_THUMBNAIL_PERSISTENCE_FAILED` | The chosen thumbnail could not be recorded |
| 502 | `YOUTUBE_THUMBNAIL_FAILED` | The video thumbnail could not be updated on YouTube |

### Rate limit de YouTube Video Upload

- 5 requests por IP cada 15 minutos.
- `GET /status`: 60 requests por IP cada 15 minutos.
- Miniatura: 20 requests por IP cada 15 minutos, en un store independiente para no consumir el presupuesto de subida.
- Todos los stores son locales al proceso.

---

## 12. YouTube OAuth

## 12.1 `GET /api/admin/youtube/connect`

**Auth:** Bearer + `ADMIN` activo.

El frontend debe:

1. llamar al endpoint;
2. leer `data.authorizationUrl`;
3. redirigir al browser a esa URL;
4. conservar la cookie `youtube_oauth_state` que establece el backend.

Response:

```json
{
  "success": true,
  "message": "YouTube authorization URL created successfully",
  "data": {
    "authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
    "expiresInSeconds": 600
  }
}
```

No devolver ni almacenar el código OAuth en el frontend.

## 12.2 `GET /api/youtube/oauth/callback`

Ruta exacta:

```text
/api/youtube/oauth/callback
```

No requiere `Authorization` porque es la continuación de Google, pero sí requiere:

- query `code`;
- query `state`;
- cookie `youtube_oauth_state`;
- state no vencido, no consumido y con hash registrado en MySQL;
- `iss` válido cuando Google lo envía.

El backend:

1. valida issuer y state;
2. consume el state de forma atómica;
3. intercambia el código en Google;
4. verifica el canal autenticado;
5. cifra el refresh token;
6. guarda la conexión;
7. limpia la cookie de state;
8. devuelve únicamente DTO seguro.

Response `200`:

```json
{
  "success": true,
  "message": "YouTube channel connected successfully",
  "data": {
    "connection": {
      "connected": true,
      "channelId": "UC...",
      "channelTitle": "Official channel",
      "connectedAt": "2026-01-01T09:00:00.000Z",
      "updatedAt": "2026-01-01T09:00:00.000Z"
    }
  }
}
```

El callback nunca devuelve:

- access token;
- refresh token;
- client secret;
- contenido cifrado.

## 12.3 `GET /api/admin/youtube/status`

**Auth:** Bearer + `ADMIN` activo.

Con canal conectado:

```json
{
  "success": true,
  "message": "YouTube channel status retrieved successfully",
  "data": {
    "connection": {
      "connected": true,
      "channelId": "UC...",
      "channelTitle": "Official channel",
      "connectedAt": "2026-01-01T09:00:00.000Z",
      "updatedAt": "2026-01-01T09:00:00.000Z"
    }
  }
}
```

Sin conexión:

```json
{
  "success": true,
  "message": "YouTube channel status retrieved successfully",
  "data": {
    "connection": {
      "connected": false,
      "channelId": null,
      "channelTitle": null,
      "connectedAt": null,
      "updatedAt": null
    }
  }
}
```

## 12.4 Seguridad OAuth

- Scopes solicitados: `youtube.upload` y `youtube.readonly`.
- State generado aleatoriamente.
- Solo se persiste SHA-256 del state.
- El state tiene expiración server-side de 10 minutos.
- El state se marca consumido atómicamente.
- El callback exige coincidencia con la cookie del navegador.
- El canal se verifica con YouTube Data API.
- Si existe `YOUTUBE_CHANNEL_ID`, el canal autenticado debe coincidir.
- El refresh token se cifra con AES-256-GCM.
- Access tokens solo viven en memoria/cache del backend.
- El frontend nunca debe recibirlos.

## 12.5 Errores YouTube OAuth

| HTTP | Código | Mensaje |
|---:|---|---|
| 400 | `INVALID_YOUTUBE_OAUTH_CALLBACK` | The YouTube authorization callback is invalid |
| 400 | `INVALID_YOUTUBE_OAUTH_STATE` | The YouTube authorization state is invalid |
| 400 | `YOUTUBE_OAUTH_FAILED` | The YouTube authorization flow could not be completed |
| 400 | `YOUTUBE_OAUTH_STATE_MISMATCH` | The YouTube authorization state does not match the browser session |
| 400 | `YOUTUBE_OAUTH_STATE_INVALID` | The YouTube authorization state is invalid or expired |
| 403 | `YOUTUBE_CHANNEL_MISMATCH` | The authorized Google account does not belong to the configured YouTube channel |
| 409 | `YOUTUBE_NOT_CONNECTED` | The YouTube channel is not connected |
| 409 | `YOUTUBE_REAUTH_REQUIRED` | The YouTube channel must be reconnected |
| 500 | `YOUTUBE_OAUTH_STATE_UNAVAILABLE` | The YouTube authorization state could not be created or verified |
| 500 | `YOUTUBE_CONNECTION_PERSISTENCE_FAILED` | The YouTube channel connection could not be saved |
| 502 | `YOUTUBE_UPLOAD_FAILED` | The video could not be uploaded to YouTube |
| 502 | `YOUTUBE_STATUS_UNAVAILABLE` | The YouTube video status could not be retrieved |
| 502 | `YOUTUBE_PROVIDER_ERROR` | The YouTube provider could not complete the request |
| 500 | `VIDEO_PERSISTENCE_FAILED` | The uploaded video could not be recorded |
| 500 | `VIDEO_STATUS_PERSISTENCE_FAILED` | The YouTube video status could not be recorded |

---

## 13. Catálogo único de errores

## 13.1 Errores HTTP globales

| HTTP | Código | Mensaje |
|---:|---|---|
| 400 | `INVALID_JSON` | The request body contains invalid JSON |
| 401 | `AUTHENTICATION_REQUIRED` | Authentication is required |
| 401 | `INVALID_AUTHORIZATION_HEADER` | The authorization header is invalid |
| 401 | `INVALID_ACCESS_TOKEN` | The access token is invalid or expired |
| 401 | `AUTHENTICATED_USER_UNAVAILABLE` | The authenticated user is unavailable |
| 401 | `AUTHENTICATION_STALE` | The authentication credentials must be renewed |
| 403 | `FORBIDDEN` | You do not have permission to perform this action |
| 404 | `ROUTE_NOT_FOUND` | The requested route does not exist |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests. Please try again later |
| 503 | `SERVICE_UNAVAILABLE` | The database is not available |
| 500 | `INTERNAL_SERVER_ERROR` | An unexpected error occurred |

`SERVICE_UNAVAILABLE` solo lo devuelve `GET /api/health/ready` cuando la base de datos no responde o
supera el timeout de 2 s. La respuesta nunca incluye el error del driver; el motivo queda solo en el
log del servidor. Un `503` aquí significa "no enviar tráfico a esta instancia", no "el usuario hizo
algo mal".

## 13.2 Auth

| HTTP | Código | Mensaje |
|---:|---|---|
| 400 | `INVALID_LOGIN_INPUT` | Email and password are required |
| 400 | `INVALID_EMAIL` | A valid email is required |
| 400 | `INVALID_PASSWORD` | Password is required |
| 401 | `INVALID_CREDENTIALS` | Invalid email or password |
| 401 | `REFRESH_TOKEN_REQUIRED` | A refresh token is required |
| 401 | `INVALID_REFRESH_TOKEN` | The refresh token is invalid or expired |
| 403 | `USER_INACTIVE` | This user account is inactive |

## 13.3 Media reutilizado por entidades

| HTTP | Código | Mensaje |
|---:|---|---|
| 404 | `MEDIA_NOT_FOUND` | The requested media does not exist |
| 409 | `MEDIA_INACTIVE` | The selected media is inactive |
| 400 | `INVALID_MEDIA_RESOURCE_TYPE` | The selected media must be an image |
| 400 | `INVALID_MEDIA_ID` | A valid media ID is required |

## 13.4 Regla de errores del proveedor

Las respuestas de ImageKit, Google OAuth y YouTube no se reenvían literalmente al frontend. El backend devuelve un código estable y un mensaje neutral. El frontend no debe intentar parsear errores internos del proveedor.

---

## 14. Guía específica para React

## 14.1 Orden recomendado

1. **Auth Provider**
2. **Refresh automático**
3. **Protected Routes**
4. **Users**
5. **Categories**
6. **Media Upload**
7. **Products**
8. **Announcements**
9. **Videos**
10. **YouTube Upload**
11. **YouTube Thumbnail**

## 14.2 Auth Provider

Mantener en memoria:

```ts
type AuthState = {
  user: { id: number; email: string; role: "ADMIN" | "EDITOR" } | null;
  accessToken: string | null;
  status: "loading" | "authenticated" | "anonymous";
};
```

No guardar el refresh token en estado React: es HttpOnly.

Al cargar la aplicación:

```text
GET /api/auth/me
  ├─ 200 → session authenticated
  └─ 401 → anonymous
```

Si no hay access token en memoria, llamar primero a:

```text
POST /api/auth/refresh
```

La cookie se envía automáticamente si `credentials: "include"` es necesario para el dominio.

## 14.3 Refresh automático

Implementar refresh single-flight:

```text
Request API
  ↓
401 INVALID_ACCESS_TOKEN
  ↓
POST /api/auth/refresh
  ↓
actualizar accessToken en memoria
  ↓
repetir una sola vez la request original
```

Evitar múltiples refresh simultáneos cuando varias requests reciben 401 al mismo tiempo.

Después de refresh:

- `200`: actualizar `user` y `accessToken`.
- `401`: limpiar estado y redirigir a login.
- `403`: no ejecutar refresh; significa permiso insuficiente.

## 14.4 Protected Routes

- Sin `Authorization` para rutas públicas.
- Con `Authorization: Bearer <accessToken>` para rutas protegidas.
- El backend vuelve a comprobar que el usuario exista, esté activo y que el rol del token coincida con el usuario actual.
- Un token con rol obsoleto puede producir:
  ```text
  401 AUTHENTICATION_STALE
  ```
  En ese caso intentar refresh una vez y, si falla, cerrar sesión.

## 14.5 Manejo de 401

- `INVALID_ACCESS_TOKEN`: intentar refresh y repetir una vez.
- `AUTHENTICATION_REQUIRED`: limpiar sesión.
- `AUTHENTICATED_USER_UNAVAILABLE`: limpiar sesión.
- `AUTHENTICATION_STALE`: refresh una vez; si no, limpiar sesión.
- `INVALID_REFRESH_TOKEN`: cerrar sesión y volver a login.

## 14.6 Manejo de 403

No intentar refresh. Mostrar:

```text
FORBIDDEN
```

o el mensaje específico de negocio. El usuario está autenticado pero no tiene rol.

## 14.7 Upload de ImageKit

1. Solicitar `POST /api/admin/media/upload-auth` con Bearer.
2. Usar los parámetros temporales en el request directo a ImageKit.
3. No enviar la request a `/api/admin/media` con el archivo.
4. Confirmar con `fileId`.
5. Usar el `media.id` devuelto como `imageMediaId`.
6. Liberar los parámetros temporales después de upload.

La llamada directa a ImageKit debe hacerse desde el navegador para aprovechar la arquitectura de carga directa. No enviar la private key al frontend.

## 14.8 Miniatura de YouTube

La miniatura también pasa por el backend, porque el backend necesita el access token para llamar a `thumbnails.set`. No hay carga directa a ImageKit para este caso.

Secuencia recomendada al subir un video nuevo:

1. Subir el MP4 y esperar a `READY` (el video debe estar procesado para aceptar miniatura).
2. `PUT /api/admin/videos/:videoId/thumbnail` con la imagen ya escalada.
3. Recién entonces publicar, si corresponde.

Para cambiar la miniatura de un video existente, el listado administrativo debe ofrecer la acción cuando `uploadStatus === "READY"`.

Escalar en el navegador antes de subir:

- El `input` de archivo puede aceptar `image/png,image/jpeg,image/webp` porque el navegador sabe decodificar los tres.
- El archivo que se envía al backend debe ser **JPEG**: la API de YouTube rechaza WebP.
- Escalar a 1280×720 con `canvas` y `toBlob("image/jpeg", 0.85)`.
- El resultado típico queda entre 100 y 300 KB, muy por debajo del límite de 10 MiB.
- Mostrar la vista previa con `URL.createObjectURL` y revocarla al reemplazar o desmontar.

Errores a manejar con mensaje propio:

- `VIDEO_THUMBNAIL_NOT_READY`: el video todavía se procesa.
- `YOUTUBE_NOT_CONNECTED` / `YOUTUBE_REAUTH_REQUIRED` / `YOUTUBE_CHANNEL_MISMATCH`: hay que reconectar el canal.
- `INVALID_VIDEO_THUMBNAIL_TYPE` / `INVALID_VIDEO_THUMBNAIL_SIZE`: la imagen local no cumple; reintentar tras escalar.
- `YOUTUBE_THUMBNAIL_RATE_LIMITED`: esperar antes de reintentar.
- Fallo al decodificar la imagen en el navegador: informar que se use JPG o PNG, porque es un fallo local y no del backend.

## 14.9 Upload de YouTube

El upload de YouTube sí pasa por el backend porque el backend debe:

- refrescar el access token;
- controlar el canal;
- transmitir el archivo;
- persistir `externalId`, URL y miniatura;
- inicializar `UNLISTED`.

Usar `File` como body, no `FormData`:

```ts
await fetch("/api/admin/videos/upload", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "video/mp4",
    "X-Video-Title": title,
    "X-Video-Description": description,
  },
  body: file,
});
```

Después:

1. Mostrar `PROCESSING`;
2. consultar status después de un intervalo prudente;
3. detener consultas cuando llegue `READY` o `FAILED`;
4. no activar hasta que `READY`;
5. no cambiar privacidad a `PUBLIC` automáticamente.

## 14.10 Cookies y CORS

- `refreshToken` es HttpOnly y no es accesible desde JavaScript.
- `youtube_oauth_state` también es HttpOnly.
- El callback OAuth debe ocurrir en el mismo navegador que inició `connect`.
- Si frontend y backend están en dominios distintos, configurar proxy/CORS en infraestructura; el backend no añade headers CORS por sí mismo.
- Para desarrollo, usar un proxy que mantenga el mismo origen.

## 14.11 React Query/TanStack Query recomendado

- Query keys separados por módulo.
- Invalidar la lista después de create/update/status.
- No invalidar en polling agresivo.
- Guardar el access token fuera de persistencia.
- Mostrar `price` como string y formatearlo solo en la vista.

---

## 15. Reglas de seguridad para frontend

- No mostrar ni registrar `Set-Cookie`.
- No enviar refresh token en headers, body o logs.
- No asumir que una URL de ImageKit o YouTube es válida solo porque el frontend la tenga; la entidad se valida en backend.
- No construir URLs de proveedor con datos del cliente para la confirmación.
- No modificar `provider`, `externalId` o `publicId` desde endpoints que no los acepten.
- No intentar eliminar media referenciada; primero quitar asociaciones.

> En fotos no se puede quitar la asociación, porque la imagen es obligatoria. Reasignar la foto a
> otra imagen o borrar la foto antes de eliminar el archivo de media.

---
- No activar videos `PROCESSING` o `FAILED`.
- No publicar un video QA como `PUBLIC` salvo una acción editorial explícita y posterior.

---

## 16. Verificación final de esta documentación

Comandos ejecutados:

```text
git status --short --branch
npm test
npm audit
npm ls --depth=0
knex migrate:list --env development
node --env-file=.env src/database/test-connection.js
```

Resultado de la auditoría:

```text
323 tests passed
0 failed
0 npm audit vulnerabilities
16 migrations completed
0 pending migrations
MySQL connection verified successfully
```

No se modificó código de negocio, tablas, migraciones ni dependencias para producir esta documentación.

No se creó commit.

---

## 16 bis. Estado verificado del backend

Este bloque **sí** se mantiene al día (a diferencia del snapshot histórico de §16). Refleja el
estado real comprobado tras las últimas rondas de trabajo.

```text
371 tests passed
0 failed
Módulos con error de sintaxis: 0
Migraciones en disco: 16 (sin cambios; ninguna migración nueva ni editada)
```

### Verificación funcional

Ejecutada sobre una copia temporal con un `.env` de valores ficticios. **Nunca** sobre el `.env`
real, que es gitignored y no se lee ni se imprime.

| Comprobación | Resultado |
|---|---|
| `npm test` | 371 / 371, 0 fallos |
| `node --check` en todos los módulos | 0 errores |
| Arranque del servidor | Correcto |
| `GET /api/health` | `200` (no consulta MySQL) |
| `GET /api/health/ready` | `503` correcto sin base de datos |
| Rutas públicas que leen MySQL | `500` con mensaje neutro + log del motivo |
| Ruta inexistente | `404 ROUTE_NOT_FOUND` |
| Rutas administrativas sin token | `401` en las 5 |
| Cabeceras de helmet | `nosniff`, `SAMEORIGIN`, `noopen`, `none`, `no-referrer`, CSP completa |
| `X-Powered-By` | Ausente |

### Despliegue verificado paso a paso

| Paso | Estado |
|---|---|
| 1. `npm ci --omit=dev` | Pasa. `knex` instalado, `nodemon` excluido |
| 2. Variables de entorno | Pasa con `NODE_ENV=production` |
| 3. CLI de knex con `NODE_ENV=production` | Resuelve `production`; llega al punto de conexión |
| 4. `create-initial-admin.js` | Lee `INITIAL_ADMIN_*`; llega al punto de conexión |
| 5. `npm start` | Pasa **con** `.env` y **solo** con variables inyectadas |
| 6. `GET /api/health` / `/api/health/ready` | Verificados arriba |
| 7-8. YouTube, ImageKit, humo con datos | **No verificable** sin credenciales y base de datos reales |

### Nota sobre los `500` en las rutas públicas

Con MySQL inaccesible las rutas públicas responden `500 INTERNAL_SERVER_ERROR` con mensaje neutro
y el motivo real queda solo en el log del servidor. Es el comportamiento correcto y el que hace
imprescindible apuntar el health check del balanceador a `/api/health/ready`.

---

## 17. Fotos (día a día)

Módulo `photos`. A diferencia del resto de módulos, los archivos usan nombre plural
(`photos.*`). Las imágenes **no** se suben a este módulo: se suben a ImageKit por el flujo de
[§10](#10-media-e-imagekit) y aquí solo se guarda la referencia.

### 17.1 DTO público

```json
{
  "id": 1,
  "caption": "Así preparamos el recado hoy",
  "image": {
    "id": 12,
    "url": "https://ik.imagekit.io/...",
    "altText": "Recado del día",
    "width": 1200,
    "height": 900
  },
  "createdAt": "2026-09-27T10:00:00.000Z"
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `id` | number | ID interno de la foto, `>= 1`. |
| `caption` | string \| null | Máximo 500 caracteres. |
| `image` | object | **Nunca `null`.** Ver [§6](#6-dtos-de-imagen). |
| `image.id` | number | **Campo nuevo y aditivo.** ID de media, entero `>= 1`. |
| `image.url` | string | URL HTTPS de ImageKit. |
| `image.altText` | string \| null | Texto alternativo. |
| `image.width`, `image.height` | number \| null | Dimensiones. |
| `createdAt` | string | ISO 8601. |

### 17.2 `image.id` y la reutilización de galería

`image.id` es el mismo valor que hay que enviar como `imageMediaId` para reutilizar esa imagen.
Sin él el frontend no puede saber qué archivo de la galería está en uso al editar una foto.

Cambio **aditivo y verificado**: antes el DTO devolvía `url`, `altText`, `width` y `height`; ahora
devuelve además `id` como la **primera** clave del objeto `image`. Los cuatro campos anteriores
conservan nombre, tipo y valor, y el orden de las claves no es parte del contrato JSON.

- `image.id` es **numérico**, aunque el driver entregue la columna como cadena. Si el `image_id`
  fuera utilizable, el backend responde `500 INTERNAL_SERVER_ERROR` en lugar de devolver un DTO
  parcial.
- El valor es el mismo en el DTO público y en el administrativo, porque ambos comparten la misma
  función de mapeo.
- No hay campo `imageMediaId` en ningún DTO de fotos: la referencia se expone ya normalizada como
  `image.id`.

### 17.3 Visibilidad

Una foto aparece en el listado público solo si:

```text
p.is_active = 1
AND m.is_active = 1
AND m.resource_type = 'IMAGE'
```

El `INNER JOIN` con `media` significa que **si la media se desactiva o se elimina, la foto desaparece
del sitio público aunque siga activa**, sin aviso y sin cambio en la fila de `photos`. Es
deliberado: no se sirven imágenes de un archivo borrado.

`GET /api/photos/:photoId` devuelve la foto si cumple lo mismo; en otro caso `404 PHOTO_NOT_FOUND`.

Orden del listado público:

```text
createdAt DESC, id DESC
```

### 17.4 `GET /api/admin/photos`

Roles: `ADMIN`, `EDITOR`.

| Parámetro | Valores | Default |
|---|---|---|
| `page` | `>=1` | `1` |
| `limit` | `1..100` | `20` |
| `isActive` | `true`, `false` | — |
| `caption` | búsqueda parcial, máximo 500 | — |
| `sortBy` | `id`, `caption`, `isActive`, `sortOrder`, `createdAt`, `updatedAt` | `createdAt` |
| `sortOrder` | `asc`, `desc` | `desc` |

No acepta parámetros desconocidos. A diferencia del listado administrativo, **no filtra por media**:
el listado administrativo usa `INNER JOIN` sin las condiciones de `media`, así que sí muestra fotos
 cuya imagen está inactiva.

### 17.5 `POST /api/admin/photos`

```json
{
  "caption": "Así preparamos el recado hoy",
  "imageMediaId": 12,
  "sortOrder": 0
}
```

Reglas:

- `imageMediaId`: **requerido**, entero `>= 1`, y debe apuntar a media activa de tipo `IMAGE`.
- `caption`: opcional, `null` o string de máximo 500 caracteres.
- `sortOrder`: default `0`, entero entre `0` y `4_294_967_295`.
- No acepta campos desconocidos.

Response `201` con el DTO administrativo.

### 17.6 `PATCH /api/admin/photos/:photoId`

Campos permitidos:

```text
caption, imageMediaId, sortOrder, isActive
```

- Se debe enviar al menos uno.
- `imageMediaId` sigue siendo **obligatorio y no admite `null`**: a diferencia de categorías,
  productos y avisos, una foto no puede quedar sin imagen.
- Si viene `imageMediaId`, se revalida que la media exista, esté activa y sea de tipo `IMAGE`.

### 17.7 `DELETE /api/admin/photos/:photoId`

Elimina la fila. **No toca el archivo de ImageKit.** Response `200`:

```json
{
  "photoId": 1,
  "deleted": true
}
```

Para liberar el archivo hay que ir después a `DELETE /api/admin/media/:mediaId`, que ya no lo
encontrará referenciado.

### 17.8 DTO administrativo

```json
{
  "id": 1,
  "caption": "Así preparamos el recado hoy",
  "image": {
    "id": 12,
    "url": "https://ik.imagekit.io/...",
    "altText": "Recado del día",
    "width": 1200,
    "height": 900
  },
  "createdAt": "2026-09-27T10:00:00.000Z",
  "isActive": true,
  "sortOrder": 0,
  "updatedAt": "2026-09-28T09:00:00.000Z"
}
```

El DTO administrativo es el público más `isActive`, `sortOrder` y `updatedAt`, con el **mismo**
objeto `image` incluido `id`.

### 17.9 Errores de Fotos

| Código | HTTP | Origen |
|---|---:|---|
| `INVALID_PHOTO_ID` | 400 | `:photoId` no es un entero `>= 1`. |
| `INVALID_PHOTO_INPUT` | 400 | Body no objeto, sin `imageMediaId` al crear, o `PATCH` vacío. |
| `UNEXPECTED_PHOTO_FIELDS` | 400 | Campo no permitido en body o query. |
| `INVALID_IMAGE_MEDIA_ID` | 400 | `imageMediaId` no es entero `>= 1`, o es `null`. |
| `INVALID_CAPTION` | 400 | `caption` no es string o excede 500. |
| `INVALID_SORT_ORDER` | 400 | `sortOrder` fuera de `0..4_294_967_295`. |
| `INVALID_PHOTO_STATUS` | 400 | `isActive` no es boolean. |
| `INVALID_PHOTO_LIST_QUERY` | 400 | Query de listado inválida. |
| `PHOTO_NOT_FOUND` | 404 | No existe o no cumple la visibilidad. |
| `MEDIA_NOT_FOUND` | 404 | `imageMediaId` no existe. |
| `MEDIA_INACTIVE` | 409 | La media referida está desactivada. |
| `INVALID_MEDIA_RESOURCE_TYPE` | 400 | La media referida no es de tipo `IMAGE`. |

Los tres últimos reutilizan los códigos de Media definidos en [§13.3](#133-media-reutilizado-por-entidades).
