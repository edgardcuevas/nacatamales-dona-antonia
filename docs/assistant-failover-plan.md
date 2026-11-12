# Plan de mejora del failover entre Gemini y NVIDIA

Plan de trabajo derivado de una validación en vivo del respaldo del asistente
(2026-11-02). `docs/assistant.md` sigue siendo la especificación funcional y
`docs/assistant-roadmap.md` el orden general del asistente; este archivo cubre
solo el failover y se puede cerrar por completo.

## Veredicto de la validación

El failover **funciona**: al agotarse el cupo por minuto de Gemini la respuesta
la entrega NVIDIA sin error visible, y pasado el minuto se reintenta Google
primero. Lo que sigue son los puntos donde se pierde una respuesta o donde el
turno no continúa.

Evidencia medida con las claves reales del `.env`:

| Prueba | Resultado |
|---|---|
| Config resuelta | `gemini` / `gemini-3.5-flash` + `nvidia/nemotron-3.5-lightning-30b-a3b`, tope diario 180 |
| Ráfaga hasta el 429 real | A la 7.ª consulta Gemini limitó y respondió NVIDIA (`providers: ["gemini","nvidia"]`, `providerCalls: 2`) |
| Consulta inmediata siguiente | Directo a NVIDIA, sin gastar intento en Google |
| Espera de 65 s | Vuelve a intentar Google primero, y si sigue limitado repite NVIDIA |
| Payload real (prompt 8.451 caracteres, 51 herramientas) | NVIDIA respondió en 2,4 s, `finish_reason: stop` |
| Streaming del panel | 1 chunk al final, concatenación exacta, sin fragmentos duplicados |
| Ambos proveedores caídos | `502` instantáneo durante 60 s (circuito abierto sin sondeo) |
| `cd server && npm test` | 885/885 en verde |

## Decisiones cerradas

| | Decisión |
|---|---|
| **D1 Modelo** | Benchmark de 4 candidatos sin razonamiento contra el actual, con el payload real. Gana el primero con **0 % de respuestas vacías, p95 < 8 s y `tool_calls` válidos en 3/3**. Si ninguno cumple se queda `nvidia/nemotron-3.5-lightning-30b-a3b` con tope de salida 2048. |
| **D2 Presupuesto** | `MAX_REASONING_ROUNDS = 3` + `MAX_PROVIDER_ATTEMPTS_PER_MESSAGE = 4`: el failover deja de comerse una ronda. |
| **D3 Cooldown** | Por código de error: `RATE_LIMITED → 60 s`, `TIMEOUT`/`UNAVAILABLE → 15 s`, con sondeo si el más próximo vence en menos de 5 s. |
| **D4 Config** | `NVIDIA_MODEL` sin `NVIDIA_API_KEY` aborta el arranque; `AI_PROVIDER` permite elegir Gemini o NVIDIA como principal y el otro queda de respaldo si sus credenciales existen. |

La API de NVIDIA es la **gratuita**: todo benchmark es secuencial, con 1 s entre
llamadas y se aborta si aparece un stall (se observó el endpoint de chat sin
responder 60 s mientras `/v1/models` contestaba en 285 ms).

---

## Fase 1 — No perder la respuesta

### [x] 1.1 Distinguir el truncado del razonamiento

Hoy `finish_reason: "length"` con `content` vacío se convierte en
`INVALID_RESPONSE` y termina en un `502 ASSISTANT_PROVIDER_ERROR` genérico, que
no explica nada y no reintenta.

Archivos: `src/modules/assistant/assistant.provider-error.js`,
`src/modules/assistant/providers/nvidia.provider.js`,
`src/modules/assistant/assistant.service.js`.

- Nuevo código de proveedor `OUTPUT_TRUNCATED` en
  `ASSISTANT_PROVIDER_ERROR_CODES`. Los códigos existentes no cambian.
- En `normalizeResponse`: `finish_reason === "length"` y `content` vacío →
  `OUTPUT_TRUNCATED`. Si hay texto parcial, se devuelve el texto y se registra
  `error_code = "OUTPUT_TRUNCATED"` en `ai_usage_events`.
