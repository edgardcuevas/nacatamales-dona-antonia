// Queries for the local DELETED transition. The executor is always a
// required parameter: this module must never reach for the shared
// pool, because the maintenance tool builds its own connection for the
// test environment and the shared pool resolves through
// src/config/env.js. Injecting the executor keeps the two paths
// provably separate.

const {
  REMOTE_DELETION_SCHEMA_COLUMNS,
} = require("./video.remote-deletion.constants");

function getSelectedColumns() {
  return `
    id,
    provider,
    external_id,
    upload_status,
    privacy_status,
    is_active,
    remote_deleted_at
  `;
}

// Only the columns the transition decides on are read. Titles, urls and
// thumbnail data are deliberately left out so no sensitive value can
// reach the tool output even by accident.
async function findVideosByIds({
  videoIds,
  executor,
}) {
  const placeholders = videoIds
    .map(() => "?")
    .join(", ");

  const [rows] = await executor.execute(
    `
      SELECT
        ${getSelectedColumns()}
      FROM videos
      WHERE id IN (${placeholders})
      ORDER BY id ASC
    `,
    [...videoIds]
  );

  return rows;
}

async function getSchemaSupport({ executor }) {
  const [rows] = await executor.execute(
    `
      SELECT
        COLUMN_NAME,
        COLUMN_TYPE,
        IS_NULLABLE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'videos'
        AND COLUMN_NAME IN (?, ?)
    `,
    [
      ...REMOTE_DELETION_SCHEMA_COLUMNS,
    ]
  );

  const byName = new Map(
    rows.map((row) => [row.COLUMN_NAME, row])
  );

  const statusColumn =
    byName.get("upload_status") ?? null;
  const remoteColumn =
    byName.get("remote_deleted_at") ?? null;

  return {
    hasRemoteDeletedAt: remoteColumn !== null,
    remoteDeletedAtNullable:
      remoteColumn?.IS_NULLABLE === "YES",
    enumAdmitsDeleted: /DELETED/i.test(
      String(statusColumn?.COLUMN_TYPE ?? "")
    ),
  };
}

// updated_at is written by hand because videos has no
// ON UPDATE CURRENT_TIMESTAMP, and the public feed cache-busting
// depends on it. Every column listed in the tool contract is left
// untouched: provider, external_id, url, privacy_status,
// thumbnail_source, thumbnail_url and created_at.
async function markRemoteDeleted({
  videoId,
  remoteDeletedAt,
  executor,
}) {
  const [result] = await executor.execute(
    `
      UPDATE videos
      SET
        upload_status = 'DELETED',
        remote_deleted_at = ?,
        is_active = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [remoteDeletedAt, videoId]
  );

  return result.affectedRows === 1;
}

// Used only to repair an already DELETED row that is still flagged
// active. The original remote_deleted_at is deliberately not part of
// this statement.
async function deactivateRemoteDeletedVideo({
  videoId,
  executor,
}) {
  const [result] = await executor.execute(
    `
      UPDATE videos
      SET
        is_active = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND upload_status = 'DELETED'
    `,
    [videoId]
  );

  return result.affectedRows === 1;
}

module.exports = {
  findVideosByIds,
  getSchemaSupport,
  markRemoteDeleted,
  deactivateRemoteDeletedVideo,
};