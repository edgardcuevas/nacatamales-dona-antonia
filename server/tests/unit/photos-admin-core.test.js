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
  DB_NAME: "photos_admin_core_test",
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

const AppError = require("../../src/errors/app-error");
const {
  parsePhotoId,
  parseAdministrativePhotoListQuery,
  parseCreatePhotoBody,
  parseUpdatePhotoBody,
} = require("../../src/modules/photos/photos.validator");
const photosRepository = require(
  "../../src/modules/photos/photos.repository"
);
const mediaRepository = require(
  "../../src/modules/media/media.repository"
);
const photosService = require(
  "../../src/modules/photos/photos.service"
);
const pool = require("../../src/database/pool");

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
});

function createRawPhoto(overrides = {}) {
  return {
    id: 1,
    caption: "A fresh photo",
    image_media_id: 8,
    is_active: 1,
    sort_order: 3,
    created_at: new Date("2026-09-27T10:00:00.000Z"),
    updated_at: new Date("2026-09-27T11:00:00.000Z"),
    image_id: 8,
    image_url: "https://cdn.example/photo.jpg",
    image_alt_text: "Fresh food",
    image_width: 1200,
    image_height: 900,
    ...overrides,
  };
}

function assertAppError(error, statusCode, code) {
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.code, code);
}

test("photo validators accept optional captions and required image references", () => {
  assert.deepEqual(
    parseCreatePhotoBody({ imageMediaId: 8, sortOrder: 3 }),
    { caption: null, imageMediaId: 8, sortOrder: 3 }
  );
  assert.deepEqual(
    parseCreatePhotoBody({ caption: "", imageMediaId: 8 }),
    { caption: "", imageMediaId: 8, sortOrder: 0 }
  );
  assert.deepEqual(parseUpdatePhotoBody({ caption: null }), {
    caption: null,
  });
  assert.deepEqual(parseUpdatePhotoBody({ isActive: false }), {
    isActive: false,
  });
  assert.equal(parsePhotoId("8"), 8);
});

test("photo validators reject invalid fields, captions, media IDs, and sort order", () => {
  const invalidCreates = [
    [{ caption: "missing image" }, "INVALID_PHOTO_INPUT"],
    [{ imageMediaId: 0 }, "INVALID_IMAGE_MEDIA_ID"],
    [{ imageMediaId: "8" }, "INVALID_IMAGE_MEDIA_ID"],
    [{ imageMediaId: 8, caption: "x".repeat(501) }, "INVALID_CAPTION"],
    [{ imageMediaId: 8, sortOrder: -1 }, "INVALID_SORT_ORDER"],
    [{ imageMediaId: 8, extra: true }, "UNEXPECTED_PHOTO_FIELDS"],
  ];

  for (const [body, code] of invalidCreates) {
    assert.throws(
      () => parseCreatePhotoBody(body),
      (error) => {
        assertAppError(error, 400, code);
        return true;
      }
    );
  }

  assert.throws(
    () => parseUpdatePhotoBody({ imageMediaId: null }),
    (error) => {
      assertAppError(error, 400, "INVALID_IMAGE_MEDIA_ID");
      return true;
    }
  );
  assert.throws(
    () => parseUpdatePhotoBody({}),
    (error) => {
      assertAppError(error, 400, "INVALID_PHOTO_INPUT");
      return true;
    }
  );
  assert.throws(
    () => parsePhotoId("0"),
    (error) => {
      assertAppError(error, 400, "INVALID_PHOTO_ID");
      return true;
    }
  );
});

test("photo admin query validates pagination, filters, and sort whitelist", () => {
  assert.deepEqual(
    parseAdministrativePhotoListQuery({
      page: "2",
      limit: "10",
      isActive: "false",
      caption: "Kitchen",
      sortBy: "caption",
      sortOrder: "asc",
    }),
    {
      page: 2,
      limit: 10,
      isActive: false,
      caption: "Kitchen",
      sortBy: "caption",
      sortOrder: "asc",
    }
  );
  assert.equal(parseAdministrativePhotoListQuery({}).limit, 20);
  assert.throws(
    () => parseAdministrativePhotoListQuery({ sortBy: "raw_sql" }),
    (error) => {
      assertAppError(error, 400, "INVALID_PHOTO_LIST_QUERY");
      return true;
    }
  );
});

