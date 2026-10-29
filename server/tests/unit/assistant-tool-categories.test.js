const test = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("node:test");

Object.assign(process.env, {
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "assistant_categories_test",
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

const categoryService = require(
  "../../src/modules/categories/category.service"
);
const assistantToolRegistry = require(
  "../../src/modules/assistant/assistant.tools"
);
const {
  MAX_ASSISTANT_CATEGORY_SEARCH_RESULTS,
} = require(
  "../../src/modules/assistant/assistant.constants"
);

test("search_categories returns at most ten minimal real category records", async () => {
  const returnedCategories = Array.from(
    {
      length: MAX_ASSISTANT_CATEGORY_SEARCH_RESULTS + 1,
    },
    (_, index) => ({
      id: index + 1,
      name: `Categoría ${index + 1}`,
      isActive: index % 2 === 0,
      slug: `categoria-${index + 1}`,
      description: "Must not be exposed",
      image: { url: "https://cdn.example/image.jpg" },
    })
  );
  const listCategories = mock.method(
    categoryService,
    "listAdministrativeCategories",
    async () => ({
      categories: returnedCategories,
      pagination: {
        totalItems: MAX_ASSISTANT_CATEGORY_SEARCH_RESULTS + 1,
      },
    })
  );

  try {
    for (const role of ["ADMIN", "EDITOR"]) {
      assert.ok(
        assistantToolRegistry
          .getToolDeclarations(role)
          .some((tool) => tool.name === "search_categories")
      );
    }

    const serialized =
      await assistantToolRegistry.executeToolCall({
        name: "search_categories",
        arguments: { query: "  bebida  " },
        role: "EDITOR",
      });
    const result = JSON.parse(serialized);

    assert.deepEqual(
      listCategories.mock.calls[0].arguments[0],
      {
        page: 1,
        limit: MAX_ASSISTANT_CATEGORY_SEARCH_RESULTS + 1,
        name: "bebida",
        sortBy: "name",
        sortOrder: "asc",
      }
    );
    assert.equal(
      result.categories.length,
      MAX_ASSISTANT_CATEGORY_SEARCH_RESULTS
    );
    assert.equal(result.truncated, true);
    assert.deepEqual(result.categories[0], {
      id: 1,
      name: "Categoría 1",
      isActive: true,
    });
    assert.doesNotMatch(
      serialized,
      /Must not be exposed|categoria-1|cdn\.example/
    );
    assert.ok(serialized.length <= 6_000);
  } finally {
    mock.restoreAll();
  }
});

test("search_categories rejects blank and oversized queries", async () => {
  let listCalls = 0;
  mock.method(
    categoryService,
    "listAdministrativeCategories",
    async () => {
      listCalls += 1;
      return {
        categories: [],
        pagination: { totalItems: 0 },
      };
    }
  );

  try {
    for (const query of ["   ", "a".repeat(121)]) {
      await assert.rejects(
        assistantToolRegistry.executeToolCall({
          name: "search_categories",
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
