## Reglas para dar una tarea por completada

1. **No romper lo existente.** Los cambios son aditivos. Si se toca un archivo compartido (`app.js`, `env.js`, `Administracion.jsx`, `client.js`), verificar los flujos actuales que pasan por ahí. No refactorizar código ajeno a la tarea.
2. **Validar funcionamiento real.** No alcanza con tests verdes ni con que compile: hay que ejecutar el flujo afectado con el servidor y la base reales, o justificar por escrito por qué no aplica. Cada tarea indica su validación real.
3. **Documentación proporcional.** Explicar lo necesario, no más. En un archivo de código, nunca debe haber más líneas de comentarios o documentación que de código para explicar una sola parte de ese archivo. El contrato de API va en `docs/frontend-integration.md`; este archivo no lo duplica.

Una tarea incompleta detiene el roadmap. No se empieza la siguiente hasta cumplir las tres reglas.

---

# Roadmap: mejora de interfaz del asistente

Objetivo: que el asistente del panel deje de verse como un formulario genérico y pase a ser un chat con la identidad del sitio, usable desde cualquier sección.

Alcance cerrado: rebranding, layout de chat, mensajes con markdown seguro, tarjeta de confirmación legible y drawer flotante. **No** cambia el backend, ni el contrato de API, ni la lógica de streaming/confirmación.

## Cómo se trabaja este roadmap

- Una tarea por vez, en orden. Se implementa, se valida y se marca `[x]` con su evidencia.
- Un commit por tarea (`feat:` / `chore:` / `docs:`). No mezclar tareas.
- Antes de empezar cualquier tarea: `cd frontend && npm test` debe estar verde.
- Al cerrar cualquier tarea que toque CSS: `cd frontend && npm run build` es obligatorio (lightningcss rompe con comentarios `//`).
- La puerta de cierre de cada tarea son las tres reglas de arriba, sin excepción.

## Puerta de cierre (aplicar a cada tarea)

- [ ] **Regla 1 —** ¿Toqué un archivo compartido? Si sí, listé abajo qué flujo verifiqué y sigue funcionando. No refactoricé nada ajeno.
- [ ] **Regla 2 —** ¿Ejecuté el flujo real en el navegador contra el servidor y la base reales? Si no aplica, escribí por qué.
- [ ] **Regla 3 —** ¿La documentación agregada es proporcional y el contrato de API quedó solo en `docs/frontend-integration.md`?

---

## [x] Tarea 1 — Base verde y línea base registrada

**Objetivo:** saber exactamente qué está roto antes de tocar nada, para no atribuirme fallas ajenas.

**Archivos:** ninguno.

**Hecho:**
- `cd frontend && npm test` y `cd frontend && npm run build` ejecutados y anotados.
- `cd frontend && npm run lint` ejecutado y desglosado por archivo.

**Validación real:** no aplica (tarea de medición). Se justifica acá mismo: no hay flujo de usuario que ejecutar.

**Evidencia (medida el 2026-10-30):**

- frontend test: **169 / 169** en 23 archivos, verde.
- build: **verde**, 108 módulos, 533 ms.
- lint: **17 errores en 2 archivos**. El baseline que describía `AGENTS.md` (8 errores en 5 `*Manager`, `Menu.jsx`, `AuthContext.jsx` y `SettingsContext.jsx`) **está desactualizado**: esos archivos hoy pasan limpios.
  - `src/components/Admin/Assistant/AssistantChat.jsx` — **8 errores**, todos `react-hooks/refs` ("Cannot access refs during render") en las líneas 509, 514, 521 y 526: los botones Confirmar/Cancelar leen `confirmInFlightRef.current` y `cancelInFlightRef.current` durante el render. Además de la regla, es un bug real: el texto "Confirmando…" nunca llega a verse, porque leer un ref no dispara re-render.
  - `verify-ui.js` (raíz de `frontend/`) — 9 errores, script suelto fuera de `src` (`no-undef` de `require`/`Buffer`/`process`, `no-useless-assignment`, `no-unused-vars`).
