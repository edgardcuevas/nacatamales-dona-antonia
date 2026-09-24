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

async function findUserById(userId) {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        email,
        role,
        is_active,
        last_login_at,
        password_changed_at,
        created_at,
        updated_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] ?? null;
}

async function updateLastLoginAtById({
  userId,
  connection,
}) {
  if (!connection) {
    throw new Error(
      "A database connection is required to update last login"
    );
  }

  const [rows] = await connection.execute(
    `
      SELECT id
      FROM users
      WHERE id = ?
        AND is_active = 1
      LIMIT 1
      FOR UPDATE
    `,
    [userId]
  );

  if (rows.length === 0) {
    return false;
  }

  await connection.execute(
    `
      UPDATE users
      SET
        last_login_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [userId]
  );

  return true;
}

module.exports = {
  findUserByEmail,
  createUser,
  updatePasswordHashById,
  findUserById,
  updateLastLoginAtById,
};
