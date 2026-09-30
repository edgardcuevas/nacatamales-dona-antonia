const VIDEO_THUMBNAIL_SOURCES = [
  "YOUTUBE_DEFAULT",
  "CUSTOM",
];

exports.up = async function (knex) {
  await knex.schema.alterTable("videos", (table) => {
    table
      .enum("thumbnail_source", VIDEO_THUMBNAIL_SOURCES)
      .notNullable()
      .defaultTo("YOUTUBE_DEFAULT");
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("videos", (table) => {
    table.dropColumn("thumbnail_source");
  });
};
