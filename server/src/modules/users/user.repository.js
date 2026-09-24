const pool = require("../../database/pool");

const {
  USER_ROLES,
  USER_SORT_FIELDS,
  USER_SORT_ORDERS,
} = require("./user.constants");

function getExecutor(connection) {
  return connection ?? pool;
}

function buildUserListWhere({
  role,
  isActive,
  email,
}) {
  const conditions = [];
  const parameters = [];

  if (role !== undefined) {
    conditions.push("role = ?");
    parameters.push(role);
  }

  if (isActive !== undefined) {
    conditions.push("is_active = ?");
    parameters.push(isActive ? 1 : 0);
  }

  if (email !== undefined) {
    conditions.push("email LIKE ?");
    parameters.push(`%${email}%`);
  }

  return {
    whereSql:
      conditions.length === 0
        ? ""
        : `WHERE ${conditions.join(" AND ")}`,
    parameters,
  };
}

function getUserListOrder({
  sortBy,
  sortOrder,
}) {
  const orderColumn = USER_SORT_FIELDS[sortBy];
  const orderDirection = USER_SORT_ORDERS[sortOrder];

  if (
    !Object.hasOwn(USER_SORT_FIELDS, sortBy) ||
    !Object.hasOwn(USER_SORT_ORDERS, sortOrder)
  ) {
    throw new Error("Invalid user sort configuration");
  }

  return `${orderColumn} ${orderDirection}`;
}

async function listUsers({
  page = 1,
  limit = 20,
  role,
  isActive,
  email,
  sortBy = "createdAt",
  sortOrder = "desc",
}) {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1
  ) {
    throw new Error("Invalid user pagination");
  }

  const { whereSql, parameters } =
    buildUserListWhere({
      role,
      isActive,
      email,
    });
  const orderSql = getUserListOrder({
    sortBy,
    sortOrder,
  });
  const offset = (page - 1) * limit;
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
      ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ? OFFSET ?
    `,
    [
      ...parameters,
      limit,
      offset,
    ]
  );
  const [countRows] = await pool.execute(
    `
      SELECT COUNT(*) AS total_items
      FROM users
      ${whereSql}
    `,
    parameters
  );

  return {
    users: rows,
    totalItems: Number(countRows[0]?.total_items ?? 0),
  };
}

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
  passwordHash,
  connection
) {
  const executor = getExecutor(connection);
  const [result] = await executor.execute(
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

async function findUserById(
  userId,
  connection
) {
  const executor = getExecutor(connection);
  const [rows] = await executor.execute(
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

async function findUserByIdForUpdate(
  userId,
  connection
) {
  if (!connection) {
    throw new Error(
      "A database connection is required to lock a user"
    );
  }

  const [rows] = await connection.execute(
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
      FOR UPDATE
    `,
    [userId]
  );

  return rows[0] ?? null;
}

async function findActiveAdminIdsExcludingUserId({
  userId,
  connection,
}) {
  if (!connection) {
    throw new Error(
      "A database connection is required to check active admins"
    );
  }

  const [rows] = await connection.execute(
    `
      SELECT id
      FROM users
      WHERE role = ?
        AND is_active = 1
        AND id <> ?
      FOR UPDATE
    `,
    [USER_ROLES.ADMIN, userId]
  );

  return rows.map((row) => Number(row.id));
}

async function updateRoleById({
  userId,
  role,
  connection,
}) {
  if (!connection) {
    throw new Error(
      "A database connection is required to update a role"
    );
  }

  const [result] = await connection.execute(
    `
      UPDATE users
      SET
        role = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [role, userId]
  );

  return result.affectedRows === 1;
}

async function updateStatusById({
  userId,
  isActive,
  connection,
}) {
  if (!connection) {
    throw new Error(
      "A database connection is required to update a status"
    );
  }

  const [result] = await connection.execute(
    `
      UPDATE users
      SET
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [isActive ? 1 : 0, userId]
  );

  return result.affectedRows === 1;
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
  listUsers,
  findUserByEmail,
  createUser,
  updatePasswordHashById,
  findUserById,
  findUserByIdForUpdate,
  findActiveAdminIdsExcludingUserId,
  updateRoleById,
  updateStatusById,
  updateLastLoginAtById,
};