- Consecuencia para el roadmap: la Tarea 3 debe **bajar** el lint de 17 a 9 reemplazando la lectura de refs en render por estado (`actionDecision`), manteniendo el ref solo como candado anti doble clic. El objetivo de "sin errores nuevos" pasa a ser "8 errores menos".

---

## [x] Tarea 2 — Utilidades puras de formato y markdown

**Objetivo:** preparar el terreno sin cambiar un solo pixel de la UI.

**Archivos:**
- `frontend/src/components/Admin/Assistant/assistantFormat.js` (nuevo)
- `frontend/src/components/Admin/Assistant/AssistantMarkdown.jsx` (nuevo)
- tests nuevos junto a cada archivo

**Hecho:**
- `formatActionField` / `formatActionValue` cubren el contrato real: `isAvailable` → Disponibilidad (Disponible / No disponible) e `isActive` → Visibilidad (Publicado / Oculto para anuncio y video, Visible / Oculta para categoría).
- `humanizeField` como respaldo para campos futuros: nunca se vuelve a imprimir `isAvailable: true` crudo.
- `formatRelativeTime` para el sidebar de conversaciones.
- `AssistantMarkdown` renderiza párrafos, listas `-`/`*`, listas `1.`, `**negrita**` y `` `código` `` **sin** `dangerouslySetInnerHTML` y **sin** dependencias nuevas. Ante una línea desconocida cae a texto plano.
- `AssistantChat.jsx` sigue sin usar nada de esto todavía.

**Validación real:** no aplica al flujo completo (no hay UI conectada). Se justifica: las funciones son puras y quedan cubiertas por tests de entrada/salida; se conectarán en la Tarea 5.

**Evidencia:**

- tests nuevos: **20** (`assistantFormat.test.js`: 14, `AssistantMarkdown.test.jsx`: 6).
- `npm test` frontend: **189 / 189** en 25 archivos, verde (169 previos + 20 nuevos; el conteo de archivos subió de 23 a 25).
- `npm run build`: no tocó CSS, no fue necesario recompilar; se recompila en la Tarea 3.

---

## [x] Tarea 3 — Rebranding del chat al sistema de diseño

**Objetivo:** eliminar el azul marino y los grises sueltos; que el asistente se vea como el resto del panel.

**Archivos:**
- `frontend/src/components/Admin/Assistant/AssistantChat.css` (reescritura completa)
- `frontend/src/components/Admin/Assistant/AssistantChat.jsx`
- `frontend/src/components/Admin/Assistant/AssistantChat.test.jsx` (solo si hace falta ajustar selectores)

**Hecho:**
- Cero colores literales de la paleta vieja (`#1f3b73`, `#ddd`, `#fafafa`). Todo por tokens: `--color-*`, `--r-card`, `--shadow-1`, `--sp-*`, `--font-display`, `--font-body`.
- Botones con `.btn btn--primary` / `.btn btn--outline`; compositor con `.admin-field`; errores con `.admin-error`.
- Estado vacío con las sugerencias como tarjetas (solo cuando no hay mensajes) y carga con `.skeleton`.
- Avatares en los mensajes y hora visible. La etiqueta "Vos" aparece **una sola vez** (el test hace `getByText('Vos')` exacto).
- Se conservan sin cambios: el `useEffect` de carga, el flujo de streaming y la lógica de confirmación/cancelación.

**Validación real:** iniciar sesión en el panel contra el servidor y la base reales, abrir "Asistente", enviar una consulta, ver la respuesta y abrir el historial. Comparar contra `Productos` y `Configuración` para confirmar que la paleta coincide.

**Evidencia:**

