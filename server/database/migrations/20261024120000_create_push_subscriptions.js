// Suscripciones de Web Push de los visitantes. No hay cuenta de usuario:
// cada fila es un navegador que aceptó recibir avisos.
//
// El endpoint es una URL larga (los servicios push de Google/Mozilla/
// Apple superan holgadamente el límite de índice de MySQL), así que la
// unicidad se garantiza con endpoint_hash (SHA-256 en hexadecimal).
exports.up = async function (knex) {
  await knex.schema.createTable(
    "push_subscriptions",
    (table) => {
      table.bigIncrements("id").primary();

      table.text("endpoint").notNullable();

      table
        .string("endpoint_hash", 64)
        .notNullable()
        .unique();

      // Claves públicas de cifrado del navegador (base64url).
      table.string("p256dh", 255).notNullable();
      table.string("auth", 255).notNullable();

      table.string("user_agent", 255).nullable();

      table
        .timestamp("created_at")
        .notNullable()
        .defaultTo(knex.fn.now());

      table.timestamp("last_success_at").nullable();

      // Se incrementa cuando el servicio push rechaza un envío. Al
      // llegar al umbral la fila se borra: la suscripción ya no sirve.
      table
        .integer("failure_count")
        .unsigned()
        .notNullable()
        .defaultTo(0);
    }
  );
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists(
    "push_subscriptions"
  );
};
