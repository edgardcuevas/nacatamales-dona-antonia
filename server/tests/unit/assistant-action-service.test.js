const test = require("node:test");
const assert = require("node:assert/strict");
const { mock, after, afterEach } = require("node:test");

process.env.NODE_ENV = "test";
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_NAME = "assistant_action_service_test";
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
const AppError = require("../../src/errors/app-error");
const productService = require(
  "../../src/modules/products/product.service"
);
const actionRegistry = require(
  "../../src/modules/assistant/assistant.action-registry"
);
const actionRepository = require(
  "../../src/modules/assistant/assistant.action.repository"
);
const assistantRepository = require(
  "../../src/modules/assistant/assistant.repository"
);
const { confirmAction, cancelAction } = require(
  "../../src/modules/assistant/assistant.action.service"
);

const currentUser = {
  id: 7,
  role: "EDITOR",
};

function createAction(overrides = {}) {
  return {
    id: 17,
    userId: 7,
    conversationId: 4,
    toolName: "set_product_availability",
    targetType: "product",
    targetId: 12,
    targetLabel: "Nacatamal de pollo",
    arguments: { productId: 12, isAvailable: false },
    before: {
      isAvailable: true,
      updatedAt: "2026-10-27T12:00:00.000Z",
    },
    summary: "Marcar «Nacatamal de pollo» como no disponible",
    status: "EXECUTING",
    result: null,
    errorCode: null,
    expiresAt: new Date("2026-10-27T12:10:00.000Z"),
    startedAt: new Date("2026-10-27T12:00:00.000Z"),
    finishedAt: null,
    ...overrides,
  };
}

function createDefinition(overrides = {}) {
  const calls = [];

  return {
    calls,
    definition: {
      name: "set_product_availability",
      mode: "write",
      targetType: "product",
      description: "Change one product's availability.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "integer" },
          isAvailable: { type: "boolean" },
        },
        required: ["productId", "isAvailable"],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      validateArguments: (args) =>
        args &&
        Number.isSafeInteger(args.productId) &&
        args.productId === 12 &&
        typeof args.isAvailable === "boolean" &&
        Object.keys(args).length === 2
          ? args
          : null,
      getTargetId: (args) => args.productId,
      getTargetById: async () => ({
        id: 12,
        label: "Nacatamal de pollo",
      }),
      getTargetLabel: (target) => target.label,
      getSnapshot: () => ({
        isAvailable: true,
        updatedAt: "2026-10-27T12:00:00.000Z",
      }),
      createSummary: () => "Change product availability",
      getChanges: () => [],
      getWarnings: () => [],
      execute: async () => {
        calls.push("execute");
        return { isAvailable: false };
      },
      toResult: ({ domainResult }) => domainResult,
      toAssistantMessage: () =>
        "Se actualizó la disponibilidad del producto.",
      ...overrides,
    },
  };
}

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
});

