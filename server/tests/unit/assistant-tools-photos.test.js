const test = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("node:test");

Object.assign(process.env, {
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "assistant_photos_test",
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

const photosService = require(
  "../../src/modules/photos/photos.service"
);
const mediaService = require(
  "../../src/modules/media/media.service"
);
const assistantToolRegistry = require(
  "../../src/modules/assistant/assistant.tools"
);
const {
  MAX_ASSISTANT_PHOTO_RESULTS,
  MAX_ASSISTANT_MEDIA_SEARCH_RESULTS,
} = require(
  "../../src/modules/assistant/assistant.constants"
);

function createPhoto(index) {
  return {
    id: index + 1,
    caption: `Foto ${index + 1}`,
    isActive: index % 2 === 0,
    sortOrder: index,
    image: {
      id: 4,
      altText: `alt-${index + 1}`,
    },
    updatedAt: "private-field",
  };
}

function createMedia(index) {
  return {
    id: index + 1,
    altText: `Postre ${index + 1}`,
    publicId: `media/postre-${index + 1}.jpg`,
    secureUrl: "https://cdn.example/image.jpg",
    width: 800,
    height: 600,
  };
}

test("list_photos is role-filtered and returns a minimal bounded DTO", async () => {
  const returnedPhotos = Array.from(
    { length: MAX_ASSISTANT_PHOTO_RESULTS + 1 },
    (_, index) => createPhoto(index)
  );
  const listPhotos = mock.method(
    photosService,
    "listAdministrativePhotos",
    async () => ({
      photos: returnedPhotos,
      pagination: {
        totalItems: MAX_ASSISTANT_PHOTO_RESULTS + 1,
      },
    })
  );

  try {
    for (const role of ["ADMIN", "EDITOR"]) {
      assert.ok(
        assistantToolRegistry
          .getToolDeclarations(role)
          .some(
            (tool) => tool.name === "list_photos"
          )
      );
    }

    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "list_photos",
        arguments: {},
        role: "EDITOR",
      });
    const result = JSON.parse(serialized);

    assert.deepEqual(
      listPhotos.mock.calls[0].arguments[0],
      {
        page: 1,
        limit: MAX_ASSISTANT_PHOTO_RESULTS + 1,
        sortBy: "createdAt",
        sortOrder: "desc",
      }
    );
    assert.equal(
      result.photos.length,
      MAX_ASSISTANT_PHOTO_RESULTS
    );
    assert.equal(result.truncated, true);
    assert.deepEqual(
      Object.keys(result.photos[0]).sort(),
      [
        "caption",
        "id",
        "imageAltText",
        "imageMediaId",
        "isActive",
        "sortOrder",
      ]
    );
    assert.doesNotMatch(
      serialized,
      /private-field/
    );
    assert.ok(serialized.length <= 6_000);
  } finally {
    mock.restoreAll();
  }
});

test("list_photos reports an empty current list without truncation", async () => {
  mock.method(
    photosService,
    "listAdministrativePhotos",
    async () => ({
      photos: [],
      pagination: { totalItems: 0 },
    })
  );

  try {
    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "list_photos",
        arguments: {},
        role: "ADMIN",
      });

    assert.deepEqual(JSON.parse(serialized), {
      photos: [],
      truncated: false,
    });
  } finally {
    mock.restoreAll();
  }
});

test("search_media returns at most ten minimal real records", async () => {
  const returnedMedia = Array.from(
    {
      length:
        MAX_ASSISTANT_MEDIA_SEARCH_RESULTS + 1,
    },
    (_, index) => createMedia(index)
  );
  const listMedia = mock.method(
    mediaService,
    "listMedia",
    async () => ({
      media: returnedMedia,
      pagination: {
        totalItems:
          MAX_ASSISTANT_MEDIA_SEARCH_RESULTS + 1,
      },
    })
  );

  try {
    for (const role of ["ADMIN", "EDITOR"]) {
      assert.ok(
        assistantToolRegistry
          .getToolDeclarations(role)
          .some(
            (tool) => tool.name === "search_media"
          )
      );
    }

    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "search_media",
        arguments: { query: "  postre  " },
        role: "EDITOR",
      });
    const result = JSON.parse(serialized);

    assert.deepEqual(
      listMedia.mock.calls[0].arguments[0],
      {
        page: 1,
        limit:
          MAX_ASSISTANT_MEDIA_SEARCH_RESULTS + 1,
        isActive: true,
        resourceType: "IMAGE",
        search: "postre",
        sortBy: "createdAt",
        sortOrder: "desc",
      }
    );
    assert.equal(
      result.media.length,
      MAX_ASSISTANT_MEDIA_SEARCH_RESULTS
    );
    assert.equal(result.truncated, true);
    assert.deepEqual(
      Object.keys(result.media[0]).sort(),
      ["altText", "height", "id", "publicId", "width"]
    );
    assert.doesNotMatch(
      serialized,
      /cdn\.example/
    );
    assert.ok(serialized.length <= 6_000);
  } finally {
    mock.restoreAll();
  }
});

test("search_media rejects an empty query", async () => {
  mock.method(
    mediaService,
    "listMedia",
    async () => ({
      media: [],
      pagination: { totalItems: 0 },
    })
  );

  try {
    await assert.rejects(
      assistantToolRegistry.executeToolCall({
        name: "search_media",
        arguments: { query: "   " },
        role: "EDITOR",
      }),
      (error) => {
        assert.equal(
          error.code,
          "INVALID_TOOL_ARGUMENTS"
        );
        return true;
      }
    );
  } finally {
    mock.restoreAll();
  }
});
