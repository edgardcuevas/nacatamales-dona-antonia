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
  DB_NAME: "settings_admin_core_test",
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

const AppError = require("../../src/errors/app-error");
const {
  parseUpdateSettingsBody,
} = require("../../src/modules/settings/settings.validator");
const settingsRepository = require(
  "../../src/modules/settings/settings.repository"
);
const settingsService = require(
  "../../src/modules/settings/settings.service"
);
const pool = require("../../src/database/pool");

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
});

function createRawSettings(overrides = {}) {
  return {
    id: 1,
    business_name: "Nacatamales de Doña Antonia",
    tagline: null,
    whatsapp_number: "50575303356",
    facebook_url: null,
    instagram_url: null,
    address: null,
    latitude: null,
    longitude: null,
    schedule_text: null,
    updated_at: new Date("2026-09-26T10:00:00.000Z"),
    ...overrides,
  };
}

function assertAppError(error, statusCode, code) {
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.code, code);
}

test("settings update validator keeps only supplied fields and accepts nullables", () => {
  assert.deepEqual(
    parseUpdateSettingsBody({
      businessName: " Doña Antonia ",
      tagline: null,
      whatsappNumber: "50575303356",
      facebookUrl: "https://facebook.com/example",
      latitude: 12.1,
      longitude: null,
    }),
    {
      businessName: "Doña Antonia",
      tagline: null,
      whatsappNumber: "50575303356",
      facebookUrl: "https://facebook.com/example",
      latitude: 12.1,
      longitude: null,
    }
  );
});

test("settings validator rejects empty bodies, unexpected fields, and invalid values", () => {
  const invalidInputs = [
    [{}, "INVALID_SETTINGS_INPUT"],
    [{ unknown: true }, "UNEXPECTED_SETTINGS_FIELDS"],
    [{ businessName: "  " }, "INVALID_BUSINESS_NAME"],
    [{ businessName: "x".repeat(151) }, "INVALID_BUSINESS_NAME"],
    [{ whatsappNumber: "505-7530" }, "INVALID_WHATSAPP_NUMBER"],
    [{ whatsappNumber: "1234567" }, "INVALID_WHATSAPP_NUMBER"],
    [{ facebookUrl: "ftp://example.test" }, "INVALID_FACEBOOK_URL"],
    [{ instagramUrl: "x".repeat(501) }, "INVALID_INSTAGRAM_URL"],
    [{ latitude: 90.1 }, "INVALID_LATITUDE"],
    [{ latitude: "12.1" }, "INVALID_LATITUDE"],
    [{ longitude: -180.1 }, "INVALID_LONGITUDE"],
    [{ tagline: "x".repeat(256) }, "INVALID_TAGLINE"],
    [{ address: "x".repeat(256) }, "INVALID_ADDRESS"],
    [{ scheduleText: "x".repeat(256) }, "INVALID_SCHEDULE_TEXT"],
  ];

  for (const [input, code] of invalidInputs) {
    assert.throws(
      () => parseUpdateSettingsBody(input),
      (error) => {
        assertAppError(error, 400, code);
        return true;
      }
    );
  }
});

test("settings repository parameterizes updates using fixed column names", async () => {
  const queries = [];
  mock.method(pool, "execute", async (sql, parameters) => {
    queries.push({ sql, parameters });
    if (queries.length === 1) {
      return [{ affectedRows: 1 }, []];
    }
    return [[createRawSettings()], []];
  });

  const result = await settingsRepository.updateSettings({
    businessName: "Updated name",
    latitude: 12.25,
  });

  assert.equal(result.id, 1);
  assert.match(queries[0].sql, /business_name = \?/);
  assert.match(queries[0].sql, /latitude = \?/);
  assert.match(queries[0].sql, /updated_at = CURRENT_TIMESTAMP WHERE id = 1/);
  assert.deepEqual(queries[0].parameters, ["Updated name", 12.25]);
  assert.match(queries[1].sql, /WHERE id = 1 LIMIT 1/);
});

test("settings service maps safe DTOs and reports missing configuration", async () => {
  mock.method(settingsRepository, "getSettings", async () => createRawSettings({
    latitude: "12.1364",
    longitude: "-86.2514",
  }));

  const result = await settingsService.getAdminSettings();

  assert.deepEqual(result, {
    businessName: "Nacatamales de Doña Antonia",
    tagline: null,
    whatsappNumber: "50575303356",
    facebookUrl: null,
    instagramUrl: null,
    address: null,
    latitude: 12.1364,
    longitude: -86.2514,
    scheduleText: null,
    updatedAt: "2026-09-26T10:00:00.000Z",
  });
  mock.method(settingsRepository, "getSettings", async () => null);

  await assert.rejects(
    settingsService.getAdminSettings(),
    (error) => {
      assertAppError(error, 500, "SETTINGS_NOT_CONFIGURED");
      return true;
    }
  );
});