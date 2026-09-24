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
  DB_NAME: "product_admin_core_test",
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
  parseAdminProductListQuery,
  parseCreateProductBody,
  parseUpdateProductBody,
  parseProductStatusBody,
  parseProductAvailabilityBody,
  parsePrice,
} = require("../../src/modules/products/product.validator");
const productRepository = require(
  "../../src/modules/products/product.repository"
);
const categoryRepository = require(
  "../../src/modules/categories/category.repository"
);
const productService = require(
  "../../src/modules/products/product.service"
);
const pool = require("../../src/database/pool");

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
});

function createRawProduct(overrides = {}) {
  return {
    id: 4,
    category_id: 1,
    name: "Admin product",
    slug: "admin-product",
    description: null,
    price: "10.00",
    is_available: 1,
    is_active: 1,
    sort_order: 0,
    created_at: new Date(),
    updated_at: new Date(),
    category_name: "Admin category",
    category_slug: "admin-category",
    ...overrides,
  };
}

function assertAppError(error, statusCode, code) {
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.code, code);
}

test("product admin query supports filters and safe sorting", () => {
  const result = parseAdminProductListQuery({
    page: "2",
    limit: "10",
    name: "Nacatamal",
    categoryId: "3",
    isActive: "true",
    isAvailable: "false",
    sortBy: "price",
    sortOrder: "asc",
  });

  assert.deepEqual(result, {
    page: 2,
    limit: 10,
    name: "Nacatamal",
    categoryId: 3,
    isActive: true,
    isAvailable: false,
    sortBy: "price",
    sortOrder: "asc",
  });
});

test("product validators normalize decimal strings and reject invalid prices", () => {
  assert.equal(parsePrice("12"), "12.00");
  assert.equal(parsePrice("12.3"), "12.30");
  assert.equal(parsePrice("12.34"), "12.34");
  assert.equal(parsePrice(null), null);

  for (const price of [
    "-1.00",
    "1.234",
    "1e3",
    "1,000.00",
    "NaN",
    "Infinity",
    "100000000.00",
    12.34,
  ]) {
    assert.throws(
      () => parsePrice(price),
      (error) => {
        assertAppError(error, 400, "INVALID_PRODUCT_PRICE");
        return true;
      }
    );
  }
});

test("product creation and update validators reject unknown fields and missing values", () => {
  const createInput = parseCreateProductBody({
    categoryId: 1,
    name: " Product ",
    slug: "product",
    price: "5.5",
    isAvailable: true,
  });
  assert.deepEqual(createInput, {
    categoryId: 1,
    name: "Product",
    slug: "product",
    description: null,
    price: "5.50",
    isAvailable: true,
    sortOrder: 0,
    imageMediaId: null,
  });

  assert.throws(
    () => parseCreateProductBody({
      categoryId: 1,
      name: "Product",
      slug: "product",
      isAvailable: true,
      isActive: true,
    }),
    (error) => {
      assertAppError(error, 400, "UNEXPECTED_PRODUCT_FIELDS");
      return true;
    }
  );
  assert.throws(
    () => parseUpdateProductBody({}),
    (error) => {
      assertAppError(error, 400, "INVALID_PRODUCT_INPUT");
      return true;
    }
  );
  assert.throws(
    () => parseProductStatusBody({ isActive: "false" }),
    (error) => {
      assertAppError(error, 400, "INVALID_PRODUCT_STATUS");
      return true;
    }
  );
  assert.throws(
    () => parseProductAvailabilityBody({ isAvailable: 1 }),
    (error) => {
      assertAppError(
        error,
        400,
        "INVALID_PRODUCT_AVAILABILITY"
      );
      return true;
    }
  );
});

