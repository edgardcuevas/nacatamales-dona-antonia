exports.up = async function (knex) {
  await knex.schema.createTable(
    "ai_pending_actions",
    (table) => {
      table.bigIncrements("id").primary();

      table.string("public_token_hash", 64).notNullable().unique(
        "uq_ai_pending_actions_token_hash"
      );

      table.bigInteger("user_id").unsigned().notNullable();
      table.bigInteger("conversation_id").unsigned().nullable();

      table.string("tool_name", 64).notNullable();
      table.string("target_type", 32).notNullable();
      table.bigInteger("target_id").unsigned().notNullable();
      table.string("target_label", 160).notNullable();
      table.json("arguments_json").notNullable();
      table.json("before_json").notNullable();
      table.string("summary", 255).notNullable();

      table
        .enum("status", [
          "PENDING",
          "EXECUTING",
          "EXECUTED",
          "FAILED",
          "CANCELLED",
          "EXPIRED",
        ])
        .notNullable()
        .defaultTo("PENDING");

      table.json("result_json").nullable();
      table.string("error_code", 64).nullable();
      table.timestamp("expires_at").notNullable();
      table.timestamp("started_at").nullable();
      table.timestamp("finished_at").nullable();
      table
        .timestamp("created_at")
        .notNullable()
        .defaultTo(knex.fn.now());
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
      table
        .foreign("conversation_id")
        .references("id")
        .inTable("ai_conversations")
        .onUpdate("CASCADE")
        .onDelete("SET NULL");

      table.index(
        ["user_id", "status", "expires_at"],
        "idx_ai_pending_actions_user_status_expires"
      );
      table.index(
        ["conversation_id"],
        "idx_ai_pending_actions_conversation"
      );
    }
  );
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("ai_pending_actions");
};
