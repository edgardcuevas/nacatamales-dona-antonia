
---

## 19. Asistente de administración (Fases 1, 2A y 2B, con streaming opcional)

Chat dentro del panel para `ADMIN` y `EDITOR`. Puede consultar información real y preparar cambios acotados que requieren confirmación explícita. El historial se persiste por usuario en MySQL. El proveedor por defecto es Gemini, detrás de un adaptador intercambiable.

### 19.1 Autenticación

Todas las rutas bajo `/api/admin/assistant` usan la cadena estándar del panel:

```
authenticate -> requireActiveUser -> authorizeRoles("ADMIN", "EDITOR")
```

Excepto `GET /usage`, que es solo `ADMIN`.

### 19.1.1 Herramientas disponibles

Las herramientas de lectura están disponibles para ambos roles:

| Herramienta | Información devuelta |
|---|---|
| `get_current_schedule` | Horarios públicos general y de fritanga; valores sin configurar se devuelven como `null`. |
| `count_products` | Conteo total de productos, sin devolver filas ni filtros libres. |
| `list_active_announcements` | Hasta 20 avisos activos y vigentes, con indicador de truncamiento si hay más. |
| `list_videos` | Hasta 20 videos ocultos, con estado de carga/publicación; no consulta YouTube. |
| `search_products` | Hasta 10 productos por nombre, con id, nombre, estado activo y disponibilidad. |
| `search_announcements` | Hasta 10 avisos por título, con id, título, estado y fechas. |
| `search_videos` | Hasta 10 videos por título, con id, título, visibilidad y estado de carga. |
| `search_categories` | Hasta 10 categorías por nombre, con id, nombre y estado. |

El servidor filtra las herramientas por el rol activo y vuelve a validar nombre, modo, rol y argumentos en cada ejecución. Ni el navegador ni el modelo pueden aportar handlers, permisos, consultas SQL o límites.

Las cuatro herramientas de escritura solo preparan propuestas:

| Herramienta | Cambio que se puede proponer |
|---|---|
| `set_product_availability` | Cambiar la disponibilidad de un producto. |
| `set_announcement_active` | Publicar u ocultar un aviso. Publicarlo puede enviar una notificación push si están configuradas. |
| `set_video_active` | Publicar u ocultar un video. Solo se puede proponer publicar videos con estado `READY`; ocultar también está permitido para `DELETED`. No consulta ni modifica YouTube. |
| `set_category_active` | Activar u ocultar una categoría. Ocultarla retira sus productos del menú, pero no los borra ni los modifica. |

Para proponer un cambio, el asistente debe buscar primero el objetivo real. La respuesta del modelo no ejecuta la acción: el servidor vuelve a cargar el objetivo y guarda una propuesta pendiente con argumentos y una instantánea del estado actual. No se modifica la tabla de negocio hasta la confirmación. No hay herramientas para crear o borrar contenido, administrar usuarios o configuración, ni ejecutar acciones remotas.

### 19.1.2 Confirmación de acciones

La tarjeta muestra el resumen, objetivo, cambio, advertencias y vencimiento, con botones **Confirmar** y **Cancelar**. El token aleatorio de 32 bytes se conserva solo en la respuesta y el estado temporal del cliente; MySQL guarda su hash. La tarjeta no se recupera al recargar la página.

- Cada propuesta vence a los 10 minutos; el usuario puede mantener hasta 5 propuestas `PENDING`.
- Confirmar/cancelar exige el mismo usuario autenticado que creó la propuesta y rol `ADMIN` o `EDITOR`. Se vuelven a validar rol, objetivo, argumentos y estado capturado; si el objetivo cambió, no se ejecuta y se responde conflicto.
- La reclamación atómica garantiza una sola ejecución. Repetir una confirmación ejecutada devuelve el resultado previo; cancelar y las acciones terminales no se vuelven a ejecutar.
- El asistente no confirma ni cancela por el usuario. Las lecturas y una propuesta de escritura ocurren en respuestas separadas del proveedor.
- El límite local de Gemini admite hasta 12 declaraciones. Por turno se permiten hasta 2 ejecuciones de herramientas y 3 llamadas al proveedor; cada handler tiene un timeout fijo de 10 s.

Cada resultado enviado al proveedor está limitado globalmente a `MAX_TOOL_RESULT_CHARS = 6000` caracteres serializados. Si el límite se supera, el resultado incluye `truncated: true` y una nota explícita. Por turno se permiten como máximo 2 ejecuciones secuenciales de herramientas y 3 llamadas al proveedor; las herramientas tienen argumentos y cantidades de filas acotados. Cada handler tiene un timeout fijo de 10 s; si se agota, la petición responde `504 ASSISTANT_TIMEOUT`.

