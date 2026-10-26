# Nacatamales de Doña Antonia

Este es el sitio web que desarrollé para un negocio de comida. La idea es
presentar el menú y el trabajo de Nacatamales de Doña Antonia en un solo lugar,
y facilitar que las personas conozcan los productos y se comuniquen con el
negocio.

## Qué ofrece

- Un menú organizado por categorías, con descripciones, precios, disponibilidad e imágenes.
- Accesos para consultar o pedir productos por WhatsApp, sin pasos innecesarios.
- Una sección de fotos y videos para mostrar el local y cómo se preparan los productos.
- Información de contacto, ubicación, horarios y redes sociales.
- Un panel privado desde el que puedo administrar el contenido del sitio:
  crear, editar y borrar productos, categorías, publicaciones y videos de
  YouTube.

## Puntos fuertes

- Puedo gestionar desde el panel de administración el contenido que aparece en
  el sitio, sin tener que editar las páginas manualmente: subir, editar y
  borrar productos, categorías, fotos, publicaciones y videos de YouTube.
- La integración con YouTube permite subir videos y administrar su publicación
  desde el panel, además de editar sus datos y eliminarlos.
- WhatsApp está integrado como canal de contacto; el sitio no procesa pagos ni
  pedidos por cuenta propia.
- Las fotos y videos ayudan a mostrar el producto y el trabajo diario del
  negocio.
- El diseño busca sentirse cálido y cercano, sin perder claridad al navegar
  desde un teléfono o una computadora.
- El proyecto separa la interfaz del servidor y usa variables de entorno para
  configurar servicios externos y datos sensibles.

## Tecnologías

- **Interfaz:** React y Vite.
- **Servidor:** Node.js, Express y MySQL.
- **Contenido multimedia:** ImageKit y YouTube.
- **Notificaciones push:** función opcional que requiere configurar sus claves.

## Estructura

- `frontend/`: sitio web y panel de administración.
- `server/`: API, lógica del negocio y migraciones de la base de datos.
- `docs/`: documentación de integración y guía visual.

## Ejecución local

Se necesita Node.js 24.x y una instancia de MySQL.

1. Crea una base de datos MySQL para el proyecto.
2. En `server/`, instala las dependencias y prepara la configuración local:

   ```bash
   cd server
   npm install
   ```

   Copia `.env.example` como `.env` dentro de `server/` y configura la conexión a
   MySQL y las credenciales de los servicios que vayas a utilizar. No publiques
   ese archivo ni incluyas credenciales reales en el repositorio.

3. Desde `server/`, aplica las migraciones e inicia la API:

   ```bash
   node --env-file=.env node_modules/knex/bin/cli.js migrate:latest
   npm run dev
   ```

4. En otra terminal, inicia la interfaz:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   Vite envía las solicitudes `/api` al servidor local en `http://localhost:3000`.

## Pruebas

Los proyectos tienen sus propios comandos:

```bash
cd server
npm test
```

```bash
cd frontend
npm test
```
