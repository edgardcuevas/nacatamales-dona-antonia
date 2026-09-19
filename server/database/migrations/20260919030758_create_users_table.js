exports.up = async function (knex) {
  await knex.schema.createTable("users", (table) => {
    table.bigIncrements("id").primary();

    table.string("email", 255).notNullable().unique();

    table.string("password_hash", 255).notNullable();

    table
      .enum("role", ["ADMIN", "EDITOR"])
      .notNullable()
      .defaultTo("EDITOR");

    table
      .boolean("is_active")
      .notNullable()
      .defaultTo(true);

    table.timestamp("last_login_at").nullable();

    table.timestamp("password_changed_at").nullable();

    table.timestamp("created_at")
      .notNullable()
      .defaultTo(knex.fn.now());

    table.timestamp("updated_at")
      .notNullable()
      .defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("users");
};