const test = require("node:test");
const assert = require("node:assert/strict");
const { mock, afterEach } = require("node:test");

Object.assign(process.env, {
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "assistant_action_tools_test",
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
const actionRegistry = require(
  "../../src/modules/assistant/assistant.action-registry"
);
const { executePendingAction } = require(
  "../../src/modules/assistant/assistant.action-executor"
);

afterEach(() => {
  mock.restoreAll();
});

function product(overrides = {}) {
  return {
    id: 12,
    name: "Nacatamal de pollo",
    isAvailable: true,
    isActive: true,
    updatedAt: new Date("2026-10-27T12:00:00.000Z"),
    ...overrides,
  };
}

test("the product availability action is write-only and validates exact arguments", () => {
  const declarations =
    actionRegistry.getActionDeclarations("EDITOR");
  assert.deepEqual(
    declarations.map((declaration) => declaration.name),
    ["set_product_availability"]
  );
  assert.deepEqual(
    declarations[0].parameters.required,
    ["productId", "isAvailable"]
  );
  assert.throws(
    () => actionRegistry.getActionDeclarations("USER"),
    /valid assistant action role/
  );

  assert.deepEqual(
    actionRegistry.validateActionCall({
      name: "set_product_availability",
      arguments: {
        productId: 12,
        isAvailable: false,
      },
      role: "EDITOR",
    }),
    {
      name: "set_product_availability",
      arguments: {
        productId: 12,
        isAvailable: false,
      },
    }
  );
  assert.equal(
    actionRegistry.validateActionCall({
      name: "set_product_availability",
      arguments: {
        productId: 12,
        isAvailable: false,
        categoryId: 2,
      },
      role: "ADMIN",
    }),
    null
  );
});

test("confirming a product action reuses the domain service and returns minimal data", async () => {
  const calls = [];
  mock.method(
    productService,
    "getProductById",
    async (productId) => {
      calls.push(["getProductById", productId]);
      return product();
    }
  );
  mock.method(
    productService,
    "changeProductAvailability",
    async (input) => {
      calls.push(["changeProductAvailability", input]);
      return product({
        isAvailable: input.isAvailable,
        updatedAt: new Date("2026-10-27T12:01:00.000Z"),
      });
    }
  );

  const result = await executePendingAction({
    action: {
      toolName: "set_product_availability",
      targetType: "product",
      targetId: 12,
      targetLabel: "Nacatamal de pollo",
      arguments: {
        productId: 12,
        isAvailable: false,
      },
      before: {
        isAvailable: true,
        updatedAt: "2026-10-27T12:00:00.000Z",
      },
    },
    role: "EDITOR",
  });

  assert.deepEqual(result, {
    result: {
      target: {
        id: 12,
        label: "Nacatamal de pollo",
      },
      isAvailable: false,
    },
    message:
      "El producto «Nacatamal de pollo» ahora está no disponible.",
  });
  assert.deepEqual(calls, [
    ["getProductById", 12],
    [
      "changeProductAvailability",
      { productId: 12, isAvailable: false },
    ],
  ]);
});

test("a stale product snapshot never calls the availability service", async () => {
  let writeCalls = 0;
  mock.method(
    productService,
    "getProductById",
    async () =>
      product({
        updatedAt: new Date("2026-10-27T12:01:00.000Z"),
      })
  );
  mock.method(
    productService,
    "changeProductAvailability",
    async () => {
      writeCalls += 1;
      return product();
    }
  );

  await assert.rejects(
    executePendingAction({
      action: {
        toolName: "set_product_availability",
        targetType: "product",
        targetId: 12,
        targetLabel: "Nacatamal de pollo",
        arguments: {
          productId: 12,
          isAvailable: false,
        },
        before: {
          isAvailable: true,
          updatedAt: "2026-10-27T12:00:00.000Z",
        },
      },
      role: "ADMIN",
    }),
    (error) =>
      error.code === "ASSISTANT_ACTION_CONFLICT"
  );

  assert.equal(writeCalls, 0);
});
