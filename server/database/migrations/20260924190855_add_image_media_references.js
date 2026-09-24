exports.up = async function (knex) {
  await knex.schema.alterTable("categories", (table) => {
    table
      .bigInteger("image_media_id")
      .unsigned()
      .nullable();

    table
      .foreign(
        "image_media_id",
        "fk_categories_image_media"
      )
      .references("id")
      .inTable("media")
      .onUpdate("CASCADE")
      .onDelete("SET NULL");
  });

  await knex.schema.alterTable("products", (table) => {
    table
      .bigInteger("image_media_id")
      .unsigned()
      .nullable();

    table
      .foreign(
        "image_media_id",
        "fk_products_image_media"
      )
      .references("id")
      .inTable("media")
      .onUpdate("CASCADE")
      .onDelete("SET NULL");
  });

  await knex.schema.alterTable(
    "announcements",
    (table) => {
      table
        .bigInteger("image_media_id")
        .unsigned()
        .nullable();

      table
        .foreign(
          "image_media_id",
          "fk_announcements_image_media"
        )
        .references("id")
        .inTable("media")
        .onUpdate("CASCADE")
        .onDelete("SET NULL");
    }
  );
};

exports.down = async function (knex) {
  await knex.schema.alterTable(
    "announcements",
    (table) => {
      table.dropForeign(
        "image_media_id",
        "fk_announcements_image_media"
      );

      table.dropColumn("image_media_id");
    }
  );

  await knex.schema.alterTable("products", (table) => {
    table.dropForeign(
      "image_media_id",
      "fk_products_image_media"
    );

    table.dropColumn("image_media_id");
  });

  await knex.schema.alterTable("categories", (table) => {
    table.dropForeign(
      "image_media_id",
      "fk_categories_image_media"
    );

    table.dropColumn("image_media_id");
  });
};