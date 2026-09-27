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
  DB_NAME: "photos_public_test",
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

const photosRepository = require(
  "../../src/modules/photos/photos.repository"
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
  mock.restoreAll();
});

function createPhoto(overrides = {}) {
  return {
    id: 1,
    caption: "Así preparamos el recado hoy",
    created_at: new Date("2026-09-27T10:00:00.000Z"),
    image_id: 8,
    image_url: "https://cdn.example/photo.jpg",
    image_alt_text: null,
    image_width: 1200,
    image_height: 900,
    ...overrides,
  };
}

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return {
    status: response.status,
    body: await response.json(),
  };
}

test("public photo repository joins active images and orders by creation date", async () => {
  let capturedSql = "";
  mock.method(pool, "execute", async (sql) => {
    capturedSql = sql;
    return [[createPhoto()], []];
  });

  const result = await photosRepository.listPublicPhotos();

  assert.equal(result.length, 1);
  assert.match(capturedSql, /FROM photos p/);
  assert.match(capturedSql, /INNER JOIN media m/);
  assert.match(capturedSql, /m\.is_active = 1/);
  assert.match(capturedSql, /m\.resource_type = 'IMAGE'/);
  assert.match(capturedSql, /WHERE p\.is_active = 1/);
  assert.match(capturedSql, /ORDER BY p\.created_at DESC, p\.id DESC/);
  assert.match(capturedSql, /m\.secure_url AS image_url/);
  assert.match(capturedSql, /m\.width AS image_width/);
  assert.doesNotMatch(capturedSql, /SELECT \*/);
});

test("public photo list returns the agreed DTO and ISO creation date", async () => {
  mock.method(photosRepository, "listPublicPhotos", async () => [createPhoto()]);

  const result = await request("/api/photos");

  assert.equal(result.status, 200);
  assert.equal(result.body.message, "Photos retrieved successfully");
  assert.deepEqual(result.body.data.photos, [
    {
      id: 1,
      caption: "Así preparamos el recado hoy",
      image: {
        url: "https://cdn.example/photo.jpg",
        altText: null,
        width: 1200,
        height: 900,
      },
      createdAt: "2026-09-27T10:00:00.000Z",
    },
  ]);
});

test("public photo detail hides unavailable photos and supports an empty list", async () => {
  mock.method(photosRepository, "findPublicPhotoById", async (photoId) => {
    assert.equal(photoId, 1);
    return createPhoto();
  });

  const found = await request("/api/photos/1");
  assert.equal(found.status, 200);
  assert.equal(found.body.data.photo.id, 1);

  mock.restoreAll();
  mock.method(photosRepository, "findPublicPhotoById", async () => null);
  mock.method(photosRepository, "listPublicPhotos", async () => []);

  const missing = await request("/api/photos/1");
  const empty = await request("/api/photos");
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "PHOTO_NOT_FOUND");
  assert.deepEqual(empty.body.data.photos, []);
});