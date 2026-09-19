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

module.exports = {
  createSession,
};