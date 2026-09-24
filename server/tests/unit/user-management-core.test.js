const test = require("node:test");
const assert = require("node:assert/strict");
const {
  after,
  afterEach,
  before,
  mock,
} = require("node:test");

const TEST_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "user_management_core_test",
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

const AppError = require("../../src/errors/app-error");
const {
  MAX_LIMIT,
  parseCreateUserBody,
  parsePasswordBody,
  parseRoleBody,
  parseStatusBody,
  parseUserId,
  parseUserListQuery,
} = require("../../src/modules/users/user.validator");
const userRepository = require(
  "../../src/modules/users/user.repository"
);
const userService = require(
  "../../src/modules/users/user.service"
);
const authSessionRepository = require(
  "../../src/modules/auth/auth-session.repository"
);
const {
  hashPassword,
} = require("../../src/modules/users/password.service");
const pool = require("../../src/database/pool");

const VALID_PASSWORD = "StrongAdminPassword1!";
let passwordHash;

before(async () => {
  passwordHash = await hashPassword(VALID_PASSWORD);
});

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
});

function createRawUser(overrides = {}) {
  return {
    id: 7,
    email: "user@example.com",
    password_hash: "must-not-be-exposed",
    role: "ADMIN",
    is_active: 1,
    last_login_at: new Date("2026-09-01T00:00:00.000Z"),
    password_changed_at: new Date("2026-08-01T00:00:00.000Z"),
    created_at: new Date("2026-07-01T00:00:00.000Z"),
    updated_at: new Date("2026-09-02T00:00:00.000Z"),
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
      const connection = { id: "transaction" };
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

function assertAppError(
  error,
  statusCode,
  code
) {
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.code, code);
}

test("user list query applies defaults, filters, and safe ordering", () => {
  const result = parseUserListQuery({
    page: "2",
    limit: "10",
    role: "EDITOR",
    isActive: "false",
    email: " USER@EXAMPLE.COM ",
    sortBy: "email",
    sortOrder: "asc",
  });

  assert.deepEqual(result, {
    page: 2,
    limit: 10,
    role: "EDITOR",
    isActive: false,
    email: "user@example.com",
    sortBy: "email",
    sortOrder: "asc",
  });
  assert.equal(parseUserListQuery({}).limit, 20);
  assert.equal(parseUserListQuery({}).page, 1);
  assert.equal(MAX_LIMIT, 100);
});

test("user list query rejects invalid pagination, filters, fields, and ordering", () => {
  const invalidQueries = [
    {
      query: { page: "0" },
      code: "INVALID_USER_LIST_QUERY",
    },
    {
      query: { limit: "101" },
      code: "INVALID_USER_LIST_QUERY",
    },
    {
      query: { role: "OWNER" },
      code: "INVALID_USER_ROLE",
    },
    {
      query: { isActive: "yes" },
      code: "INVALID_USER_LIST_QUERY",
    },
    {
      query: { email: "not-an-email" },
      code: "INVALID_USER_EMAIL",
    },
    {
      query: { sortBy: "password_hash" },
      code: "INVALID_USER_LIST_QUERY",
    },
    {
      query: { sortOrder: "random" },
      code: "INVALID_USER_LIST_QUERY",
    },
    {
      query: { unknown: "value" },
      code: "UNEXPECTED_USER_FIELDS",
    },
  ];

  for (const testCase of invalidQueries) {
    assert.throws(
      () => parseUserListQuery(testCase.query),
      (error) => {
        assertAppError(
          error,
          400,
          testCase.code
        );
        return true;
      }
    );
  }
});

test("user ID parser accepts only positive safe integers", () => {
  assert.equal(parseUserId("42"), 42);
  for (const value of [
    "0",
    "-1",
    "1.5",
    "abc",
    "9007199254740992",
  ]) {
    assert.throws(
      () => parseUserId(value),
      (error) => {
        assertAppError(error, 400, "INVALID_USER_ID");
        return true;
      }
    );
  }
});

test("user body validators enforce allowed fields and strong values", () => {
  const createInput = parseCreateUserBody({
    email: " ADMIN@EXAMPLE.COM ",
    password: VALID_PASSWORD,
    role: "ADMIN",
  });
  assert.deepEqual(createInput, {
    email: "admin@example.com",
    password: VALID_PASSWORD,
    role: "ADMIN",
  });
  assert.deepEqual(
    parseRoleBody({ role: "EDITOR" }),
    { role: "EDITOR" }
  );
  assert.deepEqual(
    parseStatusBody({ isActive: false }),
    { isActive: false }
  );
  assert.deepEqual(
    parsePasswordBody({ password: VALID_PASSWORD }),
    { password: VALID_PASSWORD }
  );

  const invalidBodies = [
    {
      body: {
        email: "invalid",
        password: VALID_PASSWORD,
        role: "ADMIN",
      },
      code: "INVALID_USER_EMAIL",
    },
    {
      body: {
        email: "admin@example.com",
        password: "weak",
        role: "ADMIN",
      },
      code: "INVALID_USER_PASSWORD",
    },
    {
      body: {
        email: "admin@example.com",
        password: VALID_PASSWORD,
        role: "OWNER",
      },
      code: "INVALID_USER_ROLE",
    },
    {
      body: {
        email: "admin@example.com",
        password: VALID_PASSWORD,
        role: "ADMIN",
        isActive: false,
      },
      code: "UNEXPECTED_USER_FIELDS",
    },
  ];

  for (const testCase of invalidBodies) {
    assert.throws(
      () => parseCreateUserBody(testCase.body),
      (error) => {
        assertAppError(error, 400, testCase.code);
        return true;
      }
    );
  }
});

test("user repository builds a safe parameterized list query", async () => {
  const queries = [];
  mock.method(
    pool,
    "execute",
    async (sql, parameters) => {
      queries.push({ sql, parameters });
      if (queries.length === 1) {
        return [[createRawUser()], []];
      }
      return [[{ total_items: 1 }], []];
    }
  );

  const result = await userRepository.listUsers({
    page: 2,
    limit: 10,
    role: "EDITOR",
    isActive: false,
    email: "user",
    sortBy: "email",
    sortOrder: "asc",
  });

  assert.equal(result.users.length, 1);
  assert.equal(result.totalItems, 1);
  assert.equal(queries.length, 2);
  assert.doesNotMatch(queries[0].sql, /password_hash/);
  assert.match(queries[0].sql, /ORDER BY email ASC/);
  assert.match(queries[0].sql, /LIMIT \? OFFSET \?/);
  assert.deepEqual(queries[0].parameters, [
    "EDITOR",
    0,
    "%user%",
    10,
    10,
  ]);
  assert.deepEqual(queries[1].parameters, [
    "EDITOR",
    0,
    "%user%",
  ]);
});

test("user repository rejects sort fields outside the whitelist", async () => {
  await assert.rejects(
    userRepository.listUsers({
      page: 1,
      limit: 20,
      sortBy: "password_hash",
      sortOrder: "asc",
    }),
    /Invalid user sort configuration/
  );
});

test("administrative user detail maps only approved fields", async () => {
  mock.method(
    userRepository,
    "findUserById",
    async () => createRawUser()
  );

  const result = await userService.getUserById(7);

  assert.deepEqual(Object.keys(result).sort(), [
    "createdAt",
    "email",
    "id",
    "isActive",
    "lastLoginAt",
    "passwordChangedAt",
    "role",
    "updatedAt",
  ]);
  assert.equal(
    Object.hasOwn(result, "password_hash"),
    false
  );
});

test("administrative user listing returns pagination without sensitive fields", async () => {
  mock.method(
    userRepository,
    "listUsers",
    async () => ({
      users: [createRawUser()],
      totalItems: 21,
    })
  );

  const result = await userService.listAdministrativeUsers({
    page: 2,
    limit: 10,
  });

  assert.equal(result.users.length, 1);
  assert.deepEqual(result.pagination, {
    page: 2,
    limit: 10,
    totalItems: 21,
    totalPages: 3,
  });
  assert.equal(
    Object.hasOwn(result.users[0], "password_hash"),
    false
  );
});

test("administrative user creation hashes password and creates no session", async () => {
  let receivedHash;
  mock.method(
    userRepository,
    "findUserByEmail",
    async () => null
  );
  mock.method(
    userRepository,
    "createUser",
    async ({ passwordHash: hash }) => {
      receivedHash = hash;
      return { id: 8 };
    }
  );
  mock.method(
    userRepository,
    "findUserById",
    async () => createRawUser({ id: 8 })
  );
  let sessionCalls = 0;
  mock.method(
    authSessionRepository,
    "createSession",
    async () => {
      sessionCalls += 1;
    }
  );

  const result = await userService.createAdministrativeUser({
    email: " NEW@EXAMPLE.COM ",
    password: VALID_PASSWORD,
    role: "EDITOR",
  });

  assert.equal(result.id, 8);
  assert.equal(result.role, "ADMIN");
  assert.equal(typeof receivedHash, "string");
  assert.equal(receivedHash.length > 0, true);
  assert.equal(sessionCalls, 0);
  assert.equal(
    Object.hasOwn(result, "password_hash"),
    false
  );
});

test("role change revokes sessions in the same transaction", async () => {
  const transaction = mockTransaction();
  const connectionArguments = [];
  let revokeConnection;

  mock.method(
    userRepository,
    "findUserByIdForUpdate",
    async () => createRawUser()
  );
  mock.method(
    userRepository,
    "findActiveAdminIdsExcludingUserId",
    async () => [8]
  );
  mock.method(
    userRepository,
    "updateRoleById",
    async ({ connection }) => {
      connectionArguments.push(connection);
      return true;
    }
  );
  mock.method(
    userRepository,
    "findUserById",
    async () => createRawUser({ role: "EDITOR" })
  );
  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async (userId, connection) => {
      revokeConnection = connection;
      return 2;
    }
  );

  const result = await userService.changeUserRole({
    userId: 7,
    role: "EDITOR",
  });

  assert.equal(result.role, "EDITOR");
  assert.equal(connectionArguments[0], revokeConnection);
  assert.equal(transaction.committed, true);
  assert.equal(transaction.rolledBack, false);
});

