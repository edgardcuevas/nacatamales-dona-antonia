const test = require("node:test");
const assert = require("node:assert/strict");
const {
  after,
  afterEach,
  mock,
} = require("node:test");

const TEST_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "youtube_state_test",
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
    "http://localhost:3000/api/youtube/oauth/callback",
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

const AppError = require("../../src/errors/app-error");
const pool = require("../../src/database/pool");
const youtubeStateRepository = require(
  "../../src/modules/youtube/youtube-state.repository"
);
const youtubeService = require(
  "../../src/modules/youtube/youtube.service"
);
const {
  youtubeClient,
} = require("../../src/config/youtube");
const {
  parseCallbackQuery,
} = require(
  "../../src/modules/youtube/youtube.validator"
);

function assertAppError(
  error,
  statusCode,
  code
) {
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.code, code);
}

function createFakeConnection(row) {
  const calls = [];
  return {
    calls,
    async beginTransaction() {
      calls.push(["begin"]);
    },
    async execute(sql, parameters) {
      calls.push(["execute", sql, parameters]);
      if (sql.includes("SELECT")) {
        return [row ? [row] : [], []];
      }
      return [{ affectedRows: 1 }, []];
    },
    async commit() {
      calls.push(["commit"]);
    },
    async rollback() {
      calls.push(["rollback"]);
    },
    release() {
      calls.push(["release"]);
    },
  };
}

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
  youtubeService.clearAccessTokenCache();
});

test("callback accepts the exact Google issuer and rejects a callback without code", () => {
  const state = "s".repeat(64);
  assert.deepEqual(
    parseCallbackQuery({
      code: "authorization-code",
      state,
      iss: "https://accounts.google.com",
    }),
    {
      code: "authorization-code",
      state,
    }
  );

  assert.throws(
    () =>
      parseCallbackQuery({
        state,
        iss: "https://accounts.google.com",
      }),
    (error) => {
      assertAppError(
        error,
        400,
        "INVALID_YOUTUBE_OAUTH_CALLBACK"
      );
      return true;
    }
  );

  assert.throws(
    () =>
      parseCallbackQuery({
        code: "authorization-code",
        state,
        iss: "https://evil.example",
      }),
    (error) => {
      assertAppError(
        error,
        400,
        "INVALID_YOUTUBE_OAUTH_CALLBACK"
      );
      return true;
    }
  );
});

test("state repository stores only the supplied hash and claims an available state once", async () => {
  const executeCalls = [];
  mock.method(
    pool,
    "execute",
    async (sql, parameters) => {
      executeCalls.push({ sql, parameters });
    }
  );
  await youtubeStateRepository.createOAuthState({
    stateHash: "a".repeat(64),
    adminUserId: 7,
    expiresAt: new Date("2026-01-01T00:10:00Z"),
  });
  assert.equal(executeCalls.length, 1);
  assert.equal(
    executeCalls[0].parameters.includes(
      "a".repeat(64)
    ),
    true
  );
  assert.equal(
    JSON.stringify(executeCalls[0]).includes(
      "refresh_token"
    ),
    false
  );

  mock.restoreAll();
  const connection = createFakeConnection({
    id: 9,
    expires_at: new Date(Date.now() + 60_000),
    consumed_at: null,
  });
  mock.method(
    pool,
    "getConnection",
    async () => connection
  );
  const result =
    await youtubeStateRepository.consumeOAuthState({
      stateHash: "b".repeat(64),
    });
  assert.deepEqual(result, {
    accepted: true,
    reason: null,
  });
  assert.equal(
    connection.calls.some(
      ([name]) => name === "commit"
    ),
    true
  );
  assert.equal(
    connection.calls.some(
      ([name]) => name === "release"
    ),
    true
  );
});

test("state repository rejects missing, expired, and already-consumed rows without updating them", async () => {
  for (const scenario of [
    {
      row: null,
      reason: "missing",
    },
    {
      row: {
        id: 1,
        expires_at: new Date(Date.now() - 1000),
        consumed_at: null,
      },
      reason: "expired",
    },
    {
      row: {
        id: 1,
        expires_at: new Date(Date.now() + 60_000),
        consumed_at: new Date(),
      },
      reason: "consumed",
    },
  ]) {
    const connection = createFakeConnection(scenario.row);
    mock.method(
      pool,
      "getConnection",
      async () => connection
    );
    const result =
      await youtubeStateRepository.consumeOAuthState({
        stateHash: "c".repeat(64),
      });
    assert.deepEqual(result, {
      accepted: false,
      reason: scenario.reason,
    });
    assert.equal(
      connection.calls.some(
        ([name, sql]) =>
          name === "execute" &&
          sql.trim().startsWith("UPDATE")
      ),
      false
    );
    mock.restoreAll();
  }
});

test("callback rejects nonexistent, expired, and reused state before contacting Google", async () => {
  for (const reason of [
    "missing",
    "expired",
    "consumed",
  ]) {
    let exchanged = false;
    mock.method(
      youtubeStateRepository,
      "consumeOAuthState",
      async () => ({
        accepted: false,
        reason,
      })
    );
    mock.method(
      youtubeClient,
      "exchangeAuthorizationCode",
      async () => {
        exchanged = true;
        return {};
      }
    );

    await assert.rejects(
      youtubeService.completeAuthorization({
        code: "authorization-code",
        state: "d".repeat(64),
        stateCookie: "d".repeat(64),
      }),
      (error) => {
        assertAppError(
          error,
          400,
          "YOUTUBE_OAUTH_STATE_INVALID"
        );
        return true;
      }
    );
    assert.equal(exchanged, false);
    mock.restoreAll();
  }
});
