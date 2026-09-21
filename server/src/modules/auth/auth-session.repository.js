const pool = require("../../database/pool");

async function createSession({
  userId,
  refreshTokenHash,
  expiresAt,
}) {
  const [result] = await pool.execute(
    `
      INSERT INTO auth_sessions (
        user_id,
        refresh_token_hash,
        expires_at
      )
      VALUES (?, ?, ?)
    `,
    [
      userId,
      refreshTokenHash,
      expiresAt,
    ]
  );

  return {
    id: result.insertId,
    userId,
    refreshTokenHash,
    expiresAt,
  };
}

async function findSessionByRefreshTokenHash(
  refreshTokenHash
) {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        user_id,
        refresh_token_hash,
        expires_at,
        last_used_at,
        revoked_at,
        created_at
      FROM auth_sessions
      WHERE refresh_token_hash = ?
      LIMIT 1
    `,
    [refreshTokenHash]
  );

  return rows[0] ?? null;
}

async function rotateSession({
  currentSessionId,
  userId,
  refreshTokenHash,
  expiresAt,
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [revokeResult] = await connection.execute(
      `
        UPDATE auth_sessions
        SET
          revoked_at = CURRENT_TIMESTAMP,
          last_used_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND user_id = ?
          AND revoked_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP
      `,
      [currentSessionId, userId]
    );

    if (revokeResult.affectedRows !== 1) {
  const error = new Error(
    "The current authentication session cannot be rotated."
  );

  error.code = "AUTH_SESSION_ROTATION_CONFLICT";

  throw error;
}

    const [insertResult] = await connection.execute(
      `
        INSERT INTO auth_sessions (
          user_id,
          refresh_token_hash,
          expires_at
        )
        VALUES (?, ?, ?)
      `,
      [
        userId,
        refreshTokenHash,
        expiresAt,
      ]
    );

    await connection.commit();

    return {
      id: insertResult.insertId,
      userId,
      refreshTokenHash,
      expiresAt,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function revokeSessionByRefreshTokenHash(
  refreshTokenHash
) {
  const [result] = await pool.execute(
    `
      UPDATE auth_sessions
      SET
        revoked_at = CURRENT_TIMESTAMP,
        last_used_at = CURRENT_TIMESTAMP
      WHERE refresh_token_hash = ?
        AND revoked_at IS NULL
    `,
    [refreshTokenHash]
  );

  return result.affectedRows === 1;
}

module.exports = {
  createSession,
  findSessionByRefreshTokenHash,
  rotateSession,
  revokeSessionByRefreshTokenHash,
};