test("confirm executes a claimed action once and appends a result message", async () => {
  const action = createAction();
  const { definition, calls } = createDefinition();
  mock.method(
    actionRepository,
    "claimPendingAction",
    async () => ({ claimed: true, action })
  );
  mock.method(
    actionRepository,
    "markActionFailed",
    async () => true
  );
  mock.method(
    actionRegistry,
    "getActionDefinition",
    () => definition
  );

  let appended;
  mock.method(
    assistantRepository,
    "appendAssistantMessageToConversation",
    async (input) => {
      appended = input;
      return true;
    }
  );

  let stored;
  mock.method(
    actionRepository,
    "markActionExecuted",
    async (input) => {
      stored = input;
      return true;
    }
  );

  const result = await confirmAction({
    currentUser,
    token: "A".repeat(43),
  });

  assert.equal(result.action.status, "EXECUTED");
  assert.equal(result.alreadyExecuted, false);
  assert.deepEqual(result.result, { isAvailable: false });
  assert.deepEqual(calls, ["execute"]);
  assert.deepEqual(stored, {
    actionId: 17,
    userId: 7,
    result: { isAvailable: false },
  });
  assert.deepEqual(appended, {
    conversationId: 4,
    userId: 7,
    message: {
      role: "assistant",
      content: "Se actualizó la disponibilidad del producto.",
    },
  });
});

  test("proposal resolves the real target and stores a server-built action snapshot", async () => {
    const product = {
      id: 12,
      name: "Nacatamal de pollo",
      isAvailable: true,
      updatedAt: new Date("2026-10-27T12:00:00.000Z"),
    };
    let inserted;
    mock.method(
      actionRegistry,
      "validateActionCall",
      ({ name, arguments: args }) => ({
        name,
        arguments: args,
      })
    );
    mock.method(
      productService,
      "getProductById",
      async () => product
    );
    mock.method(
      actionRepository,
      "createPendingAction",
      async (input) => {
        inserted = input;
        return {
          status: "CREATED",
          actionId: 31,
          expiresAt: new Date("2026-10-27T12:10:00.000Z"),
        };
      }
    );

    const result = await require(
      "../../src/modules/assistant/assistant.action.service"
    ).proposeAction({
      currentUser,
      conversationId: 9,
      toolName: "set_product_availability",
      arguments: {
        productId: 12,
        isAvailable: false,
      },
    });

    assert.equal(result.status, "CREATED");
    assert.match(result.pendingAction.token, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(result.pendingAction.target, {
      type: "product",
      id: 12,
      label: "Nacatamal de pollo",
    });
    assert.deepEqual(result.pendingAction.changes, [
      {
        field: "isAvailable",
        from: true,
        to: false,
      },
    ]);
    assert.deepEqual(result.pendingAction.warnings, []);
    assert.deepEqual(inserted, {
      token: result.pendingAction.token,
      userId: 7,
      conversationId: 9,
      toolName: "set_product_availability",
      targetType: "product",
      targetId: 12,
      targetLabel: "Nacatamal de pollo",
      arguments: {
        productId: 12,
        isAvailable: false,
      },
      before: {
        isAvailable: true,
        updatedAt: "2026-10-27T12:00:00.000Z",
      },
      summary: "Marcar «Nacatamal de pollo» como no disponible",
    });
  });

  test("proposal reports the pending-action limit and warns about no-op changes", async (t) => {
    await t.test("pending limit", async () => {
      mock.method(
        actionRegistry,
        "validateActionCall",
        ({ name, arguments: args }) => ({
          name,
          arguments: args,
        })
      );
      mock.method(
        productService,
        "getProductById",
        async () => ({
          id: 12,
          name: "Nacatamal de pollo",
          isAvailable: true,
          updatedAt: new Date("2026-10-27T12:00:00.000Z"),
        })
      );
      mock.method(
        actionRepository,
        "createPendingAction",
        async () => ({ status: "PENDING_LIMIT" })
      );

      const result = await require(
        "../../src/modules/assistant/assistant.action.service"
      ).proposeAction({
        currentUser,
        conversationId: 9,
        toolName: "set_product_availability",
        arguments: {
          productId: 12,
          isAvailable: false,
        },
      });

      assert.deepEqual(result, { status: "PENDING_LIMIT" });
    });

    await t.test("no-op warning", async () => {
      mock.method(
        actionRegistry,
        "validateActionCall",
        ({ name, arguments: args }) => ({
          name,
          arguments: args,
        })
      );
      mock.method(
        productService,
        "getProductById",
        async () => ({
          id: 12,
          name: "Nacatamal de pollo",
          isAvailable: true,
          updatedAt: new Date("2026-10-27T12:00:00.000Z"),
        })
      );
      mock.method(
        actionRepository,
        "createPendingAction",
        async () => ({
          status: "CREATED",
          actionId: 31,
          expiresAt: new Date("2026-10-27T12:10:00.000Z"),
        })
      );

      const result = await require(
        "../../src/modules/assistant/assistant.action.service"
      ).proposeAction({
        currentUser,
        conversationId: 9,
        toolName: "set_product_availability",
        arguments: {
          productId: 12,
          isAvailable: true,
        },
      });

      assert.deepEqual(result.pendingAction.warnings, [
        "El producto ya está en ese estado.",
      ]);
    });
  });

  test("proposal does not create an action if the resolved target is missing", async () => {
    mock.method(
      actionRegistry,
      "validateActionCall",
      ({ name, arguments: args }) => ({
        name,
        arguments: args,
      })
    );
    mock.method(
      productService,
      "getProductById",
      async () => {
        throw new AppError(404, "PRODUCT_NOT_FOUND", "Missing");
      }
    );
    let inserted = false;
    mock.method(
      actionRepository,
      "createPendingAction",
      async () => {
        inserted = true;
        return { status: "CREATED" };
      }
    );

    const result = await require(
      "../../src/modules/assistant/assistant.action.service"
    ).proposeAction({
      currentUser,
      conversationId: 9,
      toolName: "set_product_availability",
      arguments: {
        productId: 999,
        isAvailable: false,
      },
    });

    assert.deepEqual(result, { status: "TARGET_NOT_FOUND" });
    assert.equal(inserted, false);
  });

test("repeat confirmation returns the stored result without re-executing", async () => {
  const action = createAction({
    status: "EXECUTED",
    result: { isAvailable: false },
    finishedAt: new Date("2026-10-27T12:01:00.000Z"),
  });
  mock.method(
    actionRepository,
    "claimPendingAction",
    async () => ({ claimed: false, action })
  );

  const result = await confirmAction({
    currentUser,
    token: "A".repeat(43),
  });

  assert.equal(result.alreadyExecuted, true);
  assert.deepEqual(result.result, { isAvailable: false });
  assert.equal(result.action.status, "EXECUTED");
});

test("confirm maps missing and terminal states to stable public errors", async (t) => {
  await t.test("unknown or foreign token", async () => {
    mock.method(
      actionRepository,
      "claimPendingAction",
      async () => ({ claimed: false, action: null })
    );

    await assert.rejects(
      confirmAction({
        currentUser,
        token: "A".repeat(43),
      }),
      (error) =>
        error instanceof AppError &&
        error.statusCode === 404 &&
        error.code === "ASSISTANT_ACTION_NOT_FOUND"
    );
  });

  await t.test("expired", async () => {
    mock.method(
      actionRepository,
      "claimPendingAction",
      async () => ({
        claimed: false,
        action: createAction({ status: "EXPIRED" }),
      })
    );

    await assert.rejects(
      confirmAction({
        currentUser,
        token: "A".repeat(43),
      }),
      (error) =>
        error.statusCode === 410 &&
        error.code === "ASSISTANT_ACTION_EXPIRED"
    );
  });

  await t.test("in progress", async () => {
    mock.method(
      actionRepository,
      "claimPendingAction",
      async () => ({
        claimed: false,
        action: createAction({ status: "EXECUTING" }),
      })
    );

    await assert.rejects(
      confirmAction({
        currentUser,
        token: "A".repeat(43),
      }),
      (error) =>
        error.statusCode === 409 &&
        error.code === "ASSISTANT_ACTION_IN_PROGRESS"
    );
  });

  await t.test("interrupted execution is unknown", async () => {
    mock.method(
      actionRepository,
      "claimPendingAction",
      async () => ({
        claimed: false,
        action: createAction({
          status: "FAILED",
          errorCode: "ASSISTANT_ACTION_UNKNOWN",
        }),
      })
    );

    await assert.rejects(
      confirmAction({
        currentUser,
        token: "A".repeat(43),
      }),
      (error) =>
        error.code === "ASSISTANT_ACTION_UNKNOWN"
    );
  });
});

test("a changed target is failed with conflict and never executes the domain change", async () => {
  const action = createAction();
  const { definition, calls } = createDefinition({
    getSnapshot: () => ({
      isAvailable: false,
      updatedAt: "2026-10-27T12:00:00.000Z",
    }),
  });
  let failed;
  mock.method(
    actionRepository,
    "claimPendingAction",
    async () => ({ claimed: true, action })
  );
  mock.method(
    actionRepository,
    "markActionFailed",
    async (input) => {
      failed = input;
      return true;
    }
  );
  mock.method(
    actionRegistry,
    "getActionDefinition",
    () => definition
  );

  await assert.rejects(
    confirmAction({ currentUser, token: "A".repeat(43) }),
    (error) =>
      error.code === "ASSISTANT_ACTION_CONFLICT" &&
      error.statusCode === 409
  );

  assert.deepEqual(calls, []);
  assert.deepEqual(failed, {
    actionId: 17,
    userId: 7,
    errorCode: "ASSISTANT_ACTION_CONFLICT",
  });
});

test("domain rejections become safe stored failures", async () => {
  const action = createAction();
  const { definition } = createDefinition({
    execute: async () => {
      throw new AppError(
        409,
        "PRODUCT_NOT_READY",
        "Sensitive domain detail"
      );
    },
  });
  let failed;
  mock.method(
    actionRepository,
    "claimPendingAction",
    async () => ({ claimed: true, action })
  );
  mock.method(
    actionRepository,
    "markActionFailed",
    async (input) => {
      failed = input;
      return true;
    }
  );
  mock.method(
    actionRegistry,
    "getActionDefinition",
    () => definition
  );

  await assert.rejects(
    confirmAction({ currentUser, token: "A".repeat(43) }),
    (error) =>
      error.code === "ASSISTANT_ACTION_FAILED" &&
      !error.message.includes("Sensitive")
  );

  assert.equal(failed.errorCode, "ASSISTANT_ACTION_FAILED");
});

test("cancel is idempotent and token ownership remains hidden", async (t) => {
  await t.test("already cancelled action", async () => {
    const action = createAction({ status: "CANCELLED" });
    mock.method(
      actionRepository,
      "cancelPendingAction",
      async () => ({ cancelled: false, action })
    );

    const result = await cancelAction({
      currentUser,
      token: "A".repeat(43),
    });

    assert.equal(result.cancelled, false);
    assert.equal(result.action.status, "CANCELLED");
  });

  await t.test("unknown or foreign token", async () => {
    mock.method(
      actionRepository,
      "cancelPendingAction",
      async () => ({ cancelled: false, action: null })
    );

    await assert.rejects(
      cancelAction({
        currentUser,
        token: "A".repeat(43),
      }),
      (error) =>
        error.statusCode === 404 &&
        error.code === "ASSISTANT_ACTION_NOT_FOUND"
    );
  });
});

test("only ADMIN and EDITOR can confirm or cancel", async () => {
  await assert.rejects(
    confirmAction({
      currentUser: { id: 9, role: "USER" },
      token: "A".repeat(43),
    }),
    (error) =>
      error.statusCode === 403 &&
      error.code === "FORBIDDEN"
  );

  await assert.rejects(
    cancelAction({
      currentUser: { id: 9, role: "USER" },
      token: "A".repeat(43),
    }),
    (error) =>
      error.statusCode === 403 &&
      error.code === "FORBIDDEN"
  );
});
