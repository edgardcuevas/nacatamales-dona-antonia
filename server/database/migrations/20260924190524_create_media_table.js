const MEDIA_PROVIDERS = [
  "CLOUDINARY",
];

const MEDIA_RESOURCE_TYPES = [
  "IMAGE",
];

exports.up = async function (knex) {
  await knex.schema.createTable("media", (table) => {
    table.bigIncrements("id").primary();

    table
      .enum("provider", MEDIA_PROVIDERS)
      .notNullable()
      .defaultTo("CLOUDINARY");

    table
      .string("public_id", 255)
      .notNullable();

    table
      .string("secure_url", 2048)
      .notNullable();

    table
      .enum(
        "resource_type",
        MEDIA_RESOURCE_TYPES
      )
      .notNullable()
      .defaultTo("IMAGE");

    table
      .string("format", 32)
      .notNullable();

    table
      .bigInteger("bytes")
      .unsigned()
      .notNullable();

    table
      .integer("width")
      .unsigned()
      .nullable();

    table
      .integer("height")
      .unsigned()
      .nullable();

    table
      .string("alt_text", 255)
      .nullable();

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

    table.unique(
      ["provider", "public_id"],
      {
        indexName: "media_provider_public_id_unique",
      }
    );

    table.index(
      ["resource_type", "is_active"],
      "idx_media_resource_type_active"
    );

    table.index(
      "created_at",
      "idx_media_created_at"
    );
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("media");
};