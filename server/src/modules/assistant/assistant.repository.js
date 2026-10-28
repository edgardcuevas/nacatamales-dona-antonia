const pool = require("../../database/pool");

const {
  MAX_CONVERSATIONS_PER_USER,
} = require("./assistant.constants");

const CONVERSATION_COLUMNS = `
  id,
  title,
  created_at,
  updated_at
`;

const MESSAGE_COLUMNS = `
  id,
  role,
  content,
  provider,
  model,
  input_tokens,
  output_tokens,
  created_at
`;

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

async function insertMessage(
  executor,
  conversationId,
  message
) {
  const [result] = await executor.execute(
    `
      INSERT INTO ai_messages (
        conversation_id,
        role,
        content,
        provider,
        model,
        input_tokens,
        output_tokens
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      conversationId,
      message.role,
      message.content,
      message.provider ?? null,
      message.model ?? null,
      message.inputTokens ?? null,
      message.outputTokens ?? null,
    ]
  );

  return Number(result.insertId);
}

// La poda corre dentro de la misma transaccion que la creacion: si dos
// peticiones del mismo usuario llegan juntas, no se pisan el conteo.
// Se borran por updated_at (no por created_at) para descartar el hilo
// que lleva mas tiempo sin actividad.
async function pruneExcessConversations(
  connection,
  userId
) {
  const [rows] = await connection.execute(
    `
      SELECT id
      FROM ai_conversations
      WHERE user_id = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT 100 OFFSET ?
    `,
    [userId, MAX_CONVERSATIONS_PER_USER]
  );

  const prunedIds = rows.map((row) =>
    Number(row.id)
  );

  if (prunedIds.length === 0) {
    return [];
  }

  // Los ids son numeros ya leidos de la base; aun asi van como
  // parametros, nunca interpolados.
  const placeholders = prunedIds
    .map(() => "?")
    .join(", ");

  await connection.execute(
    `
      DELETE FROM ai_conversations
      WHERE user_id = ? AND id IN (${placeholders})
    `,
    [userId, ...prunedIds]
  );

  return prunedIds;
}

async function createConversationWithMessages({
  userId,
  title,
  userMessage,
  assistantMessage,
}) {
  return withTransaction(async (connection) => {
    const [result] = await connection.execute(
      `
        INSERT INTO ai_conversations (user_id, title)
        VALUES (?, ?)
      `,
      [userId, title ?? null]
    );

    const conversationId = Number(result.insertId);

    await insertMessage(
      connection,
      conversationId,
      userMessage
    );
    await insertMessage(
      connection,
      conversationId,
      assistantMessage
    );

    const prunedConversationIds =
      await pruneExcessConversations(
        connection,
        userId
      );

    return {
      conversationId,
      prunedConversationIds,
    };
  });
}

async function createConversationShell({
  userId,
  title,
}) {
  return withTransaction(async (connection) => {
    const [result] = await connection.execute(
      `
        INSERT INTO ai_conversations (user_id, title)
        VALUES (?, ?)
      `,
      [userId, title ?? null]
    );

    const conversationId = Number(result.insertId);
    const prunedConversationIds =
      await pruneExcessConversations(
        connection,
        userId
      );

    return {
      conversationId,
      prunedConversationIds,
    };
  });
}

// El filtro por user_id esta en el UPDATE del hilo, asi que una
// conversacion ajena no recibe mensajes ni se puede usar para escribir.
async function appendMessagesToConversation({
  conversationId,
  userId,
  userMessage,
  assistantMessage,
}) {
  return withTransaction(async (connection) => {
    const [result] = await connection.execute(
      `
        UPDATE ai_conversations
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `,
      [conversationId, userId]
    );

    if (result.affectedRows !== 1) {
      return null;
    }

    await insertMessage(
      connection,
      conversationId,
      userMessage
    );
    await insertMessage(
      connection,
      conversationId,
      assistantMessage
    );

    return { conversationId };
  });
}

async function appendActionTurnToConversation({
  conversationId,
  userId,
  userMessage,
  assistantMessage,
}) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute(
      `
        SELECT id
        FROM ai_conversations
        WHERE id = ? AND user_id = ?
        FOR UPDATE
      `,
      [conversationId, userId]
    );

    if (rows.length === 0) {
      return false;
    }

    await connection.execute(
      `
        UPDATE ai_conversations
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `,
      [conversationId, userId]
    );

    await insertMessage(
      connection,
      conversationId,
      userMessage
    );
    await insertMessage(
      connection,
      conversationId,
      assistantMessage
    );

    return true;
  });
}

async function appendAssistantMessageToConversation({
  conversationId,
  userId,
  message,
}) {
  return withTransaction(async (connection) => {
    const [result] = await connection.execute(
      `
        UPDATE ai_conversations
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `,
      [conversationId, userId]
    );

    if (result.affectedRows !== 1) {
      return false;
    }

    await insertMessage(
      connection,
      conversationId,
      message
    );

    return true;
  });
}

async function findConversationByIdForUser({
  conversationId,
  userId,
}) {
  const [rows] = await pool.execute(
    `
      SELECT ${CONVERSATION_COLUMNS}
      FROM ai_conversations
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `,
    [conversationId, userId]
  );

  return rows[0] ?? null;
}

async function listConversationsByUser({
  userId,
  limit,
}) {
  const [rows] = await pool.execute(
    `
      SELECT ${CONVERSATION_COLUMNS}
      FROM ai_conversations
      WHERE user_id = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `,
    [userId, limit]
  );

  return rows;
}

async function deleteConversationByIdForUser({
  conversationId,
  userId,
}) {
  const [result] = await pool.execute(
    `
      DELETE FROM ai_conversations
      WHERE id = ? AND user_id = ?
    `,
    [conversationId, userId]
  );

  return result.affectedRows === 1;
}

async function countMessagesByConversation(
  conversationId
) {
  const [rows] = await pool.execute(
    `
      SELECT COUNT(*) AS total_messages
      FROM ai_messages
      WHERE conversation_id = ?
    `,
    [conversationId]
  );

  return Number(
    rows[0]?.total_messages ?? 0
  );
}

async function countConversationsByUser(userId) {
  const [rows] = await pool.execute(
    `
      SELECT COUNT(*) AS total_conversations
      FROM ai_conversations
      WHERE user_id = ?
    `,
    [userId]
  );

  return Number(
    rows[0]?.total_conversations ?? 0
  );
}

// Devuelve los ultimos mensajes en orden cronologico (viejo -> nuevo),
// que es como se envia el historial al proveedor.
async function listRecentMessages({
  conversationId,
  limit,
}) {
  const [rows] = await pool.execute(
    `
      SELECT ${MESSAGE_COLUMNS}
      FROM ai_messages
      WHERE conversation_id = ?
      ORDER BY id DESC
      LIMIT ?
    `,
    [conversationId, limit]
  );

  return rows.slice().reverse();
}

  async function getUsageAggregates({ since }) {
    const [totalsRows] = await pool.execute(
      `
        SELECT
          COUNT(*) AS total_queries,
          COALESCE(
            SUM(
              CASE WHEN status = 'SUCCESS' THEN 0 ELSE 1 END
            ),
            0
          ) AS failed_queries,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens
        FROM ai_usage_events
        WHERE created_at >= ?
      `,
      [since]
    );

    const [byModelRows] = await pool.execute(
      `
        SELECT
          provider,
          model,
          COUNT(*) AS queries,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens
        FROM ai_usage_events
        WHERE created_at >= ?
        GROUP BY provider, model
        ORDER BY queries DESC, provider ASC, model ASC
      `,
      [since]
    );

    const [byDayRows] = await pool.execute(
      `
        SELECT
          DATE(created_at) AS day,
          COUNT(*) AS queries,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens
        FROM ai_usage_events
        WHERE created_at >= ?
        GROUP BY DATE(created_at)
        ORDER BY day ASC
      `,
      [since]
    );

    return {
      totals: {
        totalQueries: Number(
          totalsRows[0]?.total_queries ?? 0
        ),
        failedQueries: Number(
          totalsRows[0]?.failed_queries ?? 0
        ),
        inputTokens: Number(
          totalsRows[0]?.input_tokens ?? 0
        ),
        outputTokens: Number(
          totalsRows[0]?.output_tokens ?? 0
        ),
      },
      byModel: byModelRows.map((row) => ({
        provider: row.provider,
        model: row.model ?? null,
        queries: Number(row.queries ?? 0),
        inputTokens: Number(row.input_tokens ?? 0),
        outputTokens: Number(row.output_tokens ?? 0),
      })),
      byDay: byDayRows.map((row) => ({
        day:
          row.day instanceof Date
            ? row.day.toISOString().slice(0, 10)
            : String(row.day).slice(0, 10),
        queries: Number(row.queries ?? 0),
        inputTokens: Number(row.input_tokens ?? 0),
        outputTokens: Number(row.output_tokens ?? 0),
      })),
    };
  }

  async function insertUsageEvent({
    userId,
    conversationId,
    provider,
    model,
    status,
    errorCode,
    inputTokens,
    outputTokens,
    latencyMs,
  }) {
    const [result] = await pool.execute(
      `
        INSERT INTO ai_usage_events (
          user_id,
          conversation_id,
          provider,
          model,
          status,
          error_code,
          input_tokens,
          output_tokens,
          latency_ms
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        userId,
        conversationId ?? null,
        provider,
        model ?? null,
        status,
        errorCode ?? null,
        inputTokens ?? null,
        outputTokens ?? null,
        latencyMs ?? null,
      ]
    );

    return Number(result.insertId);
  }

module.exports = {
  createConversationWithMessages,
  createConversationShell,
  appendMessagesToConversation,
  appendActionTurnToConversation,
  appendAssistantMessageToConversation,
  findConversationByIdForUser,
  listConversationsByUser,
  deleteConversationByIdForUser,
  countMessagesByConversation,
  countConversationsByUser,
  listRecentMessages,
  insertUsageEvent,
  getUsageAggregates,
};
