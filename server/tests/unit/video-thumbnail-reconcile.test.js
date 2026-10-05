// Reconciliation of a remote and local thumbnail divergence.
// YouTube is never written: the only provider call is one read.
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
  DB_NAME: "thumbnail_reconcile_test",
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

const {
  youtubeClient,
  YouTubeApiError,
} = require("../../src/config/youtube");
const videoRepository = require(
  "../../src/modules/videos/video.repository"
);
const videoService = require(
  "../../src/modules/videos/video.service"
);
const youtubeConnectionRepository = require(
  "../../src/modules/youtube/youtube-connection.repository"
);
const youtubeService = require(
  "../../src/modules/youtube/youtube.service"
);
const {
  encryptRefreshToken,
} = require("../../src/modules/youtube/youtube-token-crypto");

const pool = require("../../src/database/pool");

const CHANNEL = "UC1234567890123456789012";
const OTHER_CHANNEL = "UC9999999999999999999999";
const EXTERNAL_ID = "aaaaaaaaaaa";
const HOST = "https://i.ytimg.com";
const CUSTOM_URL = `${HOST}/vi/${EXTERNAL_ID}/maxresdefault.jpg`;

const ENCRYPTED_REFRESH_TOKEN =
  encryptRefreshToken("refresh-token");

function createRawVideo(overrides = {}) {
  return {
    id: 6,
    title: "a title that must never be logged",
    description: null,
    url: `https://www.youtube.com/watch?v=${EXTERNAL_ID}`,
    provider: "YOUTUBE",
    external_id: EXTERNAL_ID,
    thumbnail_url: `${HOST}/vi/${EXTERNAL_ID}/hqdefault.jpg`,
    thumbnail_source: "YOUTUBE_DEFAULT",
    sort_order: 0,
    is_active: 1,
    upload_status: "READY",
    privacy_status: "PUBLIC",
    remote_deleted_at: null,
    created_at: new Date("2026-10-05T00:00:00.000Z"),
    updated_at: new Date("2026-10-05T03:23:21.000Z"),
    ...overrides,
  };
}

function createHarness({
  video = createRawVideo(),
  connectionChannelId = CHANNEL,
  remote,
  reconcileStatus = "RECONCILED",
  reconcileThrows = false,
} = {}) {
  const calls = {
    remoteReads: 0,
    remoteWrites: 0,
    reconciles: [],
    connectionReads: 0,
  };

  youtubeService.clearAccessTokenCache();

  mock.method(
    videoRepository,
    "findVideoById",
    async () => video
  );

  mock.method(
    youtubeConnectionRepository,
    "getConnection",
    async () => {
      calls.connectionReads += 1;
      return {
        id: 1,
        channel_id: connectionChannelId,
        encrypted_refresh_token:
          ENCRYPTED_REFRESH_TOKEN,
        token_expires_at: null,
      };
    }
  );

  mock.method(
    youtubeConnectionRepository,
    "updateTokenExpiry",
    async () => true
  );

  mock.method(
    youtubeClient,
    "refreshAccessToken",
    async () => ({
      accessToken: "access-token",
      expiresIn: 3600,
    })
  );

  // The only provider interaction is one read.
  mock.method(
    youtubeClient,
    "getVideoThumbnailState",
    async (_token, videoId) => {
      calls.remoteReads += 1;
      return remote
        ? remote({ videoId })
        : {
            videoId: EXTERNAL_ID,
            channelId: CHANNEL,
            thumbnailUrl: CUSTOM_URL,
            thumbnailVariant: "maxres",
          };
    }
  );

  for (const write of [
    "setVideoThumbnail",
    "deleteVideo",
    "uploadVideo",
  ]) {
    mock.method(youtubeClient, write, async () => {
      calls.remoteWrites += 1;
      throw new Error(
        `${write} must never be called`
      );
    });
  }

  mock.method(
    videoRepository,
    "reconcileThumbnailState",
    async (input) => {
      calls.reconciles.push(input);
      if (reconcileThrows) {
        throw new Error("MySQL write failed");
      }
      return { status: reconcileStatus };
    }
  );

  mock.method(
    videoService,
    "getVideoById",
    async () => ({
      id: 6,
      uploadStatus: "READY",
      thumbnailSource: "CUSTOM",
      thumbnailUrl: CUSTOM_URL,
      isActive: true,
      remoteDeletedAt: null,
      sortOrder: 0,
      provider: "YOUTUBE",
      externalId: EXTERNAL_ID,
      url: "https://www.youtube.com/watch?v=x",
      privacyStatus: "PUBLIC",
      thumbnailSource_: undefined,
    })
  );

  return calls;
}

afterEach(() => {
  mock.restoreAll();
  youtubeService.clearAccessTokenCache();
});

