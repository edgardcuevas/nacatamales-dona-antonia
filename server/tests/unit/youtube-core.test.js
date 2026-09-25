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
  DB_NAME: "youtube_core_test",
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
    "http://localhost:3000/api/youtube/oauth/callback",
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
} = require("../../src/config/youtube");
const youtubeConnectionRepository = require(
  "../../src/modules/youtube/youtube-connection.repository"
);
const youtubeStateRepository = require(
  "../../src/modules/youtube/youtube-state.repository"
);
const {
  encryptRefreshToken,
  decryptRefreshToken,
} = require(
  "../../src/modules/youtube/youtube-token-crypto"
);
const youtubeService = require(
  "../../src/modules/youtube/youtube.service"
);
const videoRepository = require(
  "../../src/modules/videos/video.repository"
);
const videoService = require(
  "../../src/modules/videos/video.service"
);
const pool = require("../../src/database/pool");

function createConnection(overrides = {}) {
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
    ...overrides,
  };
}

function createAdminVideo(overrides = {}) {
  return {
    id: 7,
    title: "QA upload",
    description: "Description",
    url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    provider: "YOUTUBE",
    externalId: "aaaaaaaaaaa",
    thumbnailUrl: null,
    sortOrder: 0,
    isActive: false,
    uploadStatus: "PROCESSING",
    privacyStatus: "UNLISTED",
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function createInput(overrides = {}) {
  return {
    title: "QA upload",
    description: "Description",
    fileStream: Readable.from(
      Buffer.from("fake-video")
    ),
    fileSize: 10,
    contentType: "video/mp4",
    ...overrides,
  };
}

function assertAppError(
  error,
  statusCode,
  code
) {
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
});

test("YouTube refresh tokens are encrypted at rest and round-trip only with the configured key", () => {
  const encrypted =
    encryptRefreshToken("refresh-token-value");
  assert.notEqual(
    encrypted,
    "refresh-token-value"
  );
  assert.equal(
    encrypted.includes("refresh-token-value"),
    false
  );
  assert.equal(
    decryptRefreshToken(encrypted),
    "refresh-token-value"
  );
});

test("authorization request stores only a state hash and returns no token", async () => {
  let storedState;
  mock.method(
    youtubeStateRepository,
    "createOAuthState",
    async (input) => {
      storedState = input;
    }
  );
  const result =
    await youtubeService.createAuthorizationRequest(1);

  assert.ok(result.state.length >= 32);
  assert.equal(
    storedState.stateHash.includes(result.state),
    false
  );
  assert.equal(storedState.adminUserId, 1);
  assert.match(
    result.authorizationUrl,
    /^https:\/\/accounts\.google\.com\//
  );
  assert.equal(
    result.authorizationUrl.includes("test_google_client_secret"),
    false
  );
  assert.equal(
    Object.hasOwn(result, "refreshToken"),
    false
  );
});

test("OAuth callback exchanges the code, verifies the channel, and stores only an encrypted refresh token", async () => {
  const calls = {
    exchange: null,
    channel: null,
    upsert: null,
  };
  mock.method(
    youtubeStateRepository,
    "consumeOAuthState",
    async () => ({
      accepted: true,
      reason: null,
    })
  );
  mock.method(
    youtubeClient,
    "exchangeAuthorizationCode",
    async (code) => {
      calls.exchange = code;
      return {
        accessToken: "short-lived-access-token",
        refreshToken: "refresh-token-value",
        expiresIn: 3600,
        scope: "youtube.upload youtube.readonly",
      };
    }
  );
  mock.method(
    youtubeClient,
    "getAuthenticatedChannel",
    async (accessToken) => {
      calls.channel = accessToken;
      return {
        channelId: "UC1234567890123456789012",
        title: "Official channel",
      };
    }
  );
  mock.method(
    youtubeConnectionRepository,
    "upsertConnection",
    async (input) => {
      calls.upsert = input;
      return createConnection({
        encrypted_refresh_token:
          input.encryptedRefreshToken,
      });
    }
  );

  const state = "b".repeat(64);
  const result =
    await youtubeService.completeAuthorization({
      code: "authorization-code",
      state,
      stateCookie: state,
    });

  assert.equal(calls.exchange, "authorization-code");
  assert.equal(
    calls.channel,
    "short-lived-access-token"
  );
  assert.equal(result.connected, true);
  assert.equal(result.channelId, "UC1234567890123456789012");
  assert.equal(
    calls.upsert.encryptedRefreshToken.includes(
      "refresh-token-value"
    ),
    false
  );
  assert.equal(
    decryptRefreshToken(
      calls.upsert.encryptedRefreshToken
    ),
    "refresh-token-value"
  );
  assert.equal(
    Object.hasOwn(result, "accessToken"),
    false
  );
  assert.equal(
    Object.hasOwn(result, "refreshToken"),
    false
  );
});

test("OAuth callback rejects a mismatched state before exchanging a code", async () => {
  let exchanged = false;
  mock.method(
    youtubeClient,
    "exchangeAuthorizationCode",
    async () => {
      exchanged = true;
      return {};
    }
  );

  await assert.rejects(
    youtubeService.completeAuthorization({
      code: "authorization-code",
      state: "a".repeat(64),
      stateCookie: "b".repeat(64),
    }),
    (error) => {
      assertAppError(
        error,
        400,
        "YOUTUBE_OAUTH_STATE_MISMATCH"
      );
      return true;
    }
  );
  assert.equal(exchanged, false);
});

test("upload refreshes the stored token once, streams the request, and persists an unlisted processing video", async () => {
  let refreshCalls = 0;
  let uploadedInput;
  let persistedInput;
  const connection = createConnection();

  mock.method(
    youtubeConnectionRepository,
    "getConnection",
    async () => connection
  );
  mock.method(
    youtubeConnectionRepository,
    "updateTokenExpiry",
    async () => true
  );
  mock.method(
    youtubeClient,
    "refreshAccessToken",
    async (refreshToken) => {
      refreshCalls += 1;
      assert.equal(refreshToken, "refresh-token");
      return {
        accessToken: "new-access-token",
        expiresIn: 3600,
      };
    }
  );
  mock.method(
    youtubeClient,
    "uploadVideo",
    async (input) => {
      uploadedInput = input;
      return {
        videoId: "aaaaaaaaaaa",
        title: input.title,
        description: input.description,
        url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
        thumbnailUrl:
          "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg",
        privacyStatus: "UNLISTED",
        uploadStatus: "uploaded",
        processingStatus: null,
      };
    }
  );
  mock.method(
    videoRepository,
    "createUploadedVideo",
    async (input) => {
      persistedInput = input;
      return { id: 7 };
    }
  );
  mock.method(
    videoService,
    "getVideoById",
    async () =>
      createAdminVideo({
        thumbnailUrl:
          "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg",
      })
  );

  const result =
    await youtubeService.uploadVideo(
      createInput()
    );

  assert.equal(result.id, 7);
  assert.equal(refreshCalls, 1);
  assert.equal(
    uploadedInput.accessToken,
    "new-access-token"
  );
  assert.equal(
    persistedInput.externalId,
    "aaaaaaaaaaa"
  );
  assert.equal(
    persistedInput.privacyStatus,
    "UNLISTED"
  );
  assert.equal(
    persistedInput.uploadStatus,
    "PROCESSING"
  );
  assert.equal(
    persistedInput.isActive,
    undefined
  );
  assert.equal(
    Object.hasOwn(persistedInput, "accessToken"),
    false
  );

  await youtubeService.uploadVideo(
    createInput()
  );
  assert.equal(refreshCalls, 1);
});

test("upload returns a neutral error and does not expose provider details", async () => {
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
  mock.method(
    youtubeClient,
    "uploadVideo",
    async () => {
      throw new Error(
        "provider response contains secret detail"
      );
    }
  );

  await assert.rejects(
    youtubeService.uploadVideo(createInput()),
    (error) => {
      assertAppError(
        error,
        502,
        "YOUTUBE_UPLOAD_FAILED"
      );
      assert.equal(
        error.message.includes("secret detail"),
        false
      );
      return true;
    }
  );
});

test("upload refuses a provider response that violates the unlisted invariant", async () => {
  let deletedId;
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
  mock.method(
    youtubeClient,
    "uploadVideo",
    async () => ({
      videoId: "aaaaaaaaaaa",
      title: "QA upload",
      description: "Description",
      url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
      thumbnailUrl: null,
      privacyStatus: "PUBLIC",
      uploadStatus: "uploaded",
      processingStatus: null,
    })
  );
  mock.method(
    youtubeClient,
    "deleteVideo",
    async (accessToken, videoId) => {
      deletedId = videoId;
    }
  );

  await assert.rejects(
    youtubeService.uploadVideo(createInput()),
    (error) => {
      assertAppError(
        error,
        502,
        "YOUTUBE_UPLOAD_FAILED"
      );
      return true;
    }
  );
  assert.equal(deletedId, "aaaaaaaaaaa");
});
test("upload rejects cleanly when the channel has not been connected", async () => {
  mock.method(
    youtubeConnectionRepository,
    "getConnection",
    async () => null
  );

  await assert.rejects(
    youtubeService.uploadVideo(createInput()),
    (error) => {
      assertAppError(
        error,
        409,
        "YOUTUBE_NOT_CONNECTED"
      );
      return true;
    }
  );
});

test("duplicate provider IDs are mapped to a safe conflict after compensation", async () => {
  const duplicate = new Error("duplicate");
  duplicate.code = "ER_DUP_ENTRY";
  let deletedId;

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
  mock.method(
    youtubeClient,
    "uploadVideo",
    async () => ({
      videoId: "aaaaaaaaaaa",
      title: "QA upload",
      description: "Description",
      url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
      thumbnailUrl: null,
      privacyStatus: "UNLISTED",
      uploadStatus: "uploaded",
      processingStatus: null,
    })
  );
  mock.method(
    videoRepository,
    "createUploadedVideo",
    async () => {
      throw duplicate;
    }
  );
  mock.method(
    youtubeClient,
    "deleteVideo",
    async (accessToken, videoId) => {
      deletedId = videoId;
    }
  );

  await assert.rejects(
    youtubeService.uploadVideo(createInput()),
    (error) => {
      assertAppError(
        error,
        409,
        "VIDEO_ALREADY_EXISTS"
      );
      return true;
    }
  );
  assert.equal(deletedId, "aaaaaaaaaaa");
});
test("persistence failure compensates by deleting the remote video", async () => {
  let deletedId;
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
  mock.method(
    youtubeClient,
    "uploadVideo",
    async () => ({
      videoId: "aaaaaaaaaaa",
      title: "QA upload",
      description: "Description",
      url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
      thumbnailUrl: null,
      privacyStatus: "UNLISTED",
      uploadStatus: "uploaded",
      processingStatus: null,
    })
  );
  mock.method(
    videoRepository,
    "createUploadedVideo",
    async () => {
      throw new Error("database unavailable");
    }
  );
  mock.method(
    youtubeClient,
    "deleteVideo",
    async (accessToken, videoId) => {
      deletedId = videoId;
    }
  );

  await assert.rejects(
    youtubeService.uploadVideo(createInput()),
    (error) => {
      assertAppError(
        error,
        500,
        "VIDEO_PERSISTENCE_FAILED"
      );
      return true;
    }
  );
  assert.equal(deletedId, "aaaaaaaaaaa");
});

test("status queries YouTube, persists processing state and thumbnail, and returns a safe admin DTO", async () => {
  let updateInput;
  mock.method(
    videoRepository,
    "findVideoById",
    async () => ({
      id: 7,
      title: "QA upload",
      description: "Description",
      url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
      provider: "YOUTUBE",
      external_id: "aaaaaaaaaaa",
      thumbnail_url: null,
      sort_order: 0,
      is_active: 0,
      upload_status: "PROCESSING",
      privacy_status: "UNLISTED",
      created_at: new Date(),
      updated_at: new Date(),
    })
  );
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
  mock.method(
    youtubeClient,
    "getVideo",
    async () => ({
      videoId: "aaaaaaaaaaa",
      title: "QA upload",
      description: "Description",
      url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
      thumbnailUrl:
        "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg",
      privacyStatus: "UNLISTED",
      uploadStatus: "processed",
      processingStatus: "succeeded",
    })
  );
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
        uploadStatus: "READY",
        thumbnailUrl:
          "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg",
      })
  );

  const result =
    await youtubeService.getVideoStatus(7);

  assert.equal(result.uploadStatus, "READY");
  assert.equal(result.privacyStatus, "UNLISTED");
  assert.equal(result.video.id, 7);
  assert.equal(updateInput.uploadStatus, "READY");
  assert.equal(
    updateInput.thumbnailUrl,
    "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg"
  );
});

test("channel status is safe when no connection exists", async () => {
  mock.method(
    youtubeConnectionRepository,
    "getConnection",
    async () => null
  );

  const result =
    await youtubeService.getConnectionStatus();
  assert.deepEqual(result, {
    connected: false,
    channelId: null,
    channelTitle: null,
    connectedAt: null,
    updatedAt: null,
  });
  assert.equal(
    Object.hasOwn(result, "encrypted_refresh_token"),
    false
  );
});

test("upload input rejects missing size, unsafe type, and oversized files before provider access", () => {
  for (const input of [
    createInput({ fileSize: 0 }),
    createInput({
      fileSize: 3 * 1024 * 1024 * 1024,
    }),
    createInput({
      contentType: "application/json",
    }),
  ]) {
    assert.throws(
      () => youtubeService.validateUploadInput(input),
      (error) => {
        assert.equal(error.statusCode, 400);
        return true;
      }
    );
  }
});
