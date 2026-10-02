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
  DB_NAME: "video_status_sync_test",
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

const videoRepository = require(
  "../../src/modules/videos/video.repository"
);
const videoService = require(
  "../../src/modules/videos/video.service"
);
const youtubeService = require(
  "../../src/modules/youtube/youtube.service"
);
const {
  youtubeClient,
} = require("../../src/config/youtube");
const youtubeConnectionRepository =
  require("../../src/modules/youtube/youtube-connection.repository");
const {
  encryptRefreshToken,
} = require("../../src/modules/youtube/youtube-token-crypto");
const pool = require("../../src/database/pool");

const YT_THUMBNAIL =
  "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg";

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
});

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

function createStoredVideo(overrides = {}) {
  return {
    id: 7,
    title: "QA upload",
    description: "Description",
    url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    provider: "YOUTUBE",
    external_id: "aaaaaaaaaaa",
    thumbnail_url: YT_THUMBNAIL,
    thumbnail_source: "YOUTUBE_DEFAULT",
    sort_order: 0,
    is_active: 0,
    upload_status: "READY",
    privacy_status: "UNLISTED",
    created_at: new Date("2026-01-01T00:00:00Z"),
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
    thumbnailUrl: YT_THUMBNAIL,
    thumbnailSource: "YOUTUBE_DEFAULT",
    sortOrder: 0,
    isActive: false,
    uploadStatus: "READY",
    privacyStatus: "UNLISTED",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function createRemoteVideo(overrides = {}) {
  return {
    videoId: "aaaaaaaaaaa",
    title: "QA upload",
    description: "Description",
    url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    thumbnailUrl: YT_THUMBNAIL,
    privacyStatus: "UNLISTED",
    uploadStatus: "processed",
    processingStatus: "succeeded",
    ...overrides,
  };
}

// Wires the whole status flow and reports how many UPDATEs were
// issued, so a test can assert on the write itself rather than only
// on the returned DTO.
function arrange({
  stored = createStoredVideo(),
  remote = createRemoteVideo(),
  adminVideo = createAdminVideo(),
} = {}) {
  const calls = { update: [], findVideoById: 0 };

  mock.method(
    videoRepository,
    "findVideoById",
    async () => {
      calls.findVideoById += 1;
      return stored;
    }
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
    async () => remote
  );
  mock.method(
    videoRepository,
    "updateVideoProcessingStatus",
    async (input) => {
      calls.update.push(input);
      return true;
    }
  );
  mock.method(
    videoService,
    "getVideoById",
    async () => adminVideo
  );

  return calls;
}

test("the status poll skips the UPDATE and returns the same DTO when nothing changed", async () => {
  const calls = arrange();

  const result = await youtubeService.getVideoStatus(7);

  assert.equal(
    calls.update.length,
    0,
    "no write must be issued when the provider reported the stored state"
  );
  assert.deepEqual(result, {
    video: createAdminVideo(),
    uploadStatus: "READY",
    privacyStatus: "UNLISTED",
  });
});

test("the status poll is idempotent across repeated polls", async () => {
  const calls = arrange();

  const first = await youtubeService.getVideoStatus(7);
  const second = await youtubeService.getVideoStatus(7);
  const third = await youtubeService.getVideoStatus(7);

  assert.equal(calls.update.length, 0);
  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
});

test("the status poll still persists a changed upload status", async () => {
  const calls = arrange({
    stored: createStoredVideo({
      upload_status: "PROCESSING",
    }),
  });

  const result = await youtubeService.getVideoStatus(7);

  assert.equal(calls.update.length, 1);
  assert.equal(
    calls.update[0].uploadStatus,
    "READY"
  );
  assert.equal(result.uploadStatus, "READY");
});

test("the status poll still persists a changed privacy status", async () => {
  const calls = arrange({
    stored: createStoredVideo({
      privacy_status: "PRIVATE",
    }),
    remote: createRemoteVideo({
      privacyStatus: "unlisted",
    }),
  });

  const result = await youtubeService.getVideoStatus(7);

  assert.equal(calls.update.length, 1);
  assert.equal(
    calls.update[0].privacyStatus,
    "UNLISTED"
  );
  assert.equal(result.privacyStatus, "UNLISTED");
});

test("the status poll still persists a changed provider thumbnail", async () => {
  const otherThumbnail =
    "https://i.ytimg.com/vi/aaaaaaaaaaa/maxresdefault.jpg";
  const calls = arrange({
    stored: createStoredVideo({
      thumbnail_url: YT_THUMBNAIL,
    }),
    remote: createRemoteVideo({
      thumbnailUrl: otherThumbnail,
    }),
  });

  await youtubeService.getVideoStatus(7);

  assert.equal(calls.update.length, 1);
  assert.equal(
    calls.update[0].thumbnailUrl,
    otherThumbnail
  );
});

test("a custom thumbnail is never treated as a change, even when the provider reports another frame", async () => {
  const calls = arrange({
    stored: createStoredVideo({
      thumbnail_source: "CUSTOM",
      thumbnail_url: YT_THUMBNAIL,
    }),
    remote: createRemoteVideo({
      thumbnailUrl:
        "https://i.ytimg.com/vi/aaaaaaaaaaa/maxresdefault.jpg",
    }),
  });

  const result = await youtubeService.getVideoStatus(7);

  // thumbnailUrl is undefined for a CUSTOM row, which the repository
  // drops from the UPDATE. That absence must not count as a change,
  // otherwise every poll would write updated_at again and a poll would
  // also risk reverting the editorial choice.
  assert.equal(calls.update.length, 0);
  assert.equal(result.video.thumbnailUrl, YT_THUMBNAIL);
});

test("a custom thumbnail still persists a genuine processing change", async () => {
  const calls = arrange({
    stored: createStoredVideo({
      thumbnail_source: "CUSTOM",
      thumbnail_url: YT_THUMBNAIL,
      upload_status: "PROCESSING",
    }),
  });

  await youtubeService.getVideoStatus(7);

  assert.equal(calls.update.length, 1);
  assert.equal(
    calls.update[0].uploadStatus,
    "READY"
  );
  assert.equal(
    calls.update[0].thumbnailUrl,
    undefined,
    "the custom thumbnail is omitted from the write"
  );
  assert.equal(
    Object.hasOwn(calls.update[0], "thumbnailUrl"),
    true
  );
});

test("a legacy row with null processing columns is compared against its defaults", async () => {
  const calls = arrange({
    stored: createStoredVideo({
      upload_status: null,
      privacy_status: null,
      thumbnail_url: null,
    }),
    remote: createRemoteVideo({
      thumbnailUrl: null,
    }),
  });

  // upload_status and privacy_status are null, so the service falls
  // back to READY/UNLISTED; those defaults match the remote values and
  // the row is already in sync.
  await youtubeService.getVideoStatus(7);

  assert.equal(calls.update.length, 0);
});

test("a legacy null thumbnail is written once the provider reports one", async () => {
  const calls = arrange({
    stored: createStoredVideo({
      upload_status: null,
      privacy_status: null,
      thumbnail_url: null,
    }),
  });

  await youtubeService.getVideoStatus(7);

  assert.equal(calls.update.length, 1);
  assert.equal(
    calls.update[0].thumbnailUrl,
    YT_THUMBNAIL
  );
});