El cliente solo envía `{ conversationId?, message }`; no envía resultados de herramientas ni historial. La ruta `DELETE /conversations/:id` elimina únicamente una conversación propia del historial del asistente y no es una herramienta disponible para el modelo.

### 19.2 Endpoints

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/admin/assistant/status` | ADMIN, EDITOR | `{ enabled, provider, model, capabilities }`. Si está desactivado: `{ enabled: false }`. |
| GET | `/admin/assistant/conversations?limit=20` | ADMIN, EDITOR | Conversaciones propias, ordenadas por actividad reciente. |
| GET | `/admin/assistant/conversations/:id/messages?limit=50` | ADMIN, EDITOR | Historial propio. Una conversación ajena responde `404`. |
| POST | `/admin/assistant/messages` | ADMIN, EDITOR | `{ conversationId?, message }`. Crea la conversación si falta `conversationId`. |
| POST | `/admin/assistant/messages/stream` | ADMIN, EDITOR | Mismo cuerpo y validación que `/messages`, pero responde `text/event-stream`. |
| DELETE | `/admin/assistant/conversations/:id` | ADMIN, EDITOR | Borra la conversación propia. |
| POST | `/admin/assistant/actions/:token/confirm` | ADMIN, EDITOR | Confirma una propuesta pendiente del usuario autenticado. |
| POST | `/admin/assistant/actions/:token/cancel` | ADMIN, EDITOR | Cancela una propuesta pendiente del usuario autenticado. |
| GET | `/admin/assistant/usage?days=30` | ADMIN | Agregados de uso. |

`POST /messages` responde `201` con el mensaje habitual y, si el asistente preparó una propuesta, añade `pendingAction`:

```json
{
  "conversation": { "id": 9, "title": "¿Cómo agrego un producto?" },
  "userMessage": { "role": "user", "content": "¿Cómo agrego un producto?" },
  "reply": {
    "role": "assistant",
    "content": "Desde Productos, con Nuevo producto.",
    "provider": "gemini",
    "model": "gemini-3.6-flash",
    "inputTokens": 120,
    "outputTokens": 30
  },
  "prunedConversationId": null,
  "pendingAction": {
    "token": "<token de un solo usuario>",
    "tool": "set_product_availability",
    "summary": "Marcar «Nacatamal de pollo» como no disponible",
    "target": { "type": "product", "id": 12, "label": "Nacatamal de pollo" },
    "changes": [{ "field": "isAvailable", "from": true, "to": false }],
    "warnings": [],
    "expiresAt": "2026-10-28T12:10:00.000Z"
  }
}
```

`pendingAction` es opcional; se devuelve solo para una propuesta creada. `prunedConversationId` aparece cuando la creación de la conversación 21 eliminó la más antigua.

Confirmar o cancelar requiere enviar `{}`; no acepta argumentos de acción desde el cliente:

```http
POST /api/admin/assistant/actions/<token>/confirm
Content-Type: application/json

{}
```

La confirmación exitosa devuelve `action`, `result` y `alreadyExecuted`. Una repetición de una acción ejecutada devuelve `alreadyExecuted: true` sin volver a llamar al servicio de dominio. El token no se incluye en el historial persistido.

El cliente **no envía historial**: el servidor carga y recorta a 10 mensajes / 8 000 caracteres. No se persiste nada si el proveedor falla.

### 19.2.1 Streaming opcional

`POST /messages/stream` acepta el mismo `{ conversationId?, message }`, pasa por la misma autenticación, validación, rate limit y persistencia, y responde `200` con `Content-Type: text/event-stream`. Solo se transmite la **respuesta final**; los turnos intermedios del modelo y las llamadas a herramientas no se envían como fragmentos. Una propuesta de cambio tampoco se transmite: aparece únicamente en el evento `complete`.

```text
event: chunk
data: {"text":"El horario "}

event: chunk
data: {"text":"es de 8 a 17."}

