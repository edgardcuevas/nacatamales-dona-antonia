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
  DB_NAME: "settings_public_test",
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

const settingsRepository = require(
  "../../src/modules/settings/settings.repository"
);
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
});

function createSettings(overrides = {}) {
  return {
    id: 1,
    business_name: "Nacatamales de Doña Antonia",
    tagline: "Tradición nicaragüense",
    whatsapp_number: "50575303356",
    facebook_url: null,
    instagram_url: null,
    address: null,
    latitude: null,
    longitude: null,
    schedule_text: "Jueves a Domingo",
    updated_at: new Date("2026-09-26T10:00:00.000Z"),
    ...overrides,
  };
}

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return {
    status: response.status,
    body: await response.json(),
  };
}

test("public settings repository reads only the singleton row", async () => {
  let capturedSql = "";
  mock.method(pool, "execute", async (sql) => {
    capturedSql = sql;
    return [[createSettings()], []];
  });

  const result = await settingsRepository.getSettings();

  assert.equal(result.id, 1);
  assert.match(capturedSql, /SELECT \* FROM site_settings WHERE id = 1 LIMIT 1/);
});

test("public settings returns only its approved DTO fields", async () => {
  mock.method(settingsRepository, "getSettings", async () => createSettings({
    latitude: "12.1364",
    longitude: "-86.2514",
  }));

  const result = await request("/api/settings");

  assert.equal(result.status, 200);
  assert.equal(result.body.message, "Settings retrieved successfully");
  assert.deepEqual(result.body.data.settings, {
    businessName: "Nacatamales de Doña Antonia",
    tagline: "Tradición nicaragüense",
    whatsappNumber: "50575303356",
    facebookUrl: null,
    instagramUrl: null,
    address: null,
    latitude: 12.1364,
    longitude: -86.2514,
    scheduleText: "Jueves a Domingo",
  });
  assert.equal(Object.hasOwn(result.body.data.settings, "id"), false);
  assert.equal(Object.hasOwn(result.body.data.settings, "updatedAt"), false);
});

test("public settings reports a configuration error if singleton row is missing", async () => {
  mock.method(settingsRepository, "getSettings", async () => null);

  const result = await request("/api/settings");

  assert.equal(result.status, 500);
  assert.equal(result.body.error.code, "SETTINGS_NOT_CONFIGURED");
});