// Catálogo del panel. Solo datos: módulos, roles, acciones y limitaciones.
// Sin endpoints, cuerpos HTTP ni lógica. Se actualiza cuando cambia un módulo.
const ASSISTANT_KNOWLEDGE = Object.freeze({
  categories: {
    label: "Categorías",
    roles: ["ADMIN", "EDITOR"],
    actions: [
      "crear con nombre, descripción opcional, orden e imagen opcional",
      "editar", "activar o desactivar", "eliminar",
    ],
    limitations: [
      "No se puede eliminar una categoría que tenga productos.",
      "El orden define su posición en el menú público.",
    ],
  },
  products: {
    label: "Productos",
    roles: ["ADMIN", "EDITOR"],
    actions: [
      "crear con nombre, categoría, precio opcional, descripción, orden e imagen",
      "editar", "marcar agotado o disponible",
      "mostrar u ocultar del sitio público", "eliminar",
    ],
    limitations: [
      "Todo producto pertenece a una categoría existente.",
      "El precio se escribe en córdobas y es opcional.",
    ],
  },
  announcements: {
    label: "Anuncios",
    roles: ["ADMIN", "EDITOR"],
    actions: [
      "crear con título, mensaje, tipo, orden e imagen opcional",
      "elegir tipo: Disponible, Agotado, Promoción o Información",
      "publicar ahora o programar desde y hasta cuándo se muestra",
      "editar; publicar u ocultar; eliminar",
      "enviar una notificación push a los suscritos",
    ],
    limitations: [
      "La notificación solo se envía si el aviso está publicado y vigente.",
      "Un aviso programado para el futuro no se puede notificar antes.",
    ],
  },
  feed: {
    label: "Día a día",
    roles: ["ADMIN", "EDITOR"],
    actions: [
      "en la pestaña Fotos: publicar fotos con texto opcional",
      "en la pestaña Videos: subir MP4 de hasta 2 GB con título y texto opcional",
      "elegir una miniatura propia en JPG para un video",
      "publicar, ocultar o eliminar de YouTube un video",
    ],
    limitations: [
      "La miniatura propia solo se cambia cuando el video está Listo.",
      "Para eliminar un video de YouTube primero hay que ocultarlo.",
      "Un video eliminado de YouTube no se puede volver a publicar.",
      "Solo un ADMIN conecta o reconecta la cuenta de YouTube.",
    ],
  },
  media: {
    label: "Galería de fotos",
    roles: ["ADMIN", "EDITOR"],
    actions: [
      "ver todas las imágenes subidas y en qué publicación se usa cada una",
      "borrar las imágenes que no se están usando",
      "cargar más imágenes cuando hay varias páginas",
    ],
    limitations: [
      "No se puede borrar una imagen que esté en uso.",
      "Si dice Uso no verificado, el uso no se pudo comprobar: no asumir que está libre.",
    ],
  },
  settings: {
    label: "Configuración del sitio",
    roles: ["ADMIN", "EDITOR"],
    actions: [
      "editar nombre del negocio, lema e historia",
      "editar WhatsApp, Facebook e Instagram",
      "editar horario general y horario de fritanga, con sus colores",
      "editar dirección, enlace de Google Maps, latitud y longitud",
    ],
    limitations: [
      "Estos datos son los que se muestran en el sitio público.",
    ],
  },
  account: {
    label: "Mi cuenta",
    roles: ["ADMIN", "EDITOR"],
    actions: [
      "cambiar la contraseña propia con la actual y la nueva",
    ],
    limitations: [
      "No cambia correo ni rol; eso lo gestiona un ADMIN en Usuarios.",
    ],
  },
  users: {
    label: "Usuarios",
    roles: ["ADMIN"],
    actions: [
      "crear con email, contraseña y rol ADMIN o EDITOR",
      "activar o desactivar", "cambiar la contraseña de otro usuario",
    ],
    limitations: [
      "Solo un ADMIN ve esta sección.",
      "Crear o editar usuarios pide la contraseña del ADMIN que hace el cambio.",
    ],
  },
});

const ASSISTANT_MODULE_KEYS = Object.freeze(
  Object.keys(ASSISTANT_KNOWLEDGE)
);

module.exports = {
  ASSISTANT_KNOWLEDGE,
  ASSISTANT_MODULE_KEYS,
};