test("role change protects the last active ADMIN and supports idempotency", async () => {
  mockTransaction();
  mock.method(
    userRepository,
    "findUserByIdForUpdate",
    async () => createRawUser()
  );
  mock.method(
    userRepository,
    "findActiveAdminIdsExcludingUserId",
    async () => []
  );
  await assert.rejects(
    userService.changeUserRole({
      userId: 7,
      role: "EDITOR",
    }),
    (error) => {
      assertAppError(
        error,
        409,
        "LAST_ACTIVE_ADMIN_REQUIRED"
      );
      return true;
    }
  );

  mock.restoreAll();
  mockTransaction();
  let updateCalls = 0;
  let revokeCalls = 0;
  mock.method(
    userRepository,
    "findUserByIdForUpdate",
    async () => createRawUser()
  );
  mock.method(
    userRepository,
    "updateRoleById",
    async () => {
      updateCalls += 1;
      return true;
    }
  );
  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async () => {
      revokeCalls += 1;
      return 0;
    }
  );

  const result = await userService.changeUserRole({
    userId: 7,
    role: "ADMIN",
  });

  assert.equal(result.role, "ADMIN");
  assert.equal(updateCalls, 0);
  assert.equal(revokeCalls, 0);
});

test("status changes protect self-deactivation and revoke sessions on deactivation", async () => {
  await assert.rejects(
    userService.changeUserStatus({
      userId: 7,
      isActive: false,
      actorId: 7,
    }),
    (error) => {
      assertAppError(
        error,
        409,
        "SELF_DEACTIVATION_NOT_ALLOWED"
      );
      return true;
    }
  );

  mockTransaction();
  mock.method(
    userRepository,
    "findUserByIdForUpdate",
    async () => createRawUser({ role: "EDITOR" })
  );
  mock.method(
    userRepository,
    "updateStatusById",
    async () => true
  );
  mock.method(
    userRepository,
    "findUserById",
    async () => createRawUser({
      role: "EDITOR",
      is_active: 0,
    })
  );
  let revokeCalls = 0;
  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async () => {
      revokeCalls += 1;
      return 3;
    }
  );

  const result = await userService.changeUserStatus({
    userId: 7,
    isActive: false,
    actorId: 1,
  });

  assert.equal(result.isActive, false);
  assert.equal(revokeCalls, 1);
});