- `assistant.service.js` mapea `OUTPUT_TRUNCATED` a `502 ASSISTANT_RESPONSE_TRUNCATED`.
- **Sin migración:** `ai_usage_events.error_code` es `VARCHAR(64)`; no se toca el
  ENUM de `status` ni se agrega columna a `ai_messages`.

Tests: `assistant-provider.test.js` — respuesta vacía + `length` da
`OUTPUT_TRUNCATED`; texto parcial + `length` se conserva; `reasoning_content`
nunca se usa como texto de respuesta.

Validación real: forzar el fallback con `NVIDIA_MAX_OUTPUT_TOKENS=128` y comprobar
que el proveedor devuelve `OUTPUT_TRUNCATED` y la API lo mapea a
`ASSISTANT_RESPONSE_TRUNCATED` en lugar de un 502 mudo.

**Resultado (2026-11-02):** aplicado. `OUTPUT_TRUNCATED` existe como código de
proveedor; `normalizeResponse` lo distingue de `INVALID_RESPONSE` y devuelve
`truncated: true` cuando hay texto parcial. `assistant.service.js` lo mapea a
`502 ASSISTANT_RESPONSE_TRUNCATED`, registra `error_code = "OUTPUT_TRUNCATED"` en
el evento de uso y agrega `reply.truncated: true` solo cuando aplica (el resto
del contrato de `reply` no cambió). Validado en vivo contra NVIDIA con el
presupuesto en 128: dio `OUTPUT_TRUNCATED`, `retryable: false`, sin failover.

### [x] 1.2 Presupuesto de salida y timeout propios de NVIDIA

El razonamiento de `nemotron-3.5-lightning` consume `max_tokens`: con 1024 y un
prompt trivial gastó entre 175 y 330 tokens pensando. Un prompt complejo puede
agotar el presupuesto y dejar la respuesta vacía.

Archivos: `src/config/env.js`, `src/modules/assistant/assistant.provider.js`,
`server/.env.example`.

- `NVIDIA_MAX_OUTPUT_TOKENS` (128–4096, default `max(AI_MAX_OUTPUT_TOKENS, 2048)`).
- `NVIDIA_TIMEOUT_MS` (5000–60000, default `AI_TIMEOUT_MS`, o sea 30 s: sin
  cambios hasta que se ajuste).
- Ambos se pasan solo al adaptador NVIDIA; Gemini conserva sus valores.

Tests: `assistant-provider.test.js` — la configuración expone
`nvidia.maxOutputTokens` y `nvidia.timeoutMs` sin filtrar la clave; el adaptador
NVIDIA recibe el tope propio y Gemini el general.

**Resultado (2026-11-02):** aplicado. Con `AI_MAX_OUTPUT_TOKENS=1024` la
configuración resuelve `nvidia.maxOutputTokens = 2048` y
`nvidia.timeoutMs = 30000`; con `NVIDIA_MAX_OUTPUT_TOKENS` / `NVIDIA_TIMEOUT_MS`
explícitos se respetan. Validado en vivo: el fallback real respondió con 2048
sin truncarse, y con 128 dio `OUTPUT_TRUNCATED` como prueba del camino de error.

### [x] 1.3 Benchmark y elección del modelo

Sin cambios de código: es una medición que decide D1.

Candidatos, todos de la lista de la cuenta y sin razonamiento:
`nvidia/nemotron-3.5-bolt-e4b`, `nvidia/nemotron-nano-3-30b-a3b`,
`openai/gpt-oss-20b`, `z-ai/glm-5.3-flash`. Línea base:
`nvidia/nemotron-3.5-lightning-30b-a3b`.

Matriz por modelo, 3 corridas cada uno, `max_tokens 2048`, `temperature 0.2`:

1. texto simple;
2. payload real (`buildSystemInstruction` + las 51 declaraciones de ADMIN) sin
   pedir herramienta;
3. pregunta que exige herramienta → nombre y argumentos válidos.

Se registran status, latencia, `finish_reason`, `reasoning_tokens` y si el
contenido vino vacío. El ganador se aplica a `NVIDIA_MODEL` y el snippet del
benchmark queda documentado acá, no como script suelto en `src/`.

