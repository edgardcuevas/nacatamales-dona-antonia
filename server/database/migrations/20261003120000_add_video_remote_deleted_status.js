const VIDEO_UPLOAD_STATUSES = [
  "PENDING",
  "UPLOADING",
  "PROCESSING",
  "READY",
  "FAILED",
  "DELETED",
];

const PREVIOUS_VIDEO_UPLOAD_STATUSES = [
  "PENDING",
  "UPLOADING",
  "PROCESSING",
  "READY",
  "FAILED",
];

exports.up = async function (knex) {
  await knex.schema.alterTable("videos", (table) => {
    table
      .enum("upload_status", VIDEO_UPLOAD_STATUSES)
      .notNullable()
      .defaultTo("READY")
      .alter();

    table.dateTime("remote_deleted_at").nullable();
  });
};

exports.down = async function (knex) {
  // The previous enum cannot represent DELETED, so preserve terminality on rollback.
  await knex("videos")
    .where({ upload_status: "DELETED" })
    .update({ upload_status: "FAILED" });

  await knex.schema.alterTable("videos", (table) => {
    table
      .enum(
        "upload_status",
        PREVIOUS_VIDEO_UPLOAD_STATUSES
      )
      .notNullable()
      .defaultTo("READY")
      .alter();

    table.dropColumn("remote_deleted_at");
  });
};