test("photo repository uses fixed columns and parameterized CRUD queries", async () => {
  const queries = [];
  mock.method(pool, "execute", async (sql, parameters) => {
    queries.push({ sql, parameters });
    if (queries.length === 1) {
      return [[createRawPhoto()], []];
    }
    if (queries.length === 2) {
      return [[{ total_items: 1 }], []];
    }
    if (sql.includes("INSERT INTO photos")) {
      return [{ insertId: 9 }, []];
    }
    if (sql.includes("UPDATE photos")) {
      return [{ affectedRows: 1 }, []];
    }
    return [{ affectedRows: 1 }, []];
  });

  const list = await photosRepository.listPhotos({
    page: 2,
    limit: 10,
    isActive: true,
    caption: "Kitchen",
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const created = await photosRepository.createPhoto({
    caption: "New",
    imageMediaId: 8,
    sortOrder: 2,
  });
  const updated = await photosRepository.updatePhotoById({
    photoId: 9,
    updates: { caption: null, imageMediaId: 10, isActive: false },
  });
  const deleted = await photosRepository.deletePhotoById(9);

  assert.equal(list.totalItems, 1);
  assert.equal(created.id, 9);
  assert.equal(updated, true);
  assert.equal(deleted, true);
  assert.match(queries[0].sql, /p\.is_active = \?/);
  assert.match(queries[0].sql, /p\.caption LIKE \?/);
  assert.match(queries[0].sql, /ORDER BY p\.created_at DESC/);
  assert.deepEqual(queries[0].parameters, [1, "%Kitchen%", 10, 10]);
  assert.deepEqual(queries[2].parameters, ["New", 8, 2]);
  assert.match(queries[3].sql, /image_media_id = \?/);
  assert.deepEqual(queries[3].parameters, [null, 10, false, 9]);
  assert.deepEqual(queries[4].parameters, [9]);
});

test("photo service requires active image media and returns safe admin DTOs", async () => {
  mock.method(mediaRepository, "findMediaById", async (mediaId) => {
    assert.equal(mediaId, 8);
    return { id: 8, is_active: 1, resource_type: "IMAGE" };
  });
  mock.method(photosRepository, "createPhoto", async () => ({ id: 1 }));
  mock.method(photosRepository, "findPhotoById", async () => createRawPhoto());

  const result = await photosService.createPhoto({
    caption: "A fresh photo",
    imageMediaId: 8,
    sortOrder: 3,
  });

  assert.deepEqual(result, {
    id: 1,
    caption: "A fresh photo",
    image: {
      url: "https://cdn.example/photo.jpg",
      altText: "Fresh food",
      width: 1200,
      height: 900,
    },
    createdAt: "2026-09-27T10:00:00.000Z",
    isActive: true,
    sortOrder: 3,
    updatedAt: "2026-09-27T11:00:00.000Z",
  });
});

test("photo service rejects missing, inactive, and non-image media", async () => {
  const input = { caption: null, imageMediaId: 8, sortOrder: 0 };

  mock.method(mediaRepository, "findMediaById", async () => null);
  await assert.rejects(photosService.createPhoto(input), (error) => {
    assertAppError(error, 404, "MEDIA_NOT_FOUND");
    return true;
  });

  mock.restoreAll();
  mock.method(mediaRepository, "findMediaById", async () => ({
    id: 8,
    is_active: 0,
    resource_type: "IMAGE",
  }));
  await assert.rejects(photosService.createPhoto(input), (error) => {
    assertAppError(error, 409, "MEDIA_INACTIVE");
    return true;
  });

  mock.restoreAll();
  mock.method(mediaRepository, "findMediaById", async () => ({
    id: 8,
    is_active: 1,
    resource_type: "VIDEO",
  }));
  await assert.rejects(photosService.createPhoto(input), (error) => {
    assertAppError(error, 400, "INVALID_MEDIA_RESOURCE_TYPE");
    return true;
  });
});