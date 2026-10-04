// HTTP level tests for DELETE /api/admin/videos/:videoId. The service is
// replaced, so no route case can reach YouTube or MySQL.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  after,
  afterEach,
  before,
  mock,
} = require("node:test");

const TEST_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "video_remote_delete_routes_test",
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
const userService = require(
  "../../src/modules/users/user.service"
);
const videoService = require(
  "../../src/modules/videos/video.service"
);
const youtubeService = require(
  "../../src/modules/youtube/youtube.service"
);
const {
  generateAccessToken,
} = require("../../src/modules/auth/token.service");
const {
  resetYoutubeRateLimiters,
  limits,
} = require(
  "../../src/middlewares/youtube-rate-limit.middleware"
);

const state = {
  currentUser: {
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    isActive: true,
  },
  video: {
    id: 3,
    title: "QA video",
    description: null,
    url: "https://youtu.be/aaaaaaaaaaa",
    provider: "YOUTUBE",
    externalId: "aaaaaaaaaaa",
    thumbnailUrl: null,
    thumbnailSource: "YOUTUBE_DEFAULT",
    sortOrder: 0,
    isActive: false,
    uploadStatus: "DELETED",
    privacyStatus: "UNLISTED",
    remoteDeletedAt: "2026-10-04T05:17:51.306Z",
    createdAt: null,
    updatedAt: null,
  },
  calls: [],
  error: null,
  result: null,
};

// The real implementation reads the user again and only returns an
// active one, so the mock must do the same for the inactive case to
// mean anything.
mock.method(
  userService,
  "getAuthenticatedUser",
  async () =>
    state.currentUser.isActive
      ? state.currentUser
      : null
);

mock.method(
  videoService,
  "listAdministrativeVideos",
  async () => ({
    videos: [],
    pagination: {
      page: 1,
      limit: 20,
      totalItems: 0,
      totalPages: 0,
    },
  })
);

mock.method(
  youtubeService,
  "deleteRemoteVideo",
  async (videoId) => {
    state.calls.push(videoId);
    if (state.error) {
      throw state.error;
    }

    return (
      state.result ?? {
        video: state.video,
        deleted: true,
        alreadyDeleted: false,
        remoteAlreadyMissing: false,
      }
    );
  }
);

const app = require("../../src/app");
const pool = require("../../src/database/pool");

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

afterEach(() => {
  state.calls = [];
  state.error = null;
  state.result = null;
  state.currentUser = {
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    isActive: true,
  };
  resetYoutubeRateLimiters();
});

function token(role = "ADMIN") {
  return generateAccessToken({
    id: role === "ADMIN" ? 1 : 2,
    role,
  });
}

async function deleteRequest(
  path,
  { accessToken } = {}
) {
  const headers = {};
  if (accessToken !== undefined) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers,
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

test("the remote deletion route requires authentication", async () => {
  const result = await deleteRequest(
    "/api/admin/videos/3"
  );

  assert.equal(result.status, 401);
  assert.equal(
    result.body.error.code,
    "AUTHENTICATION_REQUIRED"
  );
  assert.deepEqual(state.calls, []);
});

test("the remote deletion route is ADMIN only", async () => {
  state.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };

  const result = await deleteRequest(
    "/api/admin/videos/3",
    { accessToken: token("EDITOR") }
  );

  assert.equal(result.status, 403);
  assert.equal(
    result.body.error.code,
    "FORBIDDEN"
  );
  assert.deepEqual(
    state.calls,
    [],
    "EDITOR must never reach the service"
  );
});

test("EDITOR keeps every other permission on the module", async () => {
  state.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };

  // The delete route is narrower than the rest of the module, but the
  // rest of the module must not have been narrowed with it.
  const listed = await fetch(
    `${baseUrl}/api/admin/videos`,
    {
      headers: {
        authorization: `Bearer ${token("EDITOR")}`,
      },
    }
  );

  assert.equal(listed.status, 200);
});

test("the remote deletion route refuses an inactive user", async () => {
  state.currentUser = {
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    isActive: false,
  };

  const result = await deleteRequest(
    "/api/admin/videos/3",
    { accessToken: token() }
  );

  assert.equal(result.status, 401);
  assert.deepEqual(state.calls, []);
});

