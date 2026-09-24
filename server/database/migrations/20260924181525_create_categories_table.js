exports.up = async function (knex) {
  await knex.schema.createTable("categories", (table) => {
    table.bigIncrements("id").primary();

    table
      .string("name", 100)
      .notNullable()
      .unique();

    table
      .string("slug", 120)
      .notNullable()
      .unique();

    table
      .string("description", 500)
      .nullable();

    table
      .integer("sort_order")
      .unsigned()
      .notNullable()
      .defaultTo(0);

    table
      .boolean("is_active")
      .notNullable()
      .defaultTo(true);

    table
      .timestamp("created_at")
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at")
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(
      ["is_active", "sort_order"],
      "idx_categories_active_sort"
    );
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("categories");
};