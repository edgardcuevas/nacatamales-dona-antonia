
---

## 19. Asistente de administración (Fase 1)

Chat dentro del panel para `ADMIN` y `EDITOR`. En esta versión **no consulta datos en vivo ni modifica nada**: solo explica cómo usar el panel. El historial se persiste por usuario en MySQL. El proveedor por defecto es Gemini (`gemini-3.5-flash`), detrás de un adaptador intercambiable.

### 19.1 Autenticación

Todas las rutas bajo `/api/admin/assistant` usan la cadena estándar del panel:

```
authenticate -> requireActiveUser -> authorizeRoles("ADMIN", "EDITOR")
```

Excepto `GET /usage`, que es solo `ADMIN`.

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
| `ASSISTANT_TIMEOUT` | 504 | El proveedor no respondió a tiempo. |
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
