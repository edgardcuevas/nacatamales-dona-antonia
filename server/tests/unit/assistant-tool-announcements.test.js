const test = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("node:test");

Object.assign(process.env, {
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "assistant_announcements_test",
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

const announcementService = require(
  "../../src/modules/announcements/announcement.service"
);
const assistantToolRegistry = require(
  "../../src/modules/assistant/assistant.tools"
);
const {
  MAX_ASSISTANT_ANNOUNCEMENT_RESULTS,
} = require(
  "../../src/modules/assistant/assistant.constants"
);

function createAnnouncement(index) {
  return {
    id: index + 1,
    title: `Aviso ${index + 1}`,
    content: `Contenido ${index + 1}`,
    type: "INFO",
    startsAt: null,
    endsAt: null,
    sortOrder: index,
    image: {
      id: 4,
      url: "https://cdn.example/image.jpg",
    },
    notifiedAt: "private-field",
  };
}

test("list_active_announcements is role-filtered and returns a minimal bounded DTO", async () => {
  const returnedAnnouncements = Array.from(
    { length: MAX_ASSISTANT_ANNOUNCEMENT_RESULTS + 1 },
    (_, index) => createAnnouncement(index)
  );
  const listAnnouncements = mock.method(
    announcementService,
    "listPublicAnnouncements",
    async () => returnedAnnouncements
  );

  try {
    for (const role of ["ADMIN", "EDITOR"]) {
      assert.ok(
        assistantToolRegistry
          .getToolDeclarations(role)
          .some(
            (tool) =>
              tool.name === "list_active_announcements"
          )
      );
    }

    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "list_active_announcements",
        arguments: {},
        role: "EDITOR",
      });
    const result = JSON.parse(serialized);

    assert.deepEqual(
      listAnnouncements.mock.calls[0].arguments[0],
      { limit: MAX_ASSISTANT_ANNOUNCEMENT_RESULTS + 1 }
    );
    assert.equal(
      result.announcements.length,
      MAX_ASSISTANT_ANNOUNCEMENT_RESULTS
    );
    assert.equal(result.truncated, true);
    assert.deepEqual(
      Object.keys(result.announcements[0]).sort(),
      ["content", "endsAt", "startsAt", "title", "type"]
    );
    assert.doesNotMatch(
      serialized,
      /cdn\.example|private-field/
    );
    assert.ok(serialized.length <= 6_000);
  } finally {
    mock.restoreAll();
  }
});

test("list_active_announcements reports an empty current list without truncation", async () => {
  mock.method(
    announcementService,
    "listPublicAnnouncements",
    async () => []
  );

  try {
    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "list_active_announcements",
        arguments: {},
        role: "ADMIN",
      });

    assert.deepEqual(JSON.parse(serialized), {
      announcements: [],
      truncated: false,
    });
  } finally {
    mock.restoreAll();
  }
});
