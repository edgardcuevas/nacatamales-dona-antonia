
---

## 19. Asistente de administración (Fases 1 y 2A)

Chat dentro del panel para `ADMIN` y `EDITOR`. En Fase 2A puede consultar información real mediante herramientas de solo lectura; no puede modificar datos de negocio ni ejecutar acciones. El historial se persiste por usuario en MySQL. El proveedor por defecto es Gemini, detrás de un adaptador intercambiable.

### 19.1 Autenticación

Todas las rutas bajo `/api/admin/assistant` usan la cadena estándar del panel:

```
authenticate -> requireActiveUser -> authorizeRoles("ADMIN", "EDITOR")
```

Excepto `GET /usage`, que es solo `ADMIN`.

### 19.1.1 Consultas permitidas en Fase 2A

El servidor proporciona exclusivamente estas herramientas de lectura a ambos roles:

| Herramienta | Información devuelta |
|---|---|
| `get_current_schedule` | Horarios públicos general y de fritanga; valores sin configurar se devuelven como `null`. |
| `count_products` | Conteo total de productos, sin devolver filas ni filtros libres. |
| `list_active_announcements` | Hasta 20 avisos activos y vigentes, con indicador de truncamiento si hay más. |
| `list_videos` | Hasta 20 videos ocultos, con estado de carga/publicación; no consulta YouTube. |

Las cuatro definiciones pasan por el registro central de herramientas. El servidor filtra las declaraciones por el rol activo y vuelve a validar el nombre, el modo `read`, el rol y los argumentos en cada ejecución. Ni el navegador ni el modelo pueden aportar handlers, permisos, consultas SQL o límites. No existen herramientas de creación, edición, eliminación ni acciones externas en Fase 2A.

Cada resultado enviado al proveedor está limitado globalmente a `MAX_TOOL_RESULT_CHARS = 6000` caracteres serializados. Si el límite se supera, el resultado incluye `truncated: true` y una nota explícita. Por turno se permiten como máximo 2 ejecuciones secuenciales de herramientas y 3 llamadas al proveedor; las herramientas tienen argumentos y cantidades de filas acotados. Cada handler tiene un timeout fijo de 10 s; si se agota, la petición responde `504 ASSISTANT_TIMEOUT`.

El cliente solo envía `{ conversationId?, message }`; no envía resultados de herramientas ni historial. La ruta `DELETE /conversations/:id` elimina únicamente una conversación propia del historial del asistente y no es una herramienta disponible para el modelo.

### 19.2 Endpoints

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/admin/assistant/status` | ADMIN, EDITOR | `{ enabled, provider, model, capabilities }`. Si está desactivado: `{ enabled: false }`. |
| GET | `/admin/assistant/conversations?limit=20` | ADMIN, EDITOR | Conversaciones propias, ordenadas por actividad reciente. |
| GET | `/admin/assistant/conversations/:id/messages?limit=50` | ADMIN, EDITOR | Historial propio. Una conversación ajena responde `404`. |
| POST | `/admin/assistant/messages` | ADMIN, EDITOR | `{ conversationId?, message }`. Crea la conversación si falta `conversationId`. |
| DELETE | `/admin/assistant/conversations/:id` | ADMIN, EDITOR | Borra la conversación propia. |
| GET | `/admin/assistant/usage?days=30` | ADMIN | Agregados de uso. |

`POST /messages` responde `201` con:

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
  "prunedConversationId": null
}
```

`prunedConversationId` aparece cuando la creación de la conversación 21 eliminó la más antigua.

El cliente **no envía historial**: el servidor carga y recorta a 10 mensajes / 8 000 caracteres. No se persiste nada si el proveedor falla.

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
| `FORBIDDEN` | 403 | `GET /usage` pedido por un `EDITOR`. |

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
