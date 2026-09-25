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
  DB_NAME: "product_public_test",
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

const productRepository = require(
  "../../src/modules/products/product.repository"
);
const {
  parseProductSlug,
  parsePublicProductListQuery,
} = require("../../src/modules/products/product.validator");
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

function createProduct(overrides = {}) {
  return {
    id: 4,
    name: "Test product",
    slug: "test-product",
    description: null,
    price: "12.30",
    is_available: 1,
    sort_order: 0,
    category_id: 1,
    category_name: "Test category",
    category_slug: "test-category",
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

test("public product repository joins active products and categories with fixed ordering", async () => {
  const queries = [];
  mock.method(
    pool,
    "execute",
    async (sql, parameters) => {
      queries.push({ sql, parameters });
      if (queries.length === 1) {
        return [[createProduct()], []];
      }
      return [[{ total_items: 1 }], []];
    }
  );

  const result = await productRepository.listPublicProducts({
    page: 1,
    limit: 20,
  });

  assert.equal(result.totalItems, 1);
  assert.match(queries[0].sql, /p\.is_active = 1/);
  assert.match(queries[0].sql, /c\.is_active = 1/);
  assert.match(queries[0].sql, /INNER JOIN categories/);
  assert.match(
    queries[0].sql,
    /ORDER BY p\.sort_order ASC, p\.name ASC, p\.id ASC/
  );
  assert.doesNotMatch(queries[0].sql, /SELECT \*/);
});

test("public product list supports empty results and approved DTOs", async () => {
  mock.method(
    productRepository,
    "listPublicProducts",
    async () => ({ products: [], totalItems: 0 })
  );

  const result = await request("/api/products");

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, {
    products: [],
    pagination: {
      page: 1,
      limit: 20,
      totalItems: 0,
      totalPages: 0,
    },
  });
});

test("public product list includes unavailable products and preserves decimal price", async () => {
  mock.method(
    productRepository,
    "listPublicProducts",
    async () => ({
      products: [
        createProduct({
          is_available: 0,
          price: "99.90",
        }),
      ],
      totalItems: 1,
    })
  );

  const result = await request("/api/products");

  assert.equal(result.status, 200);
  assert.equal(result.body.data.products[0].isAvailable, false);
  assert.equal(result.body.data.products[0].price, "99.90");
  assert.equal(
    typeof result.body.data.products[0].price,
    "string"
  );
  assert.equal(
    result.body.data.products[0].category.slug,
    "test-category"
  );
  assert.equal(
    Object.hasOwn(result.body.data.products[0], "isActive"),
    false
  );
});

test("public product filters and pagination are passed to the repository", async () => {
  let receivedFilters;
  mock.method(
    productRepository,
    "listPublicProducts",
    async (filters) => {
      receivedFilters = filters;
      return { products: [], totalItems: 0 };
    }
  );

  const result = await request(
    "/api/products?page=2&limit=5&category=test-category&available=false"
  );

  assert.equal(result.status, 200);
  assert.deepEqual(receivedFilters, {
    page: 2,
    limit: 5,
    categorySlug: "test-category",
    available: false,
  });
});

test("public product detail returns a product and hides missing products", async () => {
  mock.method(
    productRepository,
    "findPublicProductBySlug",
    async () => createProduct()
  );

  const found = await request(
    "/api/products/test-product"
  );
  assert.equal(found.status, 200);
  assert.equal(
    found.body.data.product.slug,
    "test-product"
  );

  mock.restoreAll();
  mock.method(
    productRepository,
    "findPublicProductBySlug",
    async () => null
  );
  const missing = await request(
    "/api/products/missing-product"
  );
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "PRODUCT_NOT_FOUND");
});

test("public product query and slug validators reject invalid values", () => {
  assert.deepEqual(
    parsePublicProductListQuery({
      page: "1",
      limit: "20",
      available: "true",
    }),
    {
      page: 1,
      limit: 20,
      categorySlug: undefined,
      available: true,
    }
  );
  assert.equal(
    parseProductSlug("product-1"),
    "product-1"
  );
  for (const query of [
    { limit: "101" },
    { available: "yes" },
    { category: "Invalid" },
    { sortBy: "price" },
  ]) {
    assert.throws(
      () => parsePublicProductListQuery(query),
      (error) => {
        assert.equal(error.statusCode, 400);
        return true;
      }
    );
  }
});