test("status change protects the last active ADMIN", async () => {
  mockTransaction();
  mock.method(
    userRepository,
    "findUserByIdForUpdate",
    async () => createRawUser()
  );
  mock.method(
    userRepository,
    "findActiveAdminIdsExcludingUserId",
    async () => []
  );

  await assert.rejects(
    userService.changeUserStatus({
      userId: 7,
      isActive: false,
      actorId: 1,
    }),
    (error) => {
      assertAppError(
        error,
        409,
        "LAST_ACTIVE_ADMIN_REQUIRED"
      );
      return true;
    }
  );
});

test("password reset hashes, revokes sessions, and returns no password data", async () => {
  const transaction = mockTransaction();
  let receivedHash;
  let revokeConnection;
  mock.method(
    userRepository,
    "findUserByIdForUpdate",
    async () => createRawUser()
  );
  mock.method(
    userRepository,
    "updatePasswordHashById",
    async (userId, hash, connection) => {
      receivedHash = hash;
      revokeConnection = connection;
      return true;
    }
  );
  mock.method(
    userRepository,
    "findUserById",
    async () => createRawUser()
  );
  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async (userId, connection) => {
      assert.equal(connection, revokeConnection);
      return 2;
    }
  );

  const result = await userService.resetUserPassword({
    userId: 7,
    password: VALID_PASSWORD,
  });

  assert.equal(typeof receivedHash, "string");
  assert.equal(Object.hasOwn(result, "password"), false);
  assert.equal(
    Object.hasOwn(result, "password_hash"),
    false
  );
  assert.equal(transaction.committed, true);
});

