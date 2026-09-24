exports.up = async function (knex) {
  await knex.schema.createTable("products", (table) => {
    table.bigIncrements("id").primary();

    table
      .bigInteger("category_id")
      .unsigned()
      .notNullable();

    table
      .string("name", 150)
      .notNullable()
      .unique();

    table
      .string("slug", 180)
      .notNullable()
      .unique();

    table
      .text("description")
      .nullable();

    table
      .decimal("price", 10, 2)
      .unsigned()
      .nullable();

    table
      .boolean("is_available")
      .notNullable()
      .defaultTo(true);

    table
      .boolean("is_active")
      .notNullable()
      .defaultTo(true);

    table
      .integer("sort_order")
      .unsigned()
      .notNullable()
      .defaultTo(0);

    table
      .timestamp("created_at")
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at")
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .foreign("category_id")
      .references("id")
      .inTable("categories")
      .onUpdate("CASCADE")
      .onDelete("RESTRICT");

    table.index(
      ["category_id", "is_active", "sort_order"],
      "idx_products_category_active_sort"
    );

    table.index(
      ["is_active", "is_available", "sort_order"],
      "idx_products_public_listing"
    );
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("products");
};