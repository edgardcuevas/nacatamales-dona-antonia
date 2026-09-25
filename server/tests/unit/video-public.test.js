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
  DB_NAME: "video_public_test",
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

const videoRepository = require(
  "../../src/modules/videos/video.repository"
);
const {
  parseVideoId,
} = require("../../src/modules/videos/video.validator");
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

function createVideo(overrides = {}) {
  return {
    id: 3,
    title: "QA video",
    description: "Temporary video",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    provider: "YOUTUBE",
    external_id: "dQw4w9WgXcQ",
    thumbnail_url: null,
    sort_order: 0,
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

test("public video repository filters active rows and uses required order", async () => {
  let capturedSql = "";
  mock.method(
    pool,
    "execute",
    async (sql) => {
      capturedSql = sql;
      return [[createVideo()], []];
    }
  );

  const result = await videoRepository.listPublicVideos();

  assert.equal(result.length, 1);
  assert.match(capturedSql, /WHERE is_active = 1/);
  assert.match(
    capturedSql,
    /upload_status = 'READY'/
  );
  assert.match(
    capturedSql,
    /sort_order ASC,[\s\S]*created_at DESC,[\s\S]*id DESC/
  );
  assert.doesNotMatch(capturedSql, /SELECT \*/);
});

test("public video list returns only the approved DTO fields", async () => {
  mock.method(
    videoRepository,
    "listPublicVideos",
    async () => [createVideo()]
  );

  const result = await request("/api/videos");

  assert.equal(result.status, 200);
  assert.equal(
    result.body.message,
    "Videos retrieved successfully"
  );
  assert.deepEqual(
    Object.keys(result.body.data.videos[0]).sort(),
    [
      "description",
      "externalId",
      "id",
      "provider",
      "sortOrder",
      "thumbnailUrl",
      "title",
      "url",
    ]
  );
  assert.equal(
    Object.hasOwn(
      result.body.data.videos[0],
      "isActive"
    ),
    false
  );
  assert.equal(
    Object.hasOwn(
      result.body.data.videos[0],
      "createdAt"
    ),
    false
  );
});

test("public video list supports an empty result", async () => {
  mock.method(
    videoRepository,
    "listPublicVideos",
    async () => []
  );

  const result = await request("/api/videos");

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data.videos, []);
});

test("public video detail returns active video and hides missing video", async () => {
  mock.method(
    videoRepository,
    "findPublicVideoById",
    async (videoId) => {
      assert.equal(videoId, 3);
      return createVideo();
    }
  );

  const found = await request("/api/videos/3");
  assert.equal(found.status, 200);
  assert.equal(found.body.data.video.id, 3);

  mock.restoreAll();
  mock.method(
    videoRepository,
    "findPublicVideoById",
    async () => null
  );
  const missing = await request("/api/videos/3");
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "VIDEO_NOT_FOUND");
  assert.equal(
    missing.body.error.message,
    "The requested video does not exist"
  );
});

test("public video ID validator rejects unsafe values", () => {
  assert.equal(parseVideoId("3"), 3);
  for (const value of [
    "0",
    "-1",
    "1.5",
    "abc",
    "9007199254740992",
  ]) {
    assert.throws(
      () => parseVideoId(value),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.equal(error.code, "INVALID_VIDEO_ID");
        return true;
      }
    );
  }
});
