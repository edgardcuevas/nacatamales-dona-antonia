const ANNOUNCEMENT_TYPES = [
  "AVAILABLE",
  "SOLD_OUT",
  "PROMOTION",
  "INFO",
];

exports.up = async function (knex) {
  await knex.schema.createTable(
    "announcements",
    (table) => {
      table.bigIncrements("id").primary();

      table
        .string("title", 150)
        .notNullable();

      table
        .text("content")
        .notNullable();

      table
        .enum("type", ANNOUNCEMENT_TYPES)
        .notNullable()
        .defaultTo("INFO");

      table
        .boolean("is_active")
        .notNullable()
        .defaultTo(false);

      table
        .timestamp("starts_at")
        .nullable();

      table
        .timestamp("ends_at")
        .nullable();

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

      table.index(
        [
          "is_active",
          "starts_at",
          "ends_at",
          "sort_order",
        ],
        "idx_announcements_public_schedule"
      );

      table.index(
        ["type", "is_active"],
        "idx_announcements_type_active"
      );
    }
  );
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists(
    "announcements"
  );
};