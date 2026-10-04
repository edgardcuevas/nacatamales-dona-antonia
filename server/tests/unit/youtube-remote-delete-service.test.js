// Service level tests for the remote deletion flow. The provider and the
// repository are both replaced, so nothing here can reach YouTube or
// MySQL.
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
  DB_NAME: "youtube_remote_delete_service_test",
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
const youtubeConnectionRepository = require(
  "../../src/modules/youtube/youtube-connection.repository"
);
const youtubeService = require(
  "../../src/modules/youtube/youtube.service"
);

const pool = require("../../src/database/pool");
const {
  encryptRefreshToken,
} = require("../../src/modules/youtube/youtube-token-crypto");

const CHANNEL = "UC1234567890123456789012";
const OTHER_CHANNEL = "UC9999999999999999999999";
const EXTERNAL_ID = "aaaaaaaaaaa";
const VIDEO_ID = 7;

// A real encrypted refresh token, so the real token path runs: the only
// thing replaced is the network call to Google.
const ENCRYPTED_REFRESH_TOKEN =
  encryptRefreshToken("refresh-token");

const DELETED_DATE = new Date(
  "2026-01-02T03:04:05.000Z"
);

function createRawVideo(overrides = {}) {
  return {
    id: VIDEO_ID,
    title: "a title that must never be logged",
    description: null,
    url: `https://www.youtube.com/watch?v=${EXTERNAL_ID}`,
    provider: "YOUTUBE",
    external_id: EXTERNAL_ID,
    thumbnail_url:
      "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg",
    thumbnail_source: "CUSTOM",
    sort_order: 0,
    is_active: 1,
    upload_status: "READY",
    privacy_status: "PUBLIC",
    remote_deleted_at: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

// One harness per scenario: every collaborator is a recorder, so a test
// can assert exactly which provider calls happened and which local
// writes were attempted.
function createHarness({
  video = createRawVideo(),
  connection = {
    id: 1,
    channel_id: CHANNEL,
    encrypted_refresh_token: ENCRYPTED_REFRESH_TOKEN,
    token_expires_at: null,
  },
  getVideoOwner,
  deleteVideo,
} = {}) {
  const calls = {
    findVideoById: [],
    getConnection: 0,
    tokenRefreshes: 0,
    ownerProbes: [],
    remoteDeletes: [],
    localMarks: [],
    logs: [],
  };

  // The access token cache is module state; each scenario starts clean.
  youtubeService.clearAccessTokenCache();

  mock.method(
    videoRepository,
    "findVideoById",
    async (id) => {
      calls.findVideoById.push(id);
      return video;
    }
  );

  mock.method(
    youtubeConnectionRepository,
    "getConnection",
    async () => {
      calls.getConnection += 1;
      return connection;
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
    async () => {
      calls.tokenRefreshes += 1;
      return {
        accessToken: "access-token",
        expiresIn: 3600,
      };
    }
  );

  mock.method(
    videoRepository,
    "markVideoAsRemoteDeleted",
    async ({ videoId, remoteDeletedAt }) => {
      calls.localMarks.push({ videoId, remoteDeletedAt });
      return true;
    }
  );

  if (getVideoOwner) {
    mock.method(
      youtubeClient,
      "getVideoOwner",
      async (token, videoId) => {
        calls.ownerProbes.push(videoId);
        return getVideoOwner(token, videoId);
      }
    );
  }

  if (deleteVideo) {
    mock.method(
      youtubeClient,
      "deleteVideo",
      async (token, videoId) => {
        calls.remoteDeletes.push(videoId);
        return deleteVideo(token, videoId);
      }
    );
  }

  mock.method(console, "log", (line) => {
    calls.logs.push(String(line));
  });

  return calls;
}

afterEach(() => {
  mock.restoreAll();
  youtubeService.clearAccessTokenCache();
});

after(async () => {
  await pool.end();
});

test("a missing local video is refused without contacting YouTube or MySQL", async () => {
  const calls = createHarness({ video: null });

  await assert.rejects(
    youtubeService.deleteRemoteVideo(VIDEO_ID),
    (error) => {
      assert.equal(error.statusCode, 404);
      assert.equal(error.code, "VIDEO_NOT_FOUND");
      return true;
    }
  );

  assert.deepEqual(calls.findVideoById, [VIDEO_ID]);
  assert.deepEqual(calls.ownerProbes, []);
  assert.deepEqual(calls.remoteDeletes, []);
  assert.deepEqual(calls.localMarks, []);
});

test("a video from another provider is refused before any provider call", async () => {
  const calls = createHarness({
    video: createRawVideo({ provider: "VIMEO" }),
  });

  await assert.rejects(
    youtubeService.deleteRemoteVideo(VIDEO_ID),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(
        error.code,
        "VIDEO_PROVIDER_NOT_YOUTUBE"
      );
      return true;
    }
  );

  assert.deepEqual(calls.ownerProbes, []);
  assert.deepEqual(calls.remoteDeletes, []);
  assert.deepEqual(calls.localMarks, []);
});

test("a missing or unusable external id is refused before any provider call", async () => {
  for (const externalId of [null, "", "   "]) {
    mock.restoreAll();
    const calls = createHarness({
      video: createRawVideo({
        external_id: externalId,
      }),
    });

    await assert.rejects(
      youtubeService.deleteRemoteVideo(VIDEO_ID),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.equal(
          error.code,
          "VIDEO_REMOTE_ID_INVALID"
        );
        return true;
      }
    );

    assert.deepEqual(calls.ownerProbes, []);
    assert.deepEqual(calls.remoteDeletes, []);
    assert.deepEqual(calls.localMarks, []);
  }
});

test("an unrecognized local status is refused as an inconsistent state", async () => {
  const calls = createHarness({
    video: createRawVideo({
      upload_status: "ARCHIVED",
    }),
  });

  await assert.rejects(
    youtubeService.deleteRemoteVideo(VIDEO_ID),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(
        error.code,
        "VIDEO_LOCAL_STATE_INCONSISTENT"
      );
      return true;
    }
  );

  assert.deepEqual(calls.ownerProbes, []);
  assert.deepEqual(calls.remoteDeletes, []);
});

