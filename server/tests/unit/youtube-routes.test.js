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
  DB_NAME: "youtube_routes_test",
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

const userService = require(
  "../../src/modules/users/user.service"
);
const youtubeService = require(
  "../../src/modules/youtube/youtube.service"
);
const {
  resetYoutubeRateLimiters,
} = require(
  "../../src/middlewares/youtube-rate-limit.middleware"
);
const {
  generateAccessToken,
} = require("../../src/modules/auth/token.service");

const state = {
  currentUser: {
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    isActive: true,
  },
  calls: {},
  errors: {},
  authorization: {
    state: "a".repeat(64),
    authorizationUrl:
      "https://accounts.google.com/o/oauth2/v2/auth?state=test",
    expiresInSeconds: 600,
  },
  connection: {
    connected: true,
    channelId: "UC1234567890123456789012",
    channelTitle: "Official channel",
    connectedAt: null,
    updatedAt: null,
  },
  video: {
    id: 7,
    title: "QA upload",
    description: null,
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
  },
  status: {
    video: null,
    uploadStatus: "READY",
    privacyStatus: "UNLISTED",
  },
};

mock.method(
  userService,
  "getAuthenticatedUser",
  async () =>
    state.currentUser?.isActive === false
      ? null
      : state.currentUser
);
mock.method(
  youtubeService,
  "createAuthorizationRequest",
  async () => {
    if (state.errors.authorization) {
      throw state.errors.authorization;
    }
    return state.authorization;
  }
);
mock.method(
  youtubeService,
  "completeAuthorization",
  async (input) => {
    state.calls.callback = input;
    if (state.errors.callback) {
      throw state.errors.callback;
    }
    return state.connection;
  }
);
mock.method(
  youtubeService,
  "getConnectionStatus",
  async () => {
    if (state.errors.status) {
      throw state.errors.status;
    }
    return state.connection;
  }
);
mock.method(
  youtubeService,
  "uploadVideo",
  async (input) => {
    state.calls.upload = input;
    if (state.errors.upload) {
      throw state.errors.upload;
    }
    return state.video;
  }
);
mock.method(
  youtubeService,
  "getVideoStatus",
  async (videoId) => {
    state.calls.videoStatus = videoId;
    if (state.errors.videoStatus) {
      throw state.errors.videoStatus;
    }
    return {
      ...state.status,
      video: state.video,
    };
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
  resetYoutubeRateLimiters();
  state.calls = {};
  state.errors = {};
  state.currentUser = {
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    isActive: true,
  };
});

function token(role = "ADMIN") {
  return generateAccessToken({
    id: role === "ADMIN" ? 1 : 2,
    role,
  });
}

async function request(
  path,
  {
    method = "GET",
    body,
    headers = {},
    accessToken,
  } = {}
) {
  const requestHeaders = {
    ...headers,
  };
  if (accessToken !== undefined) {
    requestHeaders.authorization =
      `Bearer ${accessToken}`;
  }

  const response = await fetch(
    `${baseUrl}${path}`,
    {
      method,
      headers: requestHeaders,
      body,
    }
  );

  return {
    status: response.status,
    headers: response.headers,
    body: await response.json(),
  };
}

function getCookieValue(
  response,
  name
) {
  const cookie =
    response.headers.get("set-cookie") ?? "";
  const match = cookie.match(
    new RegExp(
      `(?:^|,\\s*)${name}=([^;]+)`
    )
  );
  return match?.[1] ?? null;
}

test("YouTube OAuth routes require authentication and ADMIN for connect/status", async () => {
  const unauthenticated =
    await request("/api/admin/youtube/connect");
  state.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };
  const editor =
    await request(
      "/api/admin/youtube/connect",
      {
        accessToken: token("EDITOR"),
      }
    );

  assert.equal(unauthenticated.status, 401);
  assert.equal(editor.status, 403);
  assert.equal(
    editor.body.error.code,
    "FORBIDDEN"
  );
});

