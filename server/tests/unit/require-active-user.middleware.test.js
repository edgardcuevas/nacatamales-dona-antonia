const test = require("node:test");
const assert = require("node:assert/strict");
const {
  after,
  mock,
} = require("node:test");

const TEST_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "active_user_test",
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
const userRepository = require(
  "../../src/modules/users/user.repository"
);
const userService = require(
  "../../src/modules/users/user.service"
);
const requireActiveUser = require(
  "../../src/middlewares/require-active-user.middleware"
);
const pool = require("../../src/database/pool");

after(async () => {
  await pool.end();
});

test.afterEach(() => {
  mock.restoreAll();
});

function createUser(overrides = {}) {
  return {
    id: 7,
    email: "editor@example.com",
    role: "EDITOR",
    is_active: 1,
    password_hash: "must-not-be-exposed",
    last_login_at: null,
    password_changed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

async function expectServiceError(
  user,
  tokenRole,
  expectedCode,
  expectedMessage
) {
  mock.method(
    userRepository,
    "findUserById",
    async () => user
  );

  await assert.rejects(
    () => userService.getAuthenticatedUser({
      userId: 7,
      tokenRole,
    }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 401);
      assert.equal(error.code, expectedCode);
      assert.equal(error.message, expectedMessage);
      return true;
    }
  );
}

function executeMiddleware(request) {
  return new Promise((resolve, reject) => {
    let nextCalls = 0;
    let nextError;

    Promise.resolve(
      requireActiveUser(request, {}, (error) => {
        nextCalls += 1;
        nextError = error;
        resolve({
          request,
          nextCalls,
          nextError,
        });
      })
    ).catch(reject);
  });
}

function assertForwardedError(
  execution,
  expectedCode,
  expectedMessage
) {
  assert.equal(execution.nextCalls, 1);
  assert.ok(execution.nextError instanceof AppError);
  assert.equal(execution.nextError.statusCode, 401);
  assert.equal(execution.nextError.code, expectedCode);
  assert.equal(execution.nextError.message, expectedMessage);
  assert.equal(execution.request.currentUser, undefined);
}

test("getAuthenticatedUser returns only the approved active user fields", async () => {
  mock.method(
    userRepository,
    "findUserById",
    async () => createUser()
  );

  const currentUser =
    await userService.getAuthenticatedUser({
      userId: 7,
      tokenRole: "EDITOR",
    });

  assert.deepEqual(
    Object.keys(currentUser).sort(),
    ["email", "id", "isActive", "role"]
  );
  assert.equal(currentUser.id, 7);
  assert.equal(currentUser.email, "editor@example.com");
  assert.equal(currentUser.role, "EDITOR");
  assert.equal(currentUser.isActive, true);
  assert.equal(Object.isFrozen(currentUser), true);
});

test("getAuthenticatedUser rejects a nonexistent user", async () => {
  await expectServiceError(
    null,
    "EDITOR",
    "AUTHENTICATED_USER_UNAVAILABLE",
    "The authenticated user is unavailable"
  );
});

test("getAuthenticatedUser rejects an inactive user", async () => {
  await expectServiceError(
    createUser({ is_active: 0 }),
    "EDITOR",
    "AUTHENTICATED_USER_UNAVAILABLE",
    "The authenticated user is unavailable"
  );
});

test("getAuthenticatedUser rejects an invalid stored role", async () => {
  await expectServiceError(
    createUser({ role: "OWNER" }),
    "EDITOR",
    "AUTHENTICATION_STALE",
    "The authentication credentials must be renewed"
  );
});

test("getAuthenticatedUser rejects a role different from the token", async () => {
  await expectServiceError(
    createUser({ role: "ADMIN" }),
    "EDITOR",
    "AUTHENTICATION_STALE",
    "The authentication credentials must be renewed"
  );
});

test("requireActiveUser requires an authenticated request context", async () => {
  const execution = await executeMiddleware({
    body: {
      userId: 7,
      role: "ADMIN",
    },
  });

  assertForwardedError(
    execution,
    "AUTHENTICATION_REQUIRED",
    "Authentication is required"
  );
});

test("requireActiveUser uses request.auth and sets currentUser", async () => {
  let receivedArguments;
  const currentUser = Object.freeze({
    id: 7,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  });

  mock.method(
    userService,
    "getAuthenticatedUser",
    async (argumentsObject) => {
      receivedArguments = argumentsObject;
      return currentUser;
    }
  );

  const execution = await executeMiddleware({
    auth: Object.freeze({
      userId: 7,
      role: "EDITOR",
      tokenId: "access-token-id",
    }),
    body: {
      userId: 999,
      role: "ADMIN",
    },
    params: {
      userId: 999,
    },
    query: {
      role: "ADMIN",
    },
  });

  assert.equal(execution.nextCalls, 1);
  assert.equal(execution.nextError, undefined);
  assert.deepEqual(receivedArguments, {
    userId: 7,
    tokenRole: "EDITOR",
  });
  assert.equal(execution.request.currentUser, currentUser);
});

test("requireActiveUser forwards unavailable user errors", async () => {
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

  const execution = await executeMiddleware({
    auth: Object.freeze({
      userId: 7,
      role: "EDITOR",
      tokenId: "access-token-id",
    }),
  });

  assertForwardedError(
    execution,
    "AUTHENTICATED_USER_UNAVAILABLE",
    "The authenticated user is unavailable"
  );
});

test("requireActiveUser forwards stale authentication errors", async () => {
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

  const execution = await executeMiddleware({
    auth: Object.freeze({
      userId: 7,
      role: "EDITOR",
      tokenId: "access-token-id",
    }),
  });

  assertForwardedError(
    execution,
    "AUTHENTICATION_STALE",
    "The authentication credentials must be renewed"
  );
});