test("a DELETED record with a date answers idempotently and never contacts YouTube", async () => {
  const calls = createHarness({
    video: createRawVideo({
      upload_status: "DELETED",
      is_active: 0,
      remote_deleted_at: DELETED_DATE,
    }),
  });

  const result =
    await youtubeService.deleteRemoteVideo(VIDEO_ID);

  assert.equal(result.deleted, true);
  assert.equal(result.alreadyDeleted, true);
  assert.equal(result.remoteAlreadyMissing, true);
  assert.equal(result.video.uploadStatus, "DELETED");
  assert.equal(
    result.video.remoteDeletedAt,
    DELETED_DATE.toISOString()
  );

  assert.deepEqual(calls.ownerProbes, []);
  assert.deepEqual(calls.remoteDeletes, []);
  assert.deepEqual(
    calls.localMarks,
    [],
    "the original deletion date must never be rewritten"
  );
});

test("a DELETED record without a date is refused as inconsistent without contacting YouTube", async () => {
  const calls = createHarness({
    video: createRawVideo({
      upload_status: "DELETED",
      remote_deleted_at: null,
    }),
  });

  await assert.rejects(
    youtubeService.deleteRemoteVideo(VIDEO_ID),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(
        error.code,
        "VIDEO_LOCAL_STATE_INCONSISTENT"
      );
      return true;
    }
  );

  assert.deepEqual(calls.ownerProbes, []);
  assert.deepEqual(calls.remoteDeletes, []);
  assert.deepEqual(calls.localMarks, []);
});

test("the five already deleted development records would never reach YouTube", async () => {
  // Mirrors the real shape of the five records marked by the local tool:
  // DELETED with a date. No provider call may be made.
  const calls = createHarness({
    video: createRawVideo({
      id: 3,
      upload_status: "DELETED",
      is_active: 0,
      remote_deleted_at: new Date(),
    }),
  });

  const result =
    await youtubeService.deleteRemoteVideo(3);

  assert.equal(result.alreadyDeleted, true);
  assert.deepEqual(calls.ownerProbes, []);
  assert.deepEqual(calls.remoteDeletes, []);
  assert.deepEqual(calls.localMarks, []);
});

test("an existing video from the connected channel is deleted remotely and marked locally", async () => {
  const calls = createHarness({
    getVideoOwner: async () => ({
      videoId: EXTERNAL_ID,
      channelId: CHANNEL,
    }),
    deleteVideo: async () => undefined,
  });

  const result =
    await youtubeService.deleteRemoteVideo(VIDEO_ID);

  assert.deepEqual(calls.ownerProbes, [EXTERNAL_ID]);
  assert.deepEqual(calls.remoteDeletes, [EXTERNAL_ID]);
  assert.equal(calls.localMarks.length, 1);
  assert.equal(calls.localMarks[0].videoId, VIDEO_ID);
  assert.ok(
    calls.localMarks[0].remoteDeletedAt instanceof Date
  );

  assert.equal(result.deleted, true);
  assert.equal(result.alreadyDeleted, false);
  assert.equal(result.remoteAlreadyMissing, false);
});

