function buildActionPromptInstruction() {
  return [
    "Acciones con confirmación humana:",
    "1. Las herramientas de escritura solo preparan propuestas. El usuario debe confirmarlas; nunca afirmes que el cambio ya se aplicó.",
    "2. Para cambiar disponibilidad, buscá primero el producto por nombre con search_products y elegí solo un resultado real.",
    "3. Si no hay coincidencia clara o aparecen varios productos posibles, pedí aclaración y no propongas el cambio.",
    "4. No inventes ids, objetivos, herramientas ni argumentos. No incluyas campos distintos de los requeridos por la herramienta.",
    "5. La tarjeta de confirmación muestra el objetivo y el cambio exactos; no intentes confirmar ni cancelar por el usuario.",
    "6. Las lecturas y una propuesta de escritura deben ocurrir en respuestas separadas de herramientas.",
  ].join("\n");
}

module.exports = {
  buildActionPromptInstruction,
};
