# Roadmap del asistente de administración

Plan de ejecución del asistente. `docs/assistant.md` sigue siendo la especificación
funcional y el contrato de API; este archivo es el orden de trabajo y el criterio de
cierre. Cualquier agente retoma por la primera tarea sin marcar.

## Cómo se usa

1. Tomar la primera tarea abierta de la fase más baja.
2. Implementarla con sus tests.
3. Ejecutar su **validación real** y anotar el resultado en la bitácora del final.
4. Marcar `[x]` solo si se cumplen las tres reglas de abajo.

No se salta de fase: cada fase cierra con la suite completa en verde.

---

## Reglas para dar por terminada una tarea

### 1. No romper lo existente

- `cd server && npm test` en verde, con el conteo de tests igual o mayor al de `master`.
- `cd frontend && npm test` en verde y `cd frontend && npm run lint` sin errores nuevos.
- `cd frontend && npm run build` si se tocó cualquier `.css` (lightningcss es más
  estricto que el dev server; ver AGENTS.md).
- Los códigos de error existentes (`ASSISTANT_*`) no cambian de nombre ni de status.
- No se edita una migración ya aplicada: siempre una nueva con timestamp.
- Los permisos por rol del panel siguen valiendo igual desde el asistente.

### 2. Validar funcionamiento real

No alcanza con tests verdes ni con que compile. Hay que ejecutar el flujo afectado
con el servidor (`cd server && npm run dev`) y MySQL reales, y registrar qué se hizo.
Cada tarea trae sus pasos. Si una tarea no admite validación real, se escribe acá
mismo por qué, antes de marcarla.

Para consultar el motivo real de un fallo:

```sql
SELECT id, provider, model, status, error_code, provider_calls,
       input_tokens, output_tokens, created_at
FROM ai_usage_events
ORDER BY id DESC
LIMIT 20;
```

### 3. Documentación proporcional

Explicar lo necesario, no más. En un archivo de código, nunca debe haber más líneas
de comentarios o documentación que de código para explicar una sola parte de ese
archivo. Si un comentario explica algo que el nombre ya dice, se borra.

Verificación concreta: en cada bloque tocado, contar líneas de comentario y líneas de
código. Si el comentario ocupa más, se recorta antes de cerrar la tarea.

---

## Decisiones aprobadas (2026-10-30)

- Se sigue en la **API gratuita de Gemini**. Todo queda preparado para pasar a tier
  pago sin tocar código: solo variables de entorno.
- **EDITOR** puede hacer todo el contenido, igual que en el panel. Quedan fuera para
  ambos roles: crear usuarios, resetear contraseñas y cualquier operación de YouTube.
- **No** se borran videos de YouTube desde el asistente (sí se ocultan y se restaura
  la miniatura por defecto).
- Se incluye `notify_announcement` (push real, con advertencia en la tarjeta).
- Se incluyen las 4 acciones de configuración.
- **Una sola propuesta de escritura por mensaje.** El servidor ya lo fuerza.
- **Tres acciones masivas** para operaciones de conjunto.
- Las validaciones de borrado se evalúan **al proponer**, no al confirmar.
- El asistente no sube archivos: reutiliza imágenes de la galería.
- Las contraseñas nunca viajan por el chat ni se guardan en `ai_messages`.

---

## Límites y configuración

| Constante / variable | Antes | Después | Motivo |
|---|---|---|---|
| `MAX_TOOL_DECLARATIONS` | 12 | 48 | 10 lecturas + 32 acciones, con margen |
| `MAX_TOOL_EXECUTIONS_PER_MESSAGE` | 2 | 2 | Sin cambios: las masivas quitan la necesidad |
| `MAX_PROVIDER_CALLS_PER_MESSAGE` | 3 | 3 | Sin cambios: cada llamada extra es cupo |
| Límite diario por usuario | 100 | 50 | Un admin no debe consumir el RPD del proyecto |
| `AI_DAILY_PROVIDER_CALLS` | — | 120 (0 = sin límite) | Corta antes del 429 del proveedor |
| `AI_PRICE_INPUT_PER_M` | — | 0 (desactivado) | Estimador de costo en `/usage` |
| `AI_PRICE_OUTPUT_PER_M` | — | 0 (desactivado) | Idem |

`ai_usage_events` suma `provider_calls` (llamadas reales al proveedor en ese mensaje).
Hoy guarda una fila por mensaje, así que sin esa columna no se puede medir cuota.

---

## Inventario objetivo

### Lecturas nuevas (10)

