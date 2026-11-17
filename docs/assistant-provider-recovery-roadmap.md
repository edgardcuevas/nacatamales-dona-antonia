# Roadmap de recuperación del proveedor principal

Plan de ejecución para hacer explícita y observable la recuperación de Gemini
después de un límite de cuota. `docs/assistant.md` conserva la especificación del
asistente y `docs/assistant-failover-plan.md` documenta el failover ya implementado;
este archivo cubre solo la coordinación de la prueba de recuperación.

## Estado actual

`assistant.provider.js` conserva el proveedor principal y el respaldo en orden,
aplica cooldown a errores reintentables, respeta el `retryDelay` de Gemini y limpia
el cooldown cuando un proveedor responde correctamente. Al vencer el cooldown,
la siguiente petición vuelve a intentar primero el proveedor principal.

Las dos piezas pendientes se completaron el 2026-11-12:

- ~~Al vencer el cooldown, varias peticiones concurrentes pueden intentar Gemini a
  la vez; no existe una prueba de recuperación *single-flight*.~~ Ahora solo una
  petición reclama la prueba y las concurrentes usan el respaldo.
- ~~`GET /api/admin/assistant/status` informa la configuración del principal y el
  respaldo, pero no el estado de cooldown o recuperación de cada proveedor.~~
  Ahora publica `providers` con `role`, `state`, `cooldownUntil` y
  `lastErrorCode`.

## Decisiones de diseño

- Gemini sigue siendo el principal configurado. Usar NVIDIA durante un failover
  no cambia `AI_PROVIDER` ni invierte permanentemente el orden.
- Una respuesta real exitosa confirma la recuperación. No se hacen llamadas de
  fondo ni peticiones sintéticas para consultar la cuota.
- El cooldown continúa respetando `retryDelay` y los valores existentes para
  timeout e indisponibilidad.
- El estado permanece en memoria, igual que los cooldowns actuales. No se agrega
  una migración ni se cambia el límite diario de llamadas.
- `ELIGIBLE` significa que el proveedor puede intentarse; no garantiza que el
  servicio remoto esté sano hasta recibir una respuesta exitosa.
- Cada respuesta corresponde a su propia petición. Nunca se comparte entre
  usuarios el resultado de una prueba de recuperación.

## Cómo ejecutar el roadmap

1. Tomar la primera tarea abierta.
2. Implementarla con pruebas enfocadas.
3. Ejecutar las validaciones descritas y anotar el resultado en la bitácora.
4. Marcar `[x]` solo cuando pasen las pruebas y los criterios de aceptación.

No se comienza la tarea siguiente si la actual deja regresiones en el failover,
streaming, cuota diaria o contrato existente de `/status`.

---

## Fase A — Prueba de recuperación coordinada

### [x] A.1 Agregar una prueba de recuperación *single-flight*

**Archivos**: `server/src/modules/assistant/assistant.provider.js`,
`server/tests/unit/assistant-provider.test.js`.

- Mantener el proveedor principal enfriado hasta la fecha determinada por el
  `retryDelay` o cooldown actual.
- Cuando Gemini vuelva a ser elegible tras un `RATE_LIMITED`, permitir que una
  sola petición en curso lo intente como prueba de recuperación.
- Mientras esa prueba está en curso, encaminar las otras peticiones al respaldo
  configurado. Si no hay respaldo elegible, conservar el error público existente;
  no disparar más intentos paralelos contra Gemini.
- Si la prueba responde correctamente, limpiar el cooldown y el último error de
  Gemini; las siguientes peticiones vuelven a intentar Gemini primero.
- Si falla con `429`, renovar su cooldown usando la misma regla vigente y hacer
  failover de esa petición a NVIDIA. Otros errores conservan su política actual.
- Aplicar el control por proveedor y por instancia del servidor; no compartir
  respuestas ni datos de una petición con otra.

**Tests**: usar reloj y proveedores falsos para verificar que antes del vencimiento
no se intenta Gemini; al vencer, una sola de varias peticiones concurrentes hace
la prueba; las demás usan NVIDIA; y tanto la recuperación exitosa como un nuevo
`429` dejan el estado y el orden correctos. Conservar cobertura del presupuesto
`providerCallLimit`, streaming y bloqueo de fragmentos parciales.