test("product admin repository uses a safe order map and parameterized filters", async () => {
  const queries = [];
  mock.method(
    pool,
    "execute",
    async (sql, parameters) => {
      queries.push({ sql, parameters });
      if (queries.length === 1) {
        return [[createRawProduct()], []];
      }
      return [[{ total_items: 1 }], []];
    }
  );

  const result = await productRepository.listProducts({
    page: 1,
    limit: 10,
    name: "Admin",
    categoryId: 1,
    isActive: true,
    isAvailable: false,
    sortBy: "price",
    sortOrder: "desc",
  });

  assert.equal(result.totalItems, 1);
  assert.match(queries[0].sql, /ORDER BY p\.price DESC/);
  assert.match(queries[0].sql, /p\.category_id = \?/);
  assert.match(queries[0].sql, /p\.is_available = \?/);
  assert.doesNotMatch(queries[0].sql, /SELECT \*/);
  assert.deepEqual(queries[0].parameters, [
    "%Admin%",
    1,
    1,
    0,
    10,
    0,
  ]);
});

test("product creation rejects missing and inactive categories", async () => {
  mock.method(
    categoryRepository,
    "findCategoryById",
    async () => null
  );
  await assert.rejects(
    productService.createProduct({
      categoryId: 99,
      name: "Product",
      slug: "product",
      description: null,
      price: "1.00",
      isAvailable: true,
      sortOrder: 0,
    }),
    (error) => {
      assertAppError(error, 404, "CATEGORY_NOT_FOUND");
      return true;
    }
  );

  mock.restoreAll();
  mock.method(
    categoryRepository,
    "findCategoryById",
    async () => ({
      id: 1,
      is_active: 0,
    })
  );
  await assert.rejects(
    productService.createProduct({
      categoryId: 1,
      name: "Product",
      slug: "product",
      description: null,
      price: "1.00",
      isAvailable: true,
      sortOrder: 0,
    }),
    (error) => {
      assertAppError(error, 409, "CATEGORY_INACTIVE");
      return true;
    }
  );
});

test("product service maps approved duplicate indexes and returns safe admin DTO", async () => {
  const duplicate = new Error("Duplicate entry");
  duplicate.code = "ER_DUP_ENTRY";
  duplicate.sqlMessage =
    "Duplicate entry for key 'products.products_name_unique'";
  mock.method(
    categoryRepository,
    "findCategoryById",
    async () => ({ id: 1, is_active: 1 })
  );
  mock.method(
    productRepository,
    "createProduct",
    async () => {
      throw duplicate;
    }
  );

  await assert.rejects(
    productService.createProduct({
      categoryId: 1,
      name: "Product",
      slug: "product",
      description: null,
      price: "1.00",
      isAvailable: true,
      sortOrder: 0,
    }),
    (error) => {
      assertAppError(
        error,
        409,
        "PRODUCT_NAME_ALREADY_EXISTS"
      );
      return true;
    }
  );

  mock.restoreAll();
  mock.method(
    categoryRepository,
    "findCategoryById",
    async () => ({ id: 1, is_active: 1 })
  );
  mock.method(
    productRepository,
    "createProduct",
    async () => ({ id: 4 })
  );
  mock.method(
    productRepository,
    "findProductById",
    async () => createRawProduct()
  );

  const result = await productService.createProduct({
    categoryId: 1,
    name: "Product",
    slug: "product",
    description: null,
    price: "1.00",
    isAvailable: true,
    sortOrder: 0,
  });

  assert.equal(result.id, 4);
  assert.equal(result.price, "10.00");
  assert.equal(result.isActive, true);
  assert.equal(
    Object.hasOwn(result, "password_hash"),
    false
  );
});

test("product status and availability changes are idempotent", async () => {
  let statusUpdates = 0;
  let availabilityUpdates = 0;
  mock.method(
    productRepository,
    "findProductById",
    async () => createRawProduct()
  );
  mock.method(
    productRepository,
    "updateProductStatusById",
    async () => {
      statusUpdates += 1;
      return true;
    }
  );
  mock.method(
    productRepository,
    "updateProductAvailabilityById",
    async () => {
      availabilityUpdates += 1;
      return true;
    }
  );

  const status = await productService.changeProductStatus({
    productId: 4,
    isActive: true,
  });
  const availability =
    await productService.changeProductAvailability({
      productId: 4,
      isAvailable: true,
    });

  assert.equal(status.isActive, true);
  assert.equal(availability.isAvailable, true);
  assert.equal(statusUpdates, 0);
  assert.equal(availabilityUpdates, 0);
});