**Resultado (2026-11-02).** Corrido en vivo, secuencial, 3 corridas por escenario
y 1,5 s entre llamadas. El catálogo de `/v1/models` lista 85 modelos, pero la
cuenta gratuita solo sirve unos pocos: la mayoría de los instruct conocidos
responde `404` aunque aparezcan en la lista.

| Modelo | (a) simple | (b) payload real | (c) herramienta | p95 aprox. | Veredicto |
|---|---|---|---|---|---|
| `nvidia/nemotron-3.5-bolt-e4b` | 3/3, 0,4–0,7 s | 3/3, 0,9–1,2 s | **0/3** (responde `count_products` como texto, no emite `tool_calls`) | 1,2 s | Descartado: no usa herramientas |
| `nvidia/nemotron-nano-3-30b-a3b` | 404 | 404 | 404 | — | No disponible en la cuenta |
| `openai/gpt-oss-20b` | timeout 40 s ×3 | timeout ×3 | timeout ×3 | — | Descartado: no responde |
| `z-ai/glm-5.3-flash` | timeout 40 s ×3 | timeout ×3 | timeout ×3 | — | Descartado: no responde |
| `minimaxai/minimax-m3.1-flash` | 3/3, 5,5–11,2 s | 3/3, 5,7–7,3 s | 2/3 (1 respuesta `429`), `tool_calls` válidos | ~11 s | Falla el corte de p95 |
| `stepfun-ai/step-5-preview` | 2 timeouts de 30 s | 2 s / 15,4 s / 2,7 s | 3/3, 0,8–0,9 s | ~30 s | Falla el corte de p95 |
| `nvidia/nemotron-3.5-lightning-30b-a3b` (base) | 3/3, 3,1–5,7 s | 3/3, 2,9–17,4 s | **3/3**, `count_products` + `{}` | ~17 s | 0 vacías y tools 3/3, pero un outlier de 17,4 s |

Ningún candidato cumple a la vez 0 % de respuestas vacías, p95 < 8 s y
`tool_calls` válidos en 3/3. Aplicando D1 se mantiene
`nvidia/nemotron-3.5-lightning-30b-a3b` con `NVIDIA_MAX_OUTPUT_TOKENS=2048`, que
es el default de 1.2. La congestión del endpoint gratuito (unos 2 s hasta 17 s
para el mismo prompt) es del proveedor, no del adaptador.

Snippet mínimo para repetir la medición (siempre secuencial y con pausa):

```js
const URL = "https://integrate.api.nvidia.com/v1/chat/completions";
for (const model of modelos) {
  for (const escenario of escenarios) {
    for (let run = 1; run <= 3; run += 1) {
      const res = await fetch(URL, {
        method: "POST",
        headers: { authorization: `Bearer ${clave}`, "content-type": "application/json" },
        body: JSON.stringify({ model, messages, max_tokens: 2048, temperature: 0.2, stream: false }),
        signal: AbortSignal.timeout(30000),
      });
      // registrar status, ms, finish_reason, content vacío, tool_calls y args
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}
```

---

## Fase 2 — Que la tarea continúe

### [x] 2.1 Separar rondas de intentos reales

Reconstruido: si un turno ya gastó 2 llamadas, `providerCallLimit` queda en 1 y,
si Gemini devuelve 429 en ese momento, **no se intenta NVIDIA**: el usuario
recibe `429 ASSISTANT_RATE_LIMITED` con el respaldo libre.

Archivos: `src/modules/assistant/assistant.tool-orchestrator.js`,
`src/modules/assistant/assistant.constants.js`.

- `MAX_PROVIDER_CALLS_PER_MESSAGE = 3` se reemplaza por `MAX_REASONING_ROUNDS = 3`
  y `MAX_PROVIDER_ATTEMPTS_PER_MESSAGE = 4`.
- El bucle avanza por rondas; `providerCallLimit` que recibe el adaptador es
  `MAX_PROVIDER_ATTEMPTS_PER_MESSAGE - providerAttempts`.
- `canCorrect` y el corte por `TOOL_LIMIT` se evalúan contra intentos, no contra
  rondas. La cuota diaria sigue contando cada intento real.

Tests: `assistant-tool-orchestrator.test.js` — un 429 en la segunda ronda con un
intento restante llega a NVIDIA; nunca se superan 4 intentos por mensaje.

