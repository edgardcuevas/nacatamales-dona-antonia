const test = require("node:test");
const assert = require("node:assert/strict");
const {
  after,
  afterEach,
  mock,
} = require("node:test");
const { Readable } = require("node:stream");

const TEST_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "video_thumbnail_test",
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

for (const [name, value] of Object.entries(
  TEST_ENVIRONMENT
)) {
  if (
    typeof process.env[name] !== "string" ||
    process.env[name].trim() === ""
  ) {
    process.env[name] = value;
  }
}

const AppError = require("../../src/errors/app-error");
const {
  youtubeClient,
  YouTubeApiError,
} = require("../../src/config/youtube");
const {
  parseUpdateVideoBody,
} = require("../../src/modules/videos/video.validator");
const videoRepository =
  require("../../src/modules/videos/video.repository");
const videoService =
  require("../../src/modules/videos/video.service");
const youtubeService =
  require("../../src/modules/youtube/youtube.service");
const youtubeConnectionRepository = require(
  "../../src/modules/youtube/youtube-connection.repository"
);
const {
  encryptRefreshToken,
} = require(
  "../../src/modules/youtube/youtube-token-crypto"
);
const {
  resetYoutubeRateLimiters,
} = require(
  "../../src/middlewares/youtube-rate-limit.middleware"
);
const pool = require("../../src/database/pool");

const CUSTOM_THUMBNAIL_URL =
  "https://i.ytimg.com/vi/aaaaaaaaaaa/maxresdefault.jpg";
const PROVIDER_FRAME_URL =
  "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg";

function createConnection() {
  return {
    id: 1,
    channel_id: "UC1234567890123456789012",
    channel_title: "Official channel",
    encrypted_refresh_token:
      encryptRefreshToken("refresh-token"),
    scopes: "scope",
    token_expires_at: new Date(),
    connected_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-01-02T00:00:00Z"),
  };
}

