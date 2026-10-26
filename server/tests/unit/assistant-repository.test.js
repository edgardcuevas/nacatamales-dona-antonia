const test = require("node:test");
const assert = require("node:assert/strict");
const { mock, after, afterEach } = require("node:test");

process.env.NODE_ENV = "test";
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_NAME = "assistant_repository_test";
process.env.DB_USER = "test_user";
process.env.DB_PASSWORD = "test_password";
process.env.JWT_ACCESS_TOKEN_SECRET =
  "test-access-secret-with-at-least-32-characters";
process.env.JWT_ACCESS_TOKEN_TTL = "15m";
process.env.JWT_REFRESH_TOKEN_SECRET =
  "test-refresh-secret-with-at-least-32-characters";
process.env.JWT_REFRESH_TOKEN_TTL = "30d";
process.env.IMAGEKIT_PUBLIC_KEY = "test_public_key";
process.env.IMAGEKIT_PRIVATE_KEY = "test_private_key";
process.env.IMAGEKIT_URL_ENDPOINT =
  "https://ik.imagekit.io/test-imagekit-id";
process.env.IMAGEKIT_FOLDER = "test-folder";
process.env.GOOGLE_CLIENT_ID = "test_google_client_id";
process.env.GOOGLE_CLIENT_SECRET = "test_google_client_secret";
process.env.GOOGLE_REDIRECT_URI =
  "http://localhost:3000/api/youtube/oauth/callback";
process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.YOUTUBE_CHANNEL_ID = "UC1234567890123456789012";

const pool = require("../../src/database/pool");
const repository = require(
  "../../src/modules/assistant/assistant.repository"
);
const {
  MAX_CONVERSATIONS_PER_USER,
  MAX_MESSAGES_PER_CONVERSATION,
} = require(
  "../../src/modules/assistant/assistant.constants"
);
const {
  isConversationFull,
} = require(
  "../../src/modules/assistant/assistant.retention"
);

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
});

function createFakeConnection(handler) {
  const calls = [];

  const connection = {
    async beginTransaction() {
      calls.push({ kind: "begin" });
    },
    async commit() {
      calls.push({ kind: "commit" });
    },
    async rollback() {
      calls.push({ kind: "rollback" });
    },
    release() {
      calls.push({ kind: "release" });
    },
    async execute(sql, parameters) {
      calls.push({ kind: "execute", sql, parameters });
      return handler(sql, parameters);
    },
  };

  return { connection, calls };
}