test("the remote delete happens before the local update", async () => {
  const order = [];

  const calls = createHarness({
    getVideoOwner: async () => {
      order.push("probe");
      return {
        videoId: EXTERNAL_ID,
        channelId: CHANNEL,
      };
    },
    deleteVideo: async () => {
      order.push("remote-delete");
    },
  });

  const originalMark =
    videoRepository.markVideoAsRemoteDeleted;
  mock.method(
    videoRepository,
    "markVideoAsRemoteDeleted",
    async (input) => {
      order.push("local-update");
      return originalMark(input);
    }
  );

  await youtubeService.deleteRemoteVideo(VIDEO_ID);

  assert.deepEqual(order, [
    "probe",
    "remote-delete",
    "local-update",
  ]);
  assert.equal(calls.localMarks.length, 1);
});

test("a video owned by another channel is refused without deleting or writing", async () => {
  const calls = createHarness({
    getVideoOwner: async () => ({
      videoId: EXTERNAL_ID,
      channelId: OTHER_CHANNEL,
    }),
    deleteVideo: async () => undefined,
  });

  await assert.rejects(
    youtubeService.deleteRemoteVideo(VIDEO_ID),
    (error) => {
      assert.equal(error.statusCode, 403);
      assert.equal(
        error.code,
        "YOUTUBE_CHANNEL_MISMATCH"
      );
      return true;
    }
  );

  assert.deepEqual(calls.ownerProbes, [EXTERNAL_ID]);
  assert.deepEqual(
    calls.remoteDeletes,
    [],
    "a foreign channel must never be deleted"
  );
  assert.deepEqual(calls.localMarks, []);
});

test("a missing remote resource skips the delete and completes the local marking", async () => {
  const calls = createHarness({
    getVideoOwner: async () => {
      throw new YouTubeApiError(
        "video-owner",
        404
      );
    },
    deleteVideo: async () => undefined,
  });

  const result =
    await youtubeService.deleteRemoteVideo(VIDEO_ID);

  assert.deepEqual(
    calls.remoteDeletes,
    [],
    "there is nothing left to delete remotely"
  );
  assert.equal(calls.localMarks.length, 1);
  assert.equal(result.deleted, true);
  assert.equal(result.alreadyDeleted, false);
  assert.equal(result.remoteAlreadyMissing, true);
});

test("a delete that reports the resource as gone is treated as idempotent", async () => {
  const calls = createHarness({
    getVideoOwner: async () => ({
      videoId: EXTERNAL_ID,
      channelId: CHANNEL,
    }),
    deleteVideo: async () => {
      throw new YouTubeApiError(
        "delete-video",
        404
      );
    },
  });

  const result =
    await youtubeService.deleteRemoteVideo(VIDEO_ID);

  assert.equal(calls.localMarks.length, 1);
  assert.equal(result.remoteAlreadyMissing, true);
  assert.equal(result.deleted, true);
});

test("provider failures never mark the local record as deleted", async () => {
  const scenarios = [
    {
      name: "forbidden",
      status: 403,
      code: "YOUTUBE_DELETE_NOT_PERMITTED",
      httpStatus: 409,
    },
    {
      name: "invalid grant",
      status: 401,
      code: "YOUTUBE_REAUTH_REQUIRED",
      httpStatus: 409,
    },
    {
      name: "quota",
      status: 429,
      code: "YOUTUBE_DELETE_RATE_LIMITED",
      httpStatus: 429,
    },
    {
      name: "server error",
      status: 503,
      code: "YOUTUBE_DELETE_FAILED",
      httpStatus: 502,
    },
  ];

  for (const scenario of scenarios) {
    mock.restoreAll();
    const calls = createHarness({
      getVideoOwner: async () => ({
        videoId: EXTERNAL_ID,
        channelId: CHANNEL,
      }),
      deleteVideo: async () => {
        throw new YouTubeApiError(
          "delete-video",
          scenario.status
        );
      },
    });

    await assert.rejects(
      youtubeService.deleteRemoteVideo(VIDEO_ID),
      (error) => {
        assert.equal(
          error.code,
          scenario.code,
          scenario.name
        );
        assert.equal(
          error.statusCode,
          scenario.httpStatus,
          scenario.name
        );
        return true;
      }
    );

    assert.deepEqual(
      calls.localMarks,
      [],
      `${scenario.name} must not mark the record`
    );
  }
});

test("a network failure never marks the local record as deleted", async () => {
  const calls = createHarness({
    getVideoOwner: async () => ({
      videoId: EXTERNAL_ID,
      channelId: CHANNEL,
    }),
    deleteVideo: async () => {
      throw new TypeError("fetch failed");
    },
  });

  await assert.rejects(
    youtubeService.deleteRemoteVideo(VIDEO_ID),
    (error) => {
      assert.equal(error.code, "YOUTUBE_DELETE_FAILED");
      assert.equal(error.statusCode, 502);
      return true;
    }
  );

  assert.deepEqual(calls.localMarks, []);
});

