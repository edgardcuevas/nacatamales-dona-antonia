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
  DB_NAME: "category_public_test",
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

const categoryRepository = require(
  "../../src/modules/categories/category.repository"
);
const {
  parseCategorySlug,
} = require("../../src/modules/categories/category.validator");
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

function createCategory(overrides = {}) {
  return {
    id: 1,
    name: "Test category",
    slug: "test-category",
    description: null,
    sort_order: 0,
    is_active: 1,
    created_at: new Date(),
    updated_at: new Date(),
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

test("public category repository filters active rows and orders deterministically", async () => {
  let capturedSql = "";
  mock.method(
    pool,
    "execute",
    async (sql) => {
      capturedSql = sql;
      return [[createCategory()], []];
    }
  );

  const result =
    await categoryRepository.listPublicCategories();

  assert.equal(result.length, 1);
  assert.match(capturedSql, /WHERE is_active = 1/);
  assert.match(
    capturedSql,
    /ORDER BY sort_order ASC, name ASC, id ASC/
  );
  assert.doesNotMatch(capturedSql, /SELECT \*/);
});

test("public category list returns only the approved DTO fields", async () => {
  mock.method(
    categoryRepository,
    "listPublicCategories",
    async () => [createCategory()]
  );

  const result = await request("/api/categories");

  assert.equal(result.status, 200);
  assert.equal(
    result.body.message,
    "Categories retrieved successfully"
  );
  assert.deepEqual(
    Object.keys(result.body.data.categories[0]).sort(),
    ["description", "id", "name", "slug", "sortOrder"]
  );
  assert.equal(
    Object.hasOwn(
      result.body.data.categories[0],
      "isActive"
    ),
    false
  );
});

test("public category list supports an empty result", async () => {
  mock.method(
    categoryRepository,
    "listPublicCategories",
    async () => []
  );

  const result = await request("/api/categories");

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data.categories, []);
});

test("public category detail returns an active category by slug", async () => {
  let receivedSlug;
  mock.method(
    categoryRepository,
    "findPublicCategoryBySlug",
    async (slug) => {
      receivedSlug = slug;
      return createCategory();
    }
  );

  const result = await request(
    "/api/categories/test-category"
  );

  assert.equal(result.status, 200);
  assert.equal(receivedSlug, "test-category");
  assert.equal(result.body.data.category.slug, "test-category");
});

test("public category detail hides inactive and missing categories", async () => {
  mock.method(
    categoryRepository,
    "findPublicCategoryBySlug",
    async () => null
  );

  const result = await request(
    "/api/categories/missing-category"
  );

  assert.equal(result.status, 404);
  assert.equal(result.body.error.code, "CATEGORY_NOT_FOUND");
  assert.equal(
    result.body.error.message,
    "The requested category does not exist"
  );
});

test("public category slug validator rejects unsafe values", () => {
  assert.equal(
    parseCategorySlug("nacatamal-de-cerdo"),
    "nacatamal-de-cerdo"
  );
  for (const slug of [
    "Uppercase",
    "-leading",
    "trailing-",
    "double--hyphen",
    "with space",
    "with_underscore",
    "a".repeat(121),
  ]) {
    assert.throws(
      () => parseCategorySlug(slug),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.equal(error.code, "INVALID_CATEGORY_SLUG");
        return true;
      }
    );
  }
});
