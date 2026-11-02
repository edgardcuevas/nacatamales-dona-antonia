const test = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("node:test");

Object.assign(process.env, {
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "assistant_users_test",
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

const userService = require(
  "../../src/modules/users/user.service"
);
const assistantToolRegistry = require(
  "../../src/modules/assistant/assistant.tools"
);
const actionRegistry = require(
  "../../src/modules/assistant/assistant.action-registry"
);
const {
  AssistantToolError,
} = require(
  "../../src/modules/assistant/assistant.tool-registry"
);
const {
  MAX_ASSISTANT_USER_RESULTS,
  MAX_TOOL_DECLARATIONS,
} = require(
  "../../src/modules/assistant/assistant.constants"
);

function createUser(index) {
  return {
    id: index + 1,
    email: `user-${index + 1}@example.test`,
    role: index % 2 === 0 ? "ADMIN" : "EDITOR",
    isActive: index % 3 !== 0,
    passwordChangedAt: new Date(),
  };
}

test("the complete role-specific catalog fits the Gemini declaration limit", () => {
  const expectedCounts = {
    ADMIN: 51,
    EDITOR: 47,
  };

  for (const [role, expectedCount] of Object.entries(
    expectedCounts
  )) {
    const declarations = [
      ...assistantToolRegistry.getToolDeclarations(role),
      ...actionRegistry.getActionDeclarations(role),
    ];

    assert.equal(declarations.length, expectedCount);
    assert.ok(declarations.length <= MAX_TOOL_DECLARATIONS);
  }
});

test("list_users is admin-only and returns a bounded safe DTO", async () => {
  const users = Array.from(
    { length: MAX_ASSISTANT_USER_RESULTS + 1 },
    (_, index) => createUser(index)
  );
  const listUsers = mock.method(
    userService,
    "listAdministrativeUsers",
    async () => ({
      users,
      pagination: {
        totalItems: users.length,
      },
    })
  );

  try {
    assert.ok(
      assistantToolRegistry
        .getToolDeclarations("ADMIN")
        .some((tool) => tool.name === "list_users")
    );
    assert.equal(
      assistantToolRegistry
        .getToolDeclarations("EDITOR")
        .some((tool) => tool.name === "list_users"),
      false
    );

    await assert.rejects(
      assistantToolRegistry.executeToolCall({
        name: "list_users",
        arguments: {},
        role: "EDITOR",
      }),
      (error) =>
        error instanceof AssistantToolError &&
        error.code === "FORBIDDEN_TOOL"
    );
    assert.equal(listUsers.mock.callCount(), 0);

    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "list_users",
        arguments: {},
        role: "ADMIN",
      });
    const result = JSON.parse(serialized);

    assert.deepEqual(
      listUsers.mock.calls[0].arguments[0],
      {
        page: 1,
        limit: MAX_ASSISTANT_USER_RESULTS + 1,
        sortBy: "createdAt",
        sortOrder: "desc",
      }
    );
    assert.equal(result.users.length, MAX_ASSISTANT_USER_RESULTS);
    assert.equal(result.truncated, true);
    assert.deepEqual(
      Object.keys(result.users[0]).sort(),
      ["email", "id", "isActive", "role"]
    );
    assert.doesNotMatch(serialized, /password|hash/i);
    assert.ok(serialized.length <= 6_000);
  } finally {
    mock.restoreAll();
  }
});

test("list_users returns an empty result without truncation", async () => {
  mock.method(
    userService,
    "listAdministrativeUsers",
    async () => ({
      users: [],
      pagination: { totalItems: 0 },
    })
  );

  try {
    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "list_users",
        arguments: {},
        role: "ADMIN",
      });

    assert.deepEqual(JSON.parse(serialized), {
      users: [],
      truncated: false,
    });
  } finally {
    mock.restoreAll();
  }
});
