const test = require("node:test");
const assert = require("node:assert/strict");
Object.assign(process.env, {
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "assistant_action_executor_test",
  DB_USER: "test_user",
  DB_PASSWORD: "test_password",
  JWT_ACCESS_TOKEN_SECRET:
    "test-access-secret-with-at-least-32-characters",
  JWT_ACCESS_TOKEN_TTL: "15m",
  JWT_REFRESH_TOKEN_SECRET:
    "test-refresh-secret-with-at-least-32-characters",
  JWT_REFRESH_TOKEN_TTL: "30d",
  IMAGEKIT_PUBLIC_KEY: "test_public_key",
  IMAGEKIT_PRIVATE_KEY: "test_private_key",
  IMAGEKIT_URL_ENDPOINT:
    "https://ik.imagekit.io/test-imagekit-id",
  IMAGEKIT_FOLDER: "test-folder",
  GOOGLE_CLIENT_ID: "test_google_client_id",
  GOOGLE_CLIENT_SECRET: "test_google_client_secret",
  GOOGLE_REDIRECT_URI:
    "https://example.test/api/admin/youtube/callback",
  YOUTUBE_TOKEN_ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  YOUTUBE_CHANNEL_ID: "UC1234567890123456789012",
});
const {
  createAssistantActionRegistry,
} = require(
  "../../src/modules/assistant/assistant.action-registry"
);
const {
  AssistantActionExecutionError,
  executePendingAction,
} = require(
  "../../src/modules/assistant/assistant.action-executor"
);

function createDefinition(overrides = {}) {
  const calls = [];
  const target = {
    id: 12,
    label: "Nacatamal de pollo",
    isAvailable: true,
    updatedAt: "2026-10-27T12:00:00.000Z",
  };

  const definition = {
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
    validateArguments: (value) =>
      value &&
      Number.isSafeInteger(value.productId) &&
      value.productId === 12 &&
      typeof value.isAvailable === "boolean" &&
      Object.keys(value).length === 2
        ? value
        : null,
    getTargetId: (value) => value.productId,
    getTargetById: async (targetId) => {
      calls.push(["getTargetById", targetId]);
      return target;
    },
    getTargetLabel: (value) => value.label,
    getSnapshot: (value) => ({
      isAvailable: value.isAvailable,
      updatedAt: value.updatedAt,
    }),
    createSummary: () => "Change product availability",
    getChanges: () => [],
    getWarnings: () => [],
    execute: async ({ targetId, arguments: args }) => {
      calls.push(["execute", targetId, args]);
      return { isAvailable: args.isAvailable };
    },
    toResult: ({ domainResult }) => domainResult,
    toAssistantMessage: ({ result }) =>
      `Disponibilidad actualizada: ${result.isAvailable}`,
    ...overrides,
  };

  return {
    calls,
    target,
    registry: createAssistantActionRegistry([definition]),
  };
}

function createAction(overrides = {}) {
  return {
    toolName: "set_product_availability",
    targetType: "product",
    targetId: 12,
    targetLabel: "Nacatamal de pollo",
    arguments: { productId: 12, isAvailable: false },
    before: {
      isAvailable: true,
      updatedAt: "2026-10-27T12:00:00.000Z",
    },
    ...overrides,
  };
}

test("the write registry accepts write definitions and rejects unsafe modes", () => {
  const { registry } = createDefinition();
  assert.equal(
    registry.getActionDefinition("set_product_availability").mode,
    "write"
  );
  assert.equal(registry.getActionDefinition("unknown_action"), null);

  assert.throws(
    () =>
      createAssistantActionRegistry([
        {
          ...createDefinition().registry.getActionDefinition(
            "set_product_availability"
          ),
          mode: "read",
        },
      ]),
    /must use write mode/
  );

  assert.throws(
    () =>
      createAssistantActionRegistry([
        createDefinition().registry.getActionDefinition(
          "set_product_availability"
        ),
        createDefinition().registry.getActionDefinition(
          "set_product_availability"
        ),
      ]),
    /Duplicate assistant action name/
  );
});

