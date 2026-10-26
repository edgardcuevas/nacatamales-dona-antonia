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
  DB_NAME: "notification_public_test",
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

// No VAPID keys on purpose: this file proves the feature degrades
// cleanly instead of preventing the API from booting.
const AppError = require("../../src/errors/app-error");
const {
  parsePushSubscriptionBody,
  parsePushUnsubscribeBody,
  isAllowedPushHost,
} = require("../../src/modules/notification/notification.validator");
const notificationRepository = require(
  "../../src/modules/notification/notification.repository"
);
const notificationService = require(
  "../../src/modules/notification/notification.service"
);
const app = require("../../src/app");
const pool = require("../../src/database/pool");

const VALID_ENDPOINT =
  "https://fcm.googleapis.com/fcm/send/abcdef123456";

function createSubscriptionBody(overrides = {}) {
  return {
    endpoint: VALID_ENDPOINT,
    keys: {
      p256dh:
        "BElYtqfJ-YGAMo5Ga6FO930PFs5XhodM9h2CWM-gZ3Ra-U3yjaJtfjRd2JoNscMEDouoTFkupwE979GhdsCTQ6E",
      auth: "emdVLow-Tk4XwEqVVSh8tZpwF_T7Cx3P0znKWranYuo",
    },
    ...overrides,
  };
}

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
  await new Promise((resolve) =>
    server.close(resolve)
  );
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
});

async function request(
  path,
  { method = "GET", body } = {}
) {
  const headers = {};
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

function assertAppError(error, statusCode, code) {
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.code, code);
}

test("public key endpoint reports the feature as disabled without VAPID keys", async () => {
  const result = await request(
    "/api/notifications/public-key"
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, {
    enabled: false,
    publicKey: null,
  });
});

test("subscribing without VAPID keys answers PUSH_NOT_CONFIGURED", async () => {
  const result = await request(
    "/api/notifications/subscriptions",
    {
      method: "POST",
      body: createSubscriptionBody(),
    }
  );

  assert.equal(result.status, 503);
  assert.equal(
    result.body.error.code,
    "PUSH_NOT_CONFIGURED"
  );
});

test("the public key endpoint never leaks the private key", async () => {
  const result = await request(
    "/api/notifications/public-key"
  );

  assert.equal(
    JSON.stringify(result.body).includes(
      "private"
    ),
    false
  );
});

test("push endpoints are restricted to known push services", () => {
  assert.equal(
    isAllowedPushHost("fcm.googleapis.com"),
    true
  );
  assert.equal(
    isAllowedPushHost("db5p.notify.windows.com"),
    true
  );
  assert.equal(
    isAllowedPushHost("web.push.apple.com"),
    true
  );
  assert.equal(
    isAllowedPushHost("updates.push.services.mozilla.com"),
    true
  );
  assert.equal(
    isAllowedPushHost("fcm.googleapis.com.evil.test"),
    false
  );
  assert.equal(
    isAllowedPushHost("evilnotify.windows.com"),
    false
  );
  assert.equal(
    isAllowedPushHost("127.0.0.1"),
    false
  );
});

test("subscription validator normalizes the endpoint and rejects unexpected fields", () => {
  const parsed = parsePushSubscriptionBody(
    createSubscriptionBody()
  );

  assert.equal(parsed.endpoint, VALID_ENDPOINT);

  assert.throws(
    () =>
      parsePushSubscriptionBody(
        createSubscriptionBody({
          endpoint: "http://fcm.googleapis.com/x",
        })
      ),
    (error) => {
      assertAppError(
        error,
        400,
        "INVALID_PUSH_SUBSCRIPTION"
      );
      return true;
    }
  );

  assert.throws(
    () =>
      parsePushSubscriptionBody({
        ...createSubscriptionBody(),
        extra: true,
      }),
    (error) => {
      assertAppError(
        error,
        400,
        "INVALID_PUSH_SUBSCRIPTION"
      );
      return true;
    }
  );

  assert.throws(
    () =>
      parsePushSubscriptionBody(
        createSubscriptionBody({
          keys: { p256dh: "short", auth: "x" },
        })
      ),
    (error) => {
      assertAppError(
        error,
        400,
        "INVALID_PUSH_SUBSCRIPTION"
      );
      return true;
    }
  );
});

test("unsubscribe validator requires only a valid endpoint", () => {
  assert.deepEqual(
    parsePushUnsubscribeBody({
      endpoint: VALID_ENDPOINT,
    }),
    { endpoint: VALID_ENDPOINT }
  );

  assert.throws(
    () =>
      parsePushUnsubscribeBody({
        endpoint: VALID_ENDPOINT,
        keys: {},
      }),
    (error) => {
      assertAppError(
        error,
        400,
        "INVALID_PUSH_SUBSCRIPTION"
      );
      return true;
    }
  );
});

test("the endpoint hash is deterministic and does not store the URL", () => {
  const first =
    notificationRepository.hashEndpoint(
      VALID_ENDPOINT
    );
  const second =
    notificationRepository.hashEndpoint(
      VALID_ENDPOINT
    );

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, VALID_ENDPOINT);
});

test("unsubscribing removes the stored subscription", async () => {
  let receivedEndpoint = null;
  mock.method(
    notificationRepository,
    "deleteSubscriptionByEndpoint",
    async (endpoint) => {
      receivedEndpoint = endpoint;
      return true;
    }
  );

  const result = await request(
    "/api/notifications/subscriptions/unsubscribe",
    {
      method: "POST",
      body: { endpoint: VALID_ENDPOINT },
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.data.unsubscribed, true);
  assert.equal(receivedEndpoint, VALID_ENDPOINT);
});

test("the dispatch service stays inert while the feature is disabled", async () => {
  assert.equal(
    notificationService.getPublicKeyConfig().enabled,
    false
  );

  const result =
    await notificationService.dispatchAnnouncement({
      id: 7,
      title: "Aviso",
      content: "Contenido",
    });

  assert.deepEqual(result, {
    total: 0,
    sent: 0,
    failed: 0,
    removed: 0,
  });
});