test("password reset rolls back when session revocation fails", async () => {
  const transaction = mockTransaction();
  mock.method(
    userRepository,
    "findUserByIdForUpdate",
    async () => createRawUser()
  );
  mock.method(
    userRepository,
    "updatePasswordHashById",
    async () => true
  );
  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async () => {
      throw new Error("simulated revoke failure");
    }
  );

  await assert.rejects(
    userService.resetUserPassword({
      userId: 7,
      password: VALID_PASSWORD,
    }),
    /simulated revoke failure/
  );
  assert.equal(transaction.committed, false);
  assert.equal(transaction.rolledBack, true);
});

test("administrative session revocation checks user existence and is idempotent", async () => {
  mockTransaction();
  let receivedUserId;
  mock.method(
    userRepository,
    "findUserById",
    async () => createRawUser()
  );
  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async (userId) => {
      receivedUserId = userId;
      return 0;
    }
  );

  const first = await userService.revokeUserSessions(7);
  const second = await userService.revokeUserSessions(7);

  assert.equal(first, 0);
  assert.equal(second, 0);
  assert.equal(receivedUserId, 7);

  mock.restoreAll();
  mockTransaction();
  mock.method(
    userRepository,
    "findUserById",
    async () => null
  );
  await assert.rejects(
    userService.revokeUserSessions(999),
    (error) => {
      assertAppError(error, 404, "USER_NOT_FOUND");
      return true;
    }
  );
});

