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
  DB_NAME: "media_admin_core_test",
  DB_USER: "test_user",
  DB_PASSWORD: "test_password",
  JWT_ACCESS_TOKEN_SECRET:
    "test-access-secret-with-at-least-32-characters",
  JWT_ACCESS_TOKEN_TTL: "15m",
  JWT_REFRESH_TOKEN_SECRET:
    "test-refresh-secret-with-at-least-32-characters",
  JWT_REFRESH_TOKEN_TTL: "30d",
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
const {
  parseMediaListQuery,
  parseUpdateMediaBody,
  parseMediaStatusBody,
} = require("../../src/modules/media/media.validator");
const mediaRepository = require(
  "../../src/modules/media/media.repository"
);
const mediaService = require(
  "../../src/modules/media/media.service"
);
const pool = require("../../src/database/pool");

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
});

function createRawMedia(overrides = {}) {
  return {
    id: 2,
    provider: "CLOUDINARY",
    public_id: "qa/placeholder",
    secure_url:
      "https://res.cloudinary.com/demo/image/upload/qa.jpg",
    resource_type: "IMAGE",
    format: "jpg",
    bytes: 1234,
    width: 100,
    height: 80,
    alt_text: "QA",
    is_active: 1,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function assertAppError(error, statusCode, code) {
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.code, code);
}

test("media list query supports pagination, filters, and safe ordering", () => {
  const result = parseMediaListQuery({
    page: "2",
    limit: "10",
    isActive: "true",
    resourceType: "IMAGE",
    publicId: "qa/",
    sortBy: "publicId",
    sortOrder: "asc",
  });

  assert.deepEqual(result, {
    page: 2,
    limit: 10,
    isActive: true,
    resourceType: "IMAGE",
    publicId: "qa/",
    sortBy: "publicId",
    sortOrder: "asc",
  });
  assert.equal(parseMediaListQuery({}).limit, 20);
});

test("media validators reject provider metadata and invalid updates", () => {
  assert.throws(
    () =>
      parseMediaListQuery({
        secret: "not-allowed",
      }),
    (error) => {
      assertAppError(error, 400, "UNEXPECTED_MEDIA_FIELDS");
      return true;
    }
  );
  assert.throws(
    () => parseUpdateMediaBody({ publicId: "new" }),
    (error) => {
      assertAppError(error, 400, "UNEXPECTED_MEDIA_FIELDS");
      return true;
    }
  );
  assert.deepEqual(
    parseUpdateMediaBody({ altText: null }),
    { altText: null }
  );
  assert.throws(
    () => parseMediaStatusBody({ isActive: "false" }),
    (error) => {
      assertAppError(error, 400, "INVALID_MEDIA_STATUS");
      return true;
    }
  );
});

test("media repository uses a safe order map and parameterized filters", async () => {
  const queries = [];
  mock.method(
    pool,
    "execute",
    async (sql, parameters) => {
      queries.push({ sql, parameters });
      if (queries.length === 1) {
        return [[createRawMedia()], []];
      }
      return [[{ total_items: 1 }], []];
    }
  );

  const result = await mediaRepository.listMedia({
    page: 1,
    limit: 10,
    isActive: true,
    resourceType: "IMAGE",
    publicId: "qa/",
    sortBy: "publicId",
    sortOrder: "asc",
  });

  assert.equal(result.totalItems, 1);
  assert.match(queries[0].sql, /ORDER BY public_id ASC/);
  assert.match(queries[0].sql, /resource_type = \?/);
  assert.match(queries[0].sql, /public_id LIKE \?/);
  assert.doesNotMatch(queries[0].sql, /SELECT \*/);
  assert.deepEqual(queries[0].parameters, [
    1,
    "IMAGE",
    "%qa/%",
    10,
    0,
  ]);
});

test("media service returns the approved administrative DTO", async () => {
  mock.method(
    mediaRepository,
    "findMediaById",
    async () => createRawMedia()
  );

  const result = await mediaService.getMediaById(2);

  assert.equal(result.id, 2);
  assert.equal(result.publicId, "qa/placeholder");
  assert.equal(result.isActive, true);
  assert.equal(
    Object.hasOwn(result, "apiSecret"),
    false
  );
  assert.equal(
    Object.hasOwn(result, "public_id"),
    false
  );
});

test("media service permits only alt text and idempotent status", async () => {
  let altUpdates = 0;
  let statusUpdates = 0;
  mock.method(
    mediaRepository,
    "findMediaById",
    async () => createRawMedia()
  );
  mock.method(
    mediaRepository,
    "updateMediaAltTextById",
    async () => {
      altUpdates += 1;
      return true;
    }
  );
  mock.method(
    mediaRepository,
    "updateMediaStatusById",
    async () => {
      statusUpdates += 1;
      return true;
    }
  );

  const updated = await mediaService.updateMediaAltText({
    mediaId: 2,
    altText: "Updated",
  });
  const status = await mediaService.changeMediaStatus({
    mediaId: 2,
    isActive: true,
  });

  assert.equal(updated.altText, "QA");
  assert.equal(status.isActive, true);
  assert.equal(altUpdates, 1);
  assert.equal(statusUpdates, 0);
});

test("media service returns a neutral not-found error", async () => {
  mock.method(
    mediaRepository,
    "findMediaById",
    async () => null
  );

  await assert.rejects(
    mediaService.getMediaById(999),
    (error) => {
      assertAppError(error, 404, "MEDIA_NOT_FOUND");
      return true;
    }
  );
});
