const test = require("node:test");
const assert = require("node:assert/strict");
const { after, afterEach, before, mock } = require("node:test");

process.env.NODE_ENV = "test";
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_NAME = "assistant_action_routes_test";
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
  "https://example.test/api/admin/youtube/callback";
process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.YOUTUBE_CHANNEL_ID = "UC1234567890123456789012";

const userService = require(
  "../../src/modules/users/user.service"
);
const actionRepository = require(
  "../../src/modules/assistant/assistant.action.repository"
);
const {
  resetAssistantRateLimiters,
} = require(
  "../../src/middlewares/assistant-rate-limit.middleware"
);
const { generateAccessToken } = require(
  "../../src/modules/auth/token.service"
);

const state = {
  currentUser: {
    id: 7,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  },
};

function installUserMock() {
  mock.method(
    userService,
    "getAuthenticatedUser",
    async () => state.currentUser
  );
}

installUserMock();

const app = require("../../src/app");

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  const pool = require("../../src/database/pool");
  await pool.end();
});

afterEach(() => {
  resetAssistantRateLimiters();
  state.currentUser = {
    id: 7,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };
  mock.restoreAll();
  installUserMock();
});

function accessToken(role = state.currentUser.role) {
  return generateAccessToken({
    id: state.currentUser.id,
    role,
  });
}

async function request(path, options = {}) {
  const headers = {};

  if (options.accessToken) {
    headers.authorization = `Bearer ${options.accessToken}`;
  }

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "POST",
    headers,
    body:
      options.body === undefined
        ? undefined
        : JSON.stringify(options.body),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

function cancelledAction() {
  return {
    id: 17,
    toolName: "set_product_availability",
    targetType: "product",
    targetId: 12,
    targetLabel: "Nacatamal de pollo",
    summary: "Marcar «Nacatamal de pollo» como no disponible",
    status: "CANCELLED",
    expiresAt: new Date("2026-10-27T12:10:00.000Z"),
    finishedAt: new Date("2026-10-27T12:01:00.000Z"),
  };
}

test("action endpoints require authentication", async () => {
  const result = await request(
    `/api/admin/assistant/actions/${"A".repeat(43)}/confirm`,
    { body: {} }
  );

  assert.equal(result.status, 401);
  assert.equal(
    result.body.error.code,
    "AUTHENTICATION_REQUIRED"
  );
});

test("malformed action tokens return 404", async () => {
  const result = await request(
    "/api/admin/assistant/actions/invalid/confirm",
    {
      accessToken: accessToken(),
      body: {},
    }
  );

  assert.equal(result.status, 404);
  assert.equal(
    result.body.error.code,
    "ASSISTANT_ACTION_NOT_FOUND"
  );
});

test("confirmation rejects fields and does not reach the service", async () => {
  let called = false;
  mock.method(
    actionRepository,
    "claimPendingAction",
    async () => {
      called = true;
      return { claimed: false, action: null };
    }
  );

  const result = await request(
    `/api/admin/assistant/actions/${"A".repeat(43)}/confirm`,
    {
      accessToken: accessToken(),
      body: { targetId: 12 },
    }
  );

  assert.equal(result.status, 400);
  assert.equal(
    result.body.error.code,
    "UNEXPECTED_ASSISTANT_FIELDS"
  );
  assert.equal(called, false);
});

test("confirmation uses only the authenticated user and stored action", async () => {
  let captured;
  mock.method(
    actionRepository,
    "claimPendingAction",
    async (input) => {
      captured = input;
      return { claimed: false, action: null };
    }
  );

  const result = await request(
    `/api/admin/assistant/actions/${"A".repeat(43)}/confirm`,
    {
      accessToken: accessToken(),
      body: {},
    }
  );

  assert.equal(result.status, 404);
  assert.equal(
    result.body.error.code,
    "ASSISTANT_ACTION_NOT_FOUND"
  );
  assert.deepEqual(captured, {
    token: "A".repeat(43),
    userId: 7,
  });
});

test("an EDITOR can cancel and repeat cancellation safely", async () => {
  mock.method(
    actionRepository,
    "cancelPendingAction",
    async () => ({
      cancelled: false,
      action: cancelledAction(),
    })
  );

  const result = await request(
    `/api/admin/assistant/actions/${"A".repeat(43)}/cancel`,
    {
      accessToken: accessToken("EDITOR"),
      body: {},
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.cancelled, false);
  assert.equal(
    result.body.data.action.target.label,
    "Nacatamal de pollo"
  );
});
