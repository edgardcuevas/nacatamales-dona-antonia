# Guía de marca — Nacatamales de Doña Antonia

Sistema visual del sitio. Todo lo que está aquí está implementado en
`frontend/src/index.css` y `frontend/src/styles/base.css`: si cambia una
regla, cambia también el token, y al revés.

---

## 1. Posición

**Artesanal y cálida, tradicional y profesional, moderna sin perder
autenticidad.**

La Errorsicredd no viene del adorno sino del material: papel cálido,
una tipografía con carácter, sombras que dan asiento y espacio para
respirar. **La fotografía es el ornamento.** Los motivos decorativos van
a reventar la categoría tan rápido como la零食.

### Lo que este sitio NO es

- No es un restaurante de fine dining: nada de negro, nada de dorado
- No es una cadena: nada de "somos los mejores", nada de eslóganes
- No es una app de delivery: la conversión es WhatsApp, y se ve

---

## 2. Paleta

Base obligatoria: **crema `#FFF4DC`.** No es un color de fondo, es la
identidad. El sitio no pasa a blanco puro ni a modo oscuro.

### Superficies

| Token | Hex | Uso |
|---|---|---|
| `--color-crema` | `#FFF4DC` | Fondo de página. **No se modifica** |
| `--color-crema-alt` | `#F5EBDC` | Secciones alternas, placeholders |
| `--color-blanco` | `#FFFFFF` | Superficie de tarjeta |

### Tinta (texto)

| Token | Hex | / crema | Uso |
|---|---|---|---|
| `--color-tinta` | `#2B1D15` | **14.91** | Texto principal |
| `--color-tinta-2` | `#55402F` | **8.90** | Texto secundario |
| `--color-tinta-3` | `#6E5747` | **6.17** | Metadatos, 13-14px |
| `--color-tinta-4` | `#98826C` | **3.35** | Decorativo, líneas |
| `--color-crema-tenue` | `#E9DCC9` | 12.39 / carbón | Texto sobre fondo oscuro |

> Sobre la textura de papel (las tres capas sumadas, en la esquina) el
> `--color-tinta-3` baja a **4.88**. Ese es el piso real del sitio: si
> algo no pasa 4.5 sobre `#E8DAC0`, no pasa.

### Acentos

| Token | Hex | Rol |
|---|---|---|
| `--color-rojo` | `#9E2B25` | **Achiote. Primario y único color de CTA** |
| `--color-rojo-dark` | `#7A1E1A` | Estado presionado |
| `--color-amarillo` | `#96590D` | Masa tostada. Secundario |
| `--color-masa-solido` | `#C4841C` | Relleno cálido. Tinta encima, nunca blanco |
| `--color-verde` | `#3F5D45` | **Solo semántica**: disponible, éxito |
| `--color-cafe-claro` | `#8C4A32` | Relleno neutro cálido |
| `--color-cafe-oscuro` | `#2A1A12` | Carbón. Hero, footer, citas |

### Tintes de estado

| Token | Hex | Texto | Ratio |
|---|---|---|---|
| `--color-rojo-claro` | `#F3E3E0` | `--color-rojo` | 5.97 |
| `--color-amarillo-claro` | `#F7EBD3` | `--color-amarillo` | 4.76 |
| `--color-verde-claro` | `#E6EEE4` | `--color-verde` | 6.19 |

### Bordes

| Token | Hex | / crema | Uso |
|---|---|---|---|
| `--color-linea` | `#E8DAC5` | 1.26 | Decorativo |
| `--color-linea-fuerte` | `#A0835F` | **3.26** | Controles interactivos |

### Reglas de disciplina

Estas seis reglas son las que hacen que la paleta funcione. No son
sugerencias:

1. **Un solo color de CTA: achiote.** El botón de WhatsApp del header
   es achiote, no verde. El header tiene una acción, no dos colores.
2. **Verde = exclusivamente semántico.** Nunca decorativo.
3. **Blanco sobre relleno cálido falla (3.63).** Sobre `--color-masa-solido`
   va tinta, nunca blanco.
4. **`--color-tinta-3` nunca sobre carbón (2.48).** Ahí va `--color-tinta-4`.
5. **Rojo nunca como texto sobre oscuro (2.25).** Sobre carbón,
   `--color-crema-tenue`.
6. **Bordes de control usan `--color-linea-fuerte`.** Un 1px de
   `--color-linea` sobre crema da 1.26 y no se ve.

---

## 3. Tipografía

**Fraunces** para display · **Karla** para texto y UI.

| Token | Tamaño | Uso |
|---|---|---|
| `--fs-xs` | 12px | **Piso absoluto.** Solo metadata |
| `--fs-sm` | 14px | **Mínimo en sitio público** |
| `--fs-base` | 16px | Cuerpo |
| `--fs-md` | 19px | Lead, precio, título de tarjeta |
| `--fs-lg` | 24px | H3, display secundario |
| `--fs-xl` | 31px | H2 |
| `--fs-2xl` | `clamp(30px, 4.2vw, 39px)` | H1 de página |
| `--fs-3xl` | `clamp(34px, 6vw, 60px)` | Hero |

