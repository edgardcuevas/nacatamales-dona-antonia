const pool = require("../../database/pool");

async function getConnection() {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        channel_id,
        channel_title,
        encrypted_refresh_token,
        scopes,
        token_expires_at,
        connected_at,
        updated_at
      FROM youtube_connections
      WHERE id = 1
      LIMIT 1
    `
  );

  return rows[0] ?? null;
}

async function upsertConnection({
  channelId,
  channelTitle,
  encryptedRefreshToken,
  scopes,
  tokenExpiresAt,
}) {
  await pool.execute(
    `
      INSERT INTO youtube_connections (
        id,
        channel_id,
        channel_title,
        encrypted_refresh_token,
        scopes,
        token_expires_at,
        connected_at,
        updated_at
      )
      VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        channel_id = VALUES(channel_id),
        channel_title = VALUES(channel_title),
        encrypted_refresh_token = VALUES(encrypted_refresh_token),
        scopes = VALUES(scopes),
        token_expires_at = VALUES(token_expires_at),
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      channelId,
      channelTitle,
      encryptedRefreshToken,
      scopes,
      tokenExpiresAt,
    ]
  );

  return getConnection();
}

async function updateTokenExpiry({
  channelId,
  tokenExpiresAt,
}) {
  const [result] = await pool.execute(
    `
      UPDATE youtube_connections
      SET
        token_expires_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
        AND channel_id = ?
    `,
    [tokenExpiresAt, channelId]
  );

  return result.affectedRows === 1;
}

module.exports = {
  getConnection,
  upsertConnection,
  updateTokenExpiry,
};