after(async () => {
  await pool.end();
});

test("a matching remote thumbnail reconciles the local marker with one read and no write", async () => {
  const calls = createHarness();

  const result =
    await youtubeService.reconcileRemoteThumbnail({
      videoId: 6,
    });

  assert.equal(calls.remoteReads, 1);
  assert.equal(calls.remoteWrites, 0);
  assert.equal(result.reconciled, true);
  assert.equal(
    result.remoteThumbnailVariant,
    "maxres"
  );
  assert.equal(
    result.video.thumbnailSource,
    "CUSTOM"
  );

  assert.equal(calls.reconciles.length, 1);
  assert.equal(calls.reconciles[0].videoId, 6);
  assert.equal(
    calls.reconciles[0].thumbnailUrl,
    CUSTOM_URL
  );
  assert.equal(
    calls.reconciles[0].expectedThumbnailSource,
    "YOUTUBE_DEFAULT"
  );
  assert.equal(
    calls.reconciles[0].expectedUploadStatus,
    "READY"
  );
});

test("the variant reported by the adapter is carried through", async () => {
  for (const variant of [
    "maxres",
    "standard",
    "high",
    "medium",
    "default",
  ]) {
    mock.restoreAll();

    const url = `${HOST}/vi/${EXTERNAL_ID}/x-${variant}.jpg`;
    const calls = createHarness({
      remote: () => ({
        videoId: EXTERNAL_ID,
        channelId: CHANNEL,
        thumbnailUrl: url,
        thumbnailVariant: variant,
      }),
    });

    const result =
      await youtubeService.reconcileRemoteThumbnail({
        videoId: 6,
      });

    assert.equal(
      result.remoteThumbnailVariant,
      variant
    );
    assert.equal(
      calls.reconciles[0].thumbnailUrl,
      url
    );
  }
});

test("a video that no longer exists remotely stops before any local write", async () => {
  const calls = createHarness({
    remote: () => {
      throw new YouTubeApiError(
        "thumbnail-state",
        404
      );
    },
  });

  await assert.rejects(
    youtubeService.reconcileRemoteThumbnail({
      videoId: 6,
    }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(
        error.code,
        "VIDEO_REMOTE_NOT_FOUND"
      );
      return true;
    }
  );

  assert.equal(calls.remoteReads, 1);
  assert.deepEqual(calls.reconciles, []);
});

test("a video owned by another channel is refused without writing", async () => {
  const calls = createHarness({
    remote: () => ({
      videoId: EXTERNAL_ID,
      channelId: OTHER_CHANNEL,
      thumbnailUrl: CUSTOM_URL,
      thumbnailVariant: "maxres",
    }),
  });

  await assert.rejects(
    youtubeService.reconcileRemoteThumbnail({
      videoId: 6,
    }),
    (error) => {
      assert.equal(error.statusCode, 403);
      assert.equal(
        error.code,
        "YOUTUBE_CHANNEL_MISMATCH"
      );
      return true;
    }
  );

  assert.deepEqual(calls.reconciles, []);
});

test("a remote video without a usable thumbnail stops before any local write", async () => {
  const cases = [
    null,
    "",
    "https://images.example.test/a.jpg",
    "http://i.ytimg.com/vi/x/hq.jpg",
  ];

  for (const thumbnailUrl of cases) {
    mock.restoreAll();
    const calls = createHarness({
      remote: () => ({
        videoId: EXTERNAL_ID,
        channelId: CHANNEL,
        thumbnailUrl,
        thumbnailVariant: null,
      }),
    });

    await assert.rejects(
      youtubeService.reconcileRemoteThumbnail({
        videoId: 6,
      }),
      (error) => {
        assert.equal(error.statusCode, 409);
        assert.equal(
          error.code,
          "REMOTE_THUMBNAIL_UNAVAILABLE"
        );
        return true;
      }
    );

    assert.deepEqual(calls.reconciles, []);
  }
});

test("a temporary provider failure stops before any local write", async () => {
  const cases = [
    { status: 500 },
    { status: 503 },
    { status: 429 },
    { status: 401 },
    { status: 403 },
  ];

  for (const { status } of cases) {
    mock.restoreAll();
    const calls = createHarness({
      remote: () => {
        throw new YouTubeApiError(
          "thumbnail-state",
          status
        );
      },
    });

    await assert.rejects(
      youtubeService.reconcileRemoteThumbnail({
        videoId: 6,
      }),
      (error) => {
        assert.ok(
          [
            "YOUTUBE_REMOTE_QUERY_FAILED",
            "YOUTUBE_REMOTE_QUERY_RATE_LIMITED",
            "YOUTUBE_REAUTH_REQUIRED",
          ].includes(error.code),
          `status ${status} mapped to ${error.code}`
        );
        return true;
      }
    );

    assert.deepEqual(calls.reconciles, []);
  }

  mock.restoreAll();
  const network = createHarness({
    remote: () => {
      throw new TypeError("fetch failed");
    },
  });

  await assert.rejects(
    youtubeService.reconcileRemoteThumbnail({
      videoId: 6,
    }),
    (error) => {
      assert.equal(
        error.code,
        "YOUTUBE_REMOTE_QUERY_FAILED"
      );
      return true;
    }
  );
  assert.deepEqual(network.reconciles, []);
});

