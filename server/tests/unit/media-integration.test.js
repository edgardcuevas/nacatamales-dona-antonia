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
  DB_NAME: "media_integration_test",
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
  parseCreateCategoryBody: parseCreateCategoryWithImage,
  parseUpdateCategoryBody: parseUpdateCategoryWithImage,
} = require("../../src/modules/categories/category.validator");
const productRepository = require(
  "../../src/modules/products/product.repository"
);
const {
  parseCreateProductBody: parseCreateProductWithImage,
  parseUpdateProductBody: parseUpdateProductWithImage,
} = require("../../src/modules/products/product.validator");
const categoryService = require(
  "../../src/modules/categories/category.service"
);
const productService = require(
  "../../src/modules/products/product.service"
);
const announcementRepository = require(
  "../../src/modules/announcements/announcement.repository"
);
const mediaRepository = require(
  "../../src/modules/media/media.repository"
);
const pool = require("../../src/database/pool");

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
});

function imageFields(overrides = {}) {
  return {
    image_id: 2,
    image_url: "https://cdn.example/qa.jpg",
    image_alt_text: "QA image",
    image_width: 1200,
    image_height: 800,
    ...overrides,
  };
}

function categoryRow(overrides = {}) {
  return {
    id: 1,
    name: "QA category",
    slug: "qa-category",
    description: null,
    sort_order: 0,
    is_active: 1,
    image_media_id: 2,
    created_at: new Date(),
    updated_at: new Date(),
    ...imageFields(),
    ...overrides,
  };
}

function productRow(overrides = {}) {
  return {
    id: 3,
    category_id: 1,
    name: "QA product",
    slug: "qa-product",
    description: null,
    price: "4.50",
    is_available: 1,
    is_active: 1,
    sort_order: 0,
    image_media_id: 2,
    created_at: new Date(),
    updated_at: new Date(),
    category_name: "QA category",
    category_slug: "qa-category",
    ...imageFields(),
    ...overrides,
  };
}

function announcementRow(overrides = {}) {
  return {
    id: 4,
    title: "QA announcement",
    content: "Content",
    type: "INFO",
    starts_at: null,
    ends_at: null,
    sort_order: 0,
    image_media_id: 2,
    ...imageFields(),
    ...overrides,
  };
}

function assertAppError(error, statusCode, code) {
  assert.ok(error);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.code, code);
}

test("category and product validators accept image references and null removal", () => {
  const category = parseCreateCategoryWithImage({
    name: "QA category",
    slug: "qa-category",
    imageMediaId: 2,
  });
  assert.equal(category.imageMediaId, 2);
  assert.deepEqual(
    parseUpdateCategoryWithImage({ imageMediaId: null }),
    { imageMediaId: null }
  );

  const product = parseCreateProductWithImage({
    categoryId: 1,
    name: "QA product",
    slug: "qa-product",
    isAvailable: true,
    imageMediaId: 2,
  });
  assert.equal(product.imageMediaId, 2);
  assert.deepEqual(
    parseUpdateProductWithImage({ imageMediaId: null }),
    { imageMediaId: null }
  );
});

test("category, product, and announcement repositories use one image LEFT JOIN per listing", async () => {
  const queries = [];
  mock.method(
    pool,
    "execute",
    async (sql) => {
      queries.push(sql);
      return [[], []];
    }
  );

  await categoryRepository.listPublicCategories();
  await productRepository.listPublicProducts({
    page: 1,
    limit: 20,
  });
  await announcementRepository.listPublicAnnouncements({});

  assert.equal(queries.length, 4);
  for (const sql of [queries[0], queries[1], queries[3]]) {
    assert.match(sql, /LEFT JOIN media/);
    assert.doesNotMatch(sql, /SELECT \*/);
  }
  assert.doesNotMatch(queries[2], /SELECT \*/);
});

test("category public and administrative DTOs expose only active image data", async () => {
  mock.method(
    categoryRepository,
    "listPublicCategories",
    async () => [categoryRow()]
  );
  const publicCategories =
    await categoryService.listPublicCategories();
  assert.deepEqual(publicCategories[0].image, {
    id: 2,
    url: "https://cdn.example/qa.jpg",
    altText: "QA image",
    width: 1200,
    height: 800,
  });

  mock.restoreAll();
  mock.method(
    categoryRepository,
    "listPublicCategories",
    async () => [
      categoryRow({
        image_id: null,
        image_url: null,
        image_alt_text: null,
        image_width: null,
        image_height: null,
      }),
    ]
  );
  const withoutVisibleImage =
    await categoryService.listPublicCategories();
  assert.equal(withoutVisibleImage[0].image, null);
});

