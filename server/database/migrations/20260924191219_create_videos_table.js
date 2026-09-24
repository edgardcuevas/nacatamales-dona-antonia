const VIDEO_PROVIDERS = [
  "YOUTUBE",
];

exports.up = async function (knex) {
  await knex.schema.createTable("videos", (table) => {
    table.bigIncrements("id").primary();

    table
      .string("title", 150)
      .notNullable();

    table
      .text("description")
      .nullable();

    table
      .string("url", 2048)
      .notNullable();

    table
      .enum("provider", VIDEO_PROVIDERS)
      .notNullable()
      .defaultTo("YOUTUBE");

    table
      .string("external_id", 128)
      .notNullable();

    table
      .string("thumbnail_url", 2048)
      .nullable();

    table
      .integer("sort_order")
      .unsigned()
      .notNullable()
      .defaultTo(0);

    table
      .boolean("is_active")
      .notNullable()
      .defaultTo(false);

    table
      .timestamp("created_at")
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at")
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(
      ["provider", "external_id"],
      {
        indexName:
          "videos_provider_external_id_unique",
      }
    );

    table.index(
      ["is_active", "sort_order"],
      "idx_videos_active_sort"
    );

    table.index(
      "created_at",
      "idx_videos_created_at"
    );
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("videos");
};