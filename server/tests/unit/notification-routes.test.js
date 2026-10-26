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
  DB_NAME: "notification_routes_test",
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
  WEB_PUSH_PUBLIC_KEY:
    "BElYtqfJ-YGAMo5Ga6FO930PFs5XhodM9h2CWM-gZ3Ra-U3yjaJtfjRd2JoNscMEDouoTFkupwE979GhdsCTQ6E",
  WEB_PUSH_PRIVATE_KEY:
    "emdVLow-Tk4XwEqVVSh8tZpwF_T7Cx3P0znKWranYuo",
  WEB_PUSH_SUBJECT: "mailto:test@example.com",
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

const userService = require(
  "../../src/modules/users/user.service"
);
const notificationService = require(
  "../../src/modules/notification/notification.service"
);
const {
  generateAccessToken,
} = require("../../src/modules/auth/token.service");

const state = {
  currentUser: {
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    isActive: true,
  },
  calls: {},
  errors: {},
};

mock.method(
  userService,
  "getAuthenticatedUser",
  async () => state.currentUser
);
mock.method(
  notificationService,
  "subscribe",
  async (input) => {
    state.calls.subscribe = input;
    if (state.errors.subscribe) {
      throw state.errors.subscribe;
    }
    return { subscriptionId: 42 };
  }
);
mock.method(
  notificationService,
  "unsubscribe",
  async (input) => {
    state.calls.unsubscribe = input;
    if (state.errors.unsubscribe) {
      throw state.errors.unsubscribe;
    }
    return { unsubscribed: true };
  }
);
mock.method(
  notificationService,
  "getSubscriptionStats",
  async () => {
    if (state.errors.stats) {
      throw state.errors.stats;
    }
    return { enabled: true, subscriptions: 3 };
  }
);
mock.method(
  notificationService,
  "resendAnnouncement",
  async (announcementId) => {
    state.calls.resend = { announcementId };
    if (state.errors.resend) {
      throw state.errors.resend;
    }
    return {
      total: 3,
      sent: 3,
      failed: 0,
      removed: 0,
      notifiedAt: "2026-10-25T12:00:00.000Z",
    };
  }
);

const app = require("../../src/app");
const pool = require("../../src/database/pool");

const VALID_ENDPOINT =
  "https://fcm.googleapis.com/fcm/send/abcdef123456";
const VALID_BODY = {
  endpoint: VALID_ENDPOINT,
  keys: {
    p256dh:
      "BElYtqfJ-YGAMo5Ga6FO930PFs5XhodM9h2CWM-gZ3Ra-U3yjaJtfjRd2JoNscMEDouoTFkupwE979GhdsCTQ6E",
    auth: "emdVLow-Tk4XwEqVVSh8tZpwF_T7Cx3P0znKWranYuo",
  },
};

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
  state.calls = {};
  state.errors = {};
  state.currentUser = {
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    isActive: true,
  };
});

function token(role = "ADMIN") {
  return generateAccessToken({
    id: role === "ADMIN" ? 1 : 2,
    role,
  });
}

async function request(
  path,
  { method = "GET", body, accessToken } = {}
) {
  const headers = {};
  if (accessToken !== undefined) {
    headers.authorization = `Bearer ${accessToken}`;
  }
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

test("public key endpoint exposes the configured key when enabled", async () => {
  const result = await request(
    "/api/notifications/public-key"
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.data.enabled, true);
  assert.equal(
    result.body.data.publicKey,
    TEST_ENVIRONMENT.WEB_PUSH_PUBLIC_KEY
  );
  assert.equal(
    result.body.data.privateKey,
    undefined
  );
});

test("a valid subscription is stored and the user agent is captured", async () => {
  const result = await request(
    "/api/notifications/subscriptions",
    {
      method: "POST",
      body: VALID_BODY,
    }
  );

  assert.equal(result.status, 201);
  assert.equal(result.body.data.subscriptionId, 42);
  assert.equal(
    state.calls.subscribe.endpoint,
    VALID_ENDPOINT
  );
  assert.equal(
    state.calls.subscribe.p256dh,
    VALID_BODY.keys.p256dh
  );
  assert.equal(
    state.calls.subscribe.auth,
    VALID_BODY.keys.auth
  );
  assert.ok(
    typeof state.calls.subscribe.userAgent ===
      "string"
  );
});

test("an endpoint outside the allowlist is rejected before the service runs", async () => {
  const result = await request(
    "/api/notifications/subscriptions",
    {
      method: "POST",
      body: {
        ...VALID_BODY,
        endpoint:
          "https://internal.example.test/admin",
      },
    }
  );

  assert.equal(result.status, 400);
  assert.equal(
    result.body.error.code,
    "INVALID_PUSH_SUBSCRIPTION"
  );
  assert.equal(state.calls.subscribe, undefined);
});

test("unsubscribe accepts a JSON body and reports the deletion", async () => {
  const result = await request(
    "/api/notifications/subscriptions/unsubscribe",
    {
      method: "POST",
      body: { endpoint: VALID_ENDPOINT },
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.data.unsubscribed, true);
  assert.deepEqual(state.calls.unsubscribe, {
    endpoint: VALID_ENDPOINT,
  });
});

test("notification stats require authentication", async () => {
  const result = await request(
    "/api/admin/notifications/stats"
  );

  assert.equal(result.status, 401);
  assert.equal(
    result.body.error.code,
    "AUTHENTICATION_REQUIRED"
  );
});

test("notification stats allow ADMIN and EDITOR", async () => {
  const adminResult = await request(
    "/api/admin/notifications/stats",
    { accessToken: token("ADMIN") }
  );
  const editorResult = await request(
    "/api/admin/notifications/stats",
    { accessToken: token("EDITOR") }
  );

  assert.equal(adminResult.status, 200);
  assert.deepEqual(adminResult.body.data, {
    enabled: true,
    subscriptions: 3,
  });
  assert.equal(editorResult.status, 200);
});

test("resending an announcement notification is an admin action", async () => {
  const result = await request(
    "/api/admin/announcements/7/notify",
    {
      method: "POST",
      accessToken: token("EDITOR"),
    }
  );

  assert.equal(result.status, 200);
  assert.deepEqual(state.calls.resend, {
    announcementId: 7,
  });
  assert.equal(result.body.data.sent, 3);
});

test("resending reports ANNOUNCEMENT_NOT_VISIBLE from the service", async () => {
  const AppError = require("../../src/errors/app-error");
  state.errors.resend = new AppError(
    409,
    "ANNOUNCEMENT_NOT_VISIBLE",
    "The announcement is not visible right now"
  );

  const result = await request(
    "/api/admin/announcements/7/notify",
    {
      method: "POST",
      accessToken: token("ADMIN"),
    }
  );

  assert.equal(result.status, 409);
  assert.equal(
    result.body.error.code,
    "ANNOUNCEMENT_NOT_VISIBLE"
  );
});
