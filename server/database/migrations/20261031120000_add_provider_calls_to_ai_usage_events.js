exports.up = async function (knex) {
  await knex.schema.alterTable(
    "ai_usage_events",
    (table) => {
      table
        .integer("provider_calls")
        .unsigned()
        .nullable()
        .after("error_code");
    }
  );
};

exports.down = async function (knex) {
  await knex.schema.alterTable(
    "ai_usage_events",
    (table) => {
      table.dropColumn("provider_calls");
    }
  );
};
