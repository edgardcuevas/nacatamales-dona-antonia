const test = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("node:test");

Object.assign(process.env, {
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "assistant_schedule_test",
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
const {
  runAssistantToolTurn,
} = require(
  "../../src/modules/assistant/assistant.tool-orchestrator"
);

test("get_current_schedule is available to both roles and returns only schedule fields", async () => {
  const getSettings = mock.method(
    settingsService,
    "getPublicSettings",
    async () => ({
      businessName: "Negocio privado",
      scheduleText: "Lunes a viernes, 8:00 a 17:00",
      fritangaScheduleText: "Sábados, 10:00 a 18:00",
      whatsappNumber: "+50500000000",
    })
  );

  try {
    for (const role of ["ADMIN", "EDITOR"]) {
      assert.deepEqual(
        assistantToolRegistry
          .getToolDeclarations(role)
          .map((tool) => tool.name),
        [
          "get_current_schedule",
          "count_products",
          "search_products",
          "list_active_announcements",
          "search_announcements",
          "list_videos",
          "search_videos",
        ]
      );
    }

    let providerCall = 0;
    let followUpMessages;
    const result = await runAssistantToolTurn({
      provider: {
        chat: async ({ messages }) => {
          providerCall += 1;

          if (providerCall === 1) {
            return {
              text: "",
              toolCalls: [
                {
                  name: "get_current_schedule",
                  arguments: {},
                },
              ],
              usage: { inputTokens: 5, outputTokens: 1 },
              blocked: false,
            };
          }

          followUpMessages = messages;
          return {
            text: "El horario general es de lunes a viernes.",
            toolCalls: [],
            usage: { inputTokens: 8, outputTokens: 4 },
            blocked: false,
          };
        },
      },
      toolRegistry: assistantToolRegistry,
      role: "EDITOR",
      systemInstruction: "Solo lectura.",
      messages: [
        { role: "user", content: "¿Cuál es el horario?" },
      ],
    });

    const toolMessage = followUpMessages.at(-1);
    const returnedFields = JSON.parse(toolMessage.content);

    assert.equal(result.text, "El horario general es de lunes a viernes.");
    assert.deepEqual(returnedFields, {
      scheduleText: "Lunes a viernes, 8:00 a 17:00",
      fritangaScheduleText: "Sábados, 10:00 a 18:00",
    });
    assert.equal(getSettings.mock.callCount(), 1);
  } finally {
    mock.restoreAll();
  }
});

test("get_current_schedule preserves unconfigured schedule fields as null", async () => {
  mock.method(
    settingsService,
    "getPublicSettings",
    async () => ({
      scheduleText: null,
      fritangaScheduleText: null,
    })
  );

  try {
    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "get_current_schedule",
        arguments: {},
        role: "ADMIN",
      });

    assert.deepEqual(JSON.parse(serialized), {
      scheduleText: null,
      fritangaScheduleText: null,
    });
  } finally {
    mock.restoreAll();
  }
});
