const pool = require("../../database/pool");

async function findUserByEmail(email) {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        email,
        password_hash,
        role,
        is_active,
        last_login_at,
        password_changed_at,
        created_at,
        updated_at
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [email]
  );

  return rows[0] ?? null;
}

async function createUser({
  email,
  passwordHash,
  role,
}) {
  const [result] = await pool.execute(
    `
      INSERT INTO users (
        email,
        password_hash,
        role,
        password_changed_at
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [email, passwordHash, role]
  );

  return {
    id: result.insertId,
    email,
    role,
    isActive: true,
  };
}

async function updatePasswordHashById(
  userId,
  passwordHash
) {
  const [result] = await pool.execute(
    `
      UPDATE users
      SET
        password_hash = ?,
        password_changed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [passwordHash, userId]
  );

  return result.affectedRows === 1;
}

module.exports = {
  findUserByEmail,
  createUser,
    updatePasswordHashById,
};
