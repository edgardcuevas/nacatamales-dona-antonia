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
  DB_NAME: "video_admin_core_test",
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

const AppError = require("../../src/errors/app-error");
const {
  parseAdministrativeVideoListQuery,
  parseCreateVideoBody,
  parseUpdateVideoBody,
  parseVideoStatusBody,
  validateYouTubeIdentity,
} = require("../../src/modules/videos/video.validator");
const videoRepository = require(
  "../../src/modules/videos/video.repository"
);
const videoService = require(
  "../../src/modules/videos/video.service"
);
const pool = require("../../src/database/pool");

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
});

function createRawVideo(overrides = {}) {
  return {
    id: 3,
    title: "QA video",
    description: null,
    url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    provider: "YOUTUBE",
    external_id: "aaaaaaaaaaa",
    thumbnail_url: null,
    sort_order: 0,
    is_active: 0,
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

test("video admin query supports safe filters and ordering", () => {
  const result =
    parseAdministrativeVideoListQuery({
      page: "2",
      limit: "10",
      isActive: "false",
      provider: "YOUTUBE",
      title: "QA",
      sortBy: "externalId",
      sortOrder: "asc",
    });

  assert.deepEqual(result, {
    page: 2,
    limit: 10,
    isActive: false,
    provider: "YOUTUBE",
    title: "QA",
    sortBy: "externalId",
    sortOrder: "asc",
  });
});

test("YouTube identity validation accepts only approved HTTPS hosts and matching IDs", () => {
  const id = "aaaaaaaaaaa";
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/embed/${id}`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/shorts/${id}`,
  ]) {
    assert.deepEqual(
      validateYouTubeIdentity({
        provider: "YOUTUBE",
        url,
        externalId: id,
      }),
      {
        provider: "YOUTUBE",
        url,
        externalId: id,
      }
    );
  }

  for (const url of [
    "http://www.youtube.com/watch?v=aaaaaaaaaaa",
    "https://youtube.com.evil.example/watch?v=aaaaaaaaaaa",
    "https://m.youtube.com/watch?v=aaaaaaaaaaa",
    "https://www.youtube.com/watch?v=bbbbbbbbbbb",
  ]) {
    assert.throws(
      () =>
        validateYouTubeIdentity({
          provider: "YOUTUBE",
          url,
          externalId: id,
        }),
      (error) => {
        assert.equal(error.statusCode, 400);
        return true;
      }
    );
  }
});

test("video creation validation rejects unknown fields and unsafe external data", () => {
  const input = parseCreateVideoBody({
    title: "QA video",
    description: null,
    url: "https://youtu.be/aaaaaaaaaaa",
    provider: "YOUTUBE",
    externalId: "aaaaaaaaaaa",
    thumbnailUrl:
      "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg",
    sortOrder: 0,
  });
  assert.equal(input.externalId, "aaaaaaaaaaa");

  assert.throws(
    () =>
      parseCreateVideoBody({
        title: "QA",
        url: "https://youtu.be/aaaaaaaaaaa",
        provider: "YOUTUBE",
        externalId: "aaaaaaaaaaa",
        isActive: true,
      }),
    (error) => {
      assertAppError(error, 400, "UNEXPECTED_VIDEO_FIELDS");
      return true;
    }
  );

  for (const value of [
    "short",
    "aaaaaaaaaaa!",
    "aaaaaaaaaaaa",
  ]) {
    assert.throws(
      () =>
        parseCreateVideoBody({
          title: "QA",
          url: `https://youtu.be/${value}`,
          provider: "YOUTUBE",
          externalId: value,
        }),
      (error) => {
        assert.equal(error.statusCode, 400);
        return true;
      }
    );
  }

  assert.throws(
    () => parseUpdateVideoBody({}),
    (error) => {
      assertAppError(error, 400, "INVALID_VIDEO_INPUT");
      return true;
    }
  );
  assert.throws(
    () =>
      parseUpdateVideoBody({
        url: "https://youtube.com.evil.example/watch?v=aaaaaaaaaaa",
      }),
    (error) => {
      assertAppError(error, 400, "INVALID_VIDEO_URL");
      return true;
    }
  );
  assert.throws(
    () => parseVideoStatusBody({ isActive: 1 }),
    (error) => {
      assertAppError(error, 400, "INVALID_VIDEO_STATUS");
      return true;
    }
  );
});