Validación real: turno con herramienta que cruce el límite de Gemini a mitad y
termine igual.

**Resultado (2026-11-02):** aplicado. El orquestador cuenta `reasoningRounds`
(techo 3) y `providerAttempts` (techo 4) por separado; `providerCallLimit` que
recibe el adaptador es `4 - providerAttempts` y `canCorrect` / el corte por
`TOOL_LIMIT` se evalúan contra intentos. Tests nuevos en
`assistant-tool-orchestrator.test.js`: (a) un turno donde la ronda 1 usa 1
intento de Gemini, la ronda 2 gasta 2 (Gemini 429 + NVIDIA) y la ronda 3 usa el
cuarto intento termina respondiendo, sin quedarse sin rondas; (b) un turno con
failover en cada ronda se corta en 4 intentos (1 de Gemini + 3 de NVIDIA) y nunca
pide un quinto. Validado en vivo con NVIDIA real y
Gemini simulado: la herramienta corrió en la ronda 1 con Gemini, Gemini dio 429
en la ronda 2, NVIDIA respondió con el resultado (`providerCalls: 3`,
`providers: [gemini, nvidia]`, una ejecución, 2,8 s).

### [x] 2.2 Cooldown proporcional y sondeo

Reconstruido: un fallo doble deja el asistente devolviendo `502` en 0 ms durante
60 s aunque ambos proveedores se recuperen en 2 s.

Archivos: `src/modules/assistant/assistant.provider.js`,
`src/modules/assistant/assistant.constants.js`.

- `PROVIDER_COOLDOWN_BY_CODE = { RATE_LIMITED: 60_000, TIMEOUT: 15_000, UNAVAILABLE: 15_000 }`.
  `retryAfterMs` del proveedor sigue teniendo prioridad cuando existe.
- `PROVIDER_PROBE_WINDOW_MS = 5_000`: si todos están en cooldown se permite **un**
  sondeo al que vence antes, y solo si su último error no fue `RATE_LIMITED`
  (sondear un cupo agotado solo quema cuota).

Tests: `assistant-provider.test.js` — un timeout enfría 15 s y un 429 enfría 60 s;
una cadena entera enfriando sondea solo al proveedor sin límite de cupo.

**Resultado (2026-11-02):** aplicado. `PROVIDER_COOLDOWN_BY_CODE` y
`PROVIDER_PROBE_WINDOW_MS` viven en `assistant.constants.js`; el adaptador
comparte un único `attemptCandidates` para la cadena normal y para el sondeo, así
que el resultado y la forma del error son idénticos. El sondeo elige, entre los
proveedores cuyo último error no fue `RATE_LIMITED`, el que vence antes, y queda
bloqueado 5 s después de cada intento. Tests nuevos: timeout enfria 15 s
(reintento a los 15,001 s, no a los 14,999 s); 429 sin `retry-after` enfria 60 s;
cadena entera enfriando sondea solo a NVIDIA, no repite dentro de la ventana y
descubre la recuperación pasada la ventana. Validado en vivo con la clave real:
Gemini 429 + NVIDIA 500 dieron `502 UNAVAILABLE` en 23 ms con 2 intentos; la
petición siguiente sondeó solo NVIDIA (1 intento, sin tocar a Gemini); a los 5,1 s
el sondeo encontró NVIDIA sano y respondió con 1 intento.

---

## Fase 3 — Visibilidad

### [x] 3.1 Una línea de log por cambio de proveedor

`src/modules/assistant/assistant.provider.js`. Formato sanitizado, mismo criterio
que `error.middleware.js`: sin cuerpos, headers ni claves.

```
Assistant provider failover: from=gemini to=nvidia code=RATE_LIMITED
```

Hoy el cambio es invisible: `/usage` guarda `gemini+nvidia` pero no hay UI.

Test: se emite exactamente una línea por failover y nunca contiene la clave.

**Resultado (2026-11-02):** aplicado. `attemptCandidates` emite una única línea
`Assistant provider failover: from=... to=... code=...` en el momento en que un
proveedor falla y hay un siguiente candidato; el sondeo de un único proveedor no
emite ninguna. La línea solo contiene ids de proveedor y el código estable, sin
cuerpos, headers ni claves. Tests en `assistant-provider.test.js`: failover emite
exactamente una línea (`RATE_LIMITED`) y no contiene las claves de prueba.