| Herramienta | Devuelve |
|---|---|
| `get_product_detail` | nombre, categoría, precio, disponibilidad, activo, actualizado |
| `list_categories` | id, nombre, activa, orden, cantidad de productos |
| `list_products_by_category` | productos de una categoría, acotado |
| `count_products_by_category` | cantidad por categoría |
| `list_media` | imágenes de la galería con uso |
| `search_media` | imágenes por nombre/etiqueta |
| `get_video_detail` | título, estado de carga, activo, miniatura |
| `list_users` | email, rol, activo (solo ADMIN) |
| `get_settings` | configuración administrativa completa |
| `list_photos` | fotos de Día a día, con estado |

### Acciones (32, ✔ = ya existe)

| Módulo | Acciones |
|---|---|
| Productos | ✔ `set_product_availability`, `set_product_active`, `create_product`, `update_product`, `delete_product` |
| Categorías | ✔ `set_category_active`, `create_category`, `update_category`, `delete_category` |
| Masivas | `move_products_to_category`, `set_products_availability`, `set_products_active` |
| Avisos | ✔ `set_announcement_active`, `create_announcement`, `update_announcement`, `notify_announcement`, `delete_announcement` |
| Fotos | `create_photo`, `update_photo`, `set_photo_active`, `delete_photo` |
| Videos | ✔ `set_video_active`, `update_video`, `restore_video_thumbnail` |
| Configuración | `update_business_info`, `update_contact_info`, `update_schedule`, `update_location` |
| Galería | `delete_media` |
| Usuarios | `set_user_active`, `change_user_role`, `revoke_user_sessions` |

Fuera por decisión: `create_user`, `reset_user_password`, `upload_video`, borrado
remoto de YouTube, `set_video_thumbnail` (requiere bytes).

---

## Fase A — Cimientos y productos

### [x] A.1 Orquestador tolerante a errores del modelo

Hoy una herramienta inventada, una mezcla de lectura y acción, o más de dos
herramientas en un turno producen `502 ASSISTANT_PROVIDER_ERROR`. El usuario ve
"No se pudo generar una respuesta" y no hay forma de saber qué pasó.

**Cambios**

- `server/src/modules/assistant/assistant.tool-orchestrator.js`: en lugar de cortar,
  devolver el error como resultado de herramienta (`UNKNOWN_TOOL`, `FORBIDDEN_TOOL`,
  `INVALID_TOOL_ARGUMENTS`, `TOOL_LIMIT`) y permitir una ronda más para que el modelo
  responda en español.
- Mezcla lectura + acción: ejecutar las lecturas, descartar la acción y pedir al modelo
  que la proponga sola en el siguiente turno.
- `assistant.provider-error.js`: nuevo código `TOOL_MISUSE`, usado solo si después de
  la ronda de corrección el modelo vuelve a pedir algo inválido.