test("a local state change between the read and the commit is reported and not overwritten", async () => {
  for (const status of [
    "STATE_CHANGED",
    "NOT_FOUND",
    "DELETED",
  ]) {
    mock.restoreAll();
    const calls = createHarness({
      reconcileStatus: status,
    });

    const expected =
      status === "STATE_CHANGED"
        ? "RECONCILIATION_STATE_CHANGED"
        : status === "NOT_FOUND"
          ? "VIDEO_NOT_FOUND"
          : "VIDEO_REMOTE_DELETED";

    await assert.rejects(
      youtubeService.reconcileRemoteThumbnail({
        videoId: 6,
      }),
      (error) => {
        assert.equal(error.code, expected);
        return true;
      }
    );

    assert.equal(calls.reconciles.length, 1);
    assert.equal(calls.remoteWrites, 0);
  }
});

test("a local write failure is reported without exposing the cause", async () => {
  createHarness({ reconcileThrows: true });

  await assert.rejects(
    youtubeService.reconcileRemoteThumbnail({
      videoId: 6,
    }),
    (error) => {
      assert.equal(error.statusCode, 500);
      assert.equal(
        error.code,
        "VIDEO_THUMBNAIL_PERSISTENCE_FAILED"
      );
      assert.equal(
        error.message.includes("MySQL"),
        false
      );
      return true;
    }
  );
});

test("local preconditions are checked before any provider call", async () => {
  const scenarios = [
    {
      name: "missing video",
      video: null,
      code: "VIDEO_NOT_FOUND",
      status: 404,
    },
    {
      name: "unsupported provider",
      video: createRawVideo({
        provider: "VIMEO",
      }),
      code: "VIDEO_PROVIDER_NOT_YOUTUBE",
      status: 400,
    },
    {
      name: "deleted video",
      video: createRawVideo({
        upload_status: "DELETED",
      }),
      code: "VIDEO_REMOTE_DELETED",
      status: 410,
    },
    {
      name: "missing external id",
      video: createRawVideo({
        external_id: "",
      }),
      code: "VIDEO_REMOTE_ID_INVALID",
      status: 400,
    },
  ];

  for (const scenario of scenarios) {
    mock.restoreAll();
    const calls = createHarness({
      video: scenario.video,
    });

    await assert.rejects(
      youtubeService.reconcileRemoteThumbnail({
        videoId: 6,
      }),
      (error) => {
        assert.equal(
          error.code,
          scenario.code,
          scenario.name
        );
        assert.equal(
          error.statusCode,
          scenario.status,
          scenario.name
        );
        return true;
      }
    );

    assert.equal(
      calls.remoteReads,
      0,
      `${scenario.name} must not reach YouTube`
    );
    assert.deepEqual(calls.reconciles, []);
  }
});

test("a missing OAuth connection stops before any provider call", async () => {
  const calls = createHarness({
    connectionChannelId: CHANNEL,
  });

  mock.restoreAll();
  mock.method(
    youtubeConnectionRepository,
    "getConnection",
    async () => null
  );
  mock.method(
    videoRepository,
    "findVideoById",
    async () => createRawVideo()
  );
  mock.method(
    youtubeClient,
    "getVideoThumbnailState",
    async () => {
      calls.remoteReads += 1;
      throw new Error("must not be reached");
    }
  );

  await assert.rejects(
    youtubeService.reconcileRemoteThumbnail({
      videoId: 6,
    }),
    (error) => {
      assert.equal(
        error.code,
        "YOUTUBE_NOT_CONNECTED"
      );
      return true;
    }
  );

  assert.equal(calls.remoteReads, 0);
});

test("no title, external id or channel id reaches the reconciliation result", async () => {
  const calls = createHarness();

  const result =
    await youtubeService.reconcileRemoteThumbnail({
      videoId: 6,
    });

  const serialized = JSON.stringify(result);

  assert.equal(
    serialized.includes(OTHER_CHANNEL),
    false
  );
  assert.equal(
    serialized.includes("access-token"),
    false
  );
  assert.equal(result.reconciled, true);
  assert.deepEqual(
    Object.keys(result).sort(),
    ["reconciled", "remoteThumbnailVariant", "video"]
  );
});