event: complete
data: {"success":true,"message":"Assistant message answered successfully","data":{ ...igual que POST /messages... }}
```

- `chunk` contiene solo texto visible del asistente. La concatenación de todos los `chunk` es exactamente `complete.data.reply.content`.
- `complete.data` tiene la misma forma que la respuesta de `POST /messages`, incluido `pendingAction` cuando corresponde.
- Si el proveedor falla después de abrir la conexión, el servidor emite un último `event: error` con el sobre habitual (`{ success: false, error: { code, message } }`) y cierra. No se persiste el turno.
- Los errores anteriores a las cabeceras (cuerpo inválido, conversación ajena, límite de tasa) siguen siendo respuestas JSON normales con su código HTTP.
- `GET /status` expone `capabilities.supportsStreaming`. Si es `false`, el cliente debe usar `POST /messages`.
- El cliente usa `api.streamPost('/admin/assistant/messages/stream', body, { onTextChunk })`, con la ruta **sin** el prefijo `/api`. Igual que el resto del cliente, refresca el access token y reintenta una vez ante `401`. Una conexión cortada o un flujo que no termina en `complete` se rechaza con el código local `ASSISTANT_STREAM_INTERRUPTED` (sin estado HTTP propio); la UI descarta el texto parcial y muestra el error.
- Para no exponer turnos intermedios, el servidor hace una llamada final en modo streaming después de elegir las herramientas. Un turno sin herramientas puede consumir dos llamadas al proveedor; el uso agregado se registra una sola vez por turno.

### 19.3 Errores

| Código | HTTP | Cuándo |
|---|---|---|
| `ASSISTANT_DISABLED` | 503 | No hay `GEMINI_API_KEY` configurada. |
| `INVALID_ASSISTANT_INPUT` | 400 | Cuerpo inválido, mensaje vacío o id de conversación inválido. |
| `ASSISTANT_MESSAGE_TOO_LONG` | 400 | El mensaje supera 2 000 caracteres. |
| `UNEXPECTED_ASSISTANT_FIELDS` | 400 | Campos extra en el cuerpo. |
| `ASSISTANT_CONVERSATION_NOT_FOUND` | 404 | La conversación no existe o no es del usuario. |
| `ASSISTANT_CONVERSATION_FULL` | 409 | La conversación ya tiene 100 mensajes. |
| `RATE_LIMIT_EXCEEDED` | 429 | Más de 10 consultas por minuto o 100 por día para ese usuario. |
| `ASSISTANT_TIMEOUT` | 504 | El proveedor no respondió a tiempo o una herramienta superó su límite de 10 s. |
| `ASSISTANT_PROVIDER_ERROR` | 502 | Error, bloqueo o cuota del proveedor. |
| `ASSISTANT_ACTION_NOT_FOUND` | 404 | Token inválido, inexistente o perteneciente a otra persona. |
| `ASSISTANT_ACTION_EXPIRED` | 410 | La propuesta venció. |
| `ASSISTANT_ACTION_NOT_CONFIRMABLE` | 409 | La propuesta fue cancelada o terminó con un error. |
| `ASSISTANT_ACTION_CONFLICT` | 409 | El objetivo cambió desde que se preparó la propuesta. |
| `ASSISTANT_ACTION_IN_PROGRESS` | 409 | Otra confirmación ya reclamó la propuesta. |
| `ASSISTANT_ACTION_FAILED` | 409 | El servicio de dominio rechazó el cambio; no se exponen detalles internos. |
| `ASSISTANT_ACTION_UNKNOWN` | 409 | La ejecución se interrumpió y su resultado es incierto; se debe verificar el estado antes de reintentar. |
| `ASSISTANT_ACTION_STATE_ERROR` | 500 | El estado interno de la propuesta no se pudo actualizar. |
| `FORBIDDEN` | 403 | Usuario sin rol permitido o `GET /usage` pedido por un `EDITOR`. |

Los `event: error` del streaming reutilizan estos códigos. `ASSISTANT_STREAM_INTERRUPTED` no lo emite el servidor: es un código local del cliente (`api.streamPost`) cuando la conexión se corta o el flujo termina sin `complete`.

### 19.4 Retención y métricas

- 20 conversaciones por usuario: al crear la 21 se elimina la más antigua por `updated_at` (cascada de mensajes).
- 100 mensajes por conversación: el mensaje 101 responde `409` sin llamar al proveedor.
- Un evento en `ai_usage_events` por cada intento que llega al proveedor, incluidos fallos. Borrar una conversación deja el evento con `conversation_id = NULL`.
- `GET /usage?days=30` devuelve `totals` (`queries`, `failed`, `inputTokens`, `outputTokens`), `byModel` y `byDay`.

### 19.5 Desactivado

Sin `GEMINI_API_KEY` la API arranca normal y `GET /status` responde `{ enabled: false }`. La UI muestra el asistente desactivado. No se requieren cambios en el frontend para ocultarlo.

### 19.6 Variables de entorno

```bash
AI_PROVIDER=gemini
AI_MODEL=gemini-3.5-flash
GEMINI_API_KEY=
AI_MAX_OUTPUT_TOKENS=1024
AI_TIMEOUT_MS=30000
```

El modelo por defecto es `gemini-3.5-flash`: `gemini-2.5-flash` ya no está disponible para cuentas nuevas. Se puede cambiar con `AI_MODEL` sin tocar código. Rotar la clave no invalida nada; rotar el modelo solo afecta respuestas nuevas.
