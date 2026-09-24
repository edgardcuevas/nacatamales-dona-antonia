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
  DB_NAME: "category_admin_core_test",
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
  parseCategoryId,
  parseCategoryListQuery,
  parseCreateCategoryBody,
  parseUpdateCategoryBody,
  parseCategoryStatusBody,
} = require("../../src/modules/categories/category.validator");
const categoryRepository = require(
  "../../src/modules/categories/category.repository"
);
const categoryService = require(
  "../../src/modules/categories/category.service"
);
const pool = require("../../src/database/pool");

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
});

function createRawCategory(overrides = {}) {
  return {
    id: 3,
    name: "Admin category",
    slug: "admin-category",
    description: null,
    sort_order: 0,
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

test("category admin query supports pagination, filters, and safe sorting", () => {
  const result = parseCategoryListQuery({
    page: "2",
    limit: "10",
    isActive: "false",
    name: "Sweets",
    sortBy: "name",
    sortOrder: "asc",
  });

  assert.deepEqual(result, {
    page: 2,
    limit: 10,
    isActive: false,
    name: "Sweets",
    sortBy: "name",
    sortOrder: "asc",
  });
  assert.equal(parseCategoryListQuery({}).limit, 20);
  assert.equal(parseCategoryListQuery({}).page, 1);
});

test("category admin query and body validators reject invalid input", () => {
  const invalidQueries = [
    {
      query: { page: "0" },
      code: "INVALID_CATEGORY_LIST_QUERY",
    },
    {
      query: { limit: "101" },
      code: "INVALID_CATEGORY_LIST_QUERY",
    },
    {
      query: { isActive: "sometimes" },
      code: "INVALID_CATEGORY_LIST_QUERY",
    },
    {
      query: { sortBy: "description" },
      code: "INVALID_CATEGORY_LIST_QUERY",
    },
    {
      query: { sortOrder: "sideways" },
      code: "INVALID_CATEGORY_LIST_QUERY",
    },
    {
      query: { unknown: "value" },
      code: "UNEXPECTED_CATEGORY_FIELDS",
    },
  ];

  for (const testCase of invalidQueries) {
    assert.throws(
      () => parseCategoryListQuery(testCase.query),
      (error) => {
        assertAppError(
          error,
          400,
          testCase.code
        );
        return true;
      }
    );
  }

  assert.throws(
    () => parseCategoryId("0"),
    (error) => {
      assertAppError(error, 400, "INVALID_CATEGORY_ID");
      return true;
    }
  );
  assert.throws(
    () => parseCreateCategoryBody({
      name: "Category",
      slug: "category",
      isActive: true,
    }),
    (error) => {
      assertAppError(
        error,
        400,
        "UNEXPECTED_CATEGORY_FIELDS"
      );
      return true;
    }
  );
  assert.throws(
    () => parseUpdateCategoryBody({}),
    (error) => {
      assertAppError(error, 400, "INVALID_CATEGORY_INPUT");
      return true;
    }
  );
  assert.throws(
    () => parseCategoryStatusBody({ isActive: "true" }),
    (error) => {
      assertAppError(error, 400, "INVALID_CATEGORY_STATUS");
      return true;
    }
  );
});

test("category repository uses a whitelist and parameterized admin filters", async () => {
  const queries = [];
  mock.method(
    pool,
    "execute",
    async (sql, parameters) => {
      queries.push({ sql, parameters });
      if (queries.length === 1) {
        return [[createRawCategory()], []];
      }
      return [[{ total_items: 1 }], []];
    }
  );

  const result = await categoryRepository.listCategories({
    page: 2,
    limit: 10,
    isActive: true,
    name: "Admin",
    sortBy: "name",
    sortOrder: "asc",
  });

  assert.equal(result.totalItems, 1);
  assert.match(queries[0].sql, /ORDER BY c\.name ASC/);
  assert.match(queries[0].sql, /is_active = \?/);
  assert.match(queries[0].sql, /name LIKE \?/);
  assert.deepEqual(queries[0].parameters, [
    1,
    "%Admin%",
    10,
    10,
  ]);
  assert.doesNotMatch(queries[0].sql, /SELECT \*/);
});

test("category service creates a safe administrative DTO", async () => {
  mock.method(
    categoryRepository,
    "createCategory",
    async () => ({ id: 3 })
  );
  mock.method(
    categoryRepository,
    "findCategoryById",
    async () => createRawCategory()
  );

  const result = await categoryService.createCategory({
    name: "Admin category",
    slug: "admin-category",
    description: null,
    sortOrder: 0,
  });

  assert.equal(result.id, 3);
  assert.equal(result.isActive, true);
  assert.equal(
    Object.hasOwn(result, "createdAt"),
    true
  );
  assert.equal(
    Object.hasOwn(result, "password_hash"),
    false
  );
});

test("category service maps only approved duplicate indexes", async () => {
  const duplicate = new Error("Duplicate entry");
  duplicate.code = "ER_DUP_ENTRY";
  duplicate.sqlMessage =
    "Duplicate entry for key 'categories.categories_name_unique'";
  mock.method(
    categoryRepository,
    "createCategory",
    async () => {
      throw duplicate;
    }
  );

  await assert.rejects(
    categoryService.createCategory({
      name: "Admin category",
      slug: "admin-category",
      description: null,
      sortOrder: 0,
    }),
    (error) => {
      assertAppError(
        error,
        409,
        "CATEGORY_NAME_ALREADY_EXISTS"
      );
      return true;
    }
  );

  duplicate.sqlMessage =
    "Duplicate entry for key 'categories.categories_slug_unique'";
  await assert.rejects(
    categoryService.createCategory({
      name: "Another category",
      slug: "admin-category",
      description: null,
      sortOrder: 0,
    }),
    (error) => {
      assertAppError(
        error,
        409,
        "CATEGORY_SLUG_ALREADY_EXISTS"
      );
      return true;
    }
  );

  duplicate.sqlMessage = "Duplicate entry for key 'other_index'";
  await assert.rejects(
    categoryService.createCategory({
      name: "Another category",
      slug: "another-category",
      description: null,
      sortOrder: 0,
    }),
    /Duplicate entry/
  );
});

test("category status change is idempotent and updates timestamps through repository", async () => {
  let updateCalls = 0;
  mock.method(
    categoryRepository,
    "findCategoryById",
    async () => createRawCategory({ is_active: 1 })
  );
  mock.method(
    categoryRepository,
    "updateCategoryStatusById",
    async () => {
      updateCalls += 1;
      return true;
    }
  );

  const result = await categoryService.changeCategoryStatus({
    categoryId: 3,
    isActive: true,
  });

  assert.equal(result.isActive, true);
  assert.equal(updateCalls, 0);
});