function createRawVideo(overrides = {}) {
  return {
    id: 7,
    title: "QA video",
    description: null,
    url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    provider: "YOUTUBE",
    external_id: "aaaaaaaaaaa",
    thumbnail_url: null,
    thumbnail_source: "YOUTUBE_DEFAULT",
    sort_order: 0,
    is_active: 0,
    upload_status: "READY",
    privacy_status: "UNLISTED",
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function createAdminVideo(overrides = {}) {
  return {
    id: 7,
    title: "QA video",
    description: null,
    url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    provider: "YOUTUBE",
    externalId: "aaaaaaaaaaa",
    thumbnailUrl: CUSTOM_THUMBNAIL_URL,
    thumbnailSource: "CUSTOM",
    sortOrder: 0,
    isActive: false,
    uploadStatus: "READY",
    privacyStatus: "UNLISTED",
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function createThumbnailInput(overrides = {}) {
  return {
    videoId: 7,
    fileStream: Readable.from(
      Buffer.from("fake-thumbnail-bytes")
    ),
    fileSize: 20,
    contentType: "image/jpeg",
    ...overrides,
  };
}

function mockConnectedChannel() {
  mock.method(
    youtubeConnectionRepository,
    "getConnection",
    async () => createConnection()
  );
  mock.method(
    youtubeClient,
    "refreshAccessToken",
    async () => ({
      accessToken: "access-token",
      expiresIn: 3600,
    })
  );
}

function assertAppError(error, statusCode, code) {
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.code, code);
}

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
  youtubeService.clearAccessTokenCache();
  resetYoutubeRateLimiters();
});

test("setting a thumbnail persists the URL returned by the provider and marks it custom", async () => {
  mockConnectedChannel();
  mock.method(
    videoRepository,
    "findVideoById",
    async () => createRawVideo()
  );

  let providerInput;
  mock.method(
    youtubeClient,
    "setVideoThumbnail",
    async (input) => {
      providerInput = input;
      return {
        thumbnailUrl: CUSTOM_THUMBNAIL_URL,
        width: 1280,
        height: 720,
      };
    }
  );

  let updateInput;
  mock.method(
    videoRepository,
    "updateVideoProcessingStatus",
    async (input) => {
      updateInput = input;
      return true;
    }
  );
  mock.method(
    videoService,
    "getVideoById",
    async () => createAdminVideo()
  );

  const result = await youtubeService.setVideoThumbnail(
    createThumbnailInput()
  );

  assert.equal(providerInput.videoId, "aaaaaaaaaaa");
  assert.equal(result.thumbnailUrl, CUSTOM_THUMBNAIL_URL);
  assert.equal(result.video.thumbnailSource, "CUSTOM");
  // The URL must come from the thumbnails.set response, never from a
  // follow-up read that could still report the previous frame.
  assert.equal(
    updateInput.thumbnailUrl,
    CUSTOM_THUMBNAIL_URL
  );
  assert.equal(updateInput.thumbnailSource, "CUSTOM");
});

test("status synchronization does not replace a custom thumbnail with the provider frame", async () => {
  mockConnectedChannel();
  mock.method(
    videoRepository,
    "findVideoById",
    async () =>
      createRawVideo({
        thumbnail_url: CUSTOM_THUMBNAIL_URL,
        thumbnail_source: "CUSTOM",
      })
  );
  mock.method(
    youtubeClient,
    "getVideo",
    async () => ({
      videoId: "aaaaaaaaaaa",
      title: "QA video",
      description: null,
      url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
      thumbnailUrl: PROVIDER_FRAME_URL,
      privacyStatus: "UNLISTED",
      uploadStatus: "processed",
      processingStatus: "succeeded",
    })
  );

  const updateCalls = [];
  mock.method(
    videoRepository,
    "updateVideoProcessingStatus",
    async (input) => {
      updateCalls.push(input);
      return true;
    }
  );
  mock.method(
    videoService,
    "getVideoById",
    async () => createAdminVideo()
  );

  const result = await youtubeService.getVideoStatus(7);

  // The provider reported exactly what is already stored, so the poll
  // issues no write at all. The custom URL is not merely preserved, it
  // is never sent to the database, and updated_at stays put so polling
  // does not churn the public thumbnail cache version.
  assert.equal(updateCalls.length, 0);

  // Defensive: if a future change does issue the write, the custom
  // thumbnail must still be left out of it, because the repository
  // drops undefined values from the UPDATE.
  for (const input of updateCalls) {
    assert.equal(input.uploadStatus, "READY");
    assert.equal(input.thumbnailUrl, undefined);
  }

  // The provider offered a different frame and the response still
  // carries the editorial choice.
  assert.equal(result.uploadStatus, "READY");
  assert.equal(result.privacyStatus, "UNLISTED");
  assert.equal(
    result.video.thumbnailUrl,
    CUSTOM_THUMBNAIL_URL
  );
  assert.equal(
    result.video.thumbnailSource,
    "CUSTOM"
  );
});

test("status synchronization still refreshes a default thumbnail", async () => {
  mockConnectedChannel();
  mock.method(
    videoRepository,
    "findVideoById",
    async () =>
      createRawVideo({
        thumbnail_url: null,
        thumbnail_source: "YOUTUBE_DEFAULT",
      })
  );
  mock.method(
    youtubeClient,
    "getVideo",
    async () => ({
      videoId: "aaaaaaaaaaa",
      title: "QA video",
      description: null,
      url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
      thumbnailUrl: PROVIDER_FRAME_URL,
      privacyStatus: "UNLISTED",
      uploadStatus: "processed",
      processingStatus: "succeeded",
    })
  );

  let updateInput;
  mock.method(
    videoRepository,
    "updateVideoProcessingStatus",
    async (input) => {
      updateInput = input;
      return true;
    }
  );
  mock.method(
    videoService,
    "getVideoById",
    async () =>
      createAdminVideo({
        thumbnailUrl: PROVIDER_FRAME_URL,
        thumbnailSource: "YOUTUBE_DEFAULT",
      })
  );

  await youtubeService.getVideoStatus(7);

  assert.equal(updateInput.thumbnailUrl, PROVIDER_FRAME_URL);
});

test("an administrative thumbnail override is recorded as a custom thumbnail", async () => {
  mock.method(
    videoRepository,
    "findVideoById",
    async () => createRawVideo()
  );

  let writeInput;
  mock.method(
    videoRepository,
    "updateVideoById",
    async ({ updates }) => {
      writeInput = updates;
      return true;
    }
  );
  mock.method(
    videoRepository,
    "findVideoById",
    async () => createRawVideo()
  );
  mock.method(
    videoService,
    "getVideoById",
    async () => createAdminVideo()
  );

  await videoService.updateVideo({
    videoId: 7,
    updates: parseUpdateVideoBody({
      thumbnailUrl: CUSTOM_THUMBNAIL_URL,
    }),
  });

  assert.equal(writeInput.thumbnailSource, "CUSTOM");
});

test("an administrative thumbnail override rejects hosts that are not YouTube", () => {
  assert.throws(
    () =>
      parseUpdateVideoBody({
        thumbnailUrl:
          "https://ik.imagekit.io/attacker/evil.jpg",
      }),
    (error) => {
      assertAppError(
        error,
        400,
        "INVALID_VIDEO_THUMBNAIL_URL"
      );
      return true;
    }
  );
});

test("an administrative thumbnail override accepts an allowed YouTube host", () => {
  const updates = parseUpdateVideoBody({
    thumbnailUrl: CUSTOM_THUMBNAIL_URL,
  });

  assert.equal(
    updates.thumbnailUrl,
    CUSTOM_THUMBNAIL_URL
  );
});

test("setting a thumbnail is rejected while the video is still processing", async () => {
  mock.method(
    videoRepository,
    "findVideoById",
    async () =>
      createRawVideo({ upload_status: "PROCESSING" })
  );

  await assert.rejects(
    youtubeService.setVideoThumbnail(
      createThumbnailInput()
    ),
    (error) => {
      assertAppError(
        error,
        409,
        "VIDEO_THUMBNAIL_NOT_READY"
      );
      return true;
    }
  );
});

test("setting a thumbnail on a DELETED video fails before contacting YouTube", async () => {
  mockConnectedChannel();
  mock.method(
    videoRepository,
    "findVideoById",
    async () =>
      createRawVideo({ upload_status: "DELETED" })
  );

  let providerCalls = 0;
  mock.method(
    youtubeClient,
    "setVideoThumbnail",
    async () => {
      providerCalls += 1;
      return {};
    }
  );

  await assert.rejects(
    youtubeService.setVideoThumbnail(
      createThumbnailInput()
    ),
    (error) => {
      assertAppError(
        error,
        410,
        "VIDEO_REMOTE_DELETED"
      );
      return true;
    }
  );
  assert.equal(providerCalls, 0);
});

test("setting a thumbnail rejects an unsupported media type and an oversized file", async () => {
  await assert.rejects(
    youtubeService.setVideoThumbnail(
      createThumbnailInput({
        contentType: "image/webp",
      })
    ),
    (error) => {
      assertAppError(
        error,
        400,
        "INVALID_VIDEO_THUMBNAIL_TYPE"
      );
      return true;
    }
  );

  await assert.rejects(
    youtubeService.setVideoThumbnail(
      createThumbnailInput({
        fileSize: 10 * 1024 * 1024 + 1,
      })
    ),
    (error) => {
      assertAppError(
        error,
        400,
        "INVALID_VIDEO_THUMBNAIL_SIZE"
      );
      return true;
    }
  );
});

test("a 10 MB thumbnail is within the allowed size", () => {
  const updates = createThumbnailInput({
    fileSize: 10 * 1024 * 1024,
  });

  assert.equal(updates.fileSize, 10 * 1024 * 1024);
});

test("provider thumbnail failures are neutral and do not leak the provider payload", async () => {
  mockConnectedChannel();
  mock.method(
    videoRepository,
    "findVideoById",
    async () => createRawVideo()
  );
  mock.method(
    youtubeClient,
    "setVideoThumbnail",
    async () => {
      const error = new YouTubeApiError(
        "set-thumbnail",
        500
      );
      error.reason = "internalProviderDetail";
      throw error;
    }
  );

  await assert.rejects(
    youtubeService.setVideoThumbnail(
      createThumbnailInput()
    ),
    (error) => {
      assertAppError(
        error,
        502,
        "YOUTUBE_THUMBNAIL_FAILED"
      );
      assert.equal(
        error.message.includes("internalProviderDetail"),
        false
      );
      return true;
    }
  );
});

test("provider rate limiting and invalid images map to stable codes", () => {
  const rateLimited = new YouTubeApiError(
    "set-thumbnail",
    429
  );
  rateLimited.reason = "uploadRateLimitExceeded";
  assertAppError(
    youtubeService.mapThumbnailError(rateLimited),
    429,
    "YOUTUBE_THUMBNAIL_RATE_LIMITED"
  );

  const invalidImage = new YouTubeApiError(
    "set-thumbnail",
    400
  );
  invalidImage.reason = "invalidImage";
  assertAppError(
    youtubeService.mapThumbnailError(invalidImage),
    400,
    "INVALID_VIDEO_THUMBNAIL_IMAGE"
  );

  const forbidden = new YouTubeApiError(
    "set-thumbnail",
    403
  );
  assertAppError(
    youtubeService.mapThumbnailError(forbidden),
    409,
    "YOUTUBE_THUMBNAIL_NOT_PERMITTED"
  );
});

test("a persistence failure after a successful provider call is reported neutrally", async () => {
  mockConnectedChannel();
  mock.method(
    videoRepository,
    "findVideoById",
    async () => createRawVideo()
  );
  mock.method(
    youtubeClient,
    "setVideoThumbnail",
    async () => ({
      thumbnailUrl: CUSTOM_THUMBNAIL_URL,
      width: 1280,
      height: 720,
    })
  );
  mock.method(
    videoRepository,
    "updateVideoProcessingStatus",
    async () => {
      throw new Error("SQL secret detail");
    }
  );

  await assert.rejects(
    youtubeService.setVideoThumbnail(
      createThumbnailInput()
    ),
    (error) => {
      assertAppError(
        error,
        500,
        "VIDEO_THUMBNAIL_PERSISTENCE_FAILED"
      );
      assert.equal(
        error.message.includes("SQL secret detail"),
        false
      );
      return true;
    }
  );
});

test("reverting restores the provider frame and the default source", async () => {
  mockConnectedChannel();
  mock.method(
    videoRepository,
    "findVideoById",
    async () =>
      createRawVideo({
        thumbnail_url: CUSTOM_THUMBNAIL_URL,
        thumbnail_source: "CUSTOM",
      })
  );
  mock.method(
    youtubeClient,
    "getVideo",
    async () => ({
      videoId: "aaaaaaaaaaa",
      title: "QA video",
      description: null,
      url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
      thumbnailUrl: PROVIDER_FRAME_URL,
      privacyStatus: "UNLISTED",
      uploadStatus: "processed",
      processingStatus: "succeeded",
    })
  );

  let updateInput;
  mock.method(
    videoRepository,
    "updateVideoProcessingStatus",
    async (input) => {
      updateInput = input;
      return true;
    }
  );
  mock.method(
    videoService,
    "getVideoById",
    async () =>
      createAdminVideo({
        thumbnailUrl: PROVIDER_FRAME_URL,
        thumbnailSource: "YOUTUBE_DEFAULT",
      })
  );

  const result = await youtubeService.revertVideoThumbnail(7);

  assert.equal(result.thumbnailUrl, PROVIDER_FRAME_URL);
  assert.equal(
    updateInput.thumbnailSource,
    "YOUTUBE_DEFAULT"
  );
});

test("reverting a thumbnail on a DELETED video fails before reading YouTube or updating locally", async () => {
  mockConnectedChannel();
  mock.method(
    videoRepository,
    "findVideoById",
    async () =>
      createRawVideo({ upload_status: "DELETED" })
  );

  let providerCalls = 0;
  let updateCalls = 0;
  mock.method(
    youtubeClient,
    "getVideo",
    async () => {
      providerCalls += 1;
      return {};
    }
  );
  mock.method(
    videoRepository,
    "updateVideoProcessingStatus",
    async () => {
      updateCalls += 1;
      return true;
    }
  );

  await assert.rejects(
    youtubeService.revertVideoThumbnail(7),
    (error) => {
      assertAppError(
        error,
        410,
        "VIDEO_REMOTE_DELETED"
      );
      return true;
    }
  );
  assert.equal(providerCalls, 0);
  assert.equal(updateCalls, 0);
});

test("reverting still clears the custom marker when the provider is unreachable", async () => {
  mockConnectedChannel();
  mock.method(
    videoRepository,
    "findVideoById",
    async () =>
      createRawVideo({
        thumbnail_url: CUSTOM_THUMBNAIL_URL,
        thumbnail_source: "CUSTOM",
      })
  );
  mock.method(
    youtubeClient,
    "getVideo",
    async () => {
      throw new YouTubeApiError("video-status", 503);
    }
  );

  let updateInput;
  mock.method(
    videoRepository,
    "updateVideoProcessingStatus",
    async (input) => {
      updateInput = input;
      return true;
    }
  );
  mock.method(
    videoService,
    "getVideoById",
    async () =>
      createAdminVideo({
        thumbnailSource: "YOUTUBE_DEFAULT",
      })
  );

  await youtubeService.revertVideoThumbnail(7);

  assert.equal(
    updateInput.thumbnailSource,
    "YOUTUBE_DEFAULT"
  );
  assert.equal(updateInput.thumbnailUrl, null);
});

// The validator is Express middleware, so it reports failures through
// next() instead of throwing.
function runThumbnailValidator(headers) {
  const {
    validateVideoThumbnail,
  } = require("../../src/modules/youtube/youtube.validator");

  return new Promise((resolve) => {
    validateVideoThumbnail(
      {
        get(name) {
          return headers[name];
        },
      },
      {},
      (error) => resolve(error ?? null)
    );
  });
}

test("the thumbnail route rejects an unsupported media type before any provider call", async () => {
  const error = await runThumbnailValidator({
    "content-type": "image/webp",
    "content-length": "2048",
  });

  assertAppError(
    error,
    400,
    "INVALID_VIDEO_THUMBNAIL_TYPE"
  );
});

test("the thumbnail route requires a declared content length", async () => {
  const error = await runThumbnailValidator({
    "content-type": "image/png",
  });

  assertAppError(
    error,
    400,
    "VIDEO_THUMBNAIL_SIZE_REQUIRED"
  );
});

test("the thumbnail route rejects an encoded body and an oversized image", async () => {
  const encodedError = await runThumbnailValidator({
    "content-type": "image/jpeg",
    "content-length": "2048",
    "content-encoding": "gzip",
  });
  assertAppError(
    encodedError,
    400,
    "INVALID_VIDEO_THUMBNAIL_ENCODING"
  );

  const oversizedError = await runThumbnailValidator({
    "content-type": "image/jpeg",
    "content-length": String(
      10 * 1024 * 1024 + 1
    ),
  });
  assertAppError(
    oversizedError,
    400,
    "INVALID_VIDEO_THUMBNAIL_SIZE"
  );
});

test("the thumbnail route accepts a 10 MB JPEG and exposes the raw stream", async () => {
  const {
    validateVideoThumbnail,
  } = require("../../src/modules/youtube/youtube.validator");

  const request = {
    get(name) {
      const headers = {
        "content-type": "image/jpeg",
        "content-length": String(10 * 1024 * 1024),
      };
      return headers[name];
    },
  };

  await new Promise((resolve) => {
    validateVideoThumbnail(
      request,
      {},
      (error) => {
        assert.equal(error, undefined);
        resolve();
      }
    );
  });

  assert.equal(
    request.youtubeThumbnailInput.fileSize,
    10 * 1024 * 1024
  );
  assert.equal(
    request.youtubeThumbnailInput.contentType,
    "image/jpeg"
  );
  assert.equal(
    request.youtubeThumbnailInput.fileStream,
    request
  );
});
