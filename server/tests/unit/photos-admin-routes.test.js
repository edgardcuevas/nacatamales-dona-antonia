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
  DB_NAME: "photos_admin_routes_test",
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

for (const [name, value] of Object.entries(TEST_ENVIRONMENT)) {
  if (
    typeof process.env[name] !== "string" ||
    process.env[name].trim() === ""
  ) {
    process.env[name] = value;
  }
}

const userService = require("../../src/modules/users/user.service");
const photosService = require("../../src/modules/photos/photos.service");
const {
  generateAccessToken,
} = require("../../src/modules/auth/token.service");
const app = require("../../src/app");
const pool = require("../../src/database/pool");

const state = {
  currentUser: {
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    isActive: true,
  },
  photo: {
    id: 1,
    caption: "Photo caption",
    image: {
      url: "https://cdn.example/photo.jpg",
      altText: null,
      width: 1200,
      height: 900,
    },
    createdAt: "2026-09-27T10:00:00.000Z",
    isActive: true,
    sortOrder: 0,
    updatedAt: "2026-09-27T11:00:00.000Z",
  },
  listResult: {
    photos: [],
    pagination: {
      page: 1,
      limit: 20,
      totalItems: 0,
      totalPages: 0,
    },
  },
  calls: {},
};

mock.method(userService, "getAuthenticatedUser", async () => state.currentUser);
mock.method(photosService, "listAdministrativePhotos", async (filters) => {
  state.calls.list = filters;
  return state.listResult;
});
mock.method(photosService, "getPhotoById", async (photoId) => {
  state.calls.get = photoId;
  return state.photo;
});
mock.method(photosService, "createPhoto", async (input) => {
  state.calls.create = input;
  return state.photo;
});
mock.method(photosService, "updatePhoto", async (input) => {
  state.calls.update = input;
  return state.photo;
});
mock.method(photosService, "deletePhoto", async (photoId) => {
  state.calls.delete = photoId;
  return { photoId, deleted: true };
});

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

async function request(path, { method = "GET", body, accessToken } = {}) {
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
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

test("photo admin routes require authentication and allow ADMIN and EDITOR", async () => {
  const unauthenticated = await request("/api/admin/photos");
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.body.error.code, "AUTHENTICATION_REQUIRED");

  const admin = await request("/api/admin/photos", {
    accessToken: token("ADMIN"),
  });
  state.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };
  const editor = await request("/api/admin/photos", {
    accessToken: token("EDITOR"),
  });
  assert.equal(admin.status, 200);
  assert.equal(editor.status, 200);
});

test("photo admin routes validate and forward list, create, read, update, and delete", async () => {
  const list = await request("/api/admin/photos?page=2&limit=5", {
    accessToken: token(),
  });
  const created = await request("/api/admin/photos", {
    method: "POST",
    accessToken: token(),
    body: { caption: "Photo caption", imageMediaId: 8, sortOrder: 2 },
  });
  const found = await request("/api/admin/photos/1", {
    accessToken: token(),
  });
  const updated = await request("/api/admin/photos/1", {
    method: "PATCH",
    accessToken: token(),
    body: { caption: null, isActive: false },
  });
  const deleted = await request("/api/admin/photos/1", {
    method: "DELETE",
    accessToken: token(),
  });

  assert.equal(list.status, 200);
  assert.equal(state.calls.list.page, 2);
  assert.equal(created.status, 201);
  assert.deepEqual(state.calls.create, {
    caption: "Photo caption",
    imageMediaId: 8,
    sortOrder: 2,
  });
  assert.equal(found.status, 200);
  assert.equal(state.calls.get, 1);
  assert.equal(updated.status, 200);
  assert.deepEqual(state.calls.update, {
    photoId: 1,
    updates: { caption: null, isActive: false },
  });
  assert.equal(deleted.status, 200);
  assert.equal(state.calls.delete, 1);
  assert.equal(deleted.body.data.deleted, true);
});

test("photo admin routes reject missing image IDs and unknown input", async () => {
  const missingImage = await request("/api/admin/photos", {
    method: "POST",
    accessToken: token(),
    body: { caption: "No image" },
  });
  const unknown = await request("/api/admin/photos/1", {
    method: "PATCH",
    accessToken: token(),
    body: { imageMediaId: 8, mystery: true },
  });

  assert.equal(missingImage.status, 400);
  assert.equal(missingImage.body.error.code, "INVALID_PHOTO_INPUT");
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.error.code, "UNEXPECTED_PHOTO_FIELDS");
});

test("inactive users cannot manage photos", async () => {
  state.currentUser = null;
  const result = await request("/api/admin/photos", {
    accessToken: token(),
  });

  assert.equal(result.status, 401);
  assert.equal(result.body.error.code, "AUTHENTICATED_USER_UNAVAILABLE");
});