Line-height: **cuatro reglas y ni una más.** Display 1.05 · Títulos 1.2 ·
UI densa 1.4 · Cuerpo 1.55.

- Tracking: `-0.015em` en display, `0.06em` en eyebrow, `+0.02em` a 12px
- `tabular-nums` en precios, horarios y columnas
- Nunca hay un tamaño en px fuera de la escala. Nunca por debajo de 12px

---

## 4. Espacio, radio y sombra

- **Espaciado:** base 4px. Tokens `--sp-1` a `--sp-10`
- **Contenedor:** `--container: 1200px`, gutters `clamp(16px, 5vw, 32px)`
- **Lectura:** `--reading: 65ch`
- **Radios: solo tres.** 8px chips · 14px tarjetas · 999px píldoras
- **Sección:** `clamp(56px, 8vw, 96px)` en vertical

### La sombra da asiento

Tres capas, desviadas abajo-derecha: **la luz cae de lado, nunca de
frente.** Una sola capa de sombra hace que todo se vea plano.

El borde de las tarjetas es un **degradado de 1px** de claro a sombra, no
un filo plano. Es el bisel de una hoja vista de canto, y es lo que
hace que la tarjeta se levante del fondo en lugar de flotar.

---

## 5. Movimiento

**"Vapor": las cosas se asientan, no rebotan.**

| Token | Valor | Uso |
|---|---|---|
| `--dur-1` | 120ms | Hover, presión |
| `--dur-2` | 220ms | Entrada |
| `--dur-3` | 420ms | Revelado |
| `--ease-out` | `cubic-bezier(.2,.7,.3,1)` | Transiciones |
| `--ease-settle` | `cubic-bezier(.16,1,.3,1)` | Entradas |

- Máximo 420ms. Sin bounce, sin rebote, sin parallax
- **Los datos nunca se animan.** Un precio no parpadea. La única excepción
  es el badge de horario: pulsa(opacidad 1 → 0.6 → 1, 2.8s) **solo cuando
  `useOpenNow` confirma que el negocio está abierto ahora**, evaluado en la
  zona de Managua y no en la del visitante. Si el horario no se puede
  interpretar, `null` y el badge no pulsa: es preferible callar a afirmar mal.
- Revelado al entrar en pantalla: 420ms, 8px de recorrido, escalonado
  60ms entre hermanos, **una sola vez**
- `prefers-reduced-motion` está en `index.css` desde el día uno. Toda
  animación nueva lo hereda

---

## 6. Fotografía

**Híbrido, a propósito.**

| Contexto | Guía |
|---|---|
| **Productos** (menú y portada) | Luz natural lateral · fondo de madera o papel kraft · encuadre 3/4 · sin flash · sin blanco clínico |
| **Feed "día a día"** | **Se mantiene su estética actual.** Solo se le aplica el marco (radio 14, borde) |

El feed es contenido real de clientes y del local. Mezclarlo con fotos
de producto lo haría más plano. Su formato vertical 4/5 es parte de su
ritmo y no se toca.

La imagen nunca lleva `object-fit` distinto al de su contenedor: siempre
`cover`, con la altura fijada por CSS para que no haya salto de layout.

---

## 7. Voz

Tres reglas, y ninguna excepción:

1. **Primera persona siempre.** "Somos", "nosotros", "te escribimos"
2. **"Nacatamal", nunca "tamal".** Es el nombre del producto
3. **Registro centroamericano coherente:** nacatamal + fritanga + voseo
   ("escribinos", "conocés"). **Reforzar, no corregir**

Vocabulario real de cocina: hoja de plátano, vapor, fuego lento, a fuego
lento.

**Prohibidos:** "delicioso", "sabroso", "experiencia gastronómica",
"auténtico sabor", "tradición centenaria". Son de plantilla, y este
negocio no es una plantilla.

---

## 8. Lo que no se hace aquí

Esto se prototipó y se descartó. Queda anotado para que no se repita:

- **Una red de enredaderas generada por código** en el fondo crema. Tres
  variantes, ninguna aprobada. Prototipo, generador y vistas previas
  eliminados del proyecto.
- **Hojas de plátano como patrón repetido.** El ornamento orgánico vive
  en tres sitios y ninguno más: marca de agua del hero, marca de agua de
  la cita de Nosotros, filete de nervadura en el footer.
- **Modo oscuro.** El crema es la identidad.
- **Más de un color de CTA.**

---

## 9. Referencia rápida

```
index.css   tokens: color, tipografía, espaciado, radio, sombra, movimiento
            reset, textura de papel, viñeta, foco, reduced-motion
base.css    primitivas: btn, card, pill, price, section-head, field,
            skeleton, empty-state, reveal, leaf-rule, focus-visible
```

Regla estructural: **una primitiva compartida se define en `base.css`,
nunca en la hoja de una página.** `.btn` llegaba a 12 archivos desde
`Home.css` y funcionaba solo porque Vite concatena el CSS.

Todos los ratios de esta guía están calculados, no estimados. Si se
cambia un valor de token, hay que recalcular los que lo usan como fondo.