test("an ADMIN receives the normalized local video and the idempotency flags", async () => {
  const result = await deleteRequest(
    "/api/admin/videos/3",
    { accessToken: token() }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(state.calls, [3]);
  assert.equal(result.body.data.deleted, true);
  assert.equal(
    result.body.data.alreadyDeleted,
    false
  );
  assert.equal(
    result.body.data.remoteAlreadyMissing,
    false
  );
  assert.equal(
    result.body.data.video.uploadStatus,
    "DELETED"
  );
  assert.equal(
    result.body.data.video.remoteDeletedAt,
    "2026-10-04T05:17:51.306Z"
  );
});

test("an already deleted record answers with the idempotent message and flags", async () => {
  state.result = {
    video: state.video,
    deleted: true,
    alreadyDeleted: true,
    remoteAlreadyMissing: true,
  };

  const result = await deleteRequest(
    "/api/admin/videos/3",
    { accessToken: token() }
  );

  assert.equal(result.status, 200);
  assert.match(
    result.body.message,
    /already marked as deleted/
  );
  assert.equal(
    result.body.data.alreadyDeleted,
    true
  );
  assert.equal(
    result.body.data.remoteAlreadyMissing,
    true
  );
});

test("the route passes the local id, never the external id", async () => {
  const result = await deleteRequest(
    "/api/admin/videos/42",
    { accessToken: token() }
  );

  assert.equal(result.status, 200);
  assert.deepEqual(state.calls, [42]);
});

test("a malformed local id is rejected before the service is called", async () => {
  for (const value of [
    "abc",
    "0",
    "-1",
    "1.5",
    "1a",
  ]) {
    const result = await deleteRequest(
      `/api/admin/videos/${value}`,
      { accessToken: token() }
    );

    assert.equal(result.status, 400);
    assert.equal(
      result.body.error.code,
      "INVALID_VIDEO_ID"
    );
  }

  assert.deepEqual(state.calls, []);
});

test("an ADMIN cannot smuggle a non numeric id past the validator", async () => {
  const response = await fetch(
    `${baseUrl}/api/admin/videos/3%20`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token()}`,
      },
    }
  );

  assert.equal(response.status, 400);
  assert.deepEqual(state.calls, []);
});

test("service errors reach the client as stable neutral codes", async () => {
  const scenarios = [
    {
      statusCode: 404,
      code: "VIDEO_NOT_FOUND",
      http: 404,
    },
    {
      statusCode: 400,
      code: "VIDEO_PROVIDER_NOT_YOUTUBE",
      http: 400,
    },
    {
      statusCode: 409,
      code: "VIDEO_LOCAL_STATE_INCONSISTENT",
      http: 409,
    },
    {
      statusCode: 409,
      code: "YOUTUBE_NOT_CONNECTED",
      http: 409,
    },
    {
      statusCode: 403,
      code: "YOUTUBE_CHANNEL_MISMATCH",
      http: 403,
    },
    {
      statusCode: 409,
      code: "YOUTUBE_DELETE_NOT_PERMITTED",
      http: 409,
    },
    {
      statusCode: 429,
      code: "YOUTUBE_DELETE_RATE_LIMITED",
      http: 429,
    },
    {
      statusCode: 502,
      code: "YOUTUBE_DELETE_FAILED",
      http: 502,
    },
    {
      statusCode: 500,
      code: "YOUTUBE_VIDEO_DELETED_LOCAL_UPDATE_FAILED",
      http: 500,
    },
  ];

  for (const scenario of scenarios) {
    state.error = new AppError(
      scenario.statusCode,
      scenario.code,
      "neutral message"
    );

    const result = await deleteRequest(
      "/api/admin/videos/3",
      { accessToken: token() }
    );

    assert.equal(result.status, scenario.http);
    assert.equal(
      result.body.error.code,
      scenario.code
    );
    state.error = null;
  }
});

test("the deletion route is rate limited with its own budget", async () => {
  const maxRequests = limits.delete.maxRequests;
  let limited = null;

  for (
    let attempt = 1;
    attempt <= maxRequests + 1;
    attempt += 1
  ) {
    const result = await deleteRequest(
      "/api/admin/videos/3",
      { accessToken: token() }
    );

    if (result.status === 429) {
      limited = { attempt, body: result.body };
      break;
    }

    assert.equal(
      result.status,
      200,
      `attempt ${attempt} must succeed`
    );
  }

  assert.ok(limited, "the limiter must trigger");
  assert.equal(limited.attempt, maxRequests + 1);
  assert.match(
    limited.body.error.code,
    /RATE_LIMIT/
  );

  // The irreversible route gets its own dedicated store with its own
  // ceiling, so a deletion burst can never consume the upload budget or
  // the thumbnail budget.
  assert.equal(limits.delete.windowMs, 900_000);
  assert.ok(
    Number.isSafeInteger(limits.delete.maxRequests) &&
      limits.delete.maxRequests > 0
  );
  assert.notEqual(
    limits.delete.maxRequests,
    limits.upload.maxRequests
  );
  assert.notEqual(
    limits.delete.maxRequests,
    limits.thumbnail.maxRequests
  );
});

test("the deletion response never carries a token, external id or channel id", async () => {
  state.result = {
    video: {
      ...state.video,
      externalId: "aaaaaaaaaaa",
    },
    deleted: true,
    alreadyDeleted: false,
    remoteAlreadyMissing: false,
    channelId: "UC1234567890123456789012",
    accessToken: "a-token",
  };

  const result = await deleteRequest(
    "/api/admin/videos/3",
    { accessToken: token() }
  );

  const serialized = JSON.stringify(result.body);

  assert.equal(result.status, 200);
  assert.equal(result.body.data.channelId, undefined);
  assert.equal(result.body.data.accessToken, undefined);
  assert.equal(
    serialized.includes("a-token"),
    false
  );
  assert.equal(
    serialized.includes(
      "UC1234567890123456789012"
    ),
    false
  );
});