const test = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("node:test");

Object.assign(process.env, {
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "assistant_videos_test",
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

const videoService = require(
  "../../src/modules/videos/video.service"
);
const assistantToolRegistry = require(
  "../../src/modules/assistant/assistant.tools"
);
const {
  MAX_ASSISTANT_VIDEO_RESULTS,
} = require(
  "../../src/modules/assistant/assistant.constants"
);

function createVideo(index) {
  return {
    id: index + 1,
    title: `Video ${index + 1}`,
    description: `Descripción ${index + 1}`,
    url: `https://youtube.example/watch?v=${index + 1}`,
    provider: "YOUTUBE",
    externalId: `external-${index + 1}`,
    thumbnailUrl: "https://cdn.example/thumbnail.jpg",
    uploadStatus: index === 0 ? "DELETED" : "READY",
    privacyStatus: index === 0 ? "PRIVATE" : "UNLISTED",
    isActive: false,
  };
}

test("list_videos requests only hidden videos and exposes a bounded safe DTO", async () => {
  const listVideos = mock.method(
    videoService,
    "listAdministrativeVideos",
    async () => ({
      videos: Array.from(
        { length: MAX_ASSISTANT_VIDEO_RESULTS + 1 },
        (_, index) => createVideo(index)
      ),
      pagination: {
        page: 1,
        limit: MAX_ASSISTANT_VIDEO_RESULTS + 1,
        totalItems: 23,
        totalPages: 2,
      },
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
          "list_videos",
        ]
      );
    }

    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "list_videos",
        arguments: {},
        role: "EDITOR",
      });
    const result = JSON.parse(serialized);

    assert.deepEqual(listVideos.mock.calls[0].arguments[0], {
      page: 1,
      limit: MAX_ASSISTANT_VIDEO_RESULTS + 1,
      isActive: false,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    assert.equal(
      result.videos.length,
      MAX_ASSISTANT_VIDEO_RESULTS
    );
    assert.equal(result.truncated, true);
    assert.equal(result.videos[0].uploadStatus, "DELETED");
    assert.deepEqual(
      Object.keys(result.videos[0]).sort(),
      [
        "description",
        "privacyStatus",
        "title",
        "uploadStatus",
      ]
    );
    assert.doesNotMatch(
      serialized,
      /external-1|thumbnail\.jpg|youtube\.example\/watch\?v=/
    );
    assert.ok(serialized.length <= 6_000);
    assert.equal(listVideos.mock.callCount(), 1);
  } finally {
    mock.restoreAll();
  }
});

test("list_videos returns an empty result without querying YouTube", async () => {
  const listVideos = mock.method(
    videoService,
    "listAdministrativeVideos",
    async () => ({
      videos: [],
      pagination: {
        page: 1,
        limit: MAX_ASSISTANT_VIDEO_RESULTS + 1,
        totalItems: 0,
        totalPages: 0,
      },
    })
  );

  try {
    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "list_videos",
        arguments: {},
        role: "ADMIN",
      });

    assert.deepEqual(JSON.parse(serialized), {
      videos: [],
      truncated: false,
    });
    assert.equal(listVideos.mock.callCount(), 1);
  } finally {
    mock.restoreAll();
  }
});
