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
  DB_NAME: "announcement_admin_core_test",
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
const {
  parseAdministrativeAnnouncementListQuery,
  parseCreateAnnouncementBody,
  parseUpdateAnnouncementBody,
  parseAnnouncementStatusBody,
} = require("../../src/modules/announcements/announcement.validator");
const announcementRepository = require(
  "../../src/modules/announcements/announcement.repository"
);
const mediaRepository = require(
  "../../src/modules/media/media.repository"
);
const announcementService = require(
  "../../src/modules/announcements/announcement.service"
);
const pool = require("../../src/database/pool");

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
});

function futureDate(days = 2) {
  return new Date(Date.now() + days * 86_400_000);
}

function pastDate(days = 1) {
  return new Date(Date.now() - days * 86_400_000);
}

function createRawAnnouncement(overrides = {}) {
  return {
    id: 7,
    title: "QA announcement",
    content: "Temporary content",
    type: "INFO",
    is_active: 0,
    starts_at: null,
    ends_at: null,
    sort_order: 0,
    image_media_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    image_id: null,
    image_url: null,
    image_alt_text: null,
    image_width: null,
    image_height: null,
    ...overrides,
  };
}

function assertAppError(error, statusCode, code) {
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.code, code);
}

test("announcement admin query supports safe pagination, filters, and ordering", () => {
  const result =
    parseAdministrativeAnnouncementListQuery({
      page: "2",
      limit: "10",
      isActive: "false",
      type: "PROMOTION",
      title: "QA",
      sortBy: "startsAt",
      sortOrder: "asc",
    });

  assert.deepEqual(result, {
    page: 2,
    limit: 10,
    isActive: false,
    type: "PROMOTION",
    title: "QA",
    sortBy: "startsAt",
    sortOrder: "asc",
  });
  assert.equal(
    parseAdministrativeAnnouncementListQuery({}).limit,
    20
  );
});

test("announcement validators reject unknown fields and malformed schedules", () => {
  const valid = parseCreateAnnouncementBody({
    title: "QA announcement",
    content: "Content",
    type: "INFO",
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    imageMediaId: null,
  });
  assert.equal(valid.title, "QA announcement");
  assert.equal(valid.imageMediaId, null);

  for (const body of [
    {
      title: "QA",
      content: "Content",
      type: "INFO",
      isActive: true,
    },
    {
      title: "QA",
      content: "Content",
      type: "INFO",
      startsAt: "not-a-date",
    },
    {
      title: "QA",
      content: "Content",
      type: "UNKNOWN",
    },
  ]) {
    assert.throws(
      () => parseCreateAnnouncementBody(body),
      (error) => {
        assert.equal(error.statusCode, 400);
        return true;
      }
    );
  }

  assert.throws(
    () => parseUpdateAnnouncementBody({}),
    (error) => {
      assertAppError(
        error,
        400,
        "INVALID_ANNOUNCEMENT_INPUT"
      );
      return true;
    }
  );
  assert.throws(
    () => parseAnnouncementStatusBody({ isActive: "true" }),
    (error) => {
      assertAppError(
        error,
        400,
        "INVALID_ANNOUNCEMENT_STATUS"
      );
      return true;
    }
  );
});

test("announcement admin repository uses a whitelist and parameterized query", async () => {
  const queries = [];
  mock.method(
    pool,
    "execute",
    async (sql, parameters) => {
      queries.push({ sql, parameters });
      if (queries.length === 1) {
        return [[createRawAnnouncement()], []];
      }
      return [[{ total_items: 1 }], []];
    }
  );

  const result = await announcementRepository.listAnnouncements({
    page: 2,
    limit: 10,
    isActive: true,
    type: "INFO",
    title: "QA",
    sortBy: "sortOrder",
    sortOrder: "desc",
  });

  assert.equal(result.totalItems, 1);
  assert.match(queries[0].sql, /ORDER BY a\.sort_order DESC/);
  assert.match(queries[0].sql, /a\.is_active = \?/);
  assert.match(queries[0].sql, /a\.type = \?/);
  assert.match(queries[0].sql, /a\.title LIKE \?/);
  assert.doesNotMatch(queries[0].sql, /SELECT \*/);
  assert.deepEqual(queries[0].parameters, [
    1,
    "INFO",
    "%QA%",
    10,
    10,
  ]);
});

