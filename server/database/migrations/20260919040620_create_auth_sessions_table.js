exports.up = async function (knex) {
  await knex.schema.createTable("auth_sessions", (table) => {
    table.bigIncrements("id").primary();

    table
      .bigInteger("user_id")
      .unsigned()
      .notNullable();

    table
      .string("refresh_token_hash", 64)
      .notNullable()
      .unique();

    table.timestamp("expires_at").notNullable();

    table.timestamp("last_used_at").nullable();

    table.timestamp("revoked_at").nullable();

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

    table.index(
      ["user_id", "revoked_at"],
      "idx_auth_sessions_user_revoked"
    );

    table.index(
      "expires_at",
      "idx_auth_sessions_expires_at"
    );
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("auth_sessions");
};