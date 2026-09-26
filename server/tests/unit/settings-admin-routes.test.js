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
  DB_NAME: "settings_admin_routes_test",
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

for (const [name, value] of Object.entries(TEST_ENVIRONMENT)) {
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
const settingsService = require(
  "../../src/modules/settings/settings.service"
);

const state = {
  currentUser: {
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    isActive: true,
  },
  settings: {
    businessName: "Nacatamales de Doña Antonia",
    tagline: null,
    whatsappNumber: "50575303356",
    facebookUrl: null,
    instagramUrl: null,
    address: null,
    latitude: null,
    longitude: null,
    scheduleText: null,
    updatedAt: "2026-09-26T10:00:00.000Z",
  },
  calls: {},
};

mock.method(userService, "getAuthenticatedUser", async () => state.currentUser);
mock.method(settingsService, "getAdminSettings", async () => state.settings);
mock.method(settingsService, "updateSettings", async (updates) => {
  state.calls.update = updates;
  return state.settings;
});

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
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
  mock.method(userService, "getAuthenticatedUser", async () => state.currentUser);
  mock.method(settingsService, "getAdminSettings", async () => state.settings);
  mock.method(settingsService, "updateSettings", async (updates) => {
    state.calls.update = updates;
    return state.settings;
  });
  state.calls = {};
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

async function request(path, { method = "GET", body, accessToken } = {}) {
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
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

test("settings admin routes require authentication", async () => {
  const result = await request("/api/admin/settings");

  assert.equal(result.status, 401);
  assert.equal(result.body.error.code, "AUTHENTICATION_REQUIRED");
});

test("settings admin routes allow ADMIN and EDITOR", async () => {
  const adminResult = await request("/api/admin/settings", {
    accessToken: token("ADMIN"),
  });
  state.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };
  const editorResult = await request("/api/admin/settings", {
    accessToken: token("EDITOR"),
  });

  assert.equal(adminResult.status, 200);
  assert.equal(editorResult.status, 200);
  assert.equal(
    Object.hasOwn(adminResult.body.data.settings, "updatedAt"),
    true
  );
});

test("settings admin PATCH passes only validated partial updates", async () => {
  const result = await request("/api/admin/settings", {
    method: "PATCH",
    accessToken: token(),
    body: {
      businessName: "Updated business",
      tagline: null,
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message, "Settings updated successfully");
  assert.deepEqual(state.calls.update, {
    businessName: "Updated business",
    tagline: null,
  });
});

test("settings admin PATCH rejects empty and unexpected input", async () => {
  const empty = await request("/api/admin/settings", {
    method: "PATCH",
    accessToken: token(),
    body: {},
  });
  const unknown = await request("/api/admin/settings", {
    method: "PATCH",
    accessToken: token(),
    body: { id: 1 },
  });

  assert.equal(empty.status, 400);
  assert.equal(empty.body.error.code, "INVALID_SETTINGS_INPUT");
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.error.code, "UNEXPECTED_SETTINGS_FIELDS");
});

test("inactive users cannot manage settings", async () => {
  state.currentUser = null;
  const result = await request("/api/admin/settings", {
    accessToken: token(),
  });

  assert.equal(result.status, 401);
  assert.equal(result.body.error.code, "AUTHENTICATED_USER_UNAVAILABLE");
});