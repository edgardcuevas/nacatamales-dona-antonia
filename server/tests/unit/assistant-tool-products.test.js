const test = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("node:test");

Object.assign(process.env, {
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "assistant_products_test",
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
  IMAGEKIT_URL_ENDPOINT:
    "https://ik.imagekit.io/test-imagekit-id",
  IMAGEKIT_FOLDER: "test-folder",
  GOOGLE_CLIENT_ID: "test_google_client_id",
  GOOGLE_CLIENT_SECRET: "test_google_client_secret",
  GOOGLE_REDIRECT_URI:
    "https://example.test/api/admin/youtube/callback",
  YOUTUBE_TOKEN_ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  YOUTUBE_CHANNEL_ID: "UC1234567890123456789012",
});

const productService = require(
  "../../src/modules/products/product.service"
);
const categoryService = require(
  "../../src/modules/categories/category.service"
);
const assistantToolRegistry = require(
  "../../src/modules/assistant/assistant.tools"
);
const {
  MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS,
} = require(
  "../../src/modules/assistant/assistant.constants"
);

test("count_products uses a fixed minimal page and returns only the total", async () => {
  const listProducts = mock.method(
    productService,
    "listAdministrativeProducts",
    async () => ({
      products: [
        {
          id: 7,
          name: "Sensitive product detail",
        },
      ],
      pagination: {
        page: 1,
        limit: 1,
        totalItems: 14,
        totalPages: 14,
      },
    })
  );

  try {
    for (const role of ["ADMIN", "EDITOR"]) {
      assert.ok(
        assistantToolRegistry
          .getToolDeclarations(role)
          .some((tool) => tool.name === "count_products")
      );
    }

    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "count_products",
        arguments: {},
        role: "EDITOR",
      });

    assert.deepEqual(JSON.parse(serialized), {
      totalProducts: 14,
    });
    assert.deepEqual(listProducts.mock.calls[0].arguments[0], {
      page: 1,
      limit: 1,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    assert.doesNotMatch(serialized, /Sensitive product detail/);
  } finally {
    mock.restoreAll();
  }
});

test("count_products reports zero without returning product rows", async () => {
  mock.method(
    productService,
    "listAdministrativeProducts",
    async () => ({
      products: [],
      pagination: {
        page: 1,
        limit: 1,
        totalItems: 0,
        totalPages: 0,
      },
    })
  );

  try {
    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "count_products",
        arguments: {},
        role: "ADMIN",
      });

    assert.deepEqual(JSON.parse(serialized), {
      totalProducts: 0,
    });
  } finally {
    mock.restoreAll();
  }
});

test("search_products returns at most ten minimal, real product records", async () => {
  const listProducts = mock.method(
    productService,
    "listAdministrativeProducts",
    async () => ({
      products: Array.from({ length: 10 }, (_, index) => ({
        id: index + 1,
        name: `Producto ${index + 1}`,
        isActive: true,
        isAvailable: index % 2 === 0,
        price: 999,
        description: "Must not be exposed",
      })),
      pagination: {
        page: 1,
        limit: 10,
        totalItems: 12,
        totalPages: 2,
      },
    })
  );

  try {
    for (const role of ["ADMIN", "EDITOR"]) {
      assert.ok(
        assistantToolRegistry
          .getToolDeclarations(role)
          .some((tool) => tool.name === "search_products")
      );
    }

    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "search_products",
        arguments: { query: "  pollo  " },
        role: "EDITOR",
      });
    const result = JSON.parse(serialized);

    assert.equal(result.products.length, 10);
    assert.equal(result.truncated, true);
    assert.deepEqual(result.products[0], {
      id: 1,
      name: "Producto 1",
      price: 999,
      category: null,
      isActive: true,
      isAvailable: true,
    });
    assert.doesNotMatch(serialized, /Must not be exposed/);
    assert.deepEqual(listProducts.mock.calls[0].arguments[0], {
      page: 1,
      limit: 10,
      name: "pollo",
      sortBy: "name",
      sortOrder: "asc",
    });
  } finally {
    mock.restoreAll();
  }
});