test("category image association accepts an active image and can be removed with null", async () => {
  mock.method(
    mediaRepository,
    "findMediaById",
    async (mediaId) => {
      assert.equal(mediaId, 2);
      return {
        id: 2,
        is_active: 1,
        resource_type: "IMAGE",
      };
    }
  );
  let createInput;
  mock.method(
    categoryRepository,
    "createCategory",
    async (input) => {
      createInput = input;
      return { id: 1 };
    }
  );
  mock.method(
    categoryRepository,
    "findCategoryById",
    async () => categoryRow()
  );

  const created = await categoryService.createCategory({
    name: "QA category",
    slug: "qa-category",
    description: null,
    sortOrder: 0,
    imageMediaId: 2,
  });
  assert.equal(createInput.imageMediaId, 2);
  assert.equal(created.imageMediaId, 2);

  mock.restoreAll();
  let updateInput;
  mock.method(
    categoryRepository,
    "updateCategoryById",
    async ({ updates }) => {
      updateInput = updates;
      return true;
    }
  );
  mock.method(
    categoryRepository,
    "findCategoryById",
    async () =>
      categoryRow({
        image_media_id: null,
        image_id: null,
      })
  );
  const updated = await categoryService.updateCategory({
    categoryId: 1,
    updates: { imageMediaId: null },
  });
  assert.equal(updateInput.imageMediaId, null);
  assert.equal(updated.imageMediaId, null);
  assert.equal(updated.image, null);
});

test("category rejects missing, inactive, and non-image media references", async () => {
  const input = {
    name: "QA category",
    slug: "qa-category",
    description: null,
    sortOrder: 0,
    imageMediaId: 2,
  };

  mock.method(
    mediaRepository,
    "findMediaById",
    async () => null
  );
  await assert.rejects(
    categoryService.createCategory(input),
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
      id: 2,
      is_active: 0,
      resource_type: "IMAGE",
    })
  );
  await assert.rejects(
    categoryService.createCategory(input),
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
      id: 2,
      is_active: 1,
      resource_type: "VIDEO",
    })
  );
  await assert.rejects(
    categoryService.createCategory(input),
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

test("product image association and public DTO use the same active media contract", async () => {
  mock.method(
    productRepository,
    "listPublicProducts",
    async () => ({
      products: [productRow()],
      totalItems: 1,
    })
  );
  const result =
    await productService.listPublicProducts({
      page: 1,
      limit: 20,
    });
  assert.equal(result.products[0].image.id, 2);
  assert.equal(
    Object.hasOwn(result.products[0], "imageMediaId"),
    false
  );

  mock.restoreAll();
  mock.method(
    mediaRepository,
    "findMediaById",
    async () => ({
      id: 2,
      is_active: 1,
      resource_type: "IMAGE",
    })
  );
  mock.method(
    categoryRepository,
    "findCategoryById",
    async () => ({ id: 1, is_active: 1 })
  );
  mock.method(
    productRepository,
    "createProduct",
    async () => ({ id: 3 })
  );
  mock.method(
    productRepository,
    "findProductById",
    async () => productRow()
  );
  const created = await productService.createProduct({
    categoryId: 1,
    name: "QA product",
    slug: "qa-product",
    description: null,
    price: "4.50",
    isAvailable: true,
    sortOrder: 0,
    imageMediaId: 2,
  });
  assert.equal(created.imageMediaId, 2);
  assert.equal(created.image.id, 2);
});

test("announcement image remains safe and inactive media yields null", async () => {
  mock.method(
    announcementRepository,
    "listPublicAnnouncements",
    async () => [announcementRow()]
  );
  const withImage =
    await require("../../src/modules/announcements/announcement.service")
      .listPublicAnnouncements({});
  assert.equal(withImage[0].image.id, 2);

  mock.restoreAll();
  mock.method(
    announcementRepository,
    "listPublicAnnouncements",
    async () => [
      announcementRow({
        image_id: null,
        image_url: null,
        image_alt_text: null,
        image_width: null,
        image_height: null,
      }),
    ]
  );
  const withoutImage =
    await require("../../src/modules/announcements/announcement.service")
      .listPublicAnnouncements({});
  assert.equal(withoutImage[0].image, null);
});
