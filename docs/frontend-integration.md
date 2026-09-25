# Backend API — Guía definitiva para frontend React

**Estado del documento:** contrato vigente del backend  
**Base conceptual:** `/api`  
**Formato:** JSON salvo uploads binarios  
**OpenAPI:** no existe un archivo OpenAPI/Swagger en el repositorio; este documento es la especificación Markdown equivalente.

> Esta guía describe el comportamiento real del backend. No contiene claves, tokens, secretos ni valores de `.env`.

---

## 1. Auditoría y alcance

La auditoría realizada antes de documentar confirmó:

- `npm test`: **274 pruebas aprobadas, 0 fallidas**.
- `npm audit`: **0 vulnerabilidades**.
- Migraciones: **11 completadas, 0 pendientes**.
- Conexión MySQL: verificada.
- YouTube OAuth: verificado con una conexión real.
- ImageKit: integración configurada y verificada por pruebas; el media store contiene únicamente proveedor `IMAGEKIT`.

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

---

## 3. Mapa completo de endpoints

### 3.1 Salud

| Método | Ruta | Auth | Descripción |
|---|---|---:|---|
| GET | `/api/health` | No | Estado de la aplicación |

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

- `id`: ID interno de media.
- `url`: URL HTTPS de ImageKit.
- `altText`: texto alternativo o `null`.
- `width`, `height`: enteros o `null`.

El `imageMediaId` solo aparece en DTOs administrativos.

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
- avisos.

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
2. comprueba referencias en categorías, productos y avisos;
3. desactiva el registro;
4. elimina el archivo en ImageKit;
5. elimina la fila MySQL.

No se permite eliminar media referenciada. `imageMediaId: null` es la forma de retirar asociaciones.

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
  "sortOrder": 0
}
```

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

## 11.7 Errores de Videos

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
| 400 | `INVALID_VIDEO_THUMBNAIL_URL` | A valid HTTPS thumbnail URL is required |
| 400 | `INVALID_VIDEO_SORT_ORDER` | A valid video sort order is required |
| 400 | `INVALID_VIDEO_LIST_QUERY` | Invalid video list query |
| 400 | `INVALID_VIDEO_STATUS` | A valid video status is required |
| 400 | `INVALID_VIDEO_FILE_TYPE` | Only MP4 video files are accepted |
| 400 | `VIDEO_FILE_SIZE_REQUIRED` | A valid video file size is required |
| 400 | `INVALID_VIDEO_FILE_SIZE` | The video file size is not allowed |
| 400 | `INVALID_VIDEO_UPLOAD_ENCODING` | Encoded video uploads are not accepted |
| 400 | `VIDEO_PROVIDER_NOT_YOUTUBE` | Only YouTube videos can be checked |
| 404 | `VIDEO_NOT_FOUND` | The requested video does not exist |
| 409 | `VIDEO_ALREADY_EXISTS` | A video with this provider and external ID already exists |
| 409 | `VIDEO_NOT_READY` | The video must finish processing before it can be activated |

### Rate limit de YouTube Video Upload

- 5 requests por IP cada 15 minutos.
- `GET /status`: 60 requests por IP cada 15 minutos.
- Ambos stores son locales al proceso.

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
| 500 | `INTERNAL_SERVER_ERROR` | An unexpected error occurred |

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

## 14.8 Upload de YouTube

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

## 14.9 Cookies y CORS

- `refreshToken` es HttpOnly y no es accesible desde JavaScript.
- `youtube_oauth_state` también es HttpOnly.
- El callback OAuth debe ocurrir en el mismo navegador que inició `connect`.
- Si frontend y backend están en dominios distintos, configurar proxy/CORS en infraestructura; el backend no añade headers CORS por sí mismo.
- Para desarrollo, usar un proxy que mantenga el mismo origen.

## 14.10 React Query/TanStack Query recomendado

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
274 tests passed
0 failed
0 npm audit vulnerabilities
11 migrations completed
0 pending migrations
MySQL connection verified successfully
```

No se modificó código de negocio, tablas, migraciones ni dependencias para producir esta documentación.

No se creó commit.