**Validación real**:

1. Ejecutar `cd server && node --test tests/unit/assistant-provider.test.js`.
2. Ejecutar `cd server && npm test`.
3. Validar una secuencia controlada `429` → NVIDIA responde → cooldown vencido →
   Gemini responde, sin agotar la cuota real de Google. Registrar que las
   peticiones concurrentes no multiplican las llamadas de recuperación.

**Cierre**: [x] tests enfocados · [x] suite completa · [x] secuencia anotada

**Resultado (2026-11-12)**: `assistant.provider.js` mantiene `recoveryChecks`
como `Set` de ids con prueba en curso. Tras un `RATE_LIMITED`, al vencer el
cooldown la primera petición reclama la prueba en el tramo síncrono previo al
primer `await`; las concurrentes la saltan y usan el respaldo. Si no hay
respaldo elegible, conservan `createNoProviderError()` sin tocar de nuevo al
proveedor limitado. El `finally` libera el reclamo tanto si la prueba responde
como si falla; un nuevo `429` renueva el cooldown y esa petición hace failover.
Tests: `assistant-provider.test.js` 40/40, con reloj y `fetchImpl` falsos. La
secuencia 429 → NVIDIA → cooldown vencido → Gemini se verificó con una prueba
concurrente: Gemini recibió 2 llamadas en total (la inicial y una sola prueba),
NVIDIA atendió la petición concurrente y la siguiente volvió a Gemini. Un
`assistant-provider.test.js` aislado y `npm test` completo (908/908) quedaron en
verde. No se forzó cuota real de Google.

---

## Fase B — Estado consultable

### [x] B.1 Exponer el estado del failover en `/status`

**Archivos**: `server/src/modules/assistant/assistant.provider.js`,
`server/src/modules/assistant/assistant.service.js`,
`server/tests/unit/assistant-admin-routes.test.js`.

- Agregar al proveedor un método de solo lectura que devuelva una instantánea del
  estado de cada proveedor.
- Extender `GET /api/admin/assistant/status` de forma aditiva, preservando los
  campos `provider`, `model`, `fallback`, `capabilities` y `quota`.
- Informar por proveedor su rol (`primary` o `fallback`), estado (`ELIGIBLE`,
  `COOLDOWN`, `RECOVERY_DUE` o `RECOVERY_CHECK`), `cooldownUntil` cuando aplique y
  el último código estable de error, si existe.
- Calcular el estado al consultar; si el cooldown terminó pero aún no se ha
  probado el proveedor, informar `RECOVERY_DUE`, no “sano”.
- No exponer claves, headers, cuerpos crudos, prompts ni mensajes de usuario.
  Mantener los permisos existentes de la ruta.

**Tests**: verificar estado inicial elegible, cooldown activo, recuperación
pendiente, prueba en curso y recuperación confirmada. Comprobar que una
configuración sin respaldo conserva su respuesta actual y que ningún secreto sale
en el JSON.

**Validación real**:

1. Iniciar el servidor y consultar `/api/admin/assistant/status` con una sesión
   autorizada; confirmar que los campos actuales siguen intactos.
2. Con el proveedor simulado en `429`, consultar `/status` y comprobar el cooldown.
3. Avanzar el reloj de prueba, hacer una petición real del asistente y consultar
   `/status` otra vez para confirmar `RECOVERY_CHECK` y después la recuperación.

**Cierre**: [x] tests de ruta · [x] contrato compatible · [x] validación anotada

**Resultado (2026-11-12)**: el proveedor expone `getProviderStates()` de solo
lectura y `getStatus()` agrega `providers` de forma aditiva. Los campos
existentes (`enabled`, `provider`, `model`, `capabilities`, `fallback`,
`quota`) no cambiaron. Estados: `ELIGIBLE`, `COOLDOWN`, `RECOVERY_DUE` y
`RECOVERY_CHECK`; `cooldownUntil` solo viaja en `COOLDOWN` y `lastErrorCode` es
el último código estable si existe. `RECOVERY_DUE` es el cooldown de cuota
vencido sin probar y `RECOVERY_CHECK` una prueba en curso; ninguno declara
salud. Tests
nuevos en `assistant-provider.test.js` (estado inicial, cooldown, recuperación
pendiente, prueba en curso y recuperación confirmada) y en
`assistant-admin-routes.test.js` (campo aditivo, contrato intacto y ausencia de
la clave). La ruta real respondió `200` por HTTP autenticado con el proveedor
simulado; sin respaldo configurado conserva su respuesta actual.