test("video repository uses a safe order map and parameterized filters", async () => {
  const queries = [];
  mock.method(
    pool,
    "execute",
    async (sql, parameters) => {
      queries.push({ sql, parameters });
      if (queries.length === 1) {
        return [[createRawVideo()], []];
      }
      return [[{ total_items: 1 }], []];
    }
  );

  const result = await videoRepository.listVideos({
    page: 1,
    limit: 10,
    isActive: false,
    provider: "YOUTUBE",
    title: "QA",
    sortBy: "externalId",
    sortOrder: "asc",
  });

  assert.equal(result.totalItems, 1);
  assert.match(queries[0].sql, /ORDER BY external_id ASC/);
  assert.match(queries[0].sql, /provider = \?/);
  assert.match(queries[0].sql, /title LIKE \?/);
  assert.doesNotMatch(queries[0].sql, /SELECT \*/);
  assert.deepEqual(queries[0].parameters, [
    0,
    "YOUTUBE",
    "%QA%",
    10,
    0,
  ]);
});

test("video service maps only the approved provider and external ID duplicate index", async () => {
  const duplicate = new Error("Duplicate entry");
  duplicate.code = "ER_DUP_ENTRY";
  duplicate.sqlMessage =
    "Duplicate entry for key 'videos.videos_provider_external_id_unique'";
  mock.method(
    videoRepository,
    "createVideo",
    async () => {
      throw duplicate;
    }
  );

  await assert.rejects(
    videoService.createVideo({
      title: "QA video",
      description: null,
      url: "https://youtu.be/aaaaaaaaaaa",
      provider: "YOUTUBE",
      externalId: "aaaaaaaaaaa",
      thumbnailUrl: null,
      sortOrder: 0,
    }),
    (error) => {
      assertAppError(error, 409, "VIDEO_ALREADY_EXISTS");
      return true;
    }
  );

  duplicate.sqlMessage = "Duplicate entry for key 'other_index'";
  await assert.rejects(
    videoService.createVideo({
      title: "QA video",
      description: null,
      url: "https://youtu.be/aaaaaaaaaaa",
      provider: "YOUTUBE",
      externalId: "aaaaaaaaaaa",
      thumbnailUrl: null,
      sortOrder: 0,
    }),
    /Duplicate entry/
  );
});

test("video service creates safe admin DTO and validates update identity together", async () => {
  mock.method(
    videoRepository,
    "createVideo",
    async () => ({ id: 3 })
  );
  mock.method(
    videoRepository,
    "findVideoById",
    async () => createRawVideo()
  );

  const created = await videoService.createVideo({
    title: "QA video",
    description: null,
    url: "https://youtu.be/aaaaaaaaaaa",
    provider: "YOUTUBE",
    externalId: "aaaaaaaaaaa",
    thumbnailUrl: null,
    sortOrder: 0,
  });
  assert.equal(created.id, 3);
  assert.equal(created.isActive, false);
  assert.equal(created.externalId, "aaaaaaaaaaa");

  mock.restoreAll();
  mock.method(
    videoRepository,
    "findVideoById",
    async () => createRawVideo()
  );
  await assert.rejects(
    videoService.updateVideo({
      videoId: 3,
      updates: {
        externalId: "bbbbbbbbbbb",
      },
    }),
    (error) => {
      assertAppError(
        error,
        400,
        "VIDEO_URL_ID_MISMATCH"
      );
      return true;
    }
  );
});

test("processing videos cannot be activated before they are ready", async () => {
  let updateCalls = 0;
  mock.method(
    videoRepository,
    "findVideoById",
    async () =>
      createRawVideo({
        upload_status: "PROCESSING",
      })
  );
  mock.method(
    videoRepository,
    "updateVideoStatusById",
    async () => {
      updateCalls += 1;
      return true;
    }
  );

  await assert.rejects(
    videoService.changeVideoStatus({
      videoId: 3,
      isActive: true,
    }),
    (error) => {
      assertAppError(
        error,
        409,
        "VIDEO_NOT_READY"
      );
      return true;
    }
  );
  assert.equal(updateCalls, 0);
});
test("video status changes are idempotent", async () => {
  let updateCalls = 0;
  mock.method(
    videoRepository,
    "findVideoById",
    async () => createRawVideo()
  );
  mock.method(
    videoRepository,
    "updateVideoStatusById",
    async () => {
      updateCalls += 1;
      return true;
    }
  );

  const result = await videoService.changeVideoStatus({
    videoId: 3,
    isActive: false,
  });

  assert.equal(result.isActive, false);
  assert.equal(updateCalls, 0);
});
