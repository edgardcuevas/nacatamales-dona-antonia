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
  DB_NAME: "health_ready_test",
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

const pool = require("../../src/database/pool");
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
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
});

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return {
    status: response.status,
    body: await response.json(),
  };
}

function captureConsoleError() {
  const lines = [];

  mock.method(
    console,
    "error",
    (...arguments_) => {
      lines.push(arguments_);
    }
  );

  return lines;
}

test("liveness endpoint stays static and never queries the database", async () => {
  let executeCalls = 0;
  mock.method(pool, "execute", async () => {
    executeCalls += 1;
    throw new Error("must not be called");
  });

  const result = await request("/api/health");

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    success: true,
    message: "API is running",
    data: { status: "UP" },
  });
  assert.equal(executeCalls, 0);
});

test("readiness reports 200 when the database answers", async () => {
  let capturedSql = "";
  mock.method(pool, "execute", async (sql) => {
    capturedSql = sql;
    return [[1], []];
  });

  const result = await request("/api/health/ready");

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    success: true,
    message: "API and database are ready",
    data: { status: "READY" },
  });
  assert.match(capturedSql, /SELECT 1/);
});

test("readiness reports 503 without leaking the driver error when the database fails", async () => {
  const lines = captureConsoleError();
  mock.method(pool, "execute", async () => {
    throw new Error(
      "connect ECONNREFUSED 127.0.0.1:3306 (user=root, password=hunter2)"
    );
  });

  const result = await request("/api/health/ready");

  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message: "The database is not available",
    },
  });

  const responseText = JSON.stringify(result.body);
  assert.equal(
    responseText.includes("ECONNREFUSED"),
    false
  );
  assert.equal(
    responseText.includes("3306"),
    false
  );
  assert.equal(
    responseText.includes("hunter2"),
    false
  );
  assert.equal(
    responseText.includes("root"),
    false
  );

  // The operator still gets the reason.
  const logged = lines
    .flat()
    .map((value) => String(value))
    .join("\n");
  assert.match(logged, /Readiness check failed/);
  assert.match(logged, /ECONNREFUSED/);
});

test("readiness times out on a database that never answers", async () => {
  const lines = captureConsoleError();
  mock.method(
    pool,
    "execute",
    () => new Promise(() => {})
  );

  const startedAt = process.hrtime.bigint();
  const result = await request("/api/health/ready");
  const elapsedMs = Number(
    process.hrtime.bigint() - startedAt
  ) / 1e6;

  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message: "The database is not available",
    },
  });

  // Bounded by the 2s probe timeout, not by an unbounded wait.
  assert.ok(
    elapsedMs >= 1_900 && elapsedMs < 4_000,
    `expected about 2000ms, got ${Math.round(elapsedMs)}ms`
  );

  const logged = lines
    .flat()
    .map((value) => String(value))
    .join("\n");
  assert.match(logged, /Readiness check exceeded 2000ms/);
});

test("readiness answers 503 for a rejected driver error and still logs", async () => {
  const lines = captureConsoleError();
  const driverError = new Error("ER_ACCESS_DENIED_ERROR");
  mock.method(pool, "execute", async () => {
    throw driverError;
  });

  const result = await request("/api/health/ready");

  assert.equal(result.status, 503);
  assert.equal(
    result.body.error.code,
    "SERVICE_UNAVAILABLE"
  );
  assert.equal(
    JSON.stringify(result.body).includes(
      "ER_ACCESS_DENIED_ERROR"
    ),
    false
  );
  assert.match(
    lines
      .flat()
      .map((value) => String(value))
      .join("\n"),
    /ER_ACCESS_DENIED_ERROR/
  );
});

test("readiness needs no authentication", async () => {
  mock.method(pool, "execute", async () => [[1], []]);

  const result = await request("/api/health/ready");

  assert.equal(result.status, 200);
});

test("both health routes stay free of authentication rate limiters", async () => {
  mock.method(pool, "execute", async () => [[1], []]);

  for (let index = 0; index < 25; index += 1) {
    const live = await request("/api/health");
    assert.equal(live.status, 200);

    const ready = await request("/api/health/ready");
    assert.equal(ready.status, 200);
  }
});