test("execution revalidates the role, mode, target, arguments, and snapshot", async () => {
  const { registry, calls } = createDefinition();

  const result = await executePendingAction({
    action: createAction(),
    role: "EDITOR",
    registry,
  });

  assert.deepEqual(result, {
    result: { isAvailable: false },
    message: "Disponibilidad actualizada: false",
  });
  assert.deepEqual(calls, [
    ["getTargetById", 12],
    [
      "execute",
      12,
      { productId: 12, isAvailable: false },
    ],
  ]);
});

test("execution rejects unknown, mismatched, or unauthorized actions before writing", async (t) => {
  await t.test("unknown action", async () => {
    const { registry, calls } = createDefinition();

    await assert.rejects(
      executePendingAction({
        action: createAction({ toolName: "invented_action" }),
        role: "ADMIN",
        registry,
      }),
      (error) =>
        error instanceof AssistantActionExecutionError &&
        error.code === "ASSISTANT_ACTION_NOT_CONFIRMABLE"
    );
    assert.deepEqual(calls, []);
  });

  await t.test("role no longer allowed", async () => {
    const { registry, calls } = createDefinition({
      allowedRoles: ["ADMIN"],
    });

    await assert.rejects(
      executePendingAction({
        action: createAction(),
        role: "EDITOR",
        registry,
      }),
      (error) =>
        error.code === "ASSISTANT_ACTION_NOT_CONFIRMABLE"
    );
    assert.deepEqual(calls, []);
  });

  await t.test("stored arguments are no longer valid", async () => {
    const { registry, calls } = createDefinition();

    await assert.rejects(
      executePendingAction({
        action: createAction({
          arguments: {
            productId: 12,
            isAvailable: false,
            targetId: 999,
          },
        }),
        role: "ADMIN",
        registry,
      }),
      (error) =>
        error.code === "ASSISTANT_ACTION_NOT_CONFIRMABLE"
    );
    assert.deepEqual(calls, []);
  });

  await t.test("target type changed", async () => {
    const { registry, calls } = createDefinition();

    await assert.rejects(
      executePendingAction({
        action: createAction({
          targetType: "category",
        }),
        role: "ADMIN",
        registry,
      }),
      (error) =>
        error.code === "ASSISTANT_ACTION_NOT_CONFIRMABLE"
    );
    assert.deepEqual(calls, []);
  });
});

test("execution detects a missing, renamed, or changed target without writing", async (t) => {
  await t.test("target disappeared", async () => {
    const { registry, calls } = createDefinition({
      getTargetById: async () => null,
    });

    await assert.rejects(
      executePendingAction({
        action: createAction(),
        role: "ADMIN",
        registry,
      }),
      (error) =>
        error.code === "ASSISTANT_ACTION_CONFLICT"
    );
    assert.deepEqual(calls, []);
  });

  await t.test("target label changed", async () => {
    const { registry, calls } = createDefinition({
      getTargetLabel: () => "Otro nombre",
    });

    await assert.rejects(
      executePendingAction({
        action: createAction(),
        role: "ADMIN",
        registry,
      }),
      (error) =>
        error.code === "ASSISTANT_ACTION_CONFLICT"
    );
    assert.deepEqual(calls, [["getTargetById", 12]]);
  });

  await t.test("target snapshot changed", async () => {
    const { registry, calls } = createDefinition({
      getSnapshot: () => ({
        isAvailable: false,
        updatedAt: "2026-10-27T12:01:00.000Z",
      }),
    });

    await assert.rejects(
      executePendingAction({
        action: createAction(),
        role: "ADMIN",
        registry,
      }),
      (error) =>
        error.code === "ASSISTANT_ACTION_CONFLICT"
    );
    assert.deepEqual(calls, [["getTargetById", 12]]);
  });
});
