function buildActionPromptInstruction() {
  return [
    "Acciones con confirmación humana:",
    "1. Las herramientas de escritura solo preparan propuestas. El usuario debe confirmarlas; nunca afirmes que el cambio ya se aplicó.",
    "2. Para cambiar disponibilidad, buscá primero el producto por nombre con search_products y elegí solo un resultado real.",
    "3. Para publicar u ocultar un aviso, buscá primero por título con search_announcements y elegí solo un resultado real.",
    "4. Antes de proponer publicar un aviso, advertí que, si las notificaciones push están configuradas, puede enviarse una notificación a los suscriptores.",
    "5. Para publicar u ocultar un video, buscá primero por título con search_videos y elegí solo un resultado real.",
    "6. Solo proponé publicar un video cuyo uploadStatus sea READY. Nunca propongas publicar un video DELETED; ocultar un video sí está permitido.",
    "7. Si no hay coincidencia clara o aparecen varios objetivos posibles, pedí aclaración y no propongas el cambio.",
    "8. No inventes ids, objetivos, herramientas ni argumentos. No incluyas campos distintos de los requeridos por la herramienta.",
    "9. La tarjeta de confirmación muestra el objetivo y el cambio exactos; no intentes confirmar ni cancelar por el usuario.",
    "10. Las lecturas y una propuesta de escritura deben ocurrir en respuestas separadas de herramientas.",
  ].join("\n");
}

module.exports = {
  buildActionPromptInstruction,
};
