const test = require("node:test");
const assert = require("node:assert/strict");
const { mock, afterEach } = require("node:test");

Object.assign(process.env, {
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "assistant_settings_test",
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

const settingsService = require(
  "../../src/modules/settings/settings.service"
);
const assistantToolRegistry = require(
  "../../src/modules/assistant/assistant.tools"
);
const actionRegistry = require(
  "../../src/modules/assistant/assistant.action-registry"
);
const {
  executePendingAction,
} = require(
  "../../src/modules/assistant/assistant.action-executor"
);

afterEach(() => {
  mock.restoreAll();
});

function settings(overrides = {}) {
  return {
    businessName: "Nacatamales Doña Antonia",
    tagline: "Sabor de casa",
    whatsappNumber: "50588887777",
    facebookUrl: "https://facebook.com/example",
    instagramUrl: "https://instagram.com/example",
    address: "Managua",
    latitude: 12.1,
    longitude: -86.2,
    scheduleText: "Lunes a viernes",
    storyText: "Una historia familiar",
    scheduleColor: "VERDE",
    fritangaScheduleText: "Sábados",
    fritangaScheduleColor: "ROJO",
    updatedAt: "2026-10-27T12:00:00.000Z",
    ...overrides,
  };
}

test("get_settings is available to both roles and returns administrative settings", async () => {
  const expectedSettings = settings();
  const getAdminSettings = mock.method(
    settingsService,
    "getAdminSettings",
    async () => expectedSettings
  );

  for (const role of ["ADMIN", "EDITOR"]) {
    assert.ok(
      assistantToolRegistry
        .getToolDeclarations(role)
        .some((tool) => tool.name === "get_settings")
    );
  }

  const serialized =
    await assistantToolRegistry.executeToolCall({
      name: "get_settings",
      arguments: {},
      role: "EDITOR",
    });

  assert.deepEqual(JSON.parse(serialized), expectedSettings);
  assert.equal(getAdminSettings.mock.callCount(), 1);
});

test("settings actions validate through the canonical settings validator", async () => {
  const actionNames = [
    "update_business_info",
    "update_contact_info",
    "update_schedule",
    "update_location",
  ];

  for (const role of ["ADMIN", "EDITOR"]) {
    assert.deepEqual(
      actionRegistry
        .getActionDeclarations(role)
        .filter((action) => actionNames.includes(action.name))
        .map((action) => action.name),
      actionNames
    );
  }

  const invalidCalls = [
    {
      name: "update_contact_info",
      arguments: { whatsappNumber: "not-a-phone" },
    },
    {
      name: "update_contact_info",
      arguments: { facebookUrl: "file://example.test" },
    },
    {
      name: "update_schedule",
      arguments: { scheduleColor: "ultraviolet" },
    },
    {
      name: "update_location",
      arguments: { latitude: 91 },
    },
    {
      name: "update_business_info",
      arguments: {},
    },
  ];

  for (const call of invalidCalls) {
    assert.equal(
      actionRegistry.validateActionCall({
        ...call,
        role: "ADMIN",
      }),
      null
    );
  }
});

test("confirming a settings action calls the existing settings service", async () => {
  const currentSettings = settings();
  const updatedSettings = settings({
    scheduleText: "Lunes a viernes, 7:00 a 18:00",
    updatedAt: "2026-10-27T12:01:00.000Z",
  });
  const updateSettings = mock.method(
    settingsService,
    "updateSettings",
    async (updates) => {
      assert.deepEqual(updates, {
        scheduleText: "Lunes a viernes, 7:00 a 18:00",
      });
      return updatedSettings;
    }
  );
  mock.method(
    settingsService,
    "getAdminSettings",
    async () => currentSettings
  );

  const result = await executePendingAction({
    action: {
      toolName: "update_schedule",
      targetType: "settings",
      targetId: 1,
      targetLabel: "Configuración del sitio",
      arguments: {
        scheduleText: "Lunes a viernes, 7:00 a 18:00",
      },
      before: {
        scheduleText: currentSettings.scheduleText,
        scheduleColor: currentSettings.scheduleColor,
        fritangaScheduleText:
          currentSettings.fritangaScheduleText,
        fritangaScheduleColor:
          currentSettings.fritangaScheduleColor,
        updatedAt: currentSettings.updatedAt,
      },
    },
    role: "EDITOR",
  });

  assert.deepEqual(result, {
    result: {
      target: {
        id: 1,
        label: "Configuración del sitio",
      },
      updated: true,
      settings: updatedSettings,
    },
    message: "Los horarios del sitio se actualizaron.",
  });
  assert.equal(updateSettings.mock.callCount(), 1);
});