test("announcement service validates an active image and returns a safe admin DTO", async () => {
  const imageId = 3;
  mock.method(
    mediaRepository,
    "findMediaById",
    async (receivedId) => {
      assert.equal(receivedId, imageId);
      return {
        id: imageId,
        is_active: 1,
        resource_type: "IMAGE",
      };
    }
  );
  mock.method(
    announcementRepository,
    "createAnnouncement",
    async (input) => {
      assert.equal(input.imageMediaId, imageId);
      return { id: 7 };
    }
  );
  mock.method(
    announcementRepository,
    "findAnnouncementById",
    async () =>
      createRawAnnouncement({
        image_media_id: imageId,
        image_id: imageId,
        image_url: "https://cdn.example/qa.jpg",
        image_alt_text: "QA",
        image_width: 100,
        image_height: 80,
      })
  );

  const result = await announcementService.createAnnouncement({
    title: "QA announcement",
    content: "Content",
    type: "INFO",
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    imageMediaId: imageId,
  });

  assert.equal(result.id, 7);
  assert.equal(result.isActive, false);
  assert.equal(result.imageMediaId, imageId);
  assert.equal(result.image.url, "https://cdn.example/qa.jpg");
  assert.equal(
    Object.hasOwn(result, "image_public_id"),
    false
  );
});

test("announcement service rejects missing, inactive, and non-image media", async () => {
  const baseInput = {
    title: "QA announcement",
    content: "Content",
    type: "INFO",
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    imageMediaId: 3,
  };

  mock.method(
    mediaRepository,
    "findMediaById",
    async () => null
  );
  await assert.rejects(
    announcementService.createAnnouncement(baseInput),
    (error) => {
      assertAppError(error, 404, "MEDIA_NOT_FOUND");
      return true;
    }
  );

  mock.restoreAll();
  mock.method(
    mediaRepository,
    "findMediaById",
    async () => ({
      id: 3,
      is_active: 0,
      resource_type: "IMAGE",
    })
  );
  await assert.rejects(
    announcementService.createAnnouncement(baseInput),
    (error) => {
      assertAppError(error, 409, "MEDIA_INACTIVE");
      return true;
    }
  );

  mock.restoreAll();
  mock.method(
    mediaRepository,
    "findMediaById",
    async () => ({
      id: 3,
      is_active: 1,
      resource_type: "VIDEO",
    })
  );
  await assert.rejects(
    announcementService.createAnnouncement(baseInput),
    (error) => {
      assertAppError(
        error,
        400,
        "INVALID_MEDIA_RESOURCE_TYPE"
      );
      return true;
    }
  );
});

test("announcement schedule is validated as current and new values together", async () => {
  const start = futureDate(3);
  const end = futureDate(4);
  mock.method(
    announcementRepository,
    "findAnnouncementById",
    async () =>
      createRawAnnouncement({
        starts_at: start,
        ends_at: end,
      })
  );

  await assert.rejects(
    announcementService.updateAnnouncement({
      announcementId: 7,
      updates: {
        endsAt: new Date(start.getTime() - 1000),
      },
    }),
    (error) => {
      assertAppError(
        error,
        400,
        "INVALID_ANNOUNCEMENT_SCHEDULE"
      );
      return true;
    }
  );
});

test("announcement cannot be activated after its end date but future schedules can activate", async () => {
  mock.method(
    announcementRepository,
    "findAnnouncementById",
    async () =>
      createRawAnnouncement({
        is_active: 0,
        starts_at: null,
        ends_at: pastDate(),
      })
  );
  await assert.rejects(
    announcementService.changeAnnouncementStatus({
      announcementId: 7,
      isActive: true,
    }),
    (error) => {
      assertAppError(
        error,
        400,
        "INVALID_ANNOUNCEMENT_SCHEDULE"
      );
      return true;
    }
  );

  mock.restoreAll();
  const startsAt = futureDate(2);
  const endsAt = futureDate(3);
  let updateCalls = 0;
  mock.method(
    announcementRepository,
    "findAnnouncementById",
    async () =>
      createRawAnnouncement({
        is_active: 0,
        starts_at: startsAt,
        ends_at: endsAt,
      })
  );
  mock.method(
    announcementRepository,
    "updateAnnouncementStatusById",
    async () => {
      updateCalls += 1;
      return true;
    }
  );
  const result =
    await announcementService.changeAnnouncementStatus({
      announcementId: 7,
      isActive: true,
    });

  assert.equal(result.isActive, false);
  assert.equal(updateCalls, 1);
});
