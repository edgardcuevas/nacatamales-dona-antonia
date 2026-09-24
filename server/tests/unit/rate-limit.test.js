const test = require("node:test");
const assert = require("node:assert/strict");
const {
  after,
  before,
  beforeEach,
  afterEach,
} = require("node:test");

const TEST_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "rate_limit_test",
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
  createRateLimiter,
  loginRateLimiter,
  refreshRateLimiter,
  resetRateLimiters,
  limits,
} = require("../../src/middlewares/rate-limit.middleware");
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

beforeEach(() => {
  resetRateLimiters();
});

afterEach(() => {
  resetRateLimiters();
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

function execute(middleware, request = {}) {
  let nextCalls = 0;
  let nextError;

  middleware(request, {}, (error) => {
    nextCalls += 1;
    nextError = error;
  });

  return {
    nextCalls,
    nextError,
  };
}

async function postLoginWithoutBody() {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

async function postRefreshWithoutCookie() {
  return fetch(`${baseUrl}/api/auth/refresh`, {
    method: "POST",
  });
}

test("rate limiter allows requests below the configured limit", () => {
  const store = new Map();
  const limiter = createRateLimiter({
    windowMs: 1000,
    maxRequests: 2,
    store,
    now: () => 0,
  });

  const first = execute(limiter, { ip: "127.0.0.1" });
  const second = execute(limiter, { ip: "127.0.0.1" });

  assert.equal(first.nextCalls, 1);
  assert.equal(first.nextError, undefined);
  assert.equal(second.nextCalls, 1);
  assert.equal(second.nextError, undefined);
});

test("rate limiter returns 429 and stops downstream execution after the limit", () => {
  const store = new Map();
  const limiter = createRateLimiter({
    windowMs: 1000,
    maxRequests: 2,
    store,
    now: () => 0,
  });
  let downstreamCalls = 0;

  function runRequest() {
    return new Promise((resolve) => {
      limiter(
        { ip: "127.0.0.1" },
        {},
        (error) => {
          if (!error) {
            downstreamCalls += 1;
          }
          resolve(error);
        }
      );
    });
  }

  return Promise.all([
    runRequest(),
    runRequest(),
    runRequest(),
  ]).then((errors) => {
    const blocked = errors[2];

    assert.equal(downstreamCalls, 2);
    assert.ok(blocked instanceof AppError);
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.code, "RATE_LIMIT_EXCEEDED");
    assert.equal(
      blocked.message,
      "Too many requests. Please try again later"
    );
  });
});

test("rate limiter resets after the fixed window", () => {
  const store = new Map();
  let currentTime = 0;
  const limiter = createRateLimiter({
    windowMs: 1000,
    maxRequests: 1,
    store,
    now: () => currentTime,
  });

  execute(limiter, { ip: "127.0.0.1" });
  const blocked = execute(limiter, { ip: "127.0.0.1" });
  currentTime = 1000;
  const afterWindow = execute(limiter, { ip: "127.0.0.1" });

  assert.equal(blocked.nextError.statusCode, 429);
  assert.equal(afterWindow.nextCalls, 1);
  assert.equal(afterWindow.nextError, undefined);
});

test("login and refresh limiters use independent stores", () => {
  const loginStore = new Map();
  const refreshStore = new Map();
  const login = createRateLimiter({
    windowMs: 1000,
    maxRequests: 1,
    store: loginStore,
    now: () => 0,
  });
  const refresh = createRateLimiter({
    windowMs: 1000,
    maxRequests: 2,
    store: refreshStore,
    now: () => 0,
  });
  const request = { ip: "127.0.0.1" };

  execute(login, request);
  const blockedLogin = execute(login, request);
  const firstRefresh = execute(refresh, request);
  const secondRefresh = execute(refresh, request);

  assert.equal(blockedLogin.nextError.statusCode, 429);
  assert.equal(firstRefresh.nextError, undefined);
  assert.equal(secondRefresh.nextError, undefined);
});

test("login limiter returns the centralized 429 response after eight requests", async () => {
  let response;

  for (let index = 0; index < 8; index += 1) {
    response = await postLoginWithoutBody();
    assert.equal(response.status, 400);
  }

  response = await postLoginWithoutBody();
  const body = await response.json();

  assert.equal(response.status, 429);
  assert.deepEqual(body, {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please try again later",
    },
  });
  assert.equal(
    JSON.stringify(body).includes("127.0.0.1"),
    false
  );
});

test("refresh limiter returns the centralized 429 response after thirty requests", async () => {
  let response;

  for (let index = 0; index < 30; index += 1) {
    response = await postRefreshWithoutCookie();
    assert.equal(response.status, 401);
  }

  response = await postRefreshWithoutCookie();
  const body = await response.json();

  assert.equal(response.status, 429);
  assert.deepEqual(body, {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please try again later",
    },
  });
});

test("health endpoint is not affected by authentication rate limiters", async () => {
  for (let index = 0; index < 40; index += 1) {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
  }
});

test("configured limits are explicit and frozen", () => {
  assert.deepEqual(limits, {
    login: {
      windowMs: 900000,
      maxRequests: 8,
    },
    refresh: {
      windowMs: 300000,
      maxRequests: 30,
    },
  });
  assert.equal(Object.isFrozen(limits), true);
  assert.equal(Object.isFrozen(limits.login), true);
  assert.equal(Object.isFrozen(limits.refresh), true);
});

test("invalid limiter configuration fails during initialization", () => {
  assert.throws(
    () => createRateLimiter({
      windowMs: 0,
      maxRequests: 1,
    }),
    /Invalid rate limiter configuration/
  );
  assert.throws(
    () => createRateLimiter({
      windowMs: 1000,
      maxRequests: 0,
    }),
    /Invalid rate limiter configuration/
  );
});
