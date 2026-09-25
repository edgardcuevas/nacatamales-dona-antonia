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
  DB_NAME: "media_admin_routes_test",
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

const userService = require(
  "../../src/modules/users/user.service"
);
const mediaService = require(
  "../../src/modules/media/media.service"
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
  media: {
    id: 2,
    provider: "IMAGEKIT",
    publicId: "qa/placeholder",
    secureUrl:
      "https://res.cloudinary.com/demo/image/upload/qa.jpg",
    resourceType: "IMAGE",
    format: "jpg",
    bytes: 1234,
    width: 100,
    height: 80,
    altText: "QA",
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  listResult: {
    media: [],
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
  mediaService,
  "listMedia",
  async (filters) => {
    state.calls.list = filters;
    if (state.errors.list) {
      throw state.errors.list;
    }
    return state.listResult;
  }
);
mock.method(
  mediaService,
  "getMediaById",
  async (mediaId) => {
    state.calls.get = { mediaId };
    if (state.errors.get) {
      throw state.errors.get;
    }
    return state.media;
  }
);
mock.method(
  mediaService,
  "createUploadAuth",
  async (input) => {
    state.calls.uploadAuth = input;
    if (state.errors.uploadAuth) {
      throw state.errors.uploadAuth;
    }
    return {
      uploadUrl: "https://upload.imagekit.io/api/v1/files/upload",
      publicKey: "test_public_key",
      urlEndpoint: "https://ik.imagekit.io/test-imagekit-id",
      folder: `test-folder/${input.target}`,
      token: "test-token",
      expire: 2000000000,
      signature: "test-signature",
      useUniqueFileName: true,
    };
  }
);
mock.method(
  mediaService,
  "confirmMedia",
  async (input) => {
    state.calls.confirm = input;
    if (state.errors.confirm) {
      throw state.errors.confirm;
    }
    return state.media;
  }
);
mock.method(
  mediaService,
  "deleteMedia",
  async (input) => {
    state.calls.delete = input;
    if (state.errors.delete) {
      throw state.errors.delete;
    }
    return { mediaId: input.mediaId, deleted: true };
  }
);
mock.method(
  mediaService,
  "updateMediaAltText",
  async (input) => {
    state.calls.update = input;
    if (state.errors.update) {
      throw state.errors.update;
    }
    return state.media;
  }
);
mock.method(
  mediaService,
  "changeMediaStatus",
  async (input) => {
    state.calls.status = input;
    if (state.errors.status) {
      throw state.errors.status;
    }
    return state.media;
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

test("media admin routes require authentication", async () => {
  const result = await request("/api/admin/media");
  assert.equal(result.status, 401);
  assert.equal(
    result.body.error.code,
    "AUTHENTICATION_REQUIRED"
  );
});

test("media admin routes allow ADMIN and EDITOR", async () => {
  const adminResult = await request(
    "/api/admin/media",
    { accessToken: token("ADMIN") }
  );
  state.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };
  const editorResult = await request(
    "/api/admin/media",
    { accessToken: token("EDITOR") }
  );

  assert.equal(adminResult.status, 200);
  assert.equal(editorResult.status, 200);
});

test("media admin list supports filters and safe response", async () => {
  state.listResult = {
    media: [state.media],
    pagination: {
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    },
  };

  const result = await request(
    "/api/admin/media?resourceType=IMAGE&isActive=true&sortBy=publicId&sortOrder=asc",
    { accessToken: token() }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.data.media[0].resourceType, "IMAGE");
  assert.equal(
    Object.hasOwn(
      result.body.data.media[0],
      "secure_url"
    ),
    false
  );
  assert.equal(state.calls.list.resourceType, "IMAGE");
});

test("media admin permits alt text and status changes only", async () => {
  const updated = await request(
    "/api/admin/media/2",
    {
      method: "PATCH",
      accessToken: token(),
      body: { altText: "Updated" },
    }
  );
  const status = await request(
    "/api/admin/media/2/status",
    {
      method: "PATCH",
      accessToken: token(),
      body: { isActive: false },
    }
  );
  const forbidden = await request(
    "/api/admin/media/2",
    {
      method: "PATCH",
      accessToken: token(),
      body: { publicId: "client-controlled" },
    }
  );

  assert.equal(updated.status, 200);
  assert.equal(status.status, 200);
  assert.equal(forbidden.status, 400);
  assert.equal(
    forbidden.body.error.code,
    "UNEXPECTED_MEDIA_FIELDS"
  );
  assert.equal(state.calls.update.altText, "Updated");
  assert.equal(state.calls.status.isActive, false);
});

test("media admin upload authorization and confirmation use protected routes", async () => {
  const upload = await request(
    "/api/admin/media/upload-auth",
    {
      method: "POST",
      accessToken: token(),
      body: { target: "products" },
    }
  );
  const confirm = await request(
    "/api/admin/media/confirm",
    {
      method: "POST",
      accessToken: token(),
      body: {
        fileId: "file_test_123",
        altText: null,
      },
    }
  );

  assert.equal(upload.status, 200);
  assert.equal(upload.body.data.upload.folder, "test-folder/products");
  assert.equal(
    Object.hasOwn(upload.body.data.upload, "privateKey"),
    false
  );
  assert.equal(confirm.status, 201);
  assert.equal(state.calls.uploadAuth.target, "products");
  assert.equal(state.calls.confirm.fileId, "file_test_123");
});

test("media admin does not expose generic POST and rejects inactive users", async () => {
  const post = await request(
    "/api/admin/media",
    {
      method: "POST",
      accessToken: token(),
      body: {},
    }
  );
  const remove = await request(
    "/api/admin/media/2",
    {
      method: "DELETE",
      accessToken: token(),
    }
  );
  state.currentUser = null;
  const inactive = await request(
    "/api/admin/media/2",
    { accessToken: token() }
  );

  assert.equal(post.status, 404);
  assert.equal(remove.status, 200);
  assert.equal(state.calls.delete.mediaId, 2);
  assert.equal(inactive.status, 401);
  assert.equal(
    inactive.body.error.code,
    "AUTHENTICATED_USER_UNAVAILABLE"
  );
});
