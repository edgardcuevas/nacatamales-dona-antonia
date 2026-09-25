const pool = require("../../database/pool");

async function createOAuthState({
  stateHash,
  adminUserId,
  expiresAt,
}) {
  await pool.execute(
    `
      INSERT INTO youtube_oauth_states (
        state_hash,
        admin_user_id,
        expires_at
      )
      VALUES (?, ?, ?)
    `,
    [stateHash, adminUserId, expiresAt]
  );
}

async function consumeOAuthState({
  stateHash,
}) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [rows] =
      await connection.execute(
        `
          SELECT
            id,
            expires_at,
            consumed_at
          FROM youtube_oauth_states
          WHERE state_hash = ?
          LIMIT 1
          FOR UPDATE
        `,
        [stateHash]
      );
    const state = rows[0];

    if (!state) {
      await connection.rollback();
      return {
        accepted: false,
        reason: "missing",
      };
    }

    if (state.consumed_at !== null) {
      await connection.rollback();
      return {
        accepted: false,
        reason: "consumed",
      };
    }

    const expiresAt = new Date(
      state.expires_at
    ).getTime();
    if (
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    ) {
      await connection.rollback();
      return {
        accepted: false,
        reason: "expired",
      };
    }

    const [updateResult] =
      await connection.execute(
        `
          UPDATE youtube_oauth_states
          SET consumed_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND consumed_at IS NULL
        `,
        [state.id]
      );
    if (updateResult.affectedRows !== 1) {
      throw new Error(
        "OAuth state could not be consumed"
      );
    }
    await connection.commit();

    return {
      accepted: true,
      reason: null,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original database error.
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createOAuthState,
  consumeOAuthState,
};