test("role and status changes roll back when session revocation fails", async () => {
  const roleTransaction = mockTransaction();
  mock.method(
    userRepository,
    "findUserByIdForUpdate",
    async () => createRawUser()
  );
  mock.method(
    userRepository,
    "findActiveAdminIdsExcludingUserId",
    async () => [8]
  );
  mock.method(
    userRepository,
    "updateRoleById",
    async () => true
  );
  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async () => {
      throw new Error("role revoke failure");
    }
  );

  await assert.rejects(
    userService.changeUserRole({
      userId: 7,
      role: "EDITOR",
    }),
    /role revoke failure/
  );
  assert.equal(roleTransaction.committed, false);
  assert.equal(roleTransaction.rolledBack, true);

  mock.restoreAll();
  const statusTransaction = mockTransaction();
  mock.method(
    userRepository,
    "findUserByIdForUpdate",
    async () => createRawUser({
      role: "EDITOR",
    })
  );
  mock.method(
    userRepository,
    "updateStatusById",
    async () => true
  );
  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async () => {
      throw new Error("status revoke failure");
    }
  );

  await assert.rejects(
    userService.changeUserStatus({
      userId: 7,
      isActive: false,
      actorId: 1,
    }),
    /status revoke failure/
  );
  assert.equal(statusTransaction.committed, false);
  assert.equal(statusTransaction.rolledBack, true);
});

test("role, status, and password operations reject nonexistent users or invalid roles", async () => {
  mockTransaction();
  mock.method(
    userRepository,
    "findUserByIdForUpdate",
    async () => null
  );
  await assert.rejects(
    userService.changeUserRole({
      userId: 999,
      role: "EDITOR",
    }),
    (error) => {
      assertAppError(error, 404, "USER_NOT_FOUND");
      return true;
    }
  );

  await assert.rejects(
    userService.changeUserStatus({
      userId: 999,
      isActive: false,
      actorId: 1,
    }),
    (error) => {
      assertAppError(error, 404, "USER_NOT_FOUND");
      return true;
    }
  );

  await assert.rejects(
    userService.resetUserPassword({
      userId: 999,
      password: VALID_PASSWORD,
    }),
    (error) => {
      assertAppError(error, 404, "USER_NOT_FOUND");
      return true;
    }
  );

  await assert.rejects(
    userService.changeUserRole({
      userId: 7,
      role: "OWNER",
    }),
    (error) => {
      assertAppError(error, 400, "INVALID_USER_ROLE");
      return true;
    }
  );
});

test("administrative user creation rejects duplicate email before hashing", async () => {
  mock.method(
    userRepository,
    "findUserByEmail",
    async () => createRawUser()
  );

  await assert.rejects(
    userService.createAdministrativeUser({
      email: "duplicate@example.com",
      password: VALID_PASSWORD,
      role: "EDITOR",
    }),
    (error) => {
      assertAppError(error, 409, "USER_EMAIL_ALREADY_EXISTS");
      return true;
    }
  );
});

test("administrative user detail rejects a nonexistent user", async () => {
  mock.method(
    userRepository,
    "findUserById",
    async () => null
  );

  await assert.rejects(
    userService.getUserById(999),
    (error) => {
      assertAppError(error, 404, "USER_NOT_FOUND");
      return true;
    }
  );
});

test("status activation updates the user without revoking sessions", async () => {
  const transaction = mockTransaction();
  mock.method(
    userRepository,
    "findUserByIdForUpdate",
    async () => createRawUser({ is_active: 0 })
  );
  mock.method(
    userRepository,
    "updateStatusById",
    async () => true
  );
  mock.method(
    userRepository,
    "findUserById",
    async () => createRawUser({ is_active: 1 })
  );
  let revokeCalls = 0;
  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async () => {
      revokeCalls += 1;
      return 0;
    }
  );

  const result = await userService.changeUserStatus({
    userId: 7,
    isActive: true,
    actorId: 1,
  });

  assert.equal(result.isActive, true);
  assert.equal(revokeCalls, 0);
  assert.equal(transaction.committed, true);
});
