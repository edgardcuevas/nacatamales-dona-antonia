const test = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("node:test");

Object.assign(process.env, {
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "assistant_media_test",
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

const mediaService = require(
  "../../src/modules/media/media.service"
);
const mediaRepository = require(
  "../../src/modules/media/media.repository"
);
const assistantToolRegistry = require(
  "../../src/modules/assistant/assistant.tools"
);
const {
  MAX_ASSISTANT_MEDIA_LIST_RESULTS,
} = require(
  "../../src/modules/assistant/assistant.constants"
);

function createMedia(index) {
  return {
    id: index + 1,
    altText: `Imagen ${index + 1}`,
    publicId: `media/imagen-${index + 1}.jpg`,
    isActive: index % 2 === 0,
    resourceType: "IMAGE",
    width: 800,
    height: 600,
  };
}

test("list_media is role-filtered and returns usage counts", async () => {
  const returnedMedia = Array.from(
    { length: MAX_ASSISTANT_MEDIA_LIST_RESULTS + 1 },
    (_, index) => createMedia(index)
  );
  const listMedia = mock.method(
    mediaService,
    "listMedia",
    async () => ({
      media: returnedMedia,
      pagination: {
        totalItems: MAX_ASSISTANT_MEDIA_LIST_RESULTS + 1,
      },
    })
  );
  const countReferences = mock.method(
    mediaRepository,
    "countMediaReferences",
    async (mediaId) => (mediaId % 2 === 0 ? 2 : 0)
  );

  try {
    for (const role of ["ADMIN", "EDITOR"]) {
      assert.ok(
        assistantToolRegistry
          .getToolDeclarations(role)
          .some((tool) => tool.name === "list_media")
      );
    }

    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "list_media",
        arguments: {},
        role: "EDITOR",
      });
    const result = JSON.parse(serialized);

    assert.deepEqual(
      listMedia.mock.calls[0].arguments[0],
      {
        page: 1,
        limit: MAX_ASSISTANT_MEDIA_LIST_RESULTS + 1,
        sortBy: "createdAt",
        sortOrder: "desc",
      }
    );
    assert.equal(
      result.media.length,
      MAX_ASSISTANT_MEDIA_LIST_RESULTS
    );
    assert.equal(result.truncated, true);
    assert.deepEqual(
      Object.keys(result.media[0]).sort(),
      [
        "altText",
        "height",
        "id",
        "isActive",
        "publicId",
        "resourceType",
        "usageCount",
        "width",
      ]
    );
    assert.equal(
      countReferences.mock.calls.length,
      MAX_ASSISTANT_MEDIA_LIST_RESULTS
    );
    assert.ok(serialized.length <= 6_000);
  } finally {
    mock.restoreAll();
  }
});

test("list_media reports an empty gallery without truncation", async () => {
  mock.method(
    mediaService,
    "listMedia",
    async () => ({
      media: [],
      pagination: { totalItems: 0 },
    })
  );
  mock.method(
    mediaRepository,
    "countMediaReferences",
    async () => 0
  );

  try {
    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "list_media",
        arguments: {},
        role: "ADMIN",
      });

    assert.deepEqual(JSON.parse(serialized), {
      media: [],
      truncated: false,
    });
  } finally {
    mock.restoreAll();
  }
});
