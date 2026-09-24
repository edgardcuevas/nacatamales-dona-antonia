const test = require("node:test");
const assert = require("node:assert/strict");
const {
  after,
  afterEach,
  before,
  beforeEach,
  mock,
} = require("node:test");

const TEST_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "auth_security_test",
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

const jwt = require("jsonwebtoken");

const env = require("../../src/config/env");
const AppError = require("../../src/errors/app-error");
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
  generateAccessToken,
  generateRefreshToken,
} = require("../../src/modules/auth/token.service");
const {
  hashPassword,
} = require("../../src/modules/users/password.service");
const authorizeRoles = require(
  "../../src/middlewares/authorize-roles.middleware"
);
const requireActiveUser = require(
  "../../src/middlewares/require-active-user.middleware"
);
const {
  resetRateLimiters,
} = require("../../src/middlewares/rate-limit.middleware");
const app = require("../../src/app");
const pool = require("../../src/database/pool");

const VALID_PASSWORD = "valid-security-test-password";
const ACCESS_TOKEN_ISSUER =
  "nacatamales-dona-antonia-api";
const ACCESS_TOKEN_AUDIENCE =
  "nacatamales-dona-antonia-admin";
const REFRESH_TOKEN_AUDIENCE =
  "nacatamales-dona-antonia-refresh";

let server;
let baseUrl;
let passwordHash;

before(async () => {
  passwordHash = await hashPassword(VALID_PASSWORD);
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
  resetRateLimiters();
});

beforeEach(() => {
  resetRateLimiters();
});

function createUser(overrides = {}) {
  return {
    id: 7,
    email: "security-user@example.com",
    password_hash: passwordHash,
    role: "ADMIN",
    is_active: 1,
    ...overrides,
  };
}