test("a failed ownership probe never marks the local record as deleted", async () => {
  for (const status of [401, 403, 429, 500]) {
    mock.restoreAll();
    const calls = createHarness({
      getVideoOwner: async () => {
        throw new YouTubeApiError(
          "video-owner",
          status
        );
      },
      deleteVideo: async () => undefined,
    });

    await assert.rejects(
      youtubeService.deleteRemoteVideo(VIDEO_ID),
      (error) => {
        assert.ok(
          [
            "YOUTUBE_REAUTH_REQUIRED",
            "YOUTUBE_DELETE_NOT_PERMITTED",
            "YOUTUBE_DELETE_RATE_LIMITED",
            "YOUTUBE_DELETE_FAILED",
          ].includes(error.code)
        );
        return true;
      }
    );

    assert.deepEqual(calls.remoteDeletes, []);
    assert.deepEqual(calls.localMarks, []);
  }
});

test("a missing YouTube connection is refused before any provider call", async () => {
  const calls = createHarness({
    connection: null,
    getVideoOwner: async () => ({
      videoId: EXTERNAL_ID,
      channelId: CHANNEL,
    }),
    deleteVideo: async () => undefined,
  });

  await assert.rejects(
    youtubeService.deleteRemoteVideo(VIDEO_ID),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(
        error.code,
        "YOUTUBE_NOT_CONNECTED"
      );
      return true;
    }
  );

  assert.deepEqual(calls.ownerProbes, []);
  assert.deepEqual(calls.remoteDeletes, []);
  assert.deepEqual(calls.localMarks, []);
});

test("a local failure after a successful remote delete reports its own condition", async () => {
  const calls = createHarness({
    getVideoOwner: async () => ({
      videoId: EXTERNAL_ID,
      channelId: CHANNEL,
    }),
    deleteVideo: async () => undefined,
  });

  mock.method(
    videoRepository,
    "markVideoAsRemoteDeleted",
    async () => {
      throw new Error("MySQL is gone");
    }
  );

  await assert.rejects(
    youtubeService.deleteRemoteVideo(VIDEO_ID),
    (error) => {
      assert.equal(error.statusCode, 500);
      assert.equal(
        error.code,
        "YOUTUBE_VIDEO_DELETED_LOCAL_UPDATE_FAILED"
      );
      return true;
    }
  );

  // The remote delete already happened, so the flow must not claim it
  // failed and must not repeat it.
  assert.deepEqual(calls.remoteDeletes, [EXTERNAL_ID]);
  assert.ok(
    calls.logs.some((line) =>
      line.includes("event=local-update-failed")
    )
  );
  assert.equal(
    calls.logs.some((line) =>
      line.includes("event=remote-success")
    ),
    true
  );
});

test("a second attempt after a local failure finds the resource missing and finishes the job", async () => {
  const calls = createHarness({
    getVideoOwner: async () => {
      throw new YouTubeApiError(
        "video-owner",
        404
      );
    },
    deleteVideo: async () => undefined,
  });

  const result =
    await youtubeService.deleteRemoteVideo(VIDEO_ID);

  assert.equal(result.deleted, true);
  assert.equal(result.remoteAlreadyMissing, true);
  assert.deepEqual(
    calls.remoteDeletes,
    [],
    "the retry must not call videos.delete again"
  );
  assert.equal(calls.localMarks.length, 1);
});

test("the operational log records the lifecycle without any sensitive value", async () => {
  const calls = createHarness({
    getVideoOwner: async () => ({
      videoId: EXTERNAL_ID,
      channelId: CHANNEL,
    }),
    deleteVideo: async () => undefined,
  });

  await youtubeService.deleteRemoteVideo(VIDEO_ID);

  const output = calls.logs.join("\n");
  assert.ok(calls.logs.length >= 3);

  for (const forbidden of [
    EXTERNAL_ID,
    "https://",
    "a title that must never be logged",
    "access-token",
    CHANNEL,
    "encrypted",
  ]) {
    assert.equal(
      output.includes(forbidden),
      false,
      `the log must not contain ${forbidden}`
    );
  }

  assert.match(output, /event=attempt/);
  assert.match(output, /event=remote-success/);
  assert.match(output, /event=local-success/);
  assert.match(output, new RegExp(`videoId=${VIDEO_ID}`));
});

test("channel comparison is trimmed and never falls back to the title", () => {
  assert.equal(
    youtubeService.channelIdsMatch(
      ` ${CHANNEL} `,
      CHANNEL
    ),
    true
  );
  assert.equal(
    youtubeService.channelIdsMatch(CHANNEL, OTHER_CHANNEL),
    false
  );
  assert.equal(
    youtubeService.channelIdsMatch(null, CHANNEL),
    false
  );
  assert.equal(
    youtubeService.channelIdsMatch("", ""),
    false
  );
});