exports.up = async function (knex) {
  await knex.schema.createTable(
    "youtube_connections",
    (table) => {
      table
        .integer("id")
        .unsigned()
        .primary();

      table
        .string("channel_id", 64)
        .notNullable()
        .unique();

      table
        .string("channel_title", 150)
        .nullable();

      table
        .text("encrypted_refresh_token")
        .notNullable();

      table
        .text("scopes")
        .notNullable();

      table
        .timestamp("token_expires_at")
        .nullable();

      table
        .timestamp("connected_at")
        .notNullable()
        .defaultTo(knex.fn.now());

      table
        .timestamp("updated_at")
        .notNullable()
        .defaultTo(knex.fn.now());

      table
        .unique(["id"], {
          indexName: "youtube_connections_singleton_unique",
        });
    }
  );

  await knex.schema.alterTable(
    "videos",
    (table) => {
      table
        .enum("upload_status", [
          "PENDING",
          "UPLOADING",
          "PROCESSING",
          "READY",
          "FAILED",
        ])
        .notNullable()
        .defaultTo("READY");

      table
        .enum("privacy_status", [
          "PRIVATE",
          "UNLISTED",
          "PUBLIC",
        ])
        .notNullable()
        .defaultTo("UNLISTED");
    }
  );
};

exports.down = async function (knex) {
  await knex.schema.alterTable(
    "videos",
    (table) => {
      table.dropColumn("privacy_status");
      table.dropColumn("upload_status");
    }
  );

  await knex.schema.dropTableIfExists(
    "youtube_connections"
  );
};
