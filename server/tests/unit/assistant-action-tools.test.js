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
const announcementService = require(
  "../../src/modules/announcements/announcement.service"
);
const videoService = require(
  "../../src/modules/videos/video.service"
);
const categoryService = require(
  "../../src/modules/categories/category.service"
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

function announcement(overrides = {}) {
  return {
    id: 42,
    title: "Promo de temporada",
    isActive: false,
    startsAt: null,
    endsAt: null,
    updatedAt: new Date("2026-10-27T12:00:00.000Z"),
    ...overrides,
  };
}

function video(overrides = {}) {
  return {
    id: 73,
    title: "Video de prueba",
    isActive: false,
    uploadStatus: "READY",
    updatedAt: new Date("2026-10-27T12:00:00.000Z"),
    ...overrides,
  };
}

function category(overrides = {}) {
  return {
    id: 21,
    name: "Bebidas",
    isActive: true,
    updatedAt: new Date("2026-10-27T12:00:00.000Z"),
    ...overrides,
  };
}

test("assistant actions are write-only and validate exact arguments", () => {
  const declarations =
    actionRegistry.getActionDeclarations("EDITOR");
  assert.deepEqual(
    declarations.map((declaration) => declaration.name),
    [
      "set_product_availability",
      "set_announcement_active",
      "set_video_active",
      "set_category_active",
    ]
  );
  assert.deepEqual(
    declarations[0].parameters.required,
    ["productId", "isAvailable"]
  );
  assert.deepEqual(
    declarations[1].parameters.required,
    ["announcementId", "isActive"]
  );
  assert.deepEqual(
    declarations[2].parameters.required,
    ["videoId", "isActive"]
  );
  assert.deepEqual(
    declarations[3].parameters.required,
    ["categoryId", "isActive"]
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
  assert.deepEqual(
    actionRegistry.validateActionCall({
      name: "set_category_active",
      arguments: {
        categoryId: 21,
        isActive: false,
      },
      role: "EDITOR",
    }),
    {
      name: "set_category_active",
      arguments: {
        categoryId: 21,
        isActive: false,
      },
    }
  );
  assert.equal(
    actionRegistry.validateActionCall({
      name: "set_category_active",
      arguments: {
        categoryId: 21,
        isActive: false,
        name: "Otra",
      },
      role: "ADMIN",
    }),
    null
  );
  assert.deepEqual(
    actionRegistry.validateActionCall({
      name: "set_video_active",
      arguments: {
        videoId: 73,
        isActive: true,
      },
      role: "EDITOR",
    }),
    {
      name: "set_video_active",
      arguments: {
        videoId: 73,
        isActive: true,
      },
    }
  );
  assert.equal(
    actionRegistry.validateActionCall({
      name: "set_video_active",
      arguments: {
        videoId: 73,
        isActive: true,
        uploadStatus: "READY",
      },
      role: "ADMIN",
    }),
    null
  );
  assert.deepEqual(
    actionRegistry.validateActionCall({
      name: "set_announcement_active",
      arguments: {
        announcementId: 42,
        isActive: true,
      },
      role: "EDITOR",
    }),
    {
      name: "set_announcement_active",
      arguments: {
        announcementId: 42,
        isActive: true,
      },
    }
  );
  assert.equal(
    actionRegistry.validateActionCall({
      name: "set_announcement_active",
      arguments: {
        announcementId: 42,
        isActive: true,
        title: "Changed title",
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

test("confirming an announcement action reuses status service with minimal result", async () => {
  const calls = [];
  mock.method(
    announcementService,
    "getAnnouncementById",
    async (announcementId) => {
      calls.push(["getAnnouncementById", announcementId]);
      return announcement();
    }
  );
  mock.method(
    announcementService,
    "changeAnnouncementStatus",
    async (input) => {
      calls.push(["changeAnnouncementStatus", input]);
      return announcement({
        isActive: input.isActive,
        updatedAt: new Date("2026-10-27T12:01:00.000Z"),
      });
    }
  );

  const result = await executePendingAction({
    action: {
      toolName: "set_announcement_active",
      targetType: "announcement",
      targetId: 42,
      targetLabel: "Promo de temporada",
      arguments: {
        announcementId: 42,
        isActive: true,
      },
      before: {
        isActive: false,
        updatedAt: "2026-10-27T12:00:00.000Z",
      },
    },
    role: "EDITOR",
  });

  assert.deepEqual(result, {
    result: {
      target: {
        id: 42,
        label: "Promo de temporada",
      },
      isActive: true,
    },
    message:
      "El aviso «Promo de temporada» ahora está publicado.",
  });
  assert.deepEqual(calls, [
    ["getAnnouncementById", 42],
    [
      "changeAnnouncementStatus",
      { announcementId: 42, isActive: true },
    ],
  ]);
});

test("announcement action warns about push only when publishing", () => {
  const action = actionRegistry.getActionDefinition(
    "set_announcement_active"
  );
  const target = announcement();

  assert.deepEqual(
    action.getWarnings({
      target,
      arguments: {
        announcementId: 42,
        isActive: true,
      },
    }),
    [
      "Si las notificaciones push están configuradas, publicar el aviso puede enviar una notificación a los suscriptores.",
    ]
  );
  assert.deepEqual(
    action.getWarnings({
      target,
      arguments: {
        announcementId: 42,
        isActive: false,
      },
    }),
    ["El aviso ya está en ese estado."]
  );
  assert.deepEqual(
    action.getWarnings({
      target: announcement({ isActive: true }),
      arguments: {
        announcementId: 42,
        isActive: false,
      },
    }),
    []
  );
});

test("a stale announcement snapshot never calls the status service", async () => {
  let writeCalls = 0;
  mock.method(
    announcementService,
    "getAnnouncementById",
    async () =>
      announcement({
        updatedAt: new Date("2026-10-27T12:01:00.000Z"),
      })
  );
  mock.method(
    announcementService,
    "changeAnnouncementStatus",
    async () => {
      writeCalls += 1;
      return announcement();
    }
  );

  await assert.rejects(
    executePendingAction({
      action: {
        toolName: "set_announcement_active",
        targetType: "announcement",
        targetId: 42,
        targetLabel: "Promo de temporada",
        arguments: {
          announcementId: 42,
          isActive: true,
        },
        before: {
          isActive: false,
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

test("confirming a video action reuses status service without external provider calls", async () => {
  const calls = [];
  mock.method(
    videoService,
    "getVideoById",
    async (videoId) => {
      calls.push(["getVideoById", videoId]);
      return video();
    }
  );
  mock.method(
    videoService,
    "changeVideoStatus",
    async (input) => {
      calls.push(["changeVideoStatus", input]);
      return video({
        isActive: input.isActive,
        updatedAt: new Date("2026-10-27T12:01:00.000Z"),
      });
    }
  );

  const result = await executePendingAction({
    action: {
      toolName: "set_video_active",
      targetType: "video",
      targetId: 73,
      targetLabel: "Video de prueba",
      arguments: { videoId: 73, isActive: true },
      before: {
        isActive: false,
        uploadStatus: "READY",
        updatedAt: "2026-10-27T12:00:00.000Z",
      },
    },
    role: "EDITOR",
  });

  assert.deepEqual(result, {
    result: {
      target: {
        id: 73,
        label: "Video de prueba",
      },
      isActive: true,
    },
    message: "El video «Video de prueba» ahora está publicado.",
  });
  assert.deepEqual(calls, [
    ["getVideoById", 73],
    ["changeVideoStatus", { videoId: 73, isActive: true }],
  ]);
});

test("hiding a DELETED video remains allowed and does not call YouTube", async () => {
  let changeCalls = 0;
  mock.method(
    videoService,
    "getVideoById",
    async () =>
      video({
        isActive: true,
        uploadStatus: "DELETED",
      })
  );
  mock.method(
    videoService,
    "changeVideoStatus",
    async ({ isActive }) => {
      changeCalls += 1;
      return video({
        isActive,
        uploadStatus: "DELETED",
      });
    }
  );

  const result = await executePendingAction({
    action: {
      toolName: "set_video_active",
      targetType: "video",
      targetId: 73,
      targetLabel: "Video de prueba",
      arguments: { videoId: 73, isActive: false },
      before: {
        isActive: true,
        uploadStatus: "DELETED",
        updatedAt: "2026-10-27T12:00:00.000Z",
      },
    },
    role: "ADMIN",
  });

  assert.equal(result.result.isActive, false);
  assert.equal(changeCalls, 1);
});

test("a stale video upload status never calls the status service", async () => {
  let writeCalls = 0;
  mock.method(
    videoService,
    "getVideoById",
    async () =>
      video({
        uploadStatus: "PROCESSING",
        updatedAt: new Date("2026-10-27T12:01:00.000Z"),
      })
  );
  mock.method(
    videoService,
    "changeVideoStatus",
    async () => {
      writeCalls += 1;
      return video();
    }
  );

  await assert.rejects(
    executePendingAction({
      action: {
        toolName: "set_video_active",
        targetType: "video",
        targetId: 73,
        targetLabel: "Video de prueba",
        arguments: { videoId: 73, isActive: true },
        before: {
          isActive: false,
          uploadStatus: "READY",
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

test("confirming a category action reuses status service without touching products", async () => {
  const calls = [];
  mock.method(
    categoryService,
    "getCategoryById",
    async (categoryId) => {
      calls.push(["getCategoryById", categoryId]);
      return category();
    }
  );
  mock.method(
    categoryService,
    "changeCategoryStatus",
    async (input) => {
      calls.push(["changeCategoryStatus", input]);
      return category({
        isActive: input.isActive,
        updatedAt: new Date("2026-10-27T12:01:00.000Z"),
      });
    }
  );

  const result = await executePendingAction({
    action: {
      toolName: "set_category_active",
      targetType: "category",
      targetId: 21,
      targetLabel: "Bebidas",
      arguments: { categoryId: 21, isActive: false },
      before: {
        isActive: true,
        updatedAt: "2026-10-27T12:00:00.000Z",
      },
    },
    role: "EDITOR",
  });

  assert.deepEqual(result, {
    result: {
      target: {
        id: 21,
        label: "Bebidas",
      },
      isActive: false,
    },
    message: "La categoría «Bebidas» ahora está oculta.",
  });
  assert.deepEqual(calls, [
    ["getCategoryById", 21],
    [
      "changeCategoryStatus",
      { categoryId: 21, isActive: false },
    ],
  ]);
});

test("category action warns that hiding affects visibility only", () => {
  const action = actionRegistry.getActionDefinition(
    "set_category_active"
  );
  const target = category();

  assert.deepEqual(
    action.getWarnings({
      target,
      arguments: {
        categoryId: 21,
        isActive: false,
      },
    }),
    [
      "Al ocultar esta categoría, sus productos dejarán de mostrarse en el menú. Los productos no se borran ni se modifican.",
    ]
  );
  assert.deepEqual(
    action.getWarnings({
      target,
      arguments: {
        categoryId: 21,
        isActive: true,
      },
    }),
    ["La categoría ya está en ese estado."]
  );
  assert.deepEqual(
    action.getWarnings({
      target: category({ isActive: false }),
      arguments: {
        categoryId: 21,
        isActive: true,
      },
    }),
    []
  );
});

test("a stale category snapshot never calls the status service", async () => {
  let writeCalls = 0;
  mock.method(
    categoryService,
    "getCategoryById",
    async () =>
      category({
        updatedAt: new Date("2026-10-27T12:01:00.000Z"),
      })
  );
  mock.method(
    categoryService,
    "changeCategoryStatus",
    async () => {
      writeCalls += 1;
      return category();
    }
  );

  await assert.rejects(
    executePendingAction({
      action: {
        toolName: "set_category_active",
        targetType: "category",
        targetId: 21,
        targetLabel: "Bebidas",
        arguments: { categoryId: 21, isActive: false },
        before: {
          isActive: true,
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