function createSession(overrides = {}) {
  return {
    id: 1,
    user_id: 7,
    revoked_at: null,
    expires_at: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

function getSetCookie(response) {
  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")];
  return values.find(Boolean) ?? null;
}

function getCookiePair(response) {
  const value = getSetCookie(response);
  return value ? value.split(";", 1)[0] : null;
}

async function request(
  path,
  {
    method = "GET",
    body,
    token,
    cookie,
    headers = {},
  } = {}
) {
  const requestHeaders = { ...headers };

  if (token !== undefined) {
    requestHeaders.authorization = `Bearer ${token}`;
  }

  if (cookie !== undefined) {
    requestHeaders.cookie = cookie;
  }

  const options = {
    method,
    headers: requestHeaders,
  };

  if (body !== undefined) {
    if (
      requestHeaders["content-type"] === undefined
    ) {
      requestHeaders["content-type"] =
        "application/json";
    }
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${path}`, options);
  const responseBody = await response.json();

  return {
    status: response.status,
    body: responseBody,
    setCookie: getSetCookie(response),
  };
}

function assertError(
  result,
  statusCode,
  code,
  message
) {
  assert.equal(result.status, statusCode);
  assert.deepEqual(result.body, {
    success: false,
    error: {
      code,
      message,
    },
  });
}

function mockSuccessfulLogin(user = createUser()) {
  mock.method(
    userRepository,
    "findUserByEmail",
    async () => user
  );
  mock.method(
    authSessionRepository,
    "withTransaction",
    async (work) => work({ id: "transaction" })
  );
  mock.method(
    authSessionRepository,
    "createSession",
    async () => ({ id: 1 })
  );
  mock.method(
    userRepository,
    "updateLastLoginAtById",
    async () => true
  );
}

function signExpiredRefreshToken() {
  return jwt.sign(
    {
      exp: Math.floor(Date.now() / 1000) - 60,
    },
    env.jwt.refreshTokenSecret,
    {
      algorithm: "HS256",
      subject: "7",
      jwtid: "expired-refresh-token",
      issuer: ACCESS_TOKEN_ISSUER,
      audience: REFRESH_TOKEN_AUDIENCE,
    }
  );
}

function tamperToken(token) {
  const [header, payload, signature] = token.split(".");
  const tamperedSignature =
    `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
  return [header, payload, tamperedSignature].join(".");
}

function mockActiveUser(user = createUser()) {
  mock.method(
    userRepository,
    "findUserById",
    async () => user
  );
}

function executeMiddleware(middleware, requestObject) {
  let nextCalls = 0;
  let nextError;

  middleware(requestObject, {}, (error) => {
    nextCalls += 1;
    nextError = error;
  });

  return {
    nextCalls,
    nextError,
  };
}

test("login rejects absent, null, and array bodies", async () => {
  const cases = [
    {
      sendBody: false,
      code: "INVALID_LOGIN_INPUT",
    },
    {
      body: null,
      code: "INVALID_JSON",
      message: "The request body contains invalid JSON",
    },
    {
      body: [],
      code: "INVALID_LOGIN_INPUT",
      message: "Email and password are required",
    },
  ];

  for (const testCase of cases) {
    const result = await request("/api/auth/login", {
      method: "POST",
      body: testCase.sendBody === false
        ? undefined
        : testCase.body,
    });

    assertError(
      result,
      400,
      testCase.code,
      testCase.message ?? "Email and password are required"
    );
  }
});

test("login rejects missing, empty, and non-string email values", async () => {
  const cases = [
    {},
    { email: "", password: VALID_PASSWORD },
    { email: "   ", password: VALID_PASSWORD },
    { email: 123, password: VALID_PASSWORD },
  ];

  for (const body of cases) {
    const result = await request("/api/auth/login", {
      method: "POST",
      body,
    });

    assertError(
      result,
      400,
      "INVALID_EMAIL",
      "A valid email is required"
    );
  }
});

test("login rejects missing, empty, and non-string passwords", async () => {
  const cases = [
    { email: "security-user@example.com" },
    {
      email: "security-user@example.com",
      password: "",
    },
    {
      email: "security-user@example.com",
      password: 123,
    },
  ];

  for (const body of cases) {
    const result = await request("/api/auth/login", {
      method: "POST",
      body,
    });

    assertError(
      result,
      400,
      "INVALID_PASSWORD",
      "Password is required"
    );
  }
});

test("login rejects incorrect credentials without creating a session", async () => {
  mock.method(
    userRepository,
    "findUserByEmail",
    async () => createUser()
  );
  let transactionCalls = 0;
  mock.method(
    authSessionRepository,
    "withTransaction",
    async () => {
      transactionCalls += 1;
    }
  );

  const result = await request("/api/auth/login", {
    method: "POST",
    body: {
      email: "security-user@example.com",
      password: "incorrect-password",
    },
  });

  assertError(
    result,
    401,
    "INVALID_CREDENTIALS",
    "Invalid email or password"
  );
  assert.equal(transactionCalls, 0);
});

test("login rejects an inactive user without creating a session", async () => {
  mock.method(
    userRepository,
    "findUserByEmail",
    async () => createUser({ is_active: 0 })
  );
  let transactionCalls = 0;
  mock.method(
    authSessionRepository,
    "withTransaction",
    async () => {
      transactionCalls += 1;
    }
  );

  const result = await request("/api/auth/login", {
    method: "POST",
    body: {
      email: "security-user@example.com",
      password: VALID_PASSWORD,
    },
  });

  assertError(
    result,
    403,
    "USER_INACTIVE",
    "This user account is inactive"
  );
  assert.equal(transactionCalls, 0);
});

test("login response contains no password hash or refresh token and sets HttpOnly cookie", async () => {
  mockSuccessfulLogin();

  const result = await request("/api/auth/login", {
    method: "POST",
    body: {
      email: "security-user@example.com",
      password: VALID_PASSWORD,
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(typeof result.body.data.accessToken, "string");
  assert.equal(
    Object.hasOwn(result.body.data, "refreshToken"),
    false
  );
  assert.equal(
    Object.hasOwn(result.body.data.user, "password_hash"),
    false
  );
  assert.equal(typeof result.setCookie, "string");
  assert.equal(result.setCookie.includes("HttpOnly"), true);
  assert.equal(
    result.setCookie.includes("Path=/api/auth"),
    true
  );
});

test("refresh rejects absent and empty cookies", async () => {
  const absent = await request("/api/auth/refresh", {
    method: "POST",
  });
  const empty = await request("/api/auth/refresh", {
    method: "POST",
    cookie: "refreshToken=",
  });

  assertError(
    absent,
    401,
    "REFRESH_TOKEN_REQUIRED",
    "A refresh token is required"
  );
  assertError(
    empty,
    401,
    "REFRESH_TOKEN_REQUIRED",
    "A refresh token is required"
  );
});

test("refresh rejects tampered, expired, and access tokens", async () => {
  const validRefreshToken = generateRefreshToken({ id: 7 });
  const tamperedToken = tamperToken(validRefreshToken);
  const expiredToken = signExpiredRefreshToken();
  const accessToken = generateAccessToken({
    id: 7,
    role: "ADMIN",
  });

  for (const token of [
    tamperedToken,
    expiredToken,
    accessToken,
  ]) {
    const result = await request("/api/auth/refresh", {
      method: "POST",
      cookie: `refreshToken=${token}`,
    });

    assertError(
      result,
      401,
      "INVALID_REFRESH_TOKEN",
      "The refresh token is invalid or expired"
    );
  }
});

test("refresh rejects nonexistent, revoked, and expired sessions", async () => {
  const sessions = [
    null,
    createSession({ revoked_at: new Date() }),
    createSession({
      expires_at: new Date(Date.now() - 60_000),
    }),
  ];

  for (const session of sessions) {
    mock.method(
      authSessionRepository,
      "findSessionByRefreshTokenHash",
      async () => session
    );

    const refreshToken = generateRefreshToken({ id: 7 });
    const result = await request("/api/auth/refresh", {
      method: "POST",
      cookie: `refreshToken=${refreshToken}`,
    });

    assertError(
      result,
      401,
      "INVALID_REFRESH_TOKEN",
      "The refresh token is invalid or expired"
    );
    mock.restoreAll();
  }
});

test("refresh rejects nonexistent, inactive, and invalid-role users", async () => {
  let currentUser = null;
  mock.method(
    authSessionRepository,
    "findSessionByRefreshTokenHash",
    async () => createSession()
  );
  mock.method(
    userRepository,
    "findUserById",
    async () => currentUser
  );

  const users = [
    null,
    createUser({ is_active: 0 }),
    createUser({ role: "OWNER" }),
  ];

  for (const user of users) {
    currentUser = user;
    const refreshToken = generateRefreshToken({ id: 7 });
    const result = await request("/api/auth/refresh", {
      method: "POST",
      cookie: `refreshToken=${refreshToken}`,
    });

    assertError(
      result,
      401,
      "INVALID_REFRESH_TOKEN",
      "The refresh token is invalid or expired"
    );
  }
});

test("refresh rotates once, revokes reuse, and omits refresh token from JSON", async () => {
  const currentSession = createSession();
  let rotationCalls = 0;
  const rotateArguments = [];

  mock.method(
    authSessionRepository,
    "findSessionByRefreshTokenHash",
    async () => currentSession
  );
  mockActiveUser();
  mock.method(
    authSessionRepository,
    "rotateSession",
    async (argumentsObject) => {
      rotationCalls += 1;
      rotateArguments.push(argumentsObject);
      currentSession.revoked_at = new Date();
      return { id: 2 };
    }
  );

  const refreshToken = generateRefreshToken({ id: 7 });
  const firstResult = await request("/api/auth/refresh", {
    method: "POST",
    cookie: `refreshToken=${refreshToken}`,
  });

  assert.equal(firstResult.status, 200);
  assert.equal(
    Object.hasOwn(firstResult.body.data, "refreshToken"),
    false
  );
  assert.equal(rotationCalls, 1);
  assert.equal(rotateArguments.length, 1);

  const secondResult = await request("/api/auth/refresh", {
    method: "POST",
    cookie: `refreshToken=${refreshToken}`,
  });

  assertError(
    secondResult,
    401,
    "INVALID_REFRESH_TOKEN",
    "The refresh token is invalid or expired"
  );
  assert.equal(rotationCalls, 1);
});

test("logout is idempotent, clears the cookie, and does not affect other session operations", async () => {
  let revokeCalls = 0;
  mock.method(
    authSessionRepository,
    "revokeSessionByRefreshTokenHash",
    async () => {
      revokeCalls += 1;
      return false;
    }
  );

  const noCookie = await request("/api/auth/logout", {
    method: "POST",
  });
  const first = await request("/api/auth/logout", {
    method: "POST",
    cookie: "refreshToken=manually-invalid-token",
  });
  const second = await request("/api/auth/logout", {
    method: "POST",
    cookie: "refreshToken=manually-invalid-token",
  });

  assert.equal(noCookie.status, 200);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(typeof noCookie.setCookie, "string");
  assert.equal(noCookie.setCookie.startsWith("refreshToken=;"), true);
  assert.equal(revokeCalls, 2);
});

test("logout-all requires an active authenticated user and ignores body identity", async () => {
  let receivedUserId;
  mockActiveUser();
  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async (userId) => {
      receivedUserId = userId;
      return 3;
    }
  );

  const accessToken = generateAccessToken({
    id: 7,
    role: "ADMIN",
  });
  const result = await request("/api/auth/logout-all", {
    method: "POST",
    token: accessToken,
    body: { userId: 999 },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data, null);
  assert.equal(typeof result.setCookie, "string");
  assert.equal(result.setCookie.startsWith("refreshToken=;"), true);
  assert.equal(receivedUserId, 7);
});

test("logout-all rejects missing and inactive authenticated users", async () => {
  const missing = await request("/api/auth/logout-all", {
    method: "POST",
  });
  assertError(
    missing,
    401,
    "AUTHENTICATION_REQUIRED",
    "Authentication is required"
  );

  mockActiveUser(createUser({ is_active: 0 }));
  let revokeCalls = 0;
  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async () => {
      revokeCalls += 1;
      return 1;
    }
  );

  const inactive = await request("/api/auth/logout-all", {
    method: "POST",
    token: generateAccessToken({
      id: 7,
      role: "ADMIN",
    }),
  });

  assertError(
    inactive,
    401,
    "AUTHENTICATED_USER_UNAVAILABLE",
    "The authenticated user is unavailable"
  );
  assert.equal(revokeCalls, 0);
});

test("logout-all is idempotent and leaves authorization count independent", async () => {
  let remaining = 2;
  let revokeCalls = 0;
  mockActiveUser();
  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async () => {
      revokeCalls += 1;
      const affectedRows = remaining;
      remaining = 0;
      return affectedRows;
    }
  );

  const token = generateAccessToken({
    id: 7,
    role: "ADMIN",
  });
  const first = await request("/api/auth/logout-all", {
    method: "POST",
    token,
  });
  const second = await request("/api/auth/logout-all", {
    method: "POST",
    token,
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(revokeCalls, 2);
});

test("role middleware permits ADMIN and rejects EDITOR on ADMIN-only access", () => {
  const adminOnly = authorizeRoles("ADMIN");
  const adminResult = executeMiddleware(adminOnly, {
    currentUser: createUser(),
  });
  const editorResult = executeMiddleware(adminOnly, {
    currentUser: createUser({ role: "EDITOR" }),
  });

  assert.equal(adminResult.nextCalls, 1);
  assert.equal(adminResult.nextError, undefined);
  assert.equal(editorResult.nextCalls, 1);
  assert.equal(editorResult.nextError.statusCode, 403);
  assert.equal(editorResult.nextError.code, "FORBIDDEN");
});

test("role middleware distinguishes missing authentication from forbidden access", () => {
  const middleware = authorizeRoles("ADMIN");
  const missingResult = executeMiddleware(middleware, {});
  const invalidRoleResult = executeMiddleware(middleware, {
    currentUser: createUser({ role: "OWNER" }),
  });

  assert.equal(missingResult.nextError.statusCode, 401);
  assert.equal(
    missingResult.nextError.code,
    "AUTHENTICATION_REQUIRED"
  );
  assert.equal(invalidRoleResult.nextError.statusCode, 403);
  assert.equal(invalidRoleResult.nextError.code, "FORBIDDEN");
});

test("persistent active-user validation rejects unavailable and stale users distinctly", async () => {
  mock.method(
    userRepository,
    "findUserById",
    async () => null
  );
  await assert.rejects(
    userService.getAuthenticatedUser({
      userId: 7,
      tokenRole: "ADMIN",
    }),
    (error) => {
      assert.equal(error.statusCode, 401);
      assert.equal(
        error.code,
        "AUTHENTICATED_USER_UNAVAILABLE"
      );
      return true;
    }
  );

  mock.restoreAll();
  mock.method(
    userRepository,
    "findUserById",
    async () => createUser({ role: "OWNER" })
  );
  await assert.rejects(
    userService.getAuthenticatedUser({
      userId: 7,
      tokenRole: "ADMIN",
    }),
    (error) => {
      assert.equal(error.statusCode, 401);
      assert.equal(error.code, "AUTHENTICATION_STALE");
      return true;
    }
  );
});

test("requireActiveUser preserves 401 for unavailable persistent users", async () => {
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

  const result = await new Promise((resolve) => {
    requireActiveUser(
      {
        auth: {
          userId: 7,
          role: "ADMIN",
          tokenId: "token-id",
        },
      },
      {},
      (error) => resolve({ error })
    );
  });

  assert.equal(result.error.statusCode, 401);
  assert.equal(
    result.error.code,
    "AUTHENTICATED_USER_UNAVAILABLE"
  );
});
