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
  DB_NAME: "announcement_public_test",
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

const announcementRepository = require(
  "../../src/modules/announcements/announcement.repository"
);
const {
  parsePublicAnnouncementListQuery,
} = require("../../src/modules/announcements/announcement.validator");
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

function createAnnouncement(overrides = {}) {
  return {
    id: 7,
    title: "Temporary announcement",
    content: "Announcement content",
    type: "INFO",
    starts_at: null,
    ends_at: null,
    sort_order: 0,
    image_id: null,
    image_url: null,
    image_alt_text: null,
    image_width: null,
    image_height: null,
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

test("public announcement repository applies schedule, type, active media, and ordering", async () => {
  let capturedSql = "";
  let capturedParameters;
  mock.method(
    pool,
    "execute",
    async (sql, parameters) => {
      capturedSql = sql;
      capturedParameters = parameters;
      return [[createAnnouncement()], []];
    }
  );

  const result =
    await announcementRepository.listPublicAnnouncements({
      type: "INFO",
    });

  assert.equal(result.length, 1);
  assert.match(capturedSql, /a\.is_active = 1/);
  assert.match(
    capturedSql,
    /a\.starts_at IS NULL OR a\.starts_at <= CURRENT_TIMESTAMP/
  );
  assert.match(
    capturedSql,
    /a\.ends_at IS NULL OR a\.ends_at > CURRENT_TIMESTAMP/
  );
  assert.match(capturedSql, /LEFT JOIN media/);
  assert.match(capturedSql, /m\.is_active = 1/);
  assert.match(
    capturedSql,
    /a\.sort_order ASC,[\s\S]*a\.created_at DESC,[\s\S]*a\.id DESC/
  );
  assert.deepEqual(capturedParameters, ["INFO"]);
  assert.doesNotMatch(capturedSql, /SELECT \*/);
});

test("public announcement list returns approved DTO fields and image contract", async () => {
  const startsAt = new Date("2026-09-24T10:00:00.000Z");
  const endsAt = new Date("2026-09-25T10:00:00.000Z");
  mock.method(
    announcementRepository,
    "listPublicAnnouncements",
    async () => [
      createAnnouncement({
        starts_at: startsAt,
        ends_at: endsAt,
        image_id: 2,
        image_url: "https://cdn.example/image.jpg",
        image_alt_text: "Image alt",
        image_width: 1200,
        image_height: 800,
      }),
    ]
  );

  const result = await request(
    "/api/announcements?type=INFO"
  );

  assert.equal(result.status, 200);
  assert.equal(
    result.body.message,
    "Announcements retrieved successfully"
  );
  const announcement =
    result.body.data.announcements[0];
  assert.deepEqual(
    Object.keys(announcement).sort(),
    [
      "content",
      "endsAt",
      "id",
      "image",
      "sortOrder",
      "startsAt",
      "title",
      "type",
    ]
  );
  assert.equal(announcement.startsAt, startsAt.toISOString());
  assert.deepEqual(announcement.image, {
    id: 2,
    url: "https://cdn.example/image.jpg",
    altText: "Image alt",
    width: 1200,
    height: 800,
  });
  assert.equal(
    Object.hasOwn(announcement, "isActive"),
    false
  );
  assert.equal(
    Object.hasOwn(announcement, "imageMediaId"),
    false
  );
});

test("public announcement list uses null when media is absent or inactive", async () => {
  mock.method(
    announcementRepository,
    "listPublicAnnouncements",
    async () => [createAnnouncement({ image_id: null })]
  );

  const result = await request("/api/announcements");

  assert.equal(result.status, 200);
  assert.equal(
    result.body.data.announcements[0].image,
    null
  );
});

test("public announcement list supports an empty result", async () => {
  mock.method(
    announcementRepository,
    "listPublicAnnouncements",
    async () => []
  );

  const result = await request("/api/announcements");

  assert.equal(result.status, 200);
  assert.deepEqual(
    result.body.data.announcements,
    []
  );
});

test("public announcement query validates type and rejects unknown fields", () => {
  assert.deepEqual(
    parsePublicAnnouncementListQuery({
      type: "PROMOTION",
    }),
    { type: "PROMOTION" }
  );

  for (const query of [
    { type: "UNKNOWN" },
    { page: "1" },
  ]) {
    assert.throws(
      () => parsePublicAnnouncementListQuery(query),
      (error) => {
        assert.equal(error.statusCode, 400);
        return true;
      }
    );
  }
});