---

## Fase C — Documentación y cierre

### [x] C.1 Documentar el contrato y cerrar el flujo

**Archivos**: `docs/assistant.md`, `docs/assistant-failover-plan.md`,
`docs/frontend-integration.md` y este archivo.

- Documentar el nuevo objeto de estado de `/status`, sus valores y la diferencia
  entre “elegible para intentar” y “recuperado por una respuesta exitosa”.
- Actualizar el plan de failover para enlazar este roadmap y dejar claro que el
  cooldown no dispara sondeos en segundo plano.
- Registrar evidencia de las pruebas, el flujo HTTP validado y cualquier límite
  de la validación con proveedores reales. No forzar un `429` agotando cuota real.

**Validación**:

1. `cd server && npm test` en verde.
2. `cd frontend && npm test` en verde; `npm run lint` sin errores nuevos.
3. Si no se toca CSS, no hace falta ejecutar el build del frontend.
4. Revisar que los ejemplos y el contrato de `/status` coincidan con la respuesta
   implementada.

**Cierre**: [x] suite backend · [x] suite frontend · [x] docs revisados

**Resultado (2026-11-12)**: `docs/assistant.md` documenta el objeto `providers`,
sus cuatro valores y la diferencia entre “elegible para intentar” y “recuperado
por una respuesta exitosa”; `docs/assistant-failover-plan.md` enlaza este
roadmap y aclara que el cooldown no dispara sondeos en segundo plano; el
contrato HTTP de `docs/frontend-integration.md` también refleja el campo
aditivo. Suite
backend 908/908; suite frontend 204/204; `npm run lint` conserva los 10 errores
preexistentes (9 de `verify-ui.js` y 1 de `AssistantChat.jsx`) sin errores
nuevos. No se tocó CSS, así que no se ejecutó el build del frontend.

---

## Criterios de aceptación

1. Gemini continúa siendo el principal después de cualquier uso de NVIDIA como
   respaldo.
2. Un `429` de Gemini respeta su cooldown y NVIDIA atiende la petición si está
   disponible.
3. Tras el cooldown, como máximo una petición concurrente prueba la recuperación
   de Gemini; el resto no multiplica llamadas al proveedor limitado.
4. Una respuesta exitosa confirma la recuperación; un nuevo `429` renueva el
   cooldown y preserva el failover.
5. `/status` informa el estado sin exponer secretos y sin romper clientes que usan
   los campos actuales.
6. No hay sondeos automáticos, migraciones, cambios de códigos públicos ni
   alteraciones al presupuesto diario de llamadas.

## Bitácora

| Fecha | Tarea | Resultado |
|---|---|---|
| 2026-11-12 | A.1 Prueba de recuperación *single-flight* | `recoveryChecks` por proveedor; una sola prueba concurrente; nuevo `429` renueva cooldown; `assistant-provider.test.js` 40/40 |
| 2026-11-12 | B.1 Estado consultable en `/status` | `providers` aditivo con `ELIGIBLE`/`COOLDOWN`/`RECOVERY_DUE`/`RECOVERY_CHECK`; `assistant-admin-routes.test.js` 32/32; ruta real 200; sin secretos |
| 2026-11-12 | C.1 Documentación y cierre | `docs/assistant.md` y `docs/assistant-failover-plan.md` actualizados; backend 908/908, frontend 204/204, lint sin errores nuevos |

Validación final: no se agotó cuota real de Google ni se hicieron llamadas
sintéticas a los proveedores. La secuencia 429 → respaldo → cooldown vencido se
ejercitó con reloj y `fetchImpl` simulados, y el contrato HTTP se verificó contra
la app Express real con el proveedor mockeado y autenticación de rol `EDITOR`.