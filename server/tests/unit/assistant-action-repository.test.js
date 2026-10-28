const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mock, after, afterEach } = require("node:test");

process.env.NODE_ENV = "test";
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_NAME = "assistant_action_repository_test";
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
  "../../src/modules/assistant/assistant.action.repository"
);
const {
  MAX_PENDING_ACTIONS_PER_USER,
  PENDING_ACTION_EXPIRY_MINUTES,
  STALE_ACTION_EXECUTION_SECONDS,
} = require(
  "../../src/modules/assistant/assistant.action.constants"
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
  mock.method(pool, "getConnection", async () => connection);
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function createActionRow(overrides = {}) {
  return {
    id: 17,
    user_id: 7,
    conversation_id: 4,
    tool_name: "set_product_availability",
    target_type: "product",
    target_id: 12,
    target_label: "Nacatamal de pollo",
    arguments_json: '{"isAvailable":false}',
    before_json: '{"isAvailable":true,"updatedAt":"2026-10-27T12:00:00.000Z"}',
    summary: "Marcar «Nacatamal de pollo» como no disponible",
    status: "PENDING",
    result_json: null,
    error_code: null,
    expires_at: new Date("2026-10-27T12:10:00.000Z"),
    started_at: null,
    finished_at: null,
    created_at: new Date("2026-10-27T12:00:00.000Z"),
    updated_at: new Date("2026-10-27T12:00:00.000Z"),
    ...overrides,
  };
}

function expectedAction(overrides = {}) {
  return {
    id: 17,
    userId: 7,
    conversationId: 4,
    toolName: "set_product_availability",
    targetType: "product",
    targetId: 12,
    targetLabel: "Nacatamal de pollo",
    arguments: { isAvailable: false },
    before: {
      isAvailable: true,
      updatedAt: "2026-10-27T12:00:00.000Z",
    },
    summary: "Marcar «Nacatamal de pollo» como no disponible",
    status: "PENDING",
    result: null,
    errorCode: null,
    expiresAt: new Date("2026-10-27T12:10:00.000Z"),
    startedAt: null,
    finishedAt: null,
    createdAt: new Date("2026-10-27T12:00:00.000Z"),
    updatedAt: new Date("2026-10-27T12:00:00.000Z"),
    ...overrides,
  };
}

test("creation hashes the token and enforces per-user ownership and quota", async () => {
  const expiresAt = new Date("2026-10-27T12:10:00.000Z");
  const { connection, calls } = createFakeConnection((sql) => {
    const query = normalizeSql(sql);

    if (query.startsWith("SELECT id FROM users")) {
      return [[{ id: 7 }]];
    }

    if (query.startsWith("SELECT id FROM ai_conversations")) {
      return [[{ id: 4 }]];
    }

    if (query.startsWith("UPDATE ai_pending_actions")) {
      return [{ affectedRows: 0 }];
    }

    if (query.includes("COUNT(*) AS pending_count")) {
      return [[{ pending_count: 2 }]];
    }

    if (query.startsWith("INSERT INTO ai_pending_actions")) {
      return [{ insertId: 17 }];
    }

    if (query.startsWith("SELECT expires_at")) {
      return [[{ expires_at: expiresAt }]];
    }

    throw new Error(`Unexpected query: ${query}`);
  });

  useConnection(connection);

  const token = "secret-action-token";
  const result = await repository.createPendingAction({
    token,
    userId: 7,
    conversationId: 4,
    toolName: "set_product_availability",
    targetType: "product",
    targetId: 12,
    targetLabel: "Nacatamal de pollo",
    arguments: { isAvailable: false },
    before: { isAvailable: true },
    summary: "Marcar «Nacatamal de pollo» como no disponible",
  });

  assert.deepEqual(result, {
    status: "CREATED",
    actionId: 17,
    expiresAt,
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
      "execute",
      "commit",
      "release",
    ]
  );

  const lockUser = calls[1];
  assert.match(normalizeSql(lockUser.sql), /FROM users WHERE id = \? FOR UPDATE/);
  assert.deepEqual(lockUser.parameters, [7]);

  const lockConversation = calls[2];
  assert.match(
    normalizeSql(lockConversation.sql),
    /FROM ai_conversations WHERE id = \? AND user_id = \? FOR UPDATE/
  );
  assert.deepEqual(lockConversation.parameters, [4, 7]);

  const insert = calls[5];
  assert.match(normalizeSql(insert.sql), /DATE_ADD\(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE\)/);
  assert.deepEqual(insert.parameters, [
    createHash("sha256").update(token).digest("hex"),
    7,
    4,
    "set_product_availability",
    "product",
    12,
    "Nacatamal de pollo",
    '{"isAvailable":false}',
    '{"isAvailable":true}',
    "Marcar «Nacatamal de pollo» como no disponible",
  ]);
  assert.equal(insert.parameters.includes(token), false);
  assert.equal(PENDING_ACTION_EXPIRY_MINUTES, 10);
});

test("creation expires stale proposals before enforcing the pending limit", async () => {
  const { connection, calls } = createFakeConnection((sql) => {
    const query = normalizeSql(sql);

    if (query.startsWith("SELECT id FROM users")) {
      return [[{ id: 7 }]];
    }

    if (query.startsWith("UPDATE ai_pending_actions")) {
      return [{ affectedRows: 3 }];
    }

    if (query.includes("COUNT(*) AS pending_count")) {
      return [[{ pending_count: MAX_PENDING_ACTIONS_PER_USER }]];
    }

    throw new Error(`Unexpected query: ${query}`);
  });

  useConnection(connection);

  const result = await repository.createPendingAction({
    token: "secret-action-token",
    userId: 7,
    toolName: "set_product_availability",
    targetType: "product",
    targetId: 12,
    targetLabel: "Nacatamal de pollo",
    arguments: { isAvailable: false },
    before: { isAvailable: true },
    summary: "Actualizar disponibilidad",
  });

  assert.deepEqual(result, { status: "PENDING_LIMIT" });
  assert.equal(
    normalizeSql(calls[2].sql),
    "UPDATE ai_pending_actions SET status = 'EXPIRED', finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND status = 'PENDING' AND expires_at <= CURRENT_TIMESTAMP"
  );
  assert.deepEqual(calls[2].parameters, [7]);
  assert.equal(
    calls.some(
      (call) =>
        call.kind === "execute" &&
        normalizeSql(call.sql).startsWith(
          "INSERT INTO ai_pending_actions"
        )
    ),
    false
  );
});

test("creation does not proceed for a missing user or another user's conversation", async (t) => {
  await t.test("missing user", async () => {
    const { connection, calls } = createFakeConnection(() => [[]]);
    useConnection(connection);

    const result = await repository.createPendingAction({
      token: "secret-action-token",
      userId: 7,
      toolName: "set_product_availability",
      targetType: "product",
      targetId: 12,
      targetLabel: "Nacatamal de pollo",
      arguments: { isAvailable: false },
      before: { isAvailable: true },
      summary: "Actualizar disponibilidad",
    });

    assert.deepEqual(result, { status: "USER_NOT_FOUND" });
    assert.equal(
      calls.filter((call) => call.kind === "execute").length,
      1
    );
  });

  await t.test("conversation owned by another user", async () => {
    const { connection, calls } = createFakeConnection((sql) => {
      if (normalizeSql(sql).startsWith("SELECT id FROM users")) {
        return [[{ id: 7 }]];
      }

      return [[]];
    });
    useConnection(connection);

    const result = await repository.createPendingAction({
      token: "secret-action-token",
      userId: 7,
      conversationId: 4,
      toolName: "set_product_availability",
      targetType: "product",
      targetId: 12,
      targetLabel: "Nacatamal de pollo",
      arguments: { isAvailable: false },
      before: { isAvailable: true },
      summary: "Actualizar disponibilidad",
    });

    assert.deepEqual(result, {
      status: "CONVERSATION_NOT_FOUND",
    });
    assert.equal(
      calls.filter((call) => call.kind === "execute").length,
      2
    );
  });
});

test("finding an action hashes its token, filters by owner, and maps stored JSON", async () => {
  const captured = [];
  mock.method(pool, "execute", async (sql, parameters) => {
    captured.push({ sql: normalizeSql(sql), parameters });
    return [[createActionRow()]];
  });

  const result = await repository.findActionByTokenForUser({
    token: "secret-action-token",
    userId: 7,
  });

  assert.deepEqual(result, expectedAction());
  assert.match(
    captured[0].sql,
    /WHERE public_token_hash = \? AND user_id = \? LIMIT 1/
  );
  assert.deepEqual(captured[0].parameters, [
    createHash("sha256").update("secret-action-token").digest("hex"),
    7,
  ]);
});

test("claim moves a pending action to executing atomically", async () => {
  const queries = [];
  const { connection, calls } = createFakeConnection((sql) => {
    const query = normalizeSql(sql);
    queries.push(query);

    if (query.startsWith("UPDATE ai_pending_actions")) {
      return [{ affectedRows: query.includes("status = 'EXECUTING'") ? 1 : 0 }];
    }

    if (query.startsWith("SELECT")) {
      return [[
        createActionRow({
          status: "EXECUTING",
          started_at: new Date("2026-10-27T12:00:00.000Z"),
          updated_at: new Date("2026-10-27T12:00:00.000Z"),
        }),
      ]];
    }

    throw new Error(`Unexpected query: ${query}`);
  });

  useConnection(connection);
  const result = await repository.claimPendingAction({
    token: "secret-action-token",
    userId: 7,
  });

  assert.equal(result.claimed, true);
  assert.equal(result.action.status, "EXECUTING");
  assert.equal(result.action.startedAt.toISOString(), "2026-10-27T12:00:00.000Z");
  assert.match(queries[2], /status = 'PENDING' AND expires_at > CURRENT_TIMESTAMP/);
  assert.match(queries[2], /status = 'EXECUTING'/);
  assert.equal(calls.some((call) => call.kind === "commit"), true);
});

test("claim expires overdue actions and does not expose a token owned by another user", async (t) => {
  await t.test("expired pending action", async () => {
    let updatedExpired = false;
    const { connection } = createFakeConnection((sql) => {
      const query = normalizeSql(sql);

      if (query.startsWith("UPDATE ai_pending_actions")) {
        if (query.includes("status = 'EXPIRED'")) {
          updatedExpired = true;
          return [{ affectedRows: 1 }];
        }

        return [{ affectedRows: 0 }];
      }

      if (query.startsWith("SELECT")) {
        return [[
          createActionRow({
            status: "EXPIRED",
            finished_at: new Date("2026-10-27T12:11:00.000Z"),
          }),
        ]];
      }

      throw new Error(`Unexpected query: ${query}`);
    });
    useConnection(connection);

    const result = await repository.claimPendingAction({
      token: "secret-action-token",
      userId: 7,
    });

    assert.equal(updatedExpired, true);
    assert.equal(result.claimed, false);
    assert.equal(result.action.status, "EXPIRED");
  });

  await t.test("unknown or foreign token", async () => {
    const { connection } = createFakeConnection((sql) => {
      if (normalizeSql(sql).startsWith("UPDATE ai_pending_actions")) {
        return [{ affectedRows: 0 }];
      }

      return [[]];
    });
    useConnection(connection);

    const result = await repository.claimPendingAction({
      token: "secret-action-token",
      userId: 99,
    });

    assert.deepEqual(result, { claimed: false, action: null });
  });
});

test("a stale execution is marked unknown and is never reclaimed", async () => {
  const queries = [];
  const { connection } = createFakeConnection((sql) => {
    const query = normalizeSql(sql);
    queries.push(query);

    if (query.startsWith("UPDATE ai_pending_actions")) {
      return [{
        affectedRows: query.includes("status = 'FAILED'") ? 1 : 0,
      }];
    }

    if (query.startsWith("SELECT")) {
      return [[
        createActionRow({
          status: "FAILED",
          error_code: "ASSISTANT_ACTION_UNKNOWN",
        }),
      ]];
    }

    throw new Error(`Unexpected query: ${query}`);
  });
  useConnection(connection);

  const result = await repository.claimPendingAction({
    token: "secret-action-token",
    userId: 7,
  });

  assert.equal(result.claimed, false);
  assert.equal(result.action.status, "FAILED");
  assert.equal(result.action.errorCode, "ASSISTANT_ACTION_UNKNOWN");
  assert.match(queries[0], /status = 'EXECUTING'/);
  assert.match(queries[0], /started_at <= DATE_SUB/);
  assert.match(
    queries[0],
    new RegExp(`INTERVAL ${STALE_ACTION_EXECUTION_SECONDS} SECOND`)
  );
});

test("cancellation is owner-scoped and idempotent", async (t) => {
  await t.test("cancels a pending action", async () => {
    const { connection, calls } = createFakeConnection((sql) => {
      const query = normalizeSql(sql);

      if (query.startsWith("UPDATE ai_pending_actions")) {
        return [{
          affectedRows: query.includes("status = 'CANCELLED'") ? 1 : 0,
        }];
      }

      if (query.startsWith("SELECT")) {
        return [[createActionRow({ status: "CANCELLED" })]];
      }

      throw new Error(`Unexpected query: ${query}`);
    });
    useConnection(connection);

    const result = await repository.cancelPendingAction({
      token: "secret-action-token",
      userId: 7,
    });

    assert.equal(result.cancelled, true);
    assert.equal(result.action.status, "CANCELLED");
    const cancelQuery = calls[2];
    assert.match(
      normalizeSql(cancelQuery.sql),
      /WHERE public_token_hash = \? AND user_id = \? AND status = 'PENDING' AND expires_at > CURRENT_TIMESTAMP/
    );
  });

  await t.test("repeated cancellation leaves terminal action unchanged", async () => {
    const { connection } = createFakeConnection((sql) => {
      if (normalizeSql(sql).startsWith("UPDATE ai_pending_actions")) {
        return [{ affectedRows: 0 }];
      }

      return [[createActionRow({ status: "CANCELLED" })]];
    });
    useConnection(connection);

    const result = await repository.cancelPendingAction({
      token: "secret-action-token",
      userId: 7,
    });

    assert.equal(result.cancelled, false);
    assert.equal(result.action.status, "CANCELLED");
  });

  await t.test("another user's token remains invisible", async () => {
    const captured = [];
    const { connection } = createFakeConnection((sql, parameters) => {
      captured.push({
        sql: normalizeSql(sql),
        parameters,
      });

      if (normalizeSql(sql).startsWith("UPDATE ai_pending_actions")) {
        return [{ affectedRows: 0 }];
      }

      return [[]];
    });
    useConnection(connection);

    const result = await repository.cancelPendingAction({
      token: "secret-action-token",
      userId: 99,
    });

    assert.deepEqual(result, {
      cancelled: false,
      action: null,
    });
    assert.equal(captured.at(-1).parameters[1], 99);
  });
});

test("terminal transitions only apply to the user's executing action", async (t) => {
  await t.test("marks success", async () => {
    let captured;
    mock.method(pool, "execute", async (sql, parameters) => {
      captured = { sql: normalizeSql(sql), parameters };
      return [{ affectedRows: 1 }];
    });

    const updated = await repository.markActionExecuted({
      actionId: 17,
      userId: 7,
      result: { isAvailable: false },
    });

    assert.equal(updated, true);
    assert.match(captured.sql, /status = 'EXECUTED'/);
    assert.match(captured.sql, /id = \? AND user_id = \? AND status = 'EXECUTING'/);
    assert.deepEqual(captured.parameters, [
      '{"isAvailable":false}',
      17,
      7,
    ]);
  });

  await t.test("marks a safe failure code", async () => {
    let captured;
    mock.method(pool, "execute", async (sql, parameters) => {
      captured = { sql: normalizeSql(sql), parameters };
      return [{ affectedRows: 0 }];
    });

    const updated = await repository.markActionFailed({
      actionId: 17,
      userId: 7,
      errorCode: "ASSISTANT_ACTION_CONFLICT",
    });

    assert.equal(updated, false);
    assert.match(captured.sql, /status = 'FAILED'/);
    assert.match(captured.sql, /id = \? AND user_id = \? AND status = 'EXECUTING'/);
    assert.deepEqual(captured.parameters, [
      "ASSISTANT_ACTION_CONFLICT",
      17,
      7,
    ]);
  });
});

test("non-serializable action data fails explicitly", async () => {
  const cyclic = {};
  cyclic.self = cyclic;

  await assert.rejects(
    repository.createPendingAction({
      token: "secret-action-token",
      userId: 7,
      toolName: "set_product_availability",
      targetType: "product",
      targetId: 12,
      targetLabel: "Nacatamal de pollo",
      arguments: cyclic,
      before: { isAvailable: true },
      summary: "Actualizar disponibilidad",
    }),
    TypeError
  );
});
