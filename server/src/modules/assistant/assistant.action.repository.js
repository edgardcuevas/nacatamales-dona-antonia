const { createHash } = require("node:crypto");

const pool = require("../../database/pool");
const {
  MAX_PENDING_ACTIONS_PER_USER,
  PENDING_ACTION_EXPIRY_MINUTES,
  STALE_ACTION_EXECUTION_SECONDS,
} = require("./assistant.action.constants");

const ACTION_COLUMNS = `
  id,
  user_id,
  conversation_id,
  tool_name,
  target_type,
  target_id,
  target_label,
  arguments_json,
  before_json,
  summary,
  status,
  result_json,
  error_code,
  expires_at,
  started_at,
  finished_at,
  created_at,
  updated_at
`;

function hashActionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function serializeJson(value, fieldName) {
  const json = JSON.stringify(value);

  if (json === undefined) {
    throw new TypeError(`${fieldName} must be JSON serializable`);
  }

  return json;
}

function parseJson(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? JSON.parse(value) : value;
}

function mapActionRow(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    conversationId:
      row.conversation_id === null ||
      row.conversation_id === undefined
        ? null
        : Number(row.conversation_id),
    toolName: row.tool_name,
    targetType: row.target_type,
    targetId: Number(row.target_id),
    targetLabel: row.target_label,
    arguments: parseJson(row.arguments_json),
    before: parseJson(row.before_json),
    summary: row.summary,
    status: row.status,
    result: parseJson(row.result_json),
    errorCode: row.error_code ?? null,
    expiresAt: row.expires_at,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function withTransaction(work) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function selectActionByHash(connection, tokenHash, userId) {
  const [rows] = await connection.execute(
    `
      SELECT ${ACTION_COLUMNS}
      FROM ai_pending_actions
      WHERE public_token_hash = ? AND user_id = ?
      LIMIT 1
    `,
    [tokenHash, userId]
  );

  return rows[0] ? mapActionRow(rows[0]) : null;
}

async function createPendingAction({
  token,
  userId,
  conversationId,
  toolName,
  targetType,
  targetId,
  targetLabel,
  arguments: actionArguments,
  before,
  summary,
}) {
  const tokenHash = hashActionToken(token);
  const argumentsJson = serializeJson(
    actionArguments,
    "arguments"
  );
  const beforeJson = serializeJson(before, "before");

  return withTransaction(async (connection) => {
    const [users] = await connection.execute(
      `
        SELECT id
        FROM users
        WHERE id = ?
        FOR UPDATE
      `,
      [userId]
    );

    if (users.length === 0) {
      return { status: "USER_NOT_FOUND" };
    }

    if (conversationId !== null && conversationId !== undefined) {
      const [conversations] = await connection.execute(
        `
          SELECT id
          FROM ai_conversations
          WHERE id = ? AND user_id = ?
          FOR UPDATE
        `,
        [conversationId, userId]
      );

      if (conversations.length === 0) {
        return { status: "CONVERSATION_NOT_FOUND" };
      }
    }

    await connection.execute(
      `
        UPDATE ai_pending_actions
        SET
          status = 'EXPIRED',
          finished_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND status = 'PENDING'
          AND expires_at <= CURRENT_TIMESTAMP
      `,
      [userId]
    );

    const [countRows] = await connection.execute(
      `
        SELECT COUNT(*) AS pending_count
        FROM ai_pending_actions
        WHERE user_id = ? AND status = 'PENDING'
      `,
      [userId]
    );

    if (
      Number(countRows[0]?.pending_count ?? 0) >=
      MAX_PENDING_ACTIONS_PER_USER
    ) {
      return { status: "PENDING_LIMIT" };
    }

    const [result] = await connection.execute(
      `
        INSERT INTO ai_pending_actions (
          public_token_hash,
          user_id,
          conversation_id,
          tool_name,
          target_type,
          target_id,
          target_label,
          arguments_json,
          before_json,
          summary,
          expires_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${PENDING_ACTION_EXPIRY_MINUTES} MINUTE)
        )
      `,
      [
        tokenHash,
        userId,
        conversationId ?? null,
        toolName,
        targetType,
        targetId,
        targetLabel,
        argumentsJson,
        beforeJson,
        summary,
      ]
    );

    const [actionRows] = await connection.execute(
      `
        SELECT expires_at
        FROM ai_pending_actions
        WHERE id = ? AND user_id = ?
        LIMIT 1
      `,
      [result.insertId, userId]
    );

    if (!actionRows[0]) {
      throw new Error(
        "Created assistant action could not be read"
      );
    }

    return {
      status: "CREATED",
      actionId: Number(result.insertId),
      expiresAt: actionRows[0].expires_at,
    };
  });
}

async function findActionByTokenForUser({ token, userId }) {
  const tokenHash = hashActionToken(token);
  return selectActionByHash(pool, tokenHash, userId);
}

async function claimPendingAction({ token, userId }) {
  const tokenHash = hashActionToken(token);

  return withTransaction(async (connection) => {
    await connection.execute(
      `
        UPDATE ai_pending_actions
        SET
          status = 'FAILED',
          error_code = 'ASSISTANT_ACTION_UNKNOWN',
          finished_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE public_token_hash = ?
          AND user_id = ?
          AND status = 'EXECUTING'
          AND started_at <= DATE_SUB(
            CURRENT_TIMESTAMP,
            INTERVAL ${STALE_ACTION_EXECUTION_SECONDS} SECOND
          )
      `,
      [tokenHash, userId]
    );

    await connection.execute(
      `
        UPDATE ai_pending_actions
        SET
          status = 'EXPIRED',
          finished_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE public_token_hash = ?
          AND user_id = ?
          AND status = 'PENDING'
          AND expires_at <= CURRENT_TIMESTAMP
      `,
      [tokenHash, userId]
    );

    const [result] = await connection.execute(
      `
        UPDATE ai_pending_actions
        SET
          status = 'EXECUTING',
          started_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE public_token_hash = ?
          AND user_id = ?
          AND status = 'PENDING'
          AND expires_at > CURRENT_TIMESTAMP
      `,
      [tokenHash, userId]
    );

    const action = await selectActionByHash(
      connection,
      tokenHash,
      userId
    );

    return {
      claimed: result.affectedRows === 1,
      action,
    };
  });
}

async function cancelPendingAction({ token, userId }) {
  const tokenHash = hashActionToken(token);

  return withTransaction(async (connection) => {
    await connection.execute(
      `
        UPDATE ai_pending_actions
        SET
          status = 'EXPIRED',
          finished_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE public_token_hash = ?
          AND user_id = ?
          AND status = 'PENDING'
          AND expires_at <= CURRENT_TIMESTAMP
      `,
      [tokenHash, userId]
    );

    const [result] = await connection.execute(
      `
        UPDATE ai_pending_actions
        SET
          status = 'CANCELLED',
          finished_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE public_token_hash = ?
          AND user_id = ?
          AND status = 'PENDING'
          AND expires_at > CURRENT_TIMESTAMP
      `,
      [tokenHash, userId]
    );

    const action = await selectActionByHash(
      connection,
      tokenHash,
      userId
    );

    return {
      cancelled: result.affectedRows === 1,
      action,
    };
  });
}

async function markActionExecuted({
  actionId,
  userId,
  result,
}) {
  const [update] = await pool.execute(
    `
      UPDATE ai_pending_actions
      SET
        status = 'EXECUTED',
        result_json = ?,
        error_code = NULL,
        finished_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND status = 'EXECUTING'
    `,
    [serializeJson(result, "result"), actionId, userId]
  );

  return update.affectedRows === 1;
}

async function markActionFailed({
  actionId,
  userId,
  errorCode,
}) {
  const [update] = await pool.execute(
    `
      UPDATE ai_pending_actions
      SET
        status = 'FAILED',
        error_code = ?,
        finished_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND status = 'EXECUTING'
    `,
    [errorCode, actionId, userId]
  );

  return update.affectedRows === 1;
}

module.exports = {
  createPendingAction,
  findActionByTokenForUser,
  claimPendingAction,
  cancelPendingAction,
  markActionExecuted,
  markActionFailed,
};