### [x] 3.2 `/status` informa el respaldo

`src/modules/assistant/assistant.service.js` (`getStatus`) y
`frontend/src/components/Admin/Assistant/AssistantChat.jsx` /
`AssistantDrawer.jsx`.

- Agregar `fallback: { enabled, model }` (nunca la clave).
- Línea discreta en el panel: "Respaldo: NVIDIA · `<modelo>`" o
  "Respaldo: no configurado".
- Actualizar los mocks de `api` en `AssistantChat.test.jsx` y
  `AssistantDrawer.test.jsx`.

**Resultado (2026-11-02):** aplicado. `createFailoverProvider` expone
`fallback: { enabled, model }` (sin la clave) en el objeto congelado del
proveedor; `getStatus` lo propaga normalizado (sin respaldo,
`{ enabled: false, model: null }`). El panel muestra "Respaldo: NVIDIA ·
<modelo>" o "Respaldo: no configurado" en el encabezado del chat.
`STATUS_ENABLED` de los tests se extendió con `fallback`. Tests:
`assistant-admin-routes.test.js` verifica el `fallback` en `/status` y
`assistant-provider.test.js` verifica la exposición con y sin respaldo.

Desde 2026-11-11, `fallback` también informa `provider`; `AI_PROVIDER` permite
seleccionar cualquiera de los dos como principal y el panel nombra al respaldo
configurado.

### [x] 3.3 Copy de errores

`frontend/src/components/Admin/Assistant/AssistantChat.jsx`.

