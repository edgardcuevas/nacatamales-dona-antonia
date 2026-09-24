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
  parseMediaListQuery,
  parseUpdateMediaBody,
  parseMediaStatusBody,
  parseUploadAuthBody,
  parseConfirmMediaBody,
} = require("../../src/modules/media/media.validator");
const mediaRepository = require(
  "../../src/modules/media/media.repository"
);
const imagekitAdapter = require(
  "../../src/config/imagekit"
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
    provider: "IMAGEKIT",
    public_id: "qa/placeholder",
    secure_url:
      "https://ik.imagekit.io/test-imagekit-id/test-folder/qa.jpg",
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

function createImageKitFile(overrides = {}) {
  return {
    fileId: "file_test_123",
    filePath: "/test-folder/products/file.jpg",
    fileType: "image",
    mime: "image/jpeg",
    name: "file.jpg",
    size: 1024,
    width: 1200,
    height: 800,
    url: "https://ik.imagekit.io/test-imagekit-id/test-folder/products/file.jpg",
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

test("media repository inserts provider metadata and counts all entity references", async () => {
  const queries = [];
  mock.method(
    pool,
    "execute",
    async (sql, parameters) => {
      queries.push({ sql, parameters });
      if (sql.includes("INSERT INTO media")) {
        return [{ insertId: 12 }, []];
      }
      return [
        [
          {
            category_count: 1,
            product_count: 2,
            announcement_count: 3,
          },
        ],
        [],
      ];
    }
  );

  const created = await mediaRepository.createMedia({
    publicId: "file_test_123",
    secureUrl:
      "https://ik.imagekit.io/test-imagekit-id/test-folder/products/file.jpg",
    format: "jpg",
    bytes: 1024,
    width: 1200,
    height: 800,
    altText: null,
  });
  const references =
    await mediaRepository.countMediaReferences(2);

  assert.equal(created.id, 12);
  assert.equal(references, 6);
  assert.match(queries[0].sql, /INSERT INTO media/);
  assert.equal(queries[0].parameters[0], "IMAGEKIT");
  assert.equal(queries[0].parameters[1], "file_test_123");
  assert.match(queries[1].sql, /categories/);
  assert.match(queries[1].sql, /products/);
  assert.match(queries[1].sql, /announcements/);
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

test("media upload and confirmation validators accept only approved inputs", () => {
  assert.deepEqual(
    parseUploadAuthBody({ target: "categories" }),
    { target: "categories" }
  );
  assert.deepEqual(
    parseConfirmMediaBody({
      fileId: "file_test_123",
      altText: null,
    }),
    {
      fileId: "file_test_123",
      altText: null,
    }
  );

  for (const body of [
    { target: "other" },
    { target: "categories", folder: "client-folder" },
  ]) {
    assert.throws(
      () => parseUploadAuthBody(body),
      (error) => {
        assert.equal(error.statusCode, 400);
        return true;
      }
    );
  }

  assert.throws(
    () =>
      parseConfirmMediaBody({
        fileId: "file_test_123",
        secureUrl: "https://client-controlled",
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, "UNEXPECTED_MEDIA_FIELDS");
      return true;
    }
  );
});

test("media upload auth uses a short-lived provider signature and controlled folder", async () => {
  mock.method(
    imagekitAdapter,
    "getAuthenticationParameters",
    async (token, expire) => ({
      token,
      expire,
      signature: "test-signature",
    })
  );

  const result = await mediaService.createUploadAuth({
    target: "products",
  });

  assert.equal(result.folder, "test-folder/products");
  assert.equal(result.publicKey, "test_public_key");
  assert.equal(
    Object.hasOwn(result, "privateKey"),
    false
  );
  assert.equal(result.signature, "test-signature");
  assert.equal(result.useUniqueFileName, true);
  assert.equal(
    result.uploadUrl,
    "https://upload.imagekit.io/api/v1/files/upload"
  );
});

test("media upload auth rejects targets outside the approved map", async () => {
  await assert.rejects(
    mediaService.createUploadAuth({ target: "other" }),
    (error) => {
      assertAppError(
        error,
        400,
        "INVALID_MEDIA_UPLOAD_TARGET"
      );
      return true;
    }
  );
});

test("media confirmation validates provider metadata before inserting", async () => {
  mock.method(
    imagekitAdapter,
    "getFile",
    async (fileId) => createImageKitFile({ fileId })
  );
  mock.method(
    mediaRepository,
    "findMediaByPublicId",
    async () => null
  );
  let inserted;
  mock.method(
    mediaRepository,
    "createMedia",
    async (input) => {
      inserted = input;
      return { id: 9 };
    }
  );
  mock.method(
    mediaRepository,
    "findMediaById",
    async () =>
      createRawMedia({
        id: 9,
        provider: "IMAGEKIT",
        public_id: "file_test_123",
        secure_url:
          "https://ik.imagekit.io/test-imagekit-id/test-folder/products/file.jpg",
        format: "jpg",
      })
  );

  const result = await mediaService.confirmMedia({
    fileId: "file_test_123",
    altText: "Confirmed",
  });

  assert.equal(result.id, 9);
  assert.equal(result.provider, "IMAGEKIT");
  assert.equal(inserted.publicId, "file_test_123");
  assert.equal(inserted.bytes, 1024);
  assert.equal(inserted.altText, "Confirmed");
});

test("media confirmation rejects provider metadata violations", async () => {
  const cases = [
    {
      file: createImageKitFile({ mime: "image/svg+xml" }),
      code: "MEDIA_INVALID_TYPE",
      status: 400,
    },
    {
      file: createImageKitFile({ name: "file.svg" }),
      code: "MEDIA_INVALID_FORMAT",
      status: 400,
    },
    {
      file: createImageKitFile({
        mime: "image/png",
        name: "file.jpg",
      }),
      code: "MEDIA_INVALID_FORMAT",
      status: 400,
    },
    {
      file: createImageKitFile({ size: 6 * 1024 * 1024 }),
      code: "MEDIA_TOO_LARGE",
      status: 400,
    },
    {
      file: createImageKitFile({ width: 6001 }),
      code: "MEDIA_DIMENSIONS_EXCEEDED",
      status: 400,
    },
    {
      file: createImageKitFile({
        url: "http://ik.imagekit.io/test/file.jpg",
      }),
      code: "MEDIA_PROVIDER_ERROR",
      status: 502,
    },
    {
      file: createImageKitFile({
        filePath: "/outside/products/file.jpg",
      }),
      code: "MEDIA_PROVIDER_ERROR",
      status: 502,
    },
  ];

  for (const testCase of cases) {
    mock.restoreAll();
    mock.method(
      imagekitAdapter,
      "getFile",
      async () => testCase.file
    );
    await assert.rejects(
      mediaService.confirmMedia({
        fileId: "file_test_123",
        altText: null,
      }),
      (error) => {
        assert.equal(error.statusCode, testCase.status);
        assert.equal(error.code, testCase.code);
        return true;
      }
    );
  }
});

test("media confirmation maps provider not-found and duplicate errors", async () => {
  const notFound = new Error("not found");
  notFound.status = 404;
  mock.method(
    imagekitAdapter,
    "getFile",
    async () => {
      throw notFound;
    }
  );
  await assert.rejects(
    mediaService.confirmMedia({
      fileId: "file_test_123",
      altText: null,
    }),
    (error) => {
      assertAppError(error, 404, "MEDIA_FILE_NOT_FOUND");
      return true;
    }
  );

  mock.restoreAll();
  mock.method(
    imagekitAdapter,
    "getFile",
    async () => createImageKitFile()
  );
  mock.method(
    mediaRepository,
    "findMediaByPublicId",
    async () => createRawMedia({ provider: "IMAGEKIT" })
  );
  await assert.rejects(
    mediaService.confirmMedia({
      fileId: "file_test_123",
      altText: null,
    }),
    (error) => {
      assertAppError(error, 409, "MEDIA_ALREADY_EXISTS");
      return true;
    }
  );
});

test("media deletion deactivates, deletes provider file, and then removes MySQL row", async () => {
  let transactionCalls = 0;
  let providerDeleteCalls = 0;
  mock.method(
    mediaRepository,
    "withTransaction",
    async (work) => {
      transactionCalls += 1;
      return work({});
    }
  );
  mock.method(
    mediaRepository,
    "findMediaById",
    async () =>
      createRawMedia({
        provider: "IMAGEKIT",
        public_id: "file_test_123",
      })
  );
  mock.method(
    mediaRepository,
    "countMediaReferences",
    async () => 0
  );
  mock.method(
    mediaRepository,
    "updateMediaStatusById",
    async () => true
  );
  mock.method(
    mediaRepository,
    "deleteMediaById",
    async () => true
  );
  mock.method(
    imagekitAdapter,
    "deleteFile",
    async () => {
      providerDeleteCalls += 1;
    }
  );

  const result = await mediaService.deleteMedia({
    mediaId: 2,
  });

  assert.deepEqual(result, {
    mediaId: 2,
    deleted: true,
  });
  assert.equal(transactionCalls, 2);
  assert.equal(providerDeleteCalls, 1);
});

test("media deletion rejects referenced media and compensates provider failure", async () => {
  mock.method(
    mediaRepository,
    "withTransaction",
    async (work) => work({})
  );
  mock.method(
    mediaRepository,
    "findMediaById",
    async () =>
      createRawMedia({
        provider: "IMAGEKIT",
        public_id: "file_test_123",
      })
  );
  mock.method(
    mediaRepository,
    "countMediaReferences",
    async () => 1
  );
  await assert.rejects(
    mediaService.deleteMedia({ mediaId: 2 }),
    (error) => {
      assertAppError(error, 409, "MEDIA_IN_USE");
      return true;
    }
  );

  mock.restoreAll();
  let restored = 0;
  mock.method(
    mediaRepository,
    "withTransaction",
    async (work) => work({})
  );
  mock.method(
    mediaRepository,
    "findMediaById",
    async () =>
      createRawMedia({
        provider: "IMAGEKIT",
        public_id: "file_test_123",
      })
  );
  mock.method(
    mediaRepository,
    "countMediaReferences",
    async () => 0
  );
  mock.method(
    mediaRepository,
    "updateMediaStatusById",
    async ({ isActive }) => {
      if (isActive) {
        restored += 1;
      }
      return true;
    }
  );
  mock.method(
    imagekitAdapter,
    "deleteFile",
    async () => {
      throw new Error("provider unavailable");
    }
  );
  await assert.rejects(
    mediaService.deleteMedia({ mediaId: 2 }),
    (error) => {
      assertAppError(error, 502, "MEDIA_PROVIDER_ERROR");
      return true;
    }
  );
  assert.equal(restored, 1);
});

test("media deletion treats a provider not-found response as an idempotent retry", async () => {
  mock.method(
    mediaRepository,
    "withTransaction",
    async (work) => work({})
  );
  mock.method(
    mediaRepository,
    "findMediaById",
    async () =>
      createRawMedia({
        provider: "IMAGEKIT",
        public_id: "file_test_123",
        is_active: 0,
      })
  );
  mock.method(
    mediaRepository,
    "countMediaReferences",
    async () => 0
  );
  mock.method(
    mediaRepository,
    "deleteMediaById",
    async () => true
  );
  mock.method(
    imagekitAdapter,
    "deleteFile",
    async () => {
      const error = new Error("already deleted");
      error.status = 404;
      throw error;
    }
  );

  const result = await mediaService.deleteMedia({
    mediaId: 2,
  });

  assert.deepEqual(result, {
    mediaId: 2,
    deleted: true,
  });
});

test("media deletion hides a post-provider MySQL failure and leaves a retryable row", async () => {
  let transactionCalls = 0;
  mock.method(
    console,
    "error",
    () => {}
  );
  mock.method(
    mediaRepository,
    "withTransaction",
    async (work) => {
      transactionCalls += 1;
      if (transactionCalls === 2) {
        throw new Error("database unavailable");
      }
      return work({});
    }
  );
  mock.method(
    mediaRepository,
    "findMediaById",
    async () =>
      createRawMedia({
        provider: "IMAGEKIT",
        public_id: "file_test_123",
      })
  );
  mock.method(
    mediaRepository,
    "countMediaReferences",
    async () => 0
  );
  mock.method(
    mediaRepository,
    "updateMediaStatusById",
    async () => true
  );
  mock.method(
    imagekitAdapter,
    "deleteFile",
    async () => {}
  );

  await assert.rejects(
    mediaService.deleteMedia({ mediaId: 2 }),
    (error) => {
      assertAppError(error, 500, "MEDIA_OPERATION_FAILED");
      return true;
    }
  );
});
