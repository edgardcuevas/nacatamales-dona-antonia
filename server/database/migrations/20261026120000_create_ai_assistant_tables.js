// Historial y metricas del asistente de administracion (Fase 1).
//
// Tres tablas con propositos distintos:
// - ai_conversations: hilo por usuario. Se poda a 20 por usuario al crear
//   una nueva, ordenando por updated_at (nunca por created_at).
// - ai_messages: turnos del hilo. ON DELETE CASCADE desde la conversacion.
// - ai_usage_events: un evento por intento que llega al proveedor. NO
//   cascadea con la conversacion: los eventos sobreviven al borrado
//   (conversation_id queda NULL) porque miden consumo, no contenido.
//
// Todo el texto que genera un usuario vive en ai_messages.content. Ninguna
// tabla guarda claves, tokens ni cabeceras.
exports.up = async function (knex) {
  await knex.schema.createTable(
    "ai_conversations",
    (table) => {
      table.bigIncrements("id").primary();

      table.bigInteger("user_id").unsigned().notNullable();

      table.string("title", 120).nullable();

      table
        .timestamp("created_at")
        .notNullable()
        .defaultTo(knex.fn.now());

      // Se actualiza a mano al insertar mensajes: la poda y el listado
      // dependen de este valor.
      table
        .timestamp("updated_at")
        .notNullable()
        .defaultTo(knex.fn.now());

      table
        .foreign("user_id")
        .references("id")
        .inTable("users")
        .onUpdate("CASCADE")
        .onDelete("CASCADE");

      table.index(
        ["user_id", "updated_at"],
        "idx_ai_conversations_user_updated"
      );
    }
  );

  await knex.schema.createTable(
    "ai_messages",
    (table) => {
      table.bigIncrements("id").primary();

      table
        .bigInteger("conversation_id")
        .unsigned()
        .notNullable();

      table
        .enum("role", ["user", "assistant"])
        .notNullable();

      table.text("content", "mediumtext").notNullable();

      // Solo en respuestas del asistente: que proveedor y version real
      // contestaron. En los mensajes del usuario quedan NULL.
      table.string("provider", 32).nullable();
      table.string("model", 80).nullable();
      table.integer("input_tokens").unsigned().nullable();
      table.integer("output_tokens").unsigned().nullable();

      table
        .timestamp("created_at")
        .notNullable()
        .defaultTo(knex.fn.now());

      table
        .foreign("conversation_id")
        .references("id")
        .inTable("ai_conversations")
        .onUpdate("CASCADE")
        .onDelete("CASCADE");

      table.index(
        ["conversation_id", "id"],
        "idx_ai_messages_conversation_id"
      );
    }
  );

  await knex.schema.createTable(
    "ai_usage_events",
    (table) => {
      table.bigIncrements("id").primary();

      table.bigInteger("user_id").unsigned().notNullable();

      // SET NULL, no CASCADE: borrar una conversacion no debe borrar el
      // registro de consumo que ya ocurrio.
      table
        .bigInteger("conversation_id")
        .unsigned()
        .nullable();

      table.string("provider", 32).notNullable();
      table.string("model", 80).nullable();

      table
        .enum("status", [
          "SUCCESS",
          "BLOCKED",
          "TIMEOUT",
          "PROVIDER_ERROR",
          "INTERNAL_ERROR",
        ])
        .notNullable();

      table.string("error_code", 64).nullable();

      table.integer("input_tokens").unsigned().nullable();
      table.integer("output_tokens").unsigned().nullable();

      table.integer("latency_ms").unsigned().nullable();

      table
        .timestamp("created_at")
        .notNullable()
        .defaultTo(knex.fn.now());

      table
        .foreign("user_id")
        .references("id")
        .inTable("users")
        .onUpdate("CASCADE")
        .onDelete("CASCADE");

      table
        .foreign("conversation_id")
        .references("id")
        .inTable("ai_conversations")
        .onUpdate("CASCADE")
        .onDelete("SET NULL");

      table.index(
        ["user_id", "created_at"],
        "idx_ai_usage_events_user_created"
      );
      table.index(
        ["created_at"],
        "idx_ai_usage_events_created"
      );
    }
  );
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists(
    "ai_usage_events"
  );
  await knex.schema.dropTableIfExists("ai_messages");
  await knex.schema.dropTableIfExists(
    "ai_conversations"
  );
};
