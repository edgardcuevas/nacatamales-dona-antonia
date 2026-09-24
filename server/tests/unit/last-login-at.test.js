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
  DB_NAME: "last_login_test",
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
  IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/test-imagekit-id",
  IMAGEKIT_FOLDER: "test-folder",
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

const authService = require(
  "../../src/modules/auth/auth.service"
);
const {
  generateRefreshToken,
} = require("../../src/modules/auth/token.service");
const authSessionRepository = require(
  "../../src/modules/auth/auth-session.repository"
);
const {
  renewAuthSession,
  revokeAuthSession,
} = require("../../src/modules/auth/auth-session.service");
const userRepository = require(
  "../../src/modules/users/user.repository"
);
const {
  hashPassword,
} = require("../../src/modules/users/password.service");
const pool = require("../../src/database/pool");

const VALID_PASSWORD = "valid-test-password";
let passwordHash;

after(async () => {
  await pool.end();
});

test.before(async () => {
  passwordHash = await hashPassword(VALID_PASSWORD);
});

test.afterEach(() => {
  mock.restoreAll();
});

function createUser(overrides = {}) {
  return {
    id: 7,
    email: "user@example.com",
    password_hash: passwordHash,
    role: "ADMIN",
    is_active: 1,
    ...overrides,
  };
}

function mockTransaction() {
  const state = {
    committed: false,
    rolledBack: false,
  };

  mock.method(
    authSessionRepository,
    "withTransaction",
    async (work) => {
      const connection = {
        id: "transaction-connection",
      };

      try {
        const result = await work(connection);
        state.committed = true;
        return result;
      } catch (error) {
        state.rolledBack = true;
        throw error;
      }
    }
  );

  return state;
}

function assertRejectedWithCode(
  promise,
  statusCode,
  code
) {
  return assert.rejects(
    promise,
    (error) => {
      assert.equal(error.statusCode, statusCode);
      assert.equal(error.code, code);
      return true;
    }
  );
}

test("withTransaction commits and releases its connection", async () => {
  const events = [];
  const connection = {
    async beginTransaction() {
      events.push("begin");
    },
    async commit() {
      events.push("commit");
    },
    async rollback() {
      events.push("rollback");
    },
    release() {
      events.push("release");
    },
  };

  mock.method(
    pool,
    "getConnection",
    async () => connection
  );

  const result =
    await authSessionRepository.withTransaction(
      async (receivedConnection) => {
        assert.equal(receivedConnection, connection);
        events.push("work");
        return "committed";
      }
    );

  assert.equal(result, "committed");
  assert.deepEqual(events, [
    "begin",
    "work",
    "commit",
    "release",
  ]);
});

test("withTransaction rolls back and releases after work failure", async () => {
  const events = [];
  const connection = {
    async beginTransaction() {
      events.push("begin");
    },
    async commit() {
      events.push("commit");
    },
    async rollback() {
      events.push("rollback");
    },
    release() {
      events.push("release");
    },
  };

  mock.method(
    pool,
    "getConnection",
    async () => connection
  );

  await assert.rejects(
    authSessionRepository.withTransaction(
      async () => {
        events.push("work");
        throw new Error("transaction failure");
      }
    ),
    /transaction failure/
  );

  assert.deepEqual(events, [
    "begin",
    "work",
    "rollback",
    "release",
  ]);
});

test("last-login repository locks an active user and updates the row", async () => {
  const queries = [];
  const connection = {
    async execute(sql, parameters) {
      queries.push({ sql, parameters });
      return [[{ id: 7 }], []];
    },
  };

  const updated =
    await userRepository.updateLastLoginAtById({
      userId: 7,
      connection,
    });

  assert.equal(updated, true);
  assert.equal(queries.length, 2);
  assert.match(queries[0].sql, /FOR UPDATE/);
  assert.match(queries[1].sql, /last_login_at = CURRENT_TIMESTAMP/);
  assert.deepEqual(queries[0].parameters, [7]);
  assert.deepEqual(queries[1].parameters, [7]);
});

test("last-login repository does not update an unavailable user", async () => {
  let queryCount = 0;
  const connection = {
    async execute() {
      queryCount += 1;
      return [[], []];
    },
  };

  const updated =
    await userRepository.updateLastLoginAtById({
      userId: 7,
      connection,
    });

  assert.equal(updated, false);
  assert.equal(queryCount, 1);
});

test("successful login updates last_login_at in the session transaction", async () => {
  const transaction = mockTransaction();
  let createConnection;
  let updateConnection;
  let createdSession = false;
  let updatedLastLogin = false;

  mock.method(
    userRepository,
    "findUserByEmail",
    async () => createUser()
  );
  mock.method(
    authSessionRepository,
    "createSession",
    async ({ connection }) => {
      createConnection = connection;
      createdSession = true;
      return { id: 1 };
    }
  );
  mock.method(
    userRepository,
    "updateLastLoginAtById",
    async ({ connection }) => {
      updateConnection = connection;
      updatedLastLogin = true;
      return true;
    }
  );

  const result = await authService.login({
    email: "USER@EXAMPLE.COM",
    password: VALID_PASSWORD,
  });

  assert.equal(result.user.id, 7);
  assert.equal(result.user.email, "user@example.com");
  assert.equal(result.user.role, "ADMIN");
  assert.equal(typeof result.accessToken, "string");
  assert.equal(typeof result.refreshToken, "string");
  assert.equal(createdSession, true);
  assert.equal(updatedLastLogin, true);
  assert.equal(createConnection, updateConnection);
  assert.equal(transaction.committed, true);
  assert.equal(transaction.rolledBack, false);
});

