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
  MAX_ASSISTANT_ANNOUNCEMENT_SEARCH_RESULTS,
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

test("search_announcements returns at most ten minimal real records", async () => {
  const returnedAnnouncements = Array.from(
    {
      length:
        MAX_ASSISTANT_ANNOUNCEMENT_SEARCH_RESULTS + 1,
    },
    (_, index) => ({
      id: index + 1,
      title: `Aviso ${index + 1}`,
      isActive: index % 2 === 0,
      startsAt: null,
      endsAt: null,
      content: "Must not be exposed",
      notifiedAt: "private-field",
      image: { url: "https://cdn.example/image.jpg" },
    })
  );
  const listAnnouncements = mock.method(
    announcementService,
    "listAdministrativeAnnouncements",
    async () => ({
      announcements: returnedAnnouncements,
      pagination: { totalItems: 11 },
    })
  );

  try {
    for (const role of ["ADMIN", "EDITOR"]) {
      assert.ok(
        assistantToolRegistry
          .getToolDeclarations(role)
          .some((tool) => tool.name === "search_announcements")
      );
    }

    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "search_announcements",
        arguments: { query: "  promo  " },
        role: "EDITOR",
      });
    const result = JSON.parse(serialized);

    assert.deepEqual(
      listAnnouncements.mock.calls[0].arguments[0],
      {
        page: 1,
        limit:
          MAX_ASSISTANT_ANNOUNCEMENT_SEARCH_RESULTS + 1,
        title: "promo",
        sortBy: "title",
        sortOrder: "asc",
      }
    );
    assert.equal(
      result.announcements.length,
      MAX_ASSISTANT_ANNOUNCEMENT_SEARCH_RESULTS
    );
    assert.equal(result.truncated, true);
    assert.deepEqual(result.announcements[0], {
      id: 1,
      title: "Aviso 1",
      isActive: true,
      startsAt: null,
      endsAt: null,
    });
    assert.doesNotMatch(
      serialized,
      /Must not be exposed|private-field|cdn\.example/
    );
    assert.ok(serialized.length <= 6_000);
  } finally {
    mock.restoreAll();
  }
});

test("search_announcements rejects blank and oversized queries", async () => {
  let listCalls = 0;
  mock.method(
    announcementService,
    "listAdministrativeAnnouncements",
    async () => {
      listCalls += 1;
      return {
        announcements: [],
        pagination: { totalItems: 0 },
      };
    }
  );

  try {
    for (const query of ["   ", "a".repeat(121)]) {
      await assert.rejects(
        assistantToolRegistry.executeToolCall({
          name: "search_announcements",
          arguments: { query },
          role: "ADMIN",
        }),
        (error) =>
          error.code === "INVALID_TOOL_ARGUMENTS"
      );
    }

    assert.equal(listCalls, 0);
  } finally {
    mock.restoreAll();
  }
});