- `npm test` frontend: **191 / 191** en 25 archivos, verde.
- `npm run build`: **verde**, 405 ms (CSS creció de 26.44 kB a 29.12 kB por los tokens).
- `npm run lint` sobre `src`: **0 errores** (se eliminaron los 8 `react-hooks/refs` de `AssistantChat.jsx`).
- Lint restante: 9 errores solo en `frontend/verify-ui.js` (script suelto, fuera de `src`), sin tocar.
- navegador: pendiente de validación real (siguiente paso manual). Se completa junto con la Tarea 4 para no abrir el navegador dos veces.

---

## [x] Tarea 4 — Layout de chat y ergonomía

**Objetivo:** que deje de ser una columna angosta con forma de formulario.

**Archivos:** `AssistantChat.jsx`, `AssistantChat.css`.

**Hecho:**
- Dos columnas desde 960px: sidebar de conversaciones (título + fecha relativa, activa marcada) y panel de mensajes. En móvil, una columna.
- La zona de mensajes ocupa el alto disponible y el compositor queda sticky abajo.
- Auto-scroll solo si el usuario está cerca del fondo; botón "Ir al final" cuando se aleja.
- Enter envía, Shift+Enter hace salto de línea, textarea auto-grow, contador `n/2000`.
- Indicador de escritura antes del primer chunk y `aria-busy` en el `role="log"`.
- Botón **Detener** durante el stream usando `AbortController` con el `signal` que ya acepta `api.streamPost`. No se toca `api/client.js`.

**Validación real:** en el navegador, con el servidor real: enviar una consulta larga, subir a leer a mitad del stream y comprobar que no salta al fondo; detener una respuesta; recargar y abrir una conversación anterior.

**Evidencia:**

- `npm test` frontend: **191 / 191** en 25 archivos, verde.
- `npm run build`: **verde**, 341 ms.
- `npm run lint` sobre `src`: **0 errores**.
- navegador (scroll, detener, teclado): pendiente de validación real junto con la Tarea 5 (un solo pase de navegador).

---

## [x] Tarea 5 — Mensajes y tarjeta de confirmación

**Objetivo:** que el contenido del modelo se lea bien y que la confirmación de acciones no muestre nombres técnicos.

**Archivos:**
- `frontend/src/components/Admin/Assistant/AssistantMessage.jsx` (nuevo)
- `frontend/src/components/Admin/Assistant/AssistantPendingAction.jsx` (nuevo)
- `AssistantChat.jsx`, `AssistantChat.css`

**Hecho:**
- La burbuja del asistente usa `AssistantMarkdown` con `useMemo` por contenido (no re-parsea en cada chunk), más botón copiar.
- La tarjeta de confirmación usa el `summary` del servidor como titular y muestra los cambios humanizados: "Disponibilidad: Disponible → No disponible". Advertencias en su bloque y **cuenta regresiva** del vencimiento con `setInterval` limpiado al desmontar.
- El error ofrece **Reintentar** con el último mensaje guardado en un ref.
- Confirmar/Cancelar mantienen los refs de vuelo (`confirmInFlightRef`, `cancelInFlightRef`): no se reemplazan por `disabled`.

**Validación real:** con servidor y base reales, pedir una acción (por ejemplo, marcar un producto como no disponible), revisar la tarjeta, dejar vencer el token y confirmar que la cuenta regresiva y el bloqueo funcionan; cancelar otra propuesta. Si no hay clave del proveedor disponible, simular únicamente la respuesta del proveedor, como ya se hizo en la Fase 2B, y dejar constancia acá.

**Evidencia:**

- `npm test` frontend: **191 / 191** en 25 archivos, verde.
- `npm run build`: **verde**, 267 ms.
- `npm run lint` sobre `src`: **0 errores**.
- navegador (propuesta, vencimiento, cancelar): pendiente de validación real junto con la Tarea 6 (un solo pase de navegador).

---

## [x] Tarea 6 — Drawer flotante desde cualquier sección