test("incorrect password does not update last_login_at", async () => {
  let transactionCalls = 0;
  let updateCalls = 0;

  mock.method(
    userRepository,
    "findUserByEmail",
    async () => createUser()
  );
  mock.method(
    authSessionRepository,
    "withTransaction",
    async () => {
      transactionCalls += 1;
    }
  );
  mock.method(
    userRepository,
    "updateLastLoginAtById",
    async () => {
      updateCalls += 1;
      return true;
    }
  );

  await assertRejectedWithCode(
    authService.login({
      email: "user@example.com",
      password: "incorrect-test-password",
    }),
    401,
    "INVALID_CREDENTIALS"
  );

  assert.equal(transactionCalls, 0);
  assert.equal(updateCalls, 0);
});

test("nonexistent user does not update last_login_at", async () => {
  let updateCalls = 0;

  mock.method(
    userRepository,
    "findUserByEmail",
    async () => null
  );
  mock.method(
    userRepository,
    "updateLastLoginAtById",
    async () => {
      updateCalls += 1;
      return true;
    }
  );

  await assertRejectedWithCode(
    authService.login({
      email: "missing@example.com",
      password: VALID_PASSWORD,
    }),
    401,
    "INVALID_CREDENTIALS"
  );

  assert.equal(updateCalls, 0);
});

test("inactive user does not update last_login_at", async () => {
  let updateCalls = 0;

  mock.method(
    userRepository,
    "findUserByEmail",
    async () => createUser({ is_active: 0 })
  );
  mock.method(
    userRepository,
    "updateLastLoginAtById",
    async () => {
      updateCalls += 1;
      return true;
    }
  );

  await assertRejectedWithCode(
    authService.login({
      email: "user@example.com",
      password: VALID_PASSWORD,
    }),
    403,
    "USER_INACTIVE"
  );

  assert.equal(updateCalls, 0);
});

test("session creation failure rolls back without updating last_login_at", async () => {
  const transaction = mockTransaction();
  let updateCalls = 0;

  mock.method(
    userRepository,
    "findUserByEmail",
    async () => createUser()
  );
  mock.method(
    authSessionRepository,
    "createSession",
    async () => {
      throw new Error("simulated session creation failure");
    }
  );
  mock.method(
    userRepository,
    "updateLastLoginAtById",
    async () => {
      updateCalls += 1;
      return true;
    }
  );

  await assert.rejects(
    authService.login({
      email: "user@example.com",
      password: VALID_PASSWORD,
    }),
    /simulated session creation failure/
  );

  assert.equal(updateCalls, 0);
  assert.equal(transaction.committed, false);
  assert.equal(transaction.rolledBack, true);
});

test("last-login update failure rolls back the created session", async () => {
  const transaction = mockTransaction();
  let sessionCreated = false;

  mock.method(
    userRepository,
    "findUserByEmail",
    async () => createUser()
  );
  mock.method(
    authSessionRepository,
    "createSession",
    async () => {
      sessionCreated = true;
      return { id: 1 };
    }
  );
  mock.method(
    userRepository,
    "updateLastLoginAtById",
    async () => false
  );

  await assertRejectedWithCode(
    authService.login({
      email: "user@example.com",
      password: VALID_PASSWORD,
    }),
    403,
    "USER_INACTIVE"
  );

  assert.equal(sessionCreated, true);
  assert.equal(transaction.committed, false);
  assert.equal(transaction.rolledBack, true);
});

test("refresh does not update last_login_at", async () => {
  let updateCalls = 0;
  const refreshToken = generateRefreshToken({ id: 7 });

  mock.method(
    authSessionRepository,
    "findSessionByRefreshTokenHash",
    async () => ({
      id: 1,
      user_id: 7,
      revoked_at: null,
      expires_at: new Date(Date.now() + 60_000),
    })
  );
  mock.method(
    userRepository,
    "findUserById",
    async () => createUser()
  );
  mock.method(
    authSessionRepository,
    "rotateSession",
    async () => ({})
  );
  mock.method(
    userRepository,
    "updateLastLoginAtById",
    async () => {
      updateCalls += 1;
      return true;
    }
  );

  const result = await renewAuthSession(refreshToken);

  assert.equal(result.user.id, 7);
  assert.equal(updateCalls, 0);
});

test("logout does not update last_login_at", async () => {
  let updateCalls = 0;
  const refreshToken = generateRefreshToken({ id: 7 });

  mock.method(
    authSessionRepository,
    "revokeSessionByRefreshTokenHash",
    async () => true
  );
  mock.method(
    userRepository,
    "updateLastLoginAtById",
    async () => {
      updateCalls += 1;
      return true;
    }
  );

  const revoked = await revokeAuthSession(refreshToken);

  assert.equal(revoked, true);
  assert.equal(updateCalls, 0);
});
