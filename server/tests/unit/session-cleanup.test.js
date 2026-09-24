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
  DB_NAME: "session_cleanup_test",
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

const authSessionRepository = require(
  "../../src/modules/auth/auth-session.repository"
);
const {
  cleanupAuthSessions,
} = require("../../database/scripts/cleanup-auth-sessions");
const pool = require("../../src/database/pool");

const {
  AUTH_SESSION_RETENTION_DAYS,
} = authSessionRepository;

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
});

test("session cleanup uses a fixed 30-day parameterized retention policy", async () => {
  const now = new Date("2026-09-23T12:00:00.000Z");
  const expectedCutoff = new Date(
    "2026-08-24T12:00:00.000Z"
  );
  let capturedSql = "";
  let capturedParameters = [];

  mock.method(
    pool,
    "execute",
    async (sql, parameters) => {
      capturedSql = sql;
      capturedParameters = parameters;
      return [{ affectedRows: 4 }];
    }
  );

  const deletedRows =
    await authSessionRepository.deleteStaleAuthSessions({
      now,
    });

  assert.equal(AUTH_SESSION_RETENTION_DAYS, 30);
  assert.equal(deletedRows, 4);
  assert.match(capturedSql, /DELETE FROM auth_sessions/);
  assert.match(
    capturedSql,
    /expires_at < \?[\s\S]*revoked_at IS NULL/
  );
  assert.match(
    capturedSql,
    /revoked_at IS NOT NULL[\s\S]*revoked_at < \?/
  );
  assert.doesNotMatch(capturedSql, /refresh_token_hash/);
  assert.equal(capturedParameters.length, 2);
  assert.deepEqual(
    capturedParameters,
    [expectedCutoff, expectedCutoff]
  );
});

test("session cleanup is idempotent when no stale rows remain", async () => {
  let callCount = 0;

  mock.method(
    pool,
    "execute",
    async () => {
      callCount += 1;
      return [{
        affectedRows: callCount === 1 ? 2 : 0,
      }];
    }
  );

  const first =
    await authSessionRepository.deleteStaleAuthSessions();
  const second =
    await authSessionRepository.deleteStaleAuthSessions();

  assert.equal(first, 2);
  assert.equal(second, 0);
});

test("session cleanup rejects an invalid cutoff date before querying", async () => {
  let queryCalls = 0;

  mock.method(
    pool,
    "execute",
    async () => {
      queryCalls += 1;
      return [{ affectedRows: 0 }];
    }
  );

  await assert.rejects(
    authSessionRepository.deleteStaleAuthSessions({
      now: "not-a-date",
    }),
    /A valid date is required/
  );
  assert.equal(queryCalls, 0);
});

test("manual cleanup script reports only the deleted count and closes the pool", async () => {
  let poolClosed = false;
  const logMessages = [];
  const errorMessages = [];

  const deletedRows = await cleanupAuthSessions({
    repository: {
      async deleteStaleAuthSessions() {
        return 3;
      },
    },
    databasePool: {
      async end() {
        poolClosed = true;
      },
    },
    logger: {
      log(message) {
        logMessages.push(message);
      },
      error(message) {
        errorMessages.push(message);
      },
    },
  });

  assert.equal(deletedRows, 3);
  assert.equal(poolClosed, true);
  assert.equal(errorMessages.length, 0);
  assert.equal(logMessages.length, 1);
  assert.equal(logMessages[0].includes("3"), true);
  assert.equal(
    logMessages[0].includes("refresh_token_hash"),
    false
  );
  assert.equal(
    logMessages[0].includes("password"),
    false
  );
});

test("manual cleanup script closes the pool when deletion fails", async () => {
  let poolClosed = false;

  await assert.rejects(
    cleanupAuthSessions({
      repository: {
        async deleteStaleAuthSessions() {
          throw new Error("simulated cleanup failure");
        },
      },
      databasePool: {
        async end() {
          poolClosed = true;
        },
      },
      logger: {
        log() {},
        error() {},
      },
    }),
    /simulated cleanup failure/
  );

  assert.equal(poolClosed, true);
});
