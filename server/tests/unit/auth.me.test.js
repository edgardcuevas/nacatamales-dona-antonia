const test = require("node:test");
const assert = require("node:assert/strict");
const {
  after,
  before,
  mock,
} = require("node:test");

const TEST_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "auth_me_test",
  DB_USER: "test_user",
  DB_PASSWORD: "test_password",
  JWT_ACCESS_TOKEN_SECRET:
    "test-access-secret-with-at-least-32-characters",
  JWT_ACCESS_TOKEN_TTL: "15m",
  JWT_REFRESH_TOKEN_SECRET:
    "test-refresh-secret-with-at-least-32-characters",
  JWT_REFRESH_TOKEN_TTL: "30d",
});

for (const [name, value] of Object.entries(
  TEST_ENVIRONMENT
)) {
  if (
    typeof process.env[name] !== "string" ||
    process.env[name].trim() === ""
  ) {
    process.env[name] = value;
  }
}

const AppError = require("../../src/errors/app-error");
const userService = require(
  "../../src/modules/users/user.service"
);
const {
  generateAccessToken,
} = require("../../src/modules/auth/token.service");
const app = require("../../src/app");
const pool = require("../../src/database/pool");

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
  mock.restoreAll();
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test.afterEach(() => {
  mock.restoreAll();
});

function createAccessToken(role = "ADMIN") {
  return generateAccessToken({
    id: 7,
    role,
  });
}

async function requestMe(authorization) {
  const headers = {};

  if (authorization !== undefined) {
    headers.authorization = authorization;
  }

  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers,
  });
  const body = await response.json();

  return {
    status: response.status,
    body,
  };
}

test("GET /api/auth/me requires authentication", async () => {
  const result = await requestMe();

  assert.equal(result.status, 401);
  assert.deepEqual(result.body, {
    success: false,
    error: {
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication is required",
    },
  });
});

test("GET /api/auth/me rejects an invalid access token", async () => {
  const result = await requestMe("Bearer invalid-token");

  assert.equal(result.status, 401);
  assert.deepEqual(result.body, {
    success: false,
    error: {
      code: "INVALID_ACCESS_TOKEN",
      message: "The access token is invalid or expired",
    },
  });
});

test("GET /api/auth/me returns only the authenticated user fields", async () => {
  mock.method(
    userService,
    "getAuthenticatedUser",
    async ({ userId, tokenRole }) => {
      assert.equal(userId, 7);
      assert.equal(tokenRole, "ADMIN");

      return Object.freeze({
        id: 7,
        email: "admin@example.com",
        role: "ADMIN",
        isActive: true,
        password_hash: "must-not-be-exposed",
        created_at: new Date(),
      });
    }
  );

  const result = await requestMe(
    `Bearer ${createAccessToken()}`
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    success: true,
    message: "Authenticated user retrieved successfully",
    data: {
      user: {
        id: 7,
        email: "admin@example.com",
        role: "ADMIN",
      },
    },
  });
  assert.equal(
    Object.hasOwn(result.body.data.user, "password_hash"),
    false
  );
  assert.equal(
    Object.hasOwn(result.body.data.user, "isActive"),
    false
  );
  assert.equal(
    Object.hasOwn(result.body.data.user, "accessToken"),
    false
  );
});

test("GET /api/auth/me rejects a user deactivated after token issuance", async () => {
  mock.method(
    userService,
    "getAuthenticatedUser",
    async () => {
      throw new AppError(
        401,
        "AUTHENTICATED_USER_UNAVAILABLE",
        "The authenticated user is unavailable"
      );
    }
  );

  const result = await requestMe(
    `Bearer ${createAccessToken()}`
  );

  assert.equal(result.status, 401);
  assert.deepEqual(result.body, {
    success: false,
    error: {
      code: "AUTHENTICATED_USER_UNAVAILABLE",
      message: "The authenticated user is unavailable",
    },
  });
});

test("GET /api/auth/me rejects a stale token role", async () => {
  mock.method(
    userService,
    "getAuthenticatedUser",
    async () => {
      throw new AppError(
        401,
        "AUTHENTICATION_STALE",
        "The authentication credentials must be renewed"
      );
    }
  );

  const result = await requestMe(
    `Bearer ${createAccessToken("EDITOR")}`
  );

  assert.equal(result.status, 401);
  assert.deepEqual(result.body, {
    success: false,
    error: {
      code: "AUTHENTICATION_STALE",
      message: "The authentication credentials must be renewed",
    },
  });
});