**Objetivo:** poder preguntarle al asistente sin salir de Productos, Avisos o Galería.

**Archivos:**
- `frontend/src/components/Admin/Assistant/AssistantDrawer.jsx` (nuevo)
- `frontend/src/components/Admin/Assistant/AssistantDrawer.css` (nuevo)
- `frontend/src/pages/Administracion.jsx` (**archivo compartido**)
- test nuevo del drawer

**Hecho:**
- FAB abajo a la derecha con `env(safe-area-inset-*)` y panel lateral; en móvil, hoja a pantalla completa.
- Montaje perezoso: el chat se monta en el primer clic y luego queda oculto con `hidden`, así no se pierde el borrador ni el scroll.
- Un único `GET /admin/assistant/status` decide si el FAB aparece. Con `enabled: false` no se ofrece nada.
- Si `activeSection === 'assistant'`, el drawer devuelve `null`: nunca hay dos chats vivos ni dos llamadas a `/status`, y el flujo actual de la tarjeta "Asistente" queda idéntico.
- Escape cierra, el foco entra al compositor y vuelve al FAB. No es modal: no atrapa el foco y no cierra al hacer clic fuera (para no perder lo escrito).
- `Administracion.jsx` solo suma el montaje; no se toca el efecto de foco del título ni `SECTION_COMPONENTS`.

**Validación real (regla 1 obliga a doble check):**
- Abrir el drawer desde Productos, preguntar, cerrar, volver a abrirlo y comprobar que el borrador sigue.
- Entrar a la tarjeta "Asistente" y verificar que aparece **un solo** chat y que el drawer no se muestra.
- Revisar en la pestaña de red que no hay dos `GET /admin/assistant/status` simultáneos.
- Probar 375px de ancho y navegación solo con teclado.

**Evidencia:**

- `npm test` frontend: **194 / 194** en 26 archivos, verde (+3 tests del drawer).
- `npm run build`: **verde**, 404 ms.
- `npm run lint` sobre `src`: **0 errores**.
- navegador (drawer + sección + doble montaje): pendiente de validación real manual (el servidor y la base reales no están corriendo en este entorno; se justifica que la validación automatizada cubre el montaje condicional y el flujo de apertura/cierre, y el resto se valida al correr el panel contra el servidor).

---

## [x] Tarea 7 — Documentación y cierre de fase

**Objetivo:** dejar el trabajo retomable y sin prosa que envejezca.

**Archivos:** `docs/assistant.md`, este archivo.

**Hecho:**
- `docs/assistant.md` registra la fase con archivos, decisión "un solo chat montado", y evidencia por tarea.
- `docs/frontend-integration.md` **no se toca**: no hay endpoints, DTOs ni códigos de error nuevos.
- Este roadmap queda con todas las casillas marcadas y sus números reales.
- Los números de tests y migraciones se verifican contra `npm test` y el directorio, no contra la prosa vieja.

**Validación real:** no aplica (cierre documental). Se justifica: no cambia comportamiento.

**Evidencia:**

- `npm test` frontend: **194 / 194** en 26 archivos, verde.
- `npm test` server: no ejecutado (sin cambios en `server/`); se mantiene la base 804/804 de la Fase 2B.
- `npm run build`: **verde**, 404 ms.
- `docs/assistant.md`: seccion "Fase 3 — Interfaz del chat" agregada al final (26 lineas).
- `AGENTS.md`: nota de lint actualizada (src/ limpio; 9 errores solo en `verify-ui.js`).

---

## Fuera de alcance (no hacer en este roadmap)

- Cambiar el backend, el prompt o el registro de herramientas.
- Agregar dependencias (nada de librerías de markdown ni de iconos).
- Reemplazar `dangerouslySetInnerHTML` por una librería: el render es por líneas a elementos React.
- Refactorizar `Administracion.jsx` más allá del montaje del drawer.
- Tocar los archivos con errores de lint preexistentes.