test("search_products rejects blank and oversized queries", async () => {
  let listCalls = 0;
  mock.method(
    productService,
    "listAdministrativeProducts",
    async () => {
      listCalls += 1;
      return {
        products: [],
        pagination: {
          page: 1,
          limit: 10,
          totalItems: 0,
          totalPages: 0,
        },
      };
    }
  );

  try {
    for (const query of ["   ", "a".repeat(121)]) {
      await assert.rejects(
        assistantToolRegistry.executeToolCall({
          name: "search_products",
          arguments: { query },
          role: "ADMIN",
        }),
        (error) =>
          error.code === "INVALID_TOOL_ARGUMENTS"
      );
    }

    assert.equal(listCalls, 0);
  } finally {
    mock.restoreAll();
  }
});

test("count_products_by_category reports the real count for an existing category", async () => {
  mock.method(
    categoryService,
    "getCategoryById",
    async () => ({ id: 4, name: "Nacatamales" })
  );
  const countProducts = mock.method(
    categoryService,
    "countProductsByCategory",
    async () => 3
  );

  try {
    for (const role of ["ADMIN", "EDITOR"]) {
      assert.ok(
        assistantToolRegistry
          .getToolDeclarations(role)
          .some(
            (tool) =>
              tool.name === "count_products_by_category"
          )
      );
    }

    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "count_products_by_category",
        arguments: { categoryId: 4 },
        role: "EDITOR",
      });

    assert.deepEqual(JSON.parse(serialized), {
      categoryId: 4,
      categoryName: "Nacatamales",
      totalProducts: 3,
    });
    assert.deepEqual(
      countProducts.mock.calls[0].arguments,
      [4]
    );
  } finally {
    mock.restoreAll();
  }
});

test("list_products_by_category returns at most twenty minimal records", async () => {
  mock.method(
    categoryService,
    "getCategoryById",
    async () => ({ id: 4, name: "Nacatamales" })
  );
  const listProducts = mock.method(
    productService,
    "listAdministrativeProducts",
    async () => ({
      products: Array.from(
        {
          length: MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS + 1,
        },
        (_, index) => ({
          id: index + 1,
          name: `Producto ${index + 1}`,
          isActive: true,
          isAvailable: index % 2 === 0,
          description: "Must not be exposed",
          category: { name: "Nacatamales" },
        })
      ),
      pagination: {
        totalItems: MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS + 1,
      },
    })
  );

  try {
    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "list_products_by_category",
        arguments: { categoryId: 4 },
        role: "ADMIN",
      });
    const result = JSON.parse(serialized);

    assert.deepEqual(
      listProducts.mock.calls[0].arguments[0],
      {
        page: 1,
        limit: MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS + 1,
        categoryId: 4,
        sortBy: "name",
        sortOrder: "asc",
      }
    );
    assert.equal(
      result.products.length,
      MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS
    );
    assert.equal(
      result.totalProducts,
      MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS + 1
    );
    assert.equal(result.truncated, true);
    assert.deepEqual(result.products[0], {
      id: 1,
      name: "Producto 1",
      isActive: true,
      isAvailable: true,
    });
    assert.doesNotMatch(
      serialized,
      /Must not be exposed/
    );
  } finally {
    mock.restoreAll();
  }
});

test("the category product tools reject invalid category ids without querying", async () => {
  let serviceCalls = 0;
  mock.method(
    categoryService,
    "getCategoryById",
    async () => {
      serviceCalls += 1;
      return { id: 4, name: "Nacatamales" };
    }
  );
  mock.method(
    categoryService,
    "countProductsByCategory",
    async () => {
      serviceCalls += 1;
      return 0;
    }
  );
  mock.method(
    productService,
    "listAdministrativeProducts",
    async () => {
      serviceCalls += 1;
      return { products: [], pagination: { totalItems: 0 } };
    }
  );

  try {
    for (const name of [
      "count_products_by_category",
      "list_products_by_category",
    ]) {
      for (const categoryId of [0, -1, 1.5, "4", null]) {
        await assert.rejects(
          assistantToolRegistry.executeToolCall({
            name,
            arguments: { categoryId },
            role: "EDITOR",
          }),
          (error) =>
            error.code === "INVALID_TOOL_ARGUMENTS"
        );
      }
    }

    assert.equal(serviceCalls, 0);
  } finally {
    mock.restoreAll();
  }
});