function useConnection(connection) {
  mock.method(
    pool,
    "getConnection",
    async () => connection
  );
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

test("creating a conversation inserts both turns and prunes beyond the limit", async () => {
  const { connection, calls } = createFakeConnection(
    (sql) => {
      const query = normalizeSql(sql);

      if (query.includes("INSERT INTO ai_conversations")) {
        return [{ insertId: 7 }];
      }

      if (query.includes("INSERT INTO ai_messages")) {
        return [{ insertId: calls.length }];
      }

      if (query.startsWith("SELECT id FROM ai_conversations")) {
        return [[{ id: 3 }, { id: 4 }]];
      }

      if (query.startsWith("DELETE FROM ai_conversations")) {
        return [{ affectedRows: 2 }];
      }

      throw new Error(`Unexpected query: ${query}`);
    }
  );

  useConnection(connection);

  const result =
    await repository.createConversationWithMessages({
      userId: 5,
      title: "Como agrego un producto",
      userMessage: {
        role: "user",
        content: "¿Cómo agrego un producto?",
      },
      assistantMessage: {
        role: "assistant",
        content: "Desde Productos, con Nuevo producto.",
        provider: "gemini",
        model: "gemini-3.6-flash",
        inputTokens: 120,
        outputTokens: 30,
      },
    });

  assert.deepEqual(result, {
    conversationId: 7,
    prunedConversationIds: [3, 4],
  });

  assert.deepEqual(
    calls.map((call) => call.kind),
    [
      "begin",
      "execute",
      "execute",
      "execute",
      "execute",
      "execute",
      "commit",
      "release",
    ]
  );

  const conversationInsert = calls[1];
  assert.deepEqual(conversationInsert.parameters, [
    5,
    "Como agrego un producto",
  ]);

  const userMessageInsert = calls[2];
  assert.deepEqual(userMessageInsert.parameters, [
    7,
    "user",
    "¿Cómo agrego un producto?",
    null,
    null,
    null,
    null,
  ]);

  const assistantMessageInsert = calls[3];
  assert.deepEqual(assistantMessageInsert.parameters, [
    7,
    "assistant",
    "Desde Productos, con Nuevo producto.",
    "gemini",
    "gemini-3.6-flash",
    120,
    30,
  ]);

  const pruneSelect = calls[4];
  assert.match(
    normalizeSql(pruneSelect.sql),
    /ORDER BY updated_at DESC, id DESC LIMIT 100 OFFSET \?/
  );
  assert.deepEqual(pruneSelect.parameters, [
    5,
    MAX_CONVERSATIONS_PER_USER,
  ]);

  const pruneDelete = calls[5];
  assert.match(
    normalizeSql(pruneDelete.sql),
    /WHERE user_id = \? AND id IN \(\?, \?\)/
  );
  assert.deepEqual(pruneDelete.parameters, [5, 3, 4]);
});

test("the created conversation is kept when the user is still under the limit", async () => {
  const { connection, calls } = createFakeConnection(
    (sql) => {
      const query = normalizeSql(sql);

      if (query.includes("INSERT INTO ai_conversations")) {
        return [{ insertId: 1 }];
      }

      if (query.includes("INSERT INTO ai_messages")) {
        return [{ insertId: calls.length }];
      }

      if (query.startsWith("SELECT id FROM ai_conversations")) {
        return [[]];
      }

      throw new Error(`Unexpected query: ${query}`);
    }
  );

  useConnection(connection);

  const result =
    await repository.createConversationWithMessages({
      userId: 9,
      userMessage: { role: "user", content: "Hola" },
      assistantMessage: {
        role: "assistant",
        content: "Hola.",
      },
    });

  assert.deepEqual(result, {
    conversationId: 1,
    prunedConversationIds: [],
  });

  assert.equal(
    calls.some(
      (call) =>
        call.kind === "execute" &&
        normalizeSql(call.sql).startsWith(
          "DELETE FROM ai_conversations"
        )
    ),
    false
  );
});

test("appending to another user's conversation writes nothing", async () => {
  const { connection, calls } = createFakeConnection(
    () => [{ affectedRows: 0 }]
  );

  useConnection(connection);

  const result =
    await repository.appendMessagesToConversation({
      conversationId: 12,
      userId: 4,
      userMessage: { role: "user", content: "Hola" },
      assistantMessage: {
        role: "assistant",
        content: "Hola.",
      },
    });

  assert.equal(result, null);

  const update = calls.find(
    (call) => call.kind === "execute"
  );

  assert.match(
    normalizeSql(update.sql),
    /UPDATE ai_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = \? AND user_id = \?/
  );
  assert.deepEqual(update.parameters, [12, 4]);

  assert.equal(
    calls.filter((call) => call.kind === "execute")
      .length,
    1
  );
  assert.equal(
    calls.some((call) => call.kind === "commit"),
    true
  );
});

test("appending to an owned conversation touches updated_at and inserts both turns", async () => {
  const { connection, calls } = createFakeConnection(
    (sql) => {
      const query = normalizeSql(sql);

      if (query.startsWith("UPDATE ai_conversations")) {
        return [{ affectedRows: 1 }];
      }

      if (query.includes("INSERT INTO ai_messages")) {
        return [{ insertId: 20 }];
      }

      throw new Error(`Unexpected query: ${query}`);
    }
  );

  useConnection(connection);

  const result =
    await repository.appendMessagesToConversation({
      conversationId: 12,
      userId: 4,
      userMessage: { role: "user", content: "¿Y los videos?" },
      assistantMessage: {
        role: "assistant",
        content: "Desde Videos.",
        provider: "gemini",
        model: "gemini-3.6-flash",
        inputTokens: 90,
        outputTokens: 12,
      },
    });

  assert.deepEqual(result, { conversationId: 12 });
  assert.equal(
    calls.filter(
      (call) =>
        call.kind === "execute" &&
        normalizeSql(call.sql).includes(
          "INSERT INTO ai_messages"
        )
    ).length,
    2
  );
  assert.equal(
    calls.some((call) => call.kind === "rollback"),
    false
  );
  assert.equal(
    calls.some((call) => call.kind === "release"),
    true
  );
});

test("a failed insert rolls back and still releases the connection", async () => {
  const { connection, calls } = createFakeConnection(
    (sql) => {
      const query = normalizeSql(sql);

      if (query.includes("INSERT INTO ai_conversations")) {
        return [{ insertId: 1 }];
      }

      throw new Error("insert exploded");
    }
  );

  useConnection(connection);

  await assert.rejects(
    repository.createConversationWithMessages({
      userId: 1,
      userMessage: { role: "user", content: "Hola" },
      assistantMessage: {
        role: "assistant",
        content: "Hola.",
      },
    }),
    /insert exploded/
  );

  assert.equal(
    calls.some((call) => call.kind === "rollback"),
    true
  );
  assert.equal(
    calls.some((call) => call.kind === "commit"),
    false
  );
  assert.equal(
    calls.some((call) => call.kind === "release"),
    true
  );
});

test("reading the history is scoped to the owner and returns oldest first", async () => {
  const captured = [];

  mock.method(
    pool,
    "execute",
    async (sql, parameters) => {
      captured.push({ sql: normalizeSql(sql), parameters });

      return [
        [
          { id: 30, role: "assistant", content: "B" },
          { id: 29, role: "user", content: "A" },
        ],
      ];
    }
  );

  const messages = await repository.listRecentMessages(
    { conversationId: 8, limit: 10 }
  );

  assert.deepEqual(
    messages.map((message) => message.id),
    [29, 30]
  );

  assert.match(
    captured[0].sql,
    /FROM ai_messages WHERE conversation_id = \? ORDER BY id DESC LIMIT \?/
  );
  assert.deepEqual(captured[0].parameters, [8, 10]);
});

test("conversation access always filters by user_id", async () => {
  const captured = [];

  mock.method(
    pool,
    "execute",
    async (sql, parameters) => {
      captured.push({ sql: normalizeSql(sql), parameters });

      if (normalizeSql(sql).startsWith("DELETE")) {
        return [{ affectedRows: 1 }];
      }

      if (normalizeSql(sql).includes("COUNT(*)")) {
        return [[{ total_messages: 4, total_conversations: 2 }]];
      }

      return [[{ id: parameters[0], title: null }]];
    }
  );

  const found = await repository.findConversationByIdForUser(
    { conversationId: 8, userId: 3 }
  );
  const list = await repository.listConversationsByUser(
    { userId: 3, limit: 20 }
  );
  const removed = await repository.deleteConversationByIdForUser(
    { conversationId: 8, userId: 3 }
  );
  const messages =
    await repository.countMessagesByConversation(8);
  const conversations =
    await repository.countConversationsByUser(3);

  assert.deepEqual(found, { id: 8, title: null });
  assert.equal(list.length, 1);
  assert.equal(removed, true);
  assert.equal(messages, 4);
  assert.equal(conversations, 2);

  const byOwnership = captured.slice(0, 3);

  for (const query of byOwnership) {
    assert.match(query.sql, /user_id = \?/);
    assert.equal(
      query.parameters.includes(3),
      true
    );
  }

  assert.match(
    captured[1].sql,
    /ORDER BY updated_at DESC, id DESC LIMIT \?/
  );
  assert.deepEqual(captured[1].parameters, [3, 20]);
});

test("a conversation is full on the 101st message, not the 100th", () => {
  assert.equal(
    isConversationFull(MAX_MESSAGES_PER_CONVERSATION - 1),
    false
  );
  assert.equal(
    isConversationFull(MAX_MESSAGES_PER_CONVERSATION),
    true
  );
  assert.equal(
    isConversationFull(MAX_MESSAGES_PER_CONVERSATION + 1),
    true
  );
  assert.equal(isConversationFull(0), false);
});

test("a conversation owned by someone else is reported as missing", async () => {
  mock.method(
    pool,
    "execute",
    async () => [[]]
  );

  const found = await repository.findConversationByIdForUser(
    { conversationId: 88, userId: 3 }
  );

  assert.equal(found, null);

  mock.restoreAll();

  mock.method(
    pool,
    "execute",
    async () => [{ affectedRows: 0 }]
  );

  const removed =
    await repository.deleteConversationByIdForUser({
      conversationId: 88,
      userId: 3,
    });

  assert.equal(removed, false);
});