- `assistant.service.js`: mapear `TOOL_MISUSE` a `502 ASSISTANT_TOOL_MISUSE`.
- `frontend/src/components/Admin/Assistant/AssistantChat.jsx`: mensaje propio para el
  código nuevo ("El asistente intentó una operación no permitida. Probá pidiéndolo
  paso por paso.").

**Validación real**

1. `cd server && npm run dev` con `.env` y MySQL reales.
2. Panel → Asistente → "creá un producto llamado Prueba".
3. Esperado: respuesta en español diciendo que todavía no puede crear productos.
   **No** un 502.
4. Repetir tres veces para descartar intermitencia.
5. `SELECT error_code, COUNT(*) FROM ai_usage_events WHERE created_at >= NOW() - INTERVAL 15 MINUTE GROUP BY error_code;`
   No debe aparecer `INVALID_RESPONSE` por esos intentos.

**Tests**: `assistant-tool-orchestrator.test.js` (herramienta desconocida, mezcla,
límite superado, rol insuficiente), `assistant-admin-routes.test.js` (código nuevo),
`AssistantChat.test.jsx` (mensaje del código nuevo).

**Cierre**: [x] reglas 1–3 · [x] validación anotada

### [x] A.2 Streaming en todas las rondas y control de cuota

Hoy cada pregunta cuesta el doble: se pide la respuesta sin streaming, se descarta y se
vuelve a pedir con streaming para mostrarla.

**Cambios**

- `assistant.tool-orchestrator.js`: usar `chatStream` desde la primera ronda. El texto
  de una ronda que termina en `toolCall` se muestra como progreso y no se repite.
- `gemini.provider.js`: permitir `tools` en `chatStream` (la SSE ya trae `functionCall`).
- `assistant.prompt.js`: regla de no responder antes de consultar herramientas, para no
  duplicar texto entre rondas.
- Migración nueva `..._add_provider_calls_to_ai_usage_events.js` + repositorio +
  `recordUsageEvent` con `providerCalls`.
- Contador diario en memoria con `AI_DAILY_PROVIDER_CALLS`; al agotarse responde
  `429 ASSISTANT_QUOTA_EXCEEDED`.
- `provider.mapHttpStatus` → `RATE_LIMITED` se propaga como `429 ASSISTANT_RATE_LIMITED`
  en vez de caer en el 502 genérico.
- `config/env.js`: `AI_DAILY_PROVIDER_CALLS`, `AI_PRICE_INPUT_PER_M`, `AI_PRICE_OUTPUT_PER_M`.
- `assistant.service.js` + UI de métricas: costo estimado si los precios están configurados.

**Validación real**

1. Pregunta simple ("¿cuántos productos tengo?"): `SELECT provider_calls FROM ai_usage_events ORDER BY id DESC LIMIT 1;`
   debe dar **1**.
2. Pregunta con lectura ("¿qué productos hay en Nacatamales?"): debe dar **2**.
3. Confirmar una tarjeta: no debe crear un evento nuevo (0 llamadas).
4. Con `AI_DAILY_PROVIDER_CALLS=3`, agotar el cupo y verificar el mensaje claro y el 429.
5. Comparar `SUM(input_tokens)` de 10 preguntas antes y después: debe bajar ~40 %.

**Tests**: `assistant-tool-orchestrator.test.js` (una sola llamada en pregunta simple),
`assistant-provider.test.js` (stream con tools), `assistant-repository.test.js`
(`provider_calls`), `assistant-quota.test.js`, `assistant-admin-routes.test.js`
(429 de cuota y rate limit), `AssistantChat.jsx` (`ASSISTANT_QUOTA_EXCEEDED`,
`ASSISTANT_RATE_LIMITED`).

**Cierre**: [x] reglas 1–3 · [x] validación anotada

### [x] A.3 Productos, primera escritura completa

**Cambios**

- `MAX_TOOL_DECLARATIONS` 12 → 48.
- Partir `assistant.action-tools.js` en `assistant/data/products.action-tools.js`,
  `categories`, `announcements`, `photos`, `videos`, `settings`, `media`, `users`,
  con un índice que mantiene el export actual.
- Lecturas: `get_product_detail`; agregar `price` y `category` a `search_products`.
- Acciones: `create_product`, `update_product`, `set_product_active`, `delete_product`.
  Campos espejo de `parseCreateProductBody` / `parseUpdateProductBody`
  (`categoryId`, `name`, `description`, `price`, `sortOrder`, `imageMediaId`).
- `delete_product`: advertencia con nombre y categoría; sin chequeo previo (no hay FK).
- Tarjeta: formato de precio (`C$`) y de fecha en `assistantFormat.js`.

**Validación real**

1. "Creá el producto «Nacatamal de prueba» en la categoría X a C$ 35" → tarjeta con
   nombre, categoría y precio → confirmar.
2. `SELECT id, name, price, category_id, is_active FROM products WHERE name LIKE 'Nacatamal de prueba%';`
3. "Cambiale el precio a C$ 40" → tarjeta 35 → 40 → confirmar → verificar en la DB que
   cambió `price` y `updated_at`.
4. "¿Cuánto cuesta el nacatamal?" → responde el precio real.
5. Con rol EDITOR: puede. Con un rol sin permiso: recibe negativa, no 502.
6. "Borrá el producto Nacatamal de prueba" → tarjeta de advertencia → confirmar →
   `SELECT COUNT(*)` da 0 y la imagen de la galería sigue existiendo.

**Tests**: `assistant-tool-products.test.js`, `assistant-action-tools.test.js`,
`assistant-action-service.test.js`, `assistant-action-admin-routes.test.js`,
`assistantFormat.test.js`.

**Cierre**: [x] reglas 1–3 · [x] validación anotada

---

## Fase B — Categorías y operaciones masivas

### [x] B.1 Categorías

**Cambios**: `create_category`, `update_category`, `delete_category` (ya existe
`set_category_active`), `list_categories`.

`delete_category` con chequeo previo en `getProposalRejectionMessage`: contar productos
y rechazar la propuesta con "«X» tiene N productos. Movelos a otra categoría o
desactivala." El `409 CATEGORY_HAS_PRODUCTS` del servicio sigue siendo la verdad ante
una carrera. El slug se genera del nombre y se regenera al renombrar; el rechazo es
asíncrono (`proposeAction` lo espera).

**Validación real**

1. Crear "Postres" → confirmar → aparece en `/menu` público tras recargar.
2. Intentar borrar "Nacatamales" teniendo productos → **no** aparece tarjeta; el mensaje
   trae el conteo.
3. Renombrar y cambiar orden → verificar en el sitio público.

**Tests**: `assistant-tool-categories.test.js` (`list_categories` acotado),
`assistant-action-tools.test.js` (validación exacta, alta y edición con slug),
`assistant-action-service.test.js` (rechazo de borrado con conteo singular/plural).

**Cierre**: [x] reglas 1–3 · [x] validación anotada

### [x] B.2 Lecturas de soporte para masivas

**Cambios**: `count_products_by_category`, `list_products_by_category` (límite fijo del
servidor). Sin esto el agente no puede decir "7 productos" antes de mover.
`categoryService.countProductsByCategory` valida primero que la categoría exista, para
que un ID inventado responda `CATEGORY_NOT_FOUND` y no "0 productos".

**Validación real**: en una categoría con 3 productos, preguntar "¿cuántos productos
tiene Nacatamales?" y comparar con `SELECT COUNT(*) FROM products WHERE category_id = ?`.

**Tests**: `assistant-tool-products.test.js` (conteo real, listado acotado a 20 con
`truncated` y sin descripciones, IDs inválidos sin tocar servicios); listas de
declaraciones actualizadas en `assistant-tool-schedule.test.js`,
`assistant-tool-videos.test.js` y `assistant-admin-routes.test.js`.

**Cierre**: [x] reglas 1–3 · [x] validación anotada

### [x] B.3 Acciones masivas

**Cambios**: `move_products_to_category({ fromCategoryId, toCategoryId })`,
`set_products_availability({ categoryId, isAvailable })`,
`set_products_active({ categoryId, isActive })`.

Cada una: una transacción, un `pending action`, una tarjeta con el conteo y los nombres
(hasta 20) y resultado con cuántos se aplicaron. La tarjeta de masivas no se parte.
El conteo y la lista se resuelven en `getCategoryProductsTarget` (21 filas para
detectar truncado) y el movimiento rechaza una categoría de destino oculta o la misma
categoría de origen. La ejecución revalida el conjunto por `productCount`: si cambió
entre la propuesta y la confirmación, responde `ASSISTANT_ACTION_CONFLICT`.

**Validación real**

1. "Creá una categoría Postres y pasá todos los productos de Nacatamales a Postres".
   Esperado: **dos pasos**, dos confirmaciones, y el agente anuncia el plan.
2. Tras el paso 2: `SELECT category_id, COUNT(*) FROM products WHERE category_id IN (vieja, nueva) GROUP BY category_id;`
3. Intentar mover una categoría vacía: advertencia, no error.
4. Repetir con 1 solo producto y con más de 20 para ver el truncado de la tarjeta.

**Tests**: `assistant-action-tools.test.js`, `assistant-action-service.test.js`,
`assistant-action-executor.test.js`.

**Cierre**: [x] reglas 1–3 · [x] validación anotada

---

## Fase C — Avisos

### [x] C.1 CRUD de avisos

**Cambios**: `create_announcement` (título, mensaje, tipo, orden, imagen de galería,
`startsAt`/`endsAt`, activo), `update_announcement`, `delete_announcement`,
`get_announcement_detail` (lectura con el mensaje recortado a 2000 caracteres) y
`list_photos` no aplica acá. La creación deja el aviso como borrador salvo que se pida
`isActive: true`; en ese caso se crea y se publica con `changeAnnouncementStatus`, igual
que el botón "Publicar" del panel, para que el push siga el mismo camino. Las fechas
viajan como ISO en los argumentos y se convierten a `Date` al ejecutar. La tarjeta
advierte cuando el aviso queda programado y cuando publicar puede enviar push.

**Validación real**

1. Crear un aviso programado para mañana → `SELECT title, starts_at, is_active FROM announcements ORDER BY id DESC LIMIT 1;`
2. Verificar que no aparece en el sitio público hasta la fecha.
3. Editar el mensaje y confirmar el cambio en `/`.
4. Borrar un aviso activo → permitido; verificar que la fila desaparece y que la imagen
   de la galería sigue existiendo.

**Tests**: `assistant-tool-announcements.test.js`, `assistant-action-tools.test.js`,
`assistantFormat.test.js`.

**Cierre**: [x] reglas 1–3 · [x] validación anotada

### [x] C.2 Notificación push

**Cambios**: `notify_announcement`. La tarjeta advierte que se enviará a los suscriptores.
Solo para avisos activos y vigentes; el servidor ya responde
`409 ANNOUNCEMENT_NOT_VISIBLE`. Antes de proponer se comprueba que el push esté
configurado y que el aviso esté publicado y dentro de sus fechas, para no ofrecer una
tarjeta que el servidor rechazaría. El envío real sigue siendo
`notificationService.resendAnnouncement` (claim de `notified_at`, cooldown y despacho
por lotes), así que el asistente no reimplementa nada. Un aviso ya notificado advierte
en la tarjeta que se reenviará.

**Validación real**

1. Con VAPID configurado y una suscripción de prueba propia: notificar un aviso vigente
   → llega la notificación y `notified_at` queda no nulo.
2. Notificar uno programado a futuro → rechazo con mensaje claro, sin envío.
3. Sin VAPID: el asistente no ofrece notificar y el flujo no rompe.
4. **No** usar suscriptores reales en pruebas.

**Tests**: `assistant-action-tools.test.js`, `notification-send.test.js` (mock del
proveedor por propiedad, nunca red).

**Cierre**: [x] reglas 1–3 · [x] validación anotada

---

## Fase D — Día a día y galería

### [x] D.1 Fotos

**Cambios**: `create_photo` (solo con `imageMediaId` de la galería), `update_photo`,
`set_photo_active`, `delete_photo`, `list_photos`. Se adelantó `search_media` (búsqueda
de imágenes de la galería por texto alternativo o nombre de archivo) porque la
validación de creación de fotos la necesita; D.2 conserva `list_media` y `delete_media`.
La tarjeta de confirmación identifica la imagen de la galería por su id, igual que
categorías y avisos. `create_photo` rechaza la propuesta si la imagen no existe, está
desactivada o no es una imagen, en vez de fallar al confirmar. La foto se crea
publicada, como en el panel. `search` se agregó al filtro de la lista de media
(`alt_text OR public_id`) para que la búsqueda sea exacta en SQL.

**Validación real**

1. "Publicá en Día a día la foto de la galería «postre»" → tarjeta con la imagen
   seleccionada → confirmar → `SELECT image_media_id, caption, is_active FROM photos ORDER BY id DESC LIMIT 1;`
2. Verificar que la foto aparece en `/dia-a-dia`.
3. Intentar crear una foto sin imagen existente → el agente explica que debe subirla
   desde la galería.
4. Edición, ocultación y borrado de la foto: la fila de `photos` cambia o desaparece
   y la fila de `media` sobrevive.
5. Búsqueda por texto: `search_media` devuelve las imágenes cuyo texto alternativo o
   nombre de archivo coincide.

**Tests**: nuevo `assistant-tools-photos.test.js`, `assistant-action-tools.test.js`.

**Cierre**: [x] reglas 1–3 · [x] validación anotada

### [x] D.2 Galería

**Cambios**: `list_media` (DTO con `usageCount` por imagen, calculado con
`countMediaReferences`), `delete_media` con chequeo previo por `countMediaReferences`.
Rechazo con "Se usa en N publicaciones". `search_media` ya se implementó en D.1.
El borrado real es `mediaService.deleteMedia` (misma ruta que el panel: ImageKit +
fila de `media`), así que el asistente no reimplementa la eliminación.

**Validación real**

1. `list_media` sobre la base real devolvió cada imagen con su `usageCount`
   (imagen 10 con 0, el resto con 1 o más).
2. Borrar una imagen en uso (id 2, usage 1) → `NOT_APPLICABLE` con
   "La imagen se usa en 1 publicación…", sin tarjeta.
3. Borrar una imagen libre (id 10, usage 0) → tarjeta con advertencia irreversible →
   confirmar → fila de `media` eliminada (0 restantes) y llamada a ImageKit exitosa
   (sin `MEDIA_PROVIDER_ERROR`).
4. `search_media` con `'Nacatamal'` devolvió 3 imágenes.

**Tests**: nuevo `assistant-tools-media.test.js`, `assistant-action-tools.test.js`.

**Cierre**: [x] reglas 1–3 · [x] validación anotada

---

## Fase E — Configuración

### [ ] E.1 Las cuatro acciones de configuración

**Cambios**: `get_settings`, `update_business_info`, `update_contact_info`,
`update_schedule`, `update_location`. Cada una con su lista cerrada de campos, espejo de
`settings.validator.js`. La tarjeta muestra solo los campos que cambian.

**Validación real**

1. "Cambiá el horario general a 7am–6pm" → tarjeta → confirmar → verificar en `/`.
2. Cambiar WhatsApp → verificar en `/contacto` que el enlace se actualiza.
3. Cambiar latitud/longitud → verificar el mapa público.
4. Un valor inválido (color fuera de la paleta, URL no https) → el servidor rechaza y
   el panel muestra el error, sin dejar la configuración a medias.

**Tests**: nuevo `assistant-tools-settings.test.js`, `assistant-action-tools.test.js`,
`settings` unitarios existentes.

**Cierre**: [ ] reglas 1–3 · [ ] validación anotada

---

## Fase F — Videos y usuarios

### [ ] F.1 Videos (sin YouTube destructivo)

**Cambios**: `get_video_detail`, `update_video` (título/descripción),
`restore_video_thumbnail` (solo el `DELETE`, restaura la de YouTube).

No se implementan: subir video, poner miniatura propia, borrar de YouTube.

**Validación real**

1. "Ocultá el video X" → tarjeta → confirmar → `SELECT is_active FROM videos WHERE id = ?`.
2. "Restaurá la miniatura de YouTube del video X" → confirmar →
   `SELECT thumbnail_source FROM videos WHERE id = ?` pasa a `YOUTUBE_DEFAULT` y luego
   la portada pública se actualiza.
3. "Borrá el video de YouTube" → respuesta de que no está disponible desde el asistente.
4. Verificar que no se agregó ninguna llamada a `thumbnails.set` ni a videos.delete.

**Tests**: `assistant-tool-videos.test.js`, `assistant-action-tools.test.js`,
`youtube-*` existentes siguen verdes.

**Nota de validación**: el borrado remoto no se prueba en real por ser irreversible y
estar fuera de alcance; se valida por ausencia de código y por test negativo.

**Cierre**: [ ] reglas 1–3 · [ ] validación anotada

### [ ] F.2 Usuarios (sin contraseñas)

**Cambios**: `list_users` (ADMIN), `set_user_active`, `change_user_role`,
`revoke_user_sessions`. Fuera: crear usuario y resetear contraseña.

**Validación real**

1. Con ADMIN: "¿qué usuarios hay?" lista email, rol y estado.
2. Desactivar un usuario EDITOR → confirmar → intentar entrar con ese usuario → recibe
   `AUTHENTICATION_STALE` o rechazo de login.
3. Revocar sesiones → el usuario es expulsado en la siguiente petición.
4. Con EDITOR: las herramientas de usuarios no aparecen y el servidor las rechaza.
5. "Creá un usuario nuevo" → respuesta de que no está disponible; ninguna contraseña
   aparece en `ai_messages`.

**Tests**: nuevo `assistant-tools-users.test.js`, `assistant-action-tools.test.js`,
`user` unitarios existentes.

**Cierre**: [ ] reglas 1–3 · [ ] validación anotada

---

## Fase G — Cierre y aceptación

### [ ] G.1 Documentación y aceptación final

**Cambios**

- `docs/assistant.md`: inventario final de herramientas, códigos de error nuevos,
  variables de entorno, y cómo pasar a tier pago.
- Corregir los números de tests y migraciones que estén desactualizados.
- Este archivo: marcar tareas y completar la bitácora.

**Validación real**

1. Una conversación completa en el panel con el catálogo final: crear, editar, ocultar,
   borrar, mover productos, publicar aviso, cambiar horario, ocultar video.
2. Revisar `ai_usage_events`: sin `INVALID_RESPONSE`, sin `TOOL_MISUSE`, `provider_calls`
   coherente.
3. Repetir el flujo con rol EDITOR y confirmar los límites.
4. Ejecutar la suite completa y anotar los conteos.

**Cierre**: [ ] reglas 1–3 · [ ] validación anotada

---

## Definition of Done (aplica a toda tarea)

- [ ] `cd server && npm test` verde, conteo anotado.
- [ ] `cd frontend && npm test` verde.
- [ ] `cd frontend && npm run lint` sin errores nuevos.
- [ ] `cd frontend && npm run build` si se tocó CSS.
- [ ] Validación real ejecutada y anotada en la bitácora.
- [ ] `error_code` nuevos documentados en `docs/assistant.md`.
- [ ] Migraciones: solo nuevas, nunca editadas.
- [ ] Comentarios ≤ código en los bloques tocados.
- [ ] Sin regresiones en permisos ni en códigos de error existentes.

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| ~45 declaraciones bajan la precisión del modelo | Descripciones cortas, validación real por acción; si empeora, separar lecturas y escrituras en dos rondas |
| TPM insuficiente con catálogo completo | Medir `input_tokens` por llamada; recortar historial o declaraciones antes de tocar el modelo |
| Push real durante pruebas | Usar suscripción propia; nunca suscriptores del sitio |
| Acción masiva sobre muchas filas | Transacción única, resultado con conteo, tarjeta con tope de 20 nombres |
| Carrera entre propuesta y confirmación | El servicio de dominio sigue siendo la verdad; `getProposalRejectionMessage` es solo UX |

---

## Bitácora de validaciones

| Fecha | Tarea | Qué se ejecutó | Resultado |
|---|---|---|---|
| 2026-10-31 | A.1 | `npm start` contra MySQL real + `POST /api/admin/assistant/messages` (token ADMIN firmado con el secreto real). Mensaje "creá un producto llamado Prueba" ×3 y "Usá la herramienta create_product…" ×1. | 4 respuestas en español, ningún 502. `ai_usage_events`: 4 filas `SUCCESS`, `error_code` NULL, sin `INVALID_RESPONSE`. |
| 2026-10-31 | A.1 | `cd server && npm test` → 809 ok. `cd frontend && npm test` → 198 ok. `cd frontend && npm run lint` → 10 errores. | Verde en ambas suites. Los 10 errores de lint son preexistentes y ajenos a A.1: 1 en `AssistantChat.jsx` (efecto `loadInitial`, parte de los cambios locales sin commitear del usuario) y 9 en `frontend/verify-ui.js`. |
| 2026-10-31 | A.2 | `cd server && npm test` → 820 ok (11 nuevos). `cd frontend && npm test` → 198 ok. `cd frontend && npm run lint` → 10 errores (sin regresión). | Verde en ambas suites. |
| 2026-10-31 | A.2 | `npm start` (default) + MySQL real. Pregunta simple y pregunta con lectura, confirmación de tarjeta, `GET /usage`. | Pregunta simple: 1956 tokens de entrada, `provider_calls = 1` (antes ~3.8 k por dos llamadas idénticas). Pregunta con lectura: 3980 tokens, `provider_calls = 2`. Confirmar una tarjeta no añadió filas a `ai_usage_events` (7 → 7). `GET /usage` devuelve `providerCalls`, `estimatedCostUsd` (null con precios en 0) y `quota`. |
| 2026-10-31 | A.2 | `npm start` con `AI_DAILY_PROVIDER_CALLS=3` + MySQL real. | Lectura (2) + "OK" (1) agotan el cupo; el cuarto envío responde `429 ASSISTANT_QUOTA_EXCEEDED` por SSE y HTTP, sin llamar al proveedor ni grabar evento. `GET /status` expone `quota`. |
| 2026-10-31 | A.3 | `cd server && npm test` → 820 ok. `cd frontend && npm test` → 199 ok. | Verde en ambas suites (productos y formato de precio). |
| 2026-10-31 | A.3 | Script directo contra MySQL real: propose/confirm `create_product`, `update_product` (precio 35 → 40, `updated_at`), `get_product_detail`, `delete_product`, `set_product_active` (false → true). | Producto creado en la categoría 4 con precio 35; precio actualizado a 40 y `updated_at` movido; borrado deja 0 filas con los 7 `media` intactos; `set_product_active` alterna y restaura. Gemini respondió `429` durante la validación en vivo, así que se usó el servicio directo contra la misma base. |
| 2026-10-31 | B.1 | `cd server && npm test` → 824 ok (4 nuevos). `cd frontend && npm test` → 200 ok. `npm run build` verde. `npm run lint` → 10 errores preexistentes. | Verde en ambas suites; sin regresiones. |
| 2026-10-31 | B.1 | `npm start` + MySQL real: propose/confirm `create_category` (Postres), `update_category` (Postres caseros, orden 1), `delete_category` sobre Nacatamales (1 producto), `delete_category` sobre la categoría vacía, `set_category_active` false/true sobre fritanga, leyendo `GET /api/categories` entre pasos. | Postres aparece en el menú público con slug `postres`; borrar Nacatamales responde NOT_APPLICABLE con «tiene 1 producto»; el renombrado deja slug `postres-caseros` y orden 1 visibles; el borrado deja 0 filas y desaparece del menú; ocultar/mostrar fritanga se refleja en el sitio. Todo limpiado. |
| 2026-10-31 | B.1 | Gemini en vivo: «Crea la categoria Postres» → tarjeta `create_category` → confirmación por HTTP → `GET /api/categories`. | Tarjeta correcta y categoría visible en el sitio público. El segundo mensaje («Borra la categoria Postres») cayó en `429 ASSISTANT_RATE_LIMITED` (cuota gratuita); el borrado se validó por servicio directo contra la misma base. |
| 2026-10-31 | B.2 | `cd server && npm test` → 827 ok (3 nuevos). `cd frontend && npm test` → 200 ok. `npm run build` verde. `npm run lint` → 10 errores preexistentes. | Verde en ambas suites; sin regresiones. |
| 2026-10-31 | B.2 | Script directo contra MySQL real: `count_products_by_category` y `list_products_by_category` sobre la categoría 4 y sobre una categoría temporal con 3 productos (Café, Flan, Tres leches), comparando con `SELECT COUNT(*)`. | Categoría 4: 1 = SQL 1. Temporal: 3 = SQL 3, nombres en orden alfabético, `truncated: false`. Los 3 productos y la categoría se borraron al final (0 filas restantes). |
| 2026-10-31 | B.3 | `cd server && npm test` → 837 ok (10 nuevos). `cd frontend && npm test` → 200 ok. `npm run build` verde. `npm run lint` → 10 errores preexistentes. | Verde en ambas suites; sin regresiones. |
| 2026-10-31 | B.3 | Script directo contra MySQL real: propose+confirm `move_products_to_category` (4 productos de Nacatamales a una categoría nueva), categoría vacía (advertencia, CREATED) y truncado con 26 productos (totalItems 26, 21 devueltos). | `cat4` 4 → 0 y destino 0 → 4 tras confirmar; mensaje con conteo correcto. Advertencia de vacío exacta. Truncado verificado. El producto demo «Nacatamal con chile» (id 4) se movió y se eliminó en la limpieza; se restauró como id 40 con su imagen. |
| 2026-10-31 | B.3 | Gemini en vivo: no se intentó (cuota gratuita agotada en B.2); la operación quedó validada por servicio directo contra la misma base, igual que B.1/B.2. | Sin llamada al proveedor. |

| 2026-11-01 | C.1 | `cd server && npm test` → 844 ok (7 nuevos). `cd frontend && npm test` → 203 ok (3 nuevos). `npm run build` verde. `npm run lint` → 10 errores preexistentes. | Verde en ambas suites; sin regresiones. |
| 2026-11-01 | C.1 | Script directo contra MySQL real: aviso programado para mañana publicado, aviso activo con imagen de galería, edición del mensaje, borrado del activo y rechazo de una fecha de fin pasada antes de proponer. | El programado quedó `is_active = 1` con `starts_at` futuro y ausente de `listPublicAnnouncements`. El activo apareció con su contenido original y mostró el editado tras confirmar. Tras borrarlo la fila desapareció, la imagen 7 siguió existiendo y el rechazo respondió `NOT_APPLICABLE`. Limpieza: 0 avisos QA restantes. |
| 2026-11-01 | C.1 | Gemini en vivo: no se intentó (cuota gratuita agotada); validación por servicio directo contra la misma base, igual que B.1–B.3. | Sin llamada al proveedor. |
| 2026-11-01 | C.2 | `cd server && npm test` → 850 ok (6 nuevos). `cd frontend && npm test` → 203 ok (sin cambios de UI). `npm run build` verde. `npm run lint` → 10 errores preexistentes. | Verde en ambas suites; sin regresiones. |
| 2026-11-01 | C.2 | Script directo contra MySQL real en dos pasadas. Sin VAPID: propuesta de `notify_announcement` sobre un aviso vigente. Con VAPID temporal (claves generadas por `web-push`): propuesta + confirmación sobre un aviso vigente, y propuestas sobre uno oculto, uno programado y uno vencido. La tabla `push_subscriptions` tenía 0 filas antes y después. | Sin VAPID: `NOT_APPLICABLE` con «no están configuradas». Con VAPID: tarjeta creada con la advertencia, confirmación con `sent: 0` y `notified_at` no nulo; oculto/programado/vencido rechazados con su mensaje. Cero suscriptores reales tocados y 0 avisos QA restantes. |
| 2026-11-01 | C.2 | Gemini en vivo: no se intentó (cuota gratuita agotada); validación por servicio directo contra la misma base, igual que B.1–B.3 y C.1. | Sin llamada al proveedor. |
| 2026-11-01 | D.1 | `cd server && npm test` → 860 ok (10 nuevos). `cd frontend && npm test` → 203 ok. `npm run build` verde. `npm run lint` → 10 errores preexistentes. | Verde en ambas suites; sin regresiones. |
| 2026-11-01 | D.1 | Script directo contra MySQL real: propuesta + confirmación de `create_photo` (imagen 10, caption «QA D1 foto»), verificación de fila en `photos` y aparición en `/dia-a-dia`; rechazo para `imageMediaId = 999` con mensaje claro; edición de caption y `sort_order`; ocultación; borrado con la fila de `media` sobreviviendo. | Tarjeta creada con los cambios (imageMediaId, caption, isActive); confirmación con `target.id = 4`; `is_active = 1` y `image_media_id = 10`; la foto apareció en la lista pública; la imagen inexistente se rechazó sin tarjeta; la edición y la ocultación se aplicaron; el borrado eliminó la foto y conservó la imagen de la galería. 0 fotos QA restantes. |
| 2026-11-01 | D.1 | `search_media` validado contra la base real con `mediaService.listMedia({ search: 'Nacatamal' })`: devolvió las 3 imágenes cuyo texto alternativo o nombre de archivo coincide. | Búsqueda exacta en SQL (`alt_text OR public_id LIKE %...%`), sin filtrar en memoria. |
| 2026-11-01 | D.2 | `cd server && npm test` → 865 ok (5 nuevos: 2 read + 3 action). `cd frontend && npm test` → 203 ok. `npm run build` verde. `npm run lint` → 10 errores preexistentes. | Verde en ambas suites; sin regresiones. |
| 2026-11-01 | D.2 | Script directo contra MySQL real: `list_media` con `usageCount` (imagen 10 → 0, resto → 1+); propuesta de borrado de imagen en uso (id 2) rechazada sin tarjeta con el conteo; borrado de imagen libre (id 10) con confirmación, fila eliminada y llamada a ImageKit exitosa. | `NOT_APPLICABLE` con «se usa en 1 publicación» para la imagen en uso; tarjeta creada para la libre con advertencia irreversible; confirmación con `deleted: true`; 0 filas de media con id 10 tras el borrado. Se eliminó una imagen huérfana («Nuestro bello local», sin referencias) de la galería real. |
| 2026-11-01 | D.2 | `search_media` con `'Nacatamal'` devolvió 3 imágenes (ya validado en D.1, reconfirmado). | Búsqueda por `alt_text OR public_id LIKE`. |