test("connect returns only an authorization URL and sets an HttpOnly state cookie", async () => {
  const result = await request(
    "/api/admin/youtube/connect",
    {
      accessToken: token(),
    }
  );

  assert.equal(result.status, 200);
  assert.equal(
    result.body.data.authorizationUrl,
    state.authorization.authorizationUrl
  );
  assert.equal(
    Object.hasOwn(result.body.data, "refreshToken"),
    false
  );
  assert.match(
    result.headers.get("set-cookie") ?? "",
    /youtube_oauth_state=.*HttpOnly/i
  );
  assert.match(
    result.headers.get("set-cookie") ?? "",
    /Path=\/api\/youtube\/oauth/i
  );
});

test("callback validates the state cookie without requiring a bearer token", async () => {
  const connect = await request(
    "/api/admin/youtube/connect",
    {
      accessToken: token(),
    }
  );
  const stateCookie =
    getCookieValue(
      connect,
      "youtube_oauth_state"
    );
  const result = await request(
    `/api/youtube/oauth/callback?code=oauth-code&state=${state.authorization.state}&iss=${encodeURIComponent("https://accounts.google.com")}`,
    {
      headers: {
        cookie: `youtube_oauth_state=${stateCookie}`,
      },
    }
  );

  assert.equal(result.status, 200);
  assert.equal(
    state.calls.callback.state,
    state.authorization.state
  );
  assert.equal(
    state.calls.callback.stateCookie,
    stateCookie
  );
  assert.equal(
    Object.hasOwn(
      result.body.data.connection,
      "refreshToken"
    ),
    false
  );
});

test("status route is ADMIN-only and returns a safe connection DTO", async () => {
  const result = await request(
    "/api/admin/youtube/status",
    {
      accessToken: token(),
    }
  );

  assert.equal(result.status, 200);
  assert.equal(
    result.body.data.connection.connected,
    true
  );
  assert.equal(
    Object.hasOwn(
      result.body.data.connection,
      "encrypted_refresh_token"
    ),
    false
  );
});

test("upload route accepts a streamed MP4 contract for ADMIN and EDITOR and forwards the request stream", async () => {
  for (const role of ["ADMIN", "EDITOR"]) {
    state.currentUser = {
      id: role === "ADMIN" ? 1 : 2,
      email: `${role.toLowerCase()}@example.com`,
      role,
      isActive: true,
    };
    const result = await request(
      "/api/admin/videos/upload",
      {
        method: "POST",
        accessToken: token(role),
        headers: {
          "content-type": "video/mp4",
          "content-length": "10",
          "x-video-title": "QA upload",
          "x-video-description": "Description",
        },
        body: Buffer.from("fake-video"),
      }
    );

    assert.equal(result.status, 201);
    assert.equal(result.body.data.video.id, 7);
  }

  assert.equal(
    state.calls.upload.title,
    "QA upload"
  );
  assert.equal(
    state.calls.upload.fileSize,
    10
  );
  assert.equal(
    typeof state.calls.upload.fileStream.pipe,
    "function"
  );
});

test("upload route rejects missing metadata, unknown file types, and oversized requests", async () => {
  const cases = [
    {
      headers: {
        "content-type": "video/mp4",
        "content-length": "10",
      },
    },
    {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": "10",
        "x-video-title": "QA",
      },
    },
  ];

  for (const options of cases) {
    const result = await request(
      "/api/admin/videos/upload",
      {
        method: "POST",
        accessToken: token(),
        headers: options.headers,
        body: Buffer.from("fake-video"),
      }
    );
    assert.equal(result.status, 400);
  }
});

test("video status route returns processing state and remains protected for inactive users", async () => {
  const result = await request(
    "/api/admin/videos/7/status",
    {
      accessToken: token(),
    }
  );
  assert.equal(result.status, 200);
  assert.equal(
    result.body.data.uploadStatus,
    "READY"
  );
  assert.equal(state.calls.videoStatus, 7);

  state.currentUser = {
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    isActive: false,
  };
  const inactive = await request(
    "/api/admin/videos/7/status",
    {
      accessToken: token(),
    }
  );
  assert.equal(inactive.status, 401);
});
