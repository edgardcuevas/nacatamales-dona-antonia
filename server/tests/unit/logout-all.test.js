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
  DB_NAME: "logout_all_test",
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
  GOOGLE_CLIENT_ID: "test_google_client_id",
  GOOGLE_CLIENT_SECRET: "test_google_client_secret",
  GOOGLE_REDIRECT_URI:
    "https://example.test/api/admin/youtube/callback",
  YOUTUBE_TOKEN_ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  YOUTUBE_CHANNEL_ID: "UC1234567890123456789012",
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

const authSessionRepository = require(
  "../../src/modules/auth/auth-session.repository"
);
const {
  revokeAllAuthSessions,
} = require("../../src/modules/auth/auth-session.service");
const userRepository = require(
  "../../src/modules/users/user.repository"
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

function createAccessToken() {
  return generateAccessToken({
    id: 7,
    role: "ADMIN",
  });
}

function createActiveUser() {
  return {
    id: 7,
    email: "admin@example.com",
    role: "ADMIN",
    is_active: 1,
  };
}

async function postLogoutAll(
  accessToken,
  body = {}
) {
  const headers = {
    "content-type": "application/json",
  };

  if (accessToken !== undefined) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(
    `${baseUrl}/api/auth/logout-all`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }
  );
  const responseBody = await response.json();
  const setCookie =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()[0] ?? null
      : response.headers.get("set-cookie");

  return {
    status: response.status,
    body: responseBody,
    setCookie,
  };
}

test("repository revokes only active sessions for the requested user", async () => {
  let capturedSql = "";
  let capturedParameters = [];

  mock.method(
    pool,
    "execute",
    async (sql, parameters) => {
      capturedSql = sql;
      capturedParameters = parameters;
      return [{ affectedRows: 3 }];
    }
  );

  const affectedRows =
    await authSessionRepository
      .revokeAllActiveSessionsByUserId(7);

  assert.equal(affectedRows, 3);
  assert.match(capturedSql, /WHERE user_id = \?/);
  assert.match(capturedSql, /revoked_at IS NULL/);
  assert.match(capturedSql, /expires_at > CURRENT_TIMESTAMP/);
  assert.match(capturedSql, /revoked_at = CURRENT_TIMESTAMP/);
  assert.match(capturedSql, /last_used_at = CURRENT_TIMESTAMP/);
  assert.doesNotMatch(capturedSql, /refresh_token_hash/);
  assert.deepEqual(capturedParameters, [7]);
});

test("service passes the validated user ID to the repository", async () => {
  let receivedUserId;

  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async (userId) => {
      receivedUserId = userId;
      return 2;
    }
  );

  const affectedRows = await revokeAllAuthSessions(7);

  assert.equal(affectedRows, 2);
  assert.equal(receivedUserId, 7);
});

test("POST /api/auth/logout-all revokes sessions and clears the cookie", async () => {
  mock.method(
    userRepository,
    "findUserById",
    async () => createActiveUser()
  );
  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async () => 2
  );

  const result = await postLogoutAll(createAccessToken());

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    success: true,
    message: "All sessions closed successfully",
    data: null,
  });
  assert.ok(result.setCookie);
  assert.match(result.setCookie, /^refreshToken=;/);
});

test("POST /api/auth/logout-all ignores a user ID in the body", async () => {
  let receivedUserId;

  mock.method(
    userRepository,
    "findUserById",
    async () => createActiveUser()
  );
  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async (userId) => {
      receivedUserId = userId;
      return 1;
    }
  );

  const result = await postLogoutAll(
    createAccessToken(),
    { userId: 999 }
  );

  assert.equal(result.status, 200);
  assert.equal(receivedUserId, 7);
});

test("POST /api/auth/logout-all is idempotent", async () => {
  const receivedUserIds = [];
  let affectedRows = 2;

  mock.method(
    userRepository,
    "findUserById",
    async () => createActiveUser()
  );
  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async (userId) => {
      receivedUserIds.push(userId);
      const currentAffectedRows = affectedRows;
      affectedRows = 0;
      return currentAffectedRows;
    }
  );

  const firstResult = await postLogoutAll(
    createAccessToken()
  );
  const secondResult = await postLogoutAll(
    createAccessToken()
  );

  assert.equal(firstResult.status, 200);
  assert.equal(secondResult.status, 200);
  assert.deepEqual(receivedUserIds, [7, 7]);
});

test("POST /api/auth/logout-all requires an access token", async () => {
  const result = await postLogoutAll();

  assert.equal(result.status, 401);
  assert.deepEqual(result.body, {
    success: false,
    error: {
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication is required",
    },
  });
});

test("POST /api/auth/logout-all rejects an inactive user", async () => {
  let revokeCalls = 0;

  mock.method(
    userRepository,
    "findUserById",
    async () => ({
      ...createActiveUser(),
      is_active: 0,
    })
  );
  mock.method(
    authSessionRepository,
    "revokeAllActiveSessionsByUserId",
    async () => {
      revokeCalls += 1;
      return 1;
    }
  );

  const result = await postLogoutAll(createAccessToken());

  assert.equal(result.status, 401);
  assert.deepEqual(result.body, {
    success: false,
    error: {
      code: "AUTHENTICATED_USER_UNAVAILABLE",
      message: "The authenticated user is unavailable",
    },
  });
  assert.equal(revokeCalls, 0);
});
