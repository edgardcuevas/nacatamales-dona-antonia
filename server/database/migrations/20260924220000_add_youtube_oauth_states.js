exports.up = async function (knex) {
  await knex.schema.createTable(
    "youtube_oauth_states",
    (table) => {
      table
        .bigIncrements("id")
        .unsigned()
        .primary();

      table
        .string("state_hash", 64)
        .notNullable()
        .unique();

      table
        .bigInteger("admin_user_id")
        .unsigned()
        .notNullable();

      table
        .timestamp("expires_at")
        .notNullable();

      table
        .timestamp("consumed_at")
        .nullable();

      table
        .timestamp("created_at")
        .notNullable()
        .defaultTo(knex.fn.now());

      table.index(
        ["expires_at"],
        "youtube_oauth_states_expires_at_index"
      );
    }
  );
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists(
    "youtube_oauth_states"
  );
};
