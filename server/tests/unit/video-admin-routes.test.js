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
  DB_NAME: "video_admin_routes_test",
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
  IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/test-imagekit-id",
  IMAGEKIT_FOLDER: "test-folder",
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
  video: {
    id: 3,
    title: "QA video",
    description: null,
    url: "https://youtu.be/aaaaaaaaaaa",
    provider: "YOUTUBE",
    externalId: "aaaaaaaaaaa",
    thumbnailUrl: null,
    sortOrder: 0,
    isActive: false,
    createdAt: null,
    updatedAt: null,
  },
  listResult: {
    videos: [],
    pagination: {
      page: 1,
      limit: 20,
      totalItems: 0,
      totalPages: 0,
    },
  },
  calls: {},
  errors: {},
};

mock.method(
  userService,
  "getAuthenticatedUser",
  async () => state.currentUser
);
mock.method(
  videoService,
  "listAdministrativeVideos",
  async (filters) => {
    state.calls.list = filters;
    if (state.errors.list) {
      throw state.errors.list;
    }
    return state.listResult;
  }
);
mock.method(
  videoService,
  "getVideoById",
  async (videoId) => {
    state.calls.get = { videoId };
    if (state.errors.get) {
      throw state.errors.get;
    }
    return state.video;
  }
);
mock.method(
  videoService,
  "createVideo",
  async (input) => {
    state.calls.create = input;
    if (state.errors.create) {
      throw state.errors.create;
    }
    return state.video;
  }
);
mock.method(
  videoService,
  "updateVideo",
  async (input) => {
    state.calls.update = input;
    if (state.errors.update) {
      throw state.errors.update;
    }
    return state.video;
  }
);
mock.method(
  videoService,
  "changeVideoStatus",
  async (input) => {
    state.calls.status = input;
    if (state.errors.status) {
      throw state.errors.status;
    }
    return state.video;
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
    accessToken,
  } = {}
) {
  const headers = {};
  if (accessToken !== undefined) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

test("video admin routes require authentication", async () => {
  const result = await request("/api/admin/videos");
  assert.equal(result.status, 401);
  assert.equal(
    result.body.error.code,
    "AUTHENTICATION_REQUIRED"
  );
});

test("video admin routes allow ADMIN and EDITOR", async () => {
  const adminResult = await request(
    "/api/admin/videos",
    { accessToken: token("ADMIN") }
  );
  state.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };
  const editorResult = await request(
    "/api/admin/videos",
    { accessToken: token("EDITOR") }
  );

  assert.equal(adminResult.status, 200);
  assert.equal(editorResult.status, 200);
});

test("video admin creation accepts valid YouTube data and rejects malicious hosts", async () => {
  const created = await request(
    "/api/admin/videos",
    {
      method: "POST",
      accessToken: token(),
      body: {
        title: "QA video",
        description: null,
        url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
        provider: "YOUTUBE",
        externalId: "aaaaaaaaaaa",
        thumbnailUrl: null,
        sortOrder: 0,
      },
    }
  );
  const malicious = await request(
    "/api/admin/videos",
    {
      method: "POST",
      accessToken: token(),
      body: {
        title: "Malicious",
        url: "https://youtube.com.evil.example/watch?v=aaaaaaaaaaa",
        provider: "YOUTUBE",
        externalId: "aaaaaaaaaaa",
      },
    }
  );

  assert.equal(created.status, 201);
  assert.equal(malicious.status, 400);
  assert.equal(
    malicious.body.error.code,
    "INVALID_VIDEO_URL"
  );
});

test("video admin duplicate error is neutral and edit/status routes are available", async () => {
  state.errors.create = new AppError(
    409,
    "VIDEO_ALREADY_EXISTS",
    "A video with this provider and external ID already exists"
  );
  const duplicate = await request(
    "/api/admin/videos",
    {
      method: "POST",
      accessToken: token(),
      body: {
        title: "QA",
        url: "https://youtu.be/aaaaaaaaaaa",
        provider: "YOUTUBE",
        externalId: "aaaaaaaaaaa",
      },
    }
  );
  state.errors.create = null;

  const updated = await request(
    "/api/admin/videos/3",
    {
      method: "PATCH",
      accessToken: token(),
      body: { title: "Updated" },
    }
  );
  const status = await request(
    "/api/admin/videos/3/status",
    {
      method: "PATCH",
      accessToken: token(),
      body: { isActive: true },
    }
  );

  assert.equal(duplicate.status, 409);
  assert.equal(
    duplicate.body.error.code,
    "VIDEO_ALREADY_EXISTS"
  );
  assert.equal(updated.status, 200);
  assert.equal(status.status, 200);
  assert.equal(state.calls.update.videoId, 3);
  assert.equal(state.calls.status.isActive, true);
});

test("video admin rejects unknown fields and inactive users", async () => {
  const unknown = await request(
    "/api/admin/videos",
    {
      method: "POST",
      accessToken: token(),
      body: {
        title: "QA",
        url: "https://youtu.be/aaaaaaaaaaa",
        provider: "YOUTUBE",
        externalId: "aaaaaaaaaaa",
        isActive: true,
      },
    }
  );
  state.currentUser = null;
  const inactive = await request(
    "/api/admin/videos",
    { accessToken: token() }
  );

  assert.equal(unknown.status, 400);
  assert.equal(
    unknown.body.error.code,
    "UNEXPECTED_VIDEO_FIELDS"
  );
  assert.equal(inactive.status, 401);
  assert.equal(
    inactive.body.error.code,
    "AUTHENTICATED_USER_UNAVAILABLE"
  );
});
