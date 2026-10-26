// notified_at es la marca de idempotencia del envío push: se escribe con
// un UPDATE condicional (WHERE notified_at IS NULL) antes de despachar,
// de modo que dos peticiones concurrentes no mandan el aviso dos veces.
// También permite al scheduler encontrar avisos programados que ya
// llegaron a su starts_at sin haber notificado.
exports.up = async function (knex) {
  await knex.schema.alterTable(
    "announcements",
    (table) => {
      table.timestamp("notified_at").nullable();

      // El scheduler filtra exactamente por estas dos columnas.
      table.index(
        ["is_active", "notified_at"],
        "idx_announcements_notification_pending"
      );
    }
  );

  // Los avisos que ya existian no se "reenvian" al desplegar: sin este
  // backfill, activar las claves VAPID dispararia de golpe todos los
  // avisos publicados historicamente.
  await knex("announcements")
    .where({ is_active: true })
    .whereNull("notified_at")
    .update({ notified_at: knex.fn.now() });
};

exports.down = async function (knex) {
  await knex.schema.alterTable(
    "announcements",
    (table) => {
      table.dropIndex(
        ["is_active", "notified_at"],
        "idx_announcements_notification_pending"
      );
      table.dropColumn("notified_at");
    }
  );
};