- `ASSISTANT_RATE_LIMITED` deja de culpar solo a Google (hoy significa "ambos
  proveedores limitados" o "el presupuesto bloqueó el respaldo"): "El asistente
  está saturado en este momento. Probá de nuevo en un minuto."
- Nuevo `ASSISTANT_RESPONSE_TRUNCATED`: "La respuesta quedó cortada. Probá
  pidiéndolo más corto."

**Resultado (2026-11-02):** aplicado en `AssistantChat.jsx`: el código
`ASSISTANT_RATE_LIMITED` ya no menciona a Google y se agregó
`ASSISTANT_RESPONSE_TRUNCATED` con el texto pedido. `STATUS_ENABLED` de los
tests se actualizó con `fallback`.

---

## Fase 4 — Higiene

### [x] 4.1 Trampa de configuración (D4)

`src/config/env.js`. Si `NVIDIA_MODEL` está definido sin `NVIDIA_API_KEY`, hoy el
respaldo queda apagado en silencio. Pasa a ser un error de arranque que nombre la
variable faltante, simétrico al que ya existe para el caso inverso.

**Resultado (2026-11-11):** aplicado. Definir `NVIDIA_MODEL` sin
`NVIDIA_API_KEY` ahora aborta la carga de configuración con un error que nombra
la variable faltante. `assistant-provider.test.js` verifica el arranque en un
proceso aislado, junto con el caso inverso ya cubierto.

### [x] 4.2 Respetar el `retryDelay` del cuerpo del 429

`src/modules/assistant/providers/gemini.provider.js`. Google no manda
`retry-after` (verificado), pero sí `error.details[].retryDelay`. Leerlo evita
sondear cuando pide 5 minutos y permite volver antes cuando pide 20 s. Requiere
leer el cuerpo en el camino de error, que hoy no se lee.

**Resultado (2026-11-11):** aplicado. En respuestas 429 Gemini se lee
`error.details[].retryDelay` en formato de duración protobuf (por ejemplo,
`20s`); si el header `retry-after` es válido conserva prioridad, y un cuerpo
inválido mantiene el cooldown predeterminado. Tests cubren 20 s, 300 s, dato
inválido, prioridad del header y el instante exacto en que el proveedor vuelve
a ser elegible. `assistant-provider.test.js` 33/33; `npm test` 900/900.

### [x] 4.3 Test del streaming con failover

`tests/unit/assistant-provider.test.js`. "Un chunk se entrega recién cuando el
proveedor responde completo": hoy esa propiedad está validada solo a mano.

**Resultado (2026-11-11):** aplicado. La nueva prueba hace que Gemini emita
texto parcial y luego falle la conexión; mientras NVIDIA todavía no completó la
respuesta, no se entrega ningún chunk. Al terminar el respaldo, solo se emite
su respuesta completa y no se duplica texto de Gemini. `assistant-provider.test.js`
34/34; `npm test` 901/901.

---

## Criterios de cierre

1. `cd server && npm test` en verde con el conteo igual o mayor a 898.
2. `cd frontend && npm test` (34) y `npm run lint` sin errores nuevos.
3. 20 turnos seguidos con Google limitado: 0 respuestas `502` o `429`.
4. Tras un fallo doble simulado, el asistente vuelve a responder en 15 s o menos.
5. 30 preguntas variadas: ninguna respuesta vacía sin explicación.
6. La ráfaga de ~7 consultas/min y la espera de 65 s se repiten con el modelo
   elegido y se anota el resultado.
7. `docs/assistant.md`, `docs/frontend-integration.md` y `.env.example` al día.
   Los conteos de tests y migraciones de la documentación ya están desfasados:
   corregirlos contra `npm test` y el directorio de migraciones.

## Fuera de alcance

- No se agregan reintentos ciegos ni fan-out entre proveedores: quema la cuota
  gratuita y multiplica el costo por ventana.
- No se emite texto parcial antes de cerrar el turno: es lo que evita fragmentos
  duplicados al cambiar de proveedor.
- No se mueve el cooldown ni la cuota a MySQL: con una instancia alcanza y el
  failover no debe depender de la base.
- No se agrega un tercer proveedor ni una segunda clave de NVIDIA; si el
  benchmark no alcanza, se ajusta modelo y presupuesto, no la arquitectura.

## Bitácora

Validación bidireccional del 2026-11-11: con las credenciales locales, el turno
real del orquestador ejecutó `count_products` usando Gemini como principal y
luego NVIDIA como principal. Además, por la API autenticada, `/status` y
`POST /messages` respondieron `200`/`201` en cada configuración. Con un 429
simulado en el primario, el respaldo real completó el mensaje (`provider`:
`gemini+nvidia` y `nvidia+gemini`). No se agotó cuota real para forzar el 429.
MySQL y `/api/health/ready` respondieron correctamente; no se hicieron
escrituras de negocio.

| Fecha | Tarea | Resultado |
|---|---|---|
| 2026-11-02 | Validación inicial del failover | Funciona en vivo; se abren 1.1–4.3 |
| 2026-11-02 | 1.3 Benchmark de modelos | Ninguno cumple D1; se mantiene `nemotron-3.5-lightning` con tope 2048 |
| 2026-11-02 | 1.1 Truncado + 1.2 presupuesto propio | Aplicado y validado en vivo; `npm test` 891/891 |
| 2026-11-02 | 2.1 Rondas vs intentos | Aplicado; turno con herramienta cruza el 429 de Gemini y termina en NVIDIA |
| 2026-11-02 | 2.2 Cooldown + sondeo | Aplicado y validado en vivo; recuperación detectada a los 5,1 s; `npm test` 896/896 |
| 2026-11-02 | 3.1 Log de failover + 3.2 `/status` + 3.3 copy | Aplicado; línea saneada y `fallback` en `/status`; `npm test` 898/898, frontend 203/203 |
| 2026-11-11 | 4.1 Trampa de configuración | Aplicado; proceso aislado confirma error de arranque; `assistant-provider.test.js` 31/31 y `npm test` 898/898 |
| 2026-11-11 | 4.2 `retryDelay` de Gemini | Aplicado; cooldown verificado con 20 s y 300 s, mantiene prioridad del header; `assistant-provider.test.js` 33/33 y `npm test` 900/900 |
| 2026-11-11 | 4.3 Streaming con failover | Aplicado; texto parcial descartado y respuesta de NVIDIA completa antes de emitir; `assistant-provider.test.js` 34/34, `npm test` 901/901 |
| 2026-11-11 | Selección y failover bidireccional | Turnos reales y API autenticada con cada proveedor principal; 429 simulado en cada primario y respaldo real completando el mensaje. MySQL y readiness OK; backend 903/903, frontend 204/204 y build OK. Lint mantiene 10 errores preexistentes. |
