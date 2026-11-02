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
const userService = require(
  "../../src/modules/users/user.service"
);
const notificationService = require(
  "../../src/modules/notification/notification.service"
);
const photosService = require(
  "../../src/modules/photos/photos.service"
);
const mediaService = require(
  "../../src/modules/media/media.service"
);
const mediaRepository = require(
  "../../src/modules/media/media.repository"
);
const actionService = require(
  "../../src/modules/assistant/assistant.action.service"
);
const actionRegistry = require(
  "../../src/modules/assistant/assistant.action-registry"
);
const actionRepository = require(
  "../../src/modules/assistant/assistant.action.repository"
);
const { executePendingAction } = require(
  "../../src/modules/assistant/assistant.action-executor"
);
const {
  MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS,
} = require(
  "../../src/modules/assistant/assistant.constants"
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

function photo(overrides = {}) {
  return {
    id: 91,
    caption: "Foto de la casa",
    isActive: true,
    sortOrder: 0,
    image: {
      id: 4,
      altText: "Postre",
    },
    updatedAt: new Date("2026-10-27T12:00:00.000Z"),
    ...overrides,
  };
}

function userRecord(overrides = {}) {
  return {
    id: 7,
    email: "editor@example.test",
    role: "EDITOR",
    isActive: true,
    updatedAt: new Date("2026-10-27T12:00:00.000Z"),
    ...overrides,
  };
}

function media(overrides = {}) {
  return {
    id: 7,
    altText: "Postre",
    publicId: "media/postre.jpg",
    isActive: true,
    resourceType: "IMAGE",
    width: 800,
    height: 600,
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
      "create_category",
      "update_category",
      "delete_category",
      "create_product",
      "update_product",
      "set_product_active",
      "delete_product",
      "move_products_to_category",
      "set_products_availability",
      "set_products_active",
      "create_announcement",
      "update_announcement",
      "delete_announcement",
      "notify_announcement",
      "create_photo",
      "update_photo",
      "set_photo_active",
      "delete_photo",
      "delete_media",
      "update_video",
      "restore_video_thumbnail",
      "update_business_info",
      "update_contact_info",
      "update_schedule",
      "update_location",
    ]
  );
  assert.deepEqual(
    actionRegistry
      .getActionDeclarations("ADMIN")
      .filter((declaration) =>
        [
          "set_user_active",
          "change_user_role",
          "revoke_user_sessions",
        ].includes(declaration.name)
      )
      .map((declaration) => declaration.name),
    [
      "set_user_active",
      "change_user_role",
      "revoke_user_sessions",
    ]
  );
  assert.equal(
    actionRegistry
      .getActionDeclarations("EDITOR")
      .some((declaration) =>
        declaration.name.endsWith("_user_active") ||
        declaration.name.endsWith("_user_role") ||
        declaration.name === "revoke_user_sessions"
      ),
    false
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
  assert.deepEqual(
    declarations[4].parameters.required,
    ["name"]
  );
  assert.deepEqual(
    declarations[5].parameters.required,
    ["categoryId"]
  );
  assert.deepEqual(
    declarations[6].parameters.required,
    ["categoryId"]
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

  assert.deepEqual(
    actionRegistry.validateActionCall({
      name: "create_category",
      arguments: { name: "Postres" },
      role: "EDITOR",
    }),
    {
      name: "create_category",
      arguments: { name: "Postres" },
    }
  );
  assert.deepEqual(
    actionRegistry.validateActionCall({
      name: "create_category",
      arguments: { name: "Bebidas", sortOrder: 3 },
      role: "ADMIN",
    }),
    {
      name: "create_category",
      arguments: { name: "Bebidas", sortOrder: 3 },
    }
  );
  assert.equal(
    actionRegistry.validateActionCall({
      name: "create_category",
      arguments: { name: "   " },
      role: "ADMIN",
    }),
    null
  );
  assert.deepEqual(
    actionRegistry.validateActionCall({
      name: "update_category",
      arguments: { categoryId: 4, name: "Postres" },
      role: "EDITOR",
    }),
    {
      name: "update_category",
      arguments: { categoryId: 4, name: "Postres" },
    }
  );
  assert.equal(
    actionRegistry.validateActionCall({
      name: "update_category",
      arguments: { categoryId: 4 },
      role: "ADMIN",
    }),
    null
  );
  assert.deepEqual(
    actionRegistry.validateActionCall({
      name: "delete_category",
      arguments: { categoryId: 4 },
      role: "EDITOR",
    }),
    {
      name: "delete_category",
      arguments: { categoryId: 4 },
    }
  );
  assert.equal(
    actionRegistry.validateActionCall({
      name: "delete_category",
      arguments: { categoryId: 4, name: "Postres" },
      role: "ADMIN",
    }),
    null
  );
  assert.deepEqual(
    actionRegistry.validateActionCall({
      name: "set_user_active",
      arguments: { userId: 7, isActive: false },
      role: "ADMIN",
    }),
    {
      name: "set_user_active",
      arguments: { userId: 7, isActive: false },
    }
  );
  assert.equal(
    actionRegistry.validateActionCall({
      name: "set_user_active",
      arguments: { userId: 7, isActive: false },
      role: "EDITOR",
    }),
    null
  );
  assert.deepEqual(
    actionRegistry.validateActionCall({
      name: "change_user_role",
      arguments: { userId: 7, role: "ADMIN" },
      role: "ADMIN",
    }),
    {
      name: "change_user_role",
      arguments: { userId: 7, role: "ADMIN" },
    }
  );
  assert.equal(
    actionRegistry.validateActionCall({
      name: "change_user_role",
      arguments: { userId: 7, role: "USER" },
      role: "ADMIN",
    }),
    null
  );
  assert.deepEqual(
    actionRegistry.validateActionCall({
      name: "revoke_user_sessions",
      arguments: { userId: 7 },
      role: "ADMIN",
    }),
    {
      name: "revoke_user_sessions",
      arguments: { userId: 7 },
    }
  );
});

test("user actions preserve email and role in their conflict snapshots", () => {
  for (const name of [
    "set_user_active",
    "change_user_role",
    "revoke_user_sessions",
  ]) {
    const definition =
      actionRegistry.getActionDefinition(name);

    assert.deepEqual(
      definition.getSnapshot(userRecord()),
      {
        email: "editor@example.test",
        role: "EDITOR",
        isActive: true,
        updatedAt: "2026-10-27T12:00:00.000Z",
      }
    );
  }
});

test("a role change invalidates a pending user-status action", async () => {
  let writeCalls = 0;
  mock.method(
    userService,
    "getUserById",
    async () => userRecord({ role: "ADMIN" })
  );
  mock.method(
    userService,
    "changeUserStatus",
    async () => {
      writeCalls += 1;
      return userRecord();
    }
  );

  await assert.rejects(
    executePendingAction({
      action: {
        toolName: "set_user_active",
        targetType: "user",
        targetId: 7,
        targetLabel: "editor@example.test",
        arguments: { userId: 7, isActive: false },
        before: {
          email: "editor@example.test",
          role: "EDITOR",
          isActive: true,
          updatedAt: "2026-10-27T12:00:00.000Z",
        },
      },
      role: "ADMIN",
      actorId: 1,
    }),
    (error) =>
      error.code === "ASSISTANT_ACTION_CONFLICT"
  );
  assert.equal(writeCalls, 0);
});

test("an email change invalidates a pending session-revocation action", async () => {
  let revokeCalls = 0;
  mock.method(
    userService,
    "getUserById",
    async () =>
      userRecord({ email: "new-editor@example.test" })
  );
  mock.method(
    userService,
    "revokeUserSessions",
    async () => {
      revokeCalls += 1;
      return 0;
    }
  );

  await assert.rejects(
    executePendingAction({
      action: {
        toolName: "revoke_user_sessions",
        targetType: "user",
        targetId: 7,
        targetLabel: "new-editor@example.test",
        arguments: { userId: 7 },
        before: {
          email: "editor@example.test",
          role: "EDITOR",
          isActive: true,
          updatedAt: "2026-10-27T12:00:00.000Z",
        },
      },
      role: "ADMIN",
      actorId: 1,
    }),
    (error) =>
      error.code === "ASSISTANT_ACTION_CONFLICT"
  );
  assert.equal(revokeCalls, 0);
});

test("set_user_active forwards the confirming admin and rejects self-deactivation", async () => {
  const calls = [];
  mock.method(
    userService,
    "getUserById",
    async (userId) => userRecord({ id: userId })
  );
  mock.method(
    userService,
    "changeUserStatus",
    async (input) => {
      calls.push(input);
      return userRecord({
        id: input.userId,
        isActive: input.isActive,
        updatedAt: new Date("2026-10-27T12:01:00.000Z"),
      });
    }
  );

  const definition =
    actionRegistry.getActionDefinition("set_user_active");
  assert.equal(
    await definition.getProposalRejectionMessage({
      target: userRecord(),
      arguments: { userId: 7, isActive: false },
      currentUser: { id: 7, role: "ADMIN" },
    }),
    "No podés desactivar tu propia cuenta."
  );

  const execution = await executePendingAction({
    action: {
      toolName: "set_user_active",
      targetType: "user",
      targetId: 7,
      targetLabel: "editor@example.test",
      arguments: { userId: 7, isActive: false },
      before: {
        email: "editor@example.test",
        role: "EDITOR",
        isActive: true,
        updatedAt: "2026-10-27T12:00:00.000Z",
      },
    },
    role: "ADMIN",
    actorId: 1,
  });

  assert.deepEqual(calls, [
    { userId: 7, isActive: false, actorId: 1 },
  ]);
  assert.equal(
    execution.message,
    "El usuario «editor@example.test» ahora está inactivo."
  );
});

test("change_user_role reuses the domain service after a full snapshot check", async () => {
  let updated;
  mock.method(
    userService,
    "getUserById",
    async (userId) => userRecord({ id: userId })
  );
  mock.method(
    userService,
    "changeUserRole",
    async (input) => {
      updated = input;
      return userRecord({
        id: input.userId,
        role: input.role,
        updatedAt: new Date("2026-10-27T12:01:00.000Z"),
      });
    }
  );

  const execution = await executePendingAction({
    action: {
      toolName: "change_user_role",
      targetType: "user",
      targetId: 7,
      targetLabel: "editor@example.test",
      arguments: { userId: 7, role: "ADMIN" },
      before: {
        email: "editor@example.test",
        role: "EDITOR",
        isActive: true,
        updatedAt: "2026-10-27T12:00:00.000Z",
      },
    },
    role: "ADMIN",
    actorId: 1,
  });

  assert.deepEqual(updated, { userId: 7, role: "ADMIN" });
  assert.equal(
    execution.message,
    "El rol del usuario «editor@example.test» ahora es ADMIN."
  );
});

test("revoke_user_sessions reports the service's revoked-session count", async () => {
  let revokedUserId;
  mock.method(
    userService,
    "getUserById",
    async (userId) => userRecord({ id: userId })
  );
  mock.method(
    userService,
    "revokeUserSessions",
    async (userId) => {
      revokedUserId = userId;
      return 3;
    }
  );

  const execution = await executePendingAction({
    action: {
      toolName: "revoke_user_sessions",
      targetType: "user",
      targetId: 7,
      targetLabel: "editor@example.test",
      arguments: { userId: 7 },
      before: {
        email: "editor@example.test",
        role: "EDITOR",
        isActive: true,
        updatedAt: "2026-10-27T12:00:00.000Z",
      },
    },
    role: "ADMIN",
    actorId: 1,
  });

  assert.equal(revokedUserId, 7);
  assert.equal(
    execution.message,
    "Se revocaron 3 sesiones activas de «editor@example.test»."
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

test("confirming a category creation adds the slug and returns minimal data", async () => {
  const calls = [];
  mock.method(
    categoryService,
    "createCategory",
    async (input) => {
      calls.push(input);
      return category({
        id: 9,
        name: input.name,
        slug: input.slug,
        description: input.description,
        sortOrder: input.sortOrder,
        imageMediaId: input.imageMediaId,
      });
    }
  );

  const result = await executePendingAction({
    action: {
      toolName: "create_category",
      targetType: "category",
      targetId: 0,
      targetLabel: "Postres",
      arguments: { name: "Postres" },
      before: null,
    },
    role: "EDITOR",
  });

  assert.deepEqual(result, {
    result: {
      target: {
        id: 9,
        label: "Postres",
      },
      created: true,
    },
    message: "La categoría «Postres» se creó.",
  });
  assert.deepEqual(calls, [
    {
      name: "Postres",
      slug: "postres",
      description: null,
      sortOrder: 0,
      imageMediaId: null,
    },
  ]);
});

test("confirming a category update regenerates the slug from the new name", async () => {
  const calls = [];
  mock.method(categoryService, "getCategoryById", async () =>
    category({
      id: 21,
      name: "Bebidas",
      description: null,
      sortOrder: 0,
      imageMediaId: null,
    })
  );
  mock.method(
    categoryService,
    "updateCategory",
    async (input) => {
      calls.push(input);
      return category({
        id: 21,
        name: input.updates.name,
        description: input.updates.description,
        sortOrder: input.updates.sortOrder,
        imageMediaId: input.updates.imageMediaId,
        updatedAt: new Date("2026-10-27T12:01:00.000Z"),
      });
    }
  );

  const result = await executePendingAction({
    action: {
      toolName: "update_category",
      targetType: "category",
      targetId: 21,
      targetLabel: "Bebidas",
      arguments: {
        categoryId: 21,
        name: "Bebidas frías",
        sortOrder: 2,
      },
      before: {
        name: "Bebidas",
        description: null,
        sortOrder: 0,
        imageMediaId: null,
        updatedAt: "2026-10-27T12:00:00.000Z",
      },
    },
    role: "ADMIN",
  });

  assert.deepEqual(result, {
    result: {
      target: {
        id: 21,
        label: "Bebidas frías",
      },
      updated: true,
    },
    message: "La categoría «Bebidas frías» se actualizó.",
  });
  assert.deepEqual(calls, [
    {
      categoryId: 21,
      updates: {
        name: "Bebidas frías",
        sortOrder: 2,
        slug: "bebidas-frias",
      },
    },
  ]);
});

function bulkTarget(overrides = {}) {
  return {
    id: 21,
    name: "Bebidas",
    productCount: 2,
    productNames: ["Café", "Flan"],
    ...overrides,
  };
}

test("bulk product actions validate exact arguments", () => {
  const valid = {
    move_products_to_category: {
      arguments: { fromCategoryId: 21, toCategoryId: 22 },
      state: ["fromCategoryId", 21],
    },
    set_products_availability: {
      arguments: { categoryId: 21, isAvailable: false },
      state: ["isAvailable", false],
    },
    set_products_active: {
      arguments: { categoryId: 21, isActive: true },
      state: ["isActive", true],
    },
  };

  for (const [name, { arguments: argumentsValue, state }] of Object.entries(valid)) {
    const validated = actionRegistry.validateActionCall({
      name,
      arguments: argumentsValue,
      role: "EDITOR",
    });

    assert.deepEqual(validated.arguments, argumentsValue);
    assert.equal(validated.arguments[state[0]], state[1]);

    for (const broken of [
      {},
      { ...argumentsValue, extra: true },
      { ...argumentsValue, [state[0]]: 0 },
      { ...argumentsValue, [state[0]]: "1" },
      { ...argumentsValue, [state[0]]: 1.5 },
    ]) {
      assert.equal(
        actionRegistry.validateActionCall({
          name,
          arguments: broken,
          role: "EDITOR",
        }),
        null,
        `${name} accepted ${JSON.stringify(broken)}`
      );
    }
  }
});

test("confirming a bulk availability action applies it to the whole category", async () => {
  const calls = [];
  mock.method(
    categoryService,
    "getCategoryById",
    async (categoryId) => {
      calls.push(["getCategoryById", categoryId]);
      return category({ id: 21, name: "Bebidas" });
    }
  );
  mock.method(
    productService,
    "listAdministrativeProducts",
    async (filters) => {
      calls.push(["listAdministrativeProducts", filters]);
      return {
        products: [
          { id: 31, name: "Café" },
          { id: 32, name: "Flan" },
        ],
        pagination: { totalItems: 2 },
      };
    }
  );
  mock.method(
    productService,
    "changeProductsAvailabilityByCategory",
    async (input) => {
      calls.push([
        "changeProductsAvailabilityByCategory",
        input,
      ]);
      return {
        categoryId: input.categoryId,
        isAvailable: input.isAvailable,
        appliedCount: 2,
      };
    }
  );

  const result = await executePendingAction({
    action: {
      toolName: "set_products_availability",
      targetType: "category",
      targetId: 21,
      targetLabel: "Bebidas",
      arguments: { categoryId: 21, isAvailable: false },
      before: { categoryId: 21, productCount: 2 },
    },
    role: "EDITOR",
  });

  assert.deepEqual(result, {
    result: {
      target: { id: 21, label: "Bebidas" },
      isAvailable: false,
      appliedCount: 2,
      productCount: 2,
    },
    message:
      "Se actualizaron 2 productos de «Bebidas» como no disponibles.",
  });
  assert.deepEqual(calls, [
    ["getCategoryById", 21],
    [
      "listAdministrativeProducts",
      {
        page: 1,
        limit: MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS + 1,
        categoryId: 21,
        sortBy: "name",
        sortOrder: "asc",
      },
    ],
    [
      "changeProductsAvailabilityByCategory",
      { categoryId: 21, isAvailable: false },
    ],
  ]);
});

test("confirming a bulk move reports the applied count and both categories", async () => {
  const calls = [];
  mock.method(
    categoryService,
    "getCategoryById",
    async (categoryId) => {
      calls.push(["getCategoryById", categoryId]);
      return categoryId === 22
        ? category({ id: 22, name: "Postres" })
        : category({ id: 21, name: "Bebidas" });
    }
  );
  mock.method(
    productService,
    "listAdministrativeProducts",
    async () => ({
      products: [{ id: 31, name: "Flan" }],
      pagination: { totalItems: 1 },
    })
  );
  mock.method(
    productService,
    "moveProductsToCategory",
    async (input) => {
      calls.push(["moveProductsToCategory", input]);
      return { ...input, appliedCount: 1 };
    }
  );

  const result = await executePendingAction({
    action: {
      toolName: "move_products_to_category",
      targetType: "category",
      targetId: 21,
      targetLabel: "Bebidas",
      arguments: { fromCategoryId: 21, toCategoryId: 22 },
      before: {
        categoryId: 21,
        productCount: 1,
        destinationId: 22,
        destinationName: "Postres",
      },
    },
    role: "EDITOR",
  });

  assert.deepEqual(result, {
    result: {
      target: { id: 21, label: "Bebidas" },
      destination: { id: 22, label: "Postres" },
      appliedCount: 1,
      productCount: 1,
    },
    message: "Se movió 1 producto de «Bebidas» a «Postres».",
  });
  assert.deepEqual(calls.at(-1), [
    "moveProductsToCategory",
    { fromCategoryId: 21, toCategoryId: 22 },
  ]);
});

test("a changed product count never runs a bulk move", async () => {
  mock.method(
    categoryService,
    "getCategoryById",
    async (categoryId) =>
      categoryId === 22
        ? category({ id: 22, name: "Postres" })
        : category({ id: 21, name: "Bebidas" })
  );
  mock.method(
    productService,
    "listAdministrativeProducts",
    async () => ({
      products: [{ id: 31, name: "Flan" }],
      pagination: { totalItems: 3 },
    })
  );
  let moveCalls = 0;
  mock.method(
    productService,
    "moveProductsToCategory",
    async () => {
      moveCalls += 1;
      return { appliedCount: 1 };
    }
  );

  await assert.rejects(
    executePendingAction({
      action: {
        toolName: "move_products_to_category",
        targetType: "category",
        targetId: 21,
        targetLabel: "Bebidas",
        arguments: { fromCategoryId: 21, toCategoryId: 22 },
        before: {
          categoryId: 21,
          productCount: 1,
          destinationId: 22,
          destinationName: "Postres",
        },
      },
      role: "EDITOR",
    }),
    (error) => error.code === "ASSISTANT_ACTION_CONFLICT"
  );

  assert.equal(moveCalls, 0);
});

test("bulk move rejects the same category and a hidden destination", async () => {
  const definition = actionRegistry.getActionDefinition(
    "move_products_to_category"
  );
  const target = {
    ...bulkTarget(),
    destination: {
      id: 22,
      name: "Postres",
      isActive: true,
    },
  };

  assert.equal(
    await definition.getProposalRejectionMessage({
      target,
      arguments: { fromCategoryId: 21, toCategoryId: 21 },
    }),
    "La categoría de origen y la de destino son la misma."
  );
  assert.equal(
    await definition.getProposalRejectionMessage({
      target: {
        ...target,
        destination: {
          id: 22,
          name: "Postres",
          isActive: false,
        },
      },
      arguments: { fromCategoryId: 21, toCategoryId: 22 },
    }),
    "La categoría «Postres» está oculta. Mostrala primero para poder mover productos ahí."
  );
  assert.equal(
    await definition.getProposalRejectionMessage({
      target,
      arguments: { fromCategoryId: 21, toCategoryId: 22 },
    }),
    null
  );
});

test("bulk cards carry the product count, the names and their warnings", () => {
  const definition = actionRegistry.getActionDefinition(
    "move_products_to_category"
  );
  const target = {
    ...bulkTarget(),
    destination: {
      id: 22,
      name: "Postres",
      isActive: true,
    },
  };
  const argumentsValue = {
    fromCategoryId: 21,
    toCategoryId: 22,
  };

  assert.equal(
    definition.createSummary({ target, arguments: argumentsValue }),
    "Mover 2 productos de «Bebidas» a «Postres»"
  );
  assert.deepEqual(
    definition.getChanges({ target, arguments: argumentsValue }),
    [
      { field: "categoryId", from: "Bebidas", to: "Postres" },
      { field: "productCount", from: 0, to: 2 },
      {
        field: "productNames",
        from: [],
        to: ["Café", "Flan"],
      },
    ]
  );
  assert.deepEqual(
    definition.getWarnings({ target, arguments: argumentsValue }),
    []
  );

  const truncated = {
    ...target,
    productCount: MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS + 10,
    productNames: Array.from(
      { length: MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS },
      (_, index) => `Producto ${index + 1}`
    ),
  };
  assert.deepEqual(
    definition.getWarnings({
      target: truncated,
      arguments: argumentsValue,
    }),
    [
      `Se listan los primeros ${MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS} de ${MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS + 10} productos.`,
    ]
  );

  const empty = {
    ...target,
    productCount: 0,
    productNames: [],
  };
  assert.deepEqual(
    definition.getWarnings({
      target: empty,
      arguments: argumentsValue,
    }),
    [
      "La categoría «Bebidas» no tiene productos, así que no se va a cambiar nada.",
    ]
  );
});

test("bulk state actions keep their own warnings", () => {
  const definition = actionRegistry.getActionDefinition(
    "set_products_active"
  );
  const target = bulkTarget();
  const warnings = definition.getWarnings({
    target,
    arguments: { categoryId: 21, isActive: false },
  });

  assert.deepEqual(warnings, [
    "Los productos dejan de verse en el menú, pero no se borran ni se modifican.",
  ]);
  assert.deepEqual(
    definition.getWarnings({
      target,
      arguments: { categoryId: 21, isActive: true },
    }),
    []
  );
  assert.equal(
    definition.createSummary({
      target: bulkTarget({ productCount: 1, productNames: ["Café"] }),
      arguments: { categoryId: 21, isActive: false },
    }),
    "Ocultar 1 producto de «Bebidas»"
  );
});

function announcementTarget(overrides = {}) {
  return {
    id: 42,
    title: "Promo de temporada",
    content: "Texto original",
    type: "INFO",
    isActive: false,
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    imageMediaId: null,
    updatedAt: new Date("2026-10-27T12:00:00.000Z"),
    ...overrides,
  };
}

test("announcement actions accept only their exact fields", () => {
  const valid = {
    create_announcement: {
      title: "Promo de fin de semana",
      content: "Nacatamales a C$30",
    },
    update_announcement: {
      announcementId: 42,
      content: "Mensaje nuevo",
    },
    delete_announcement: { announcementId: 42 },
  };

  for (const [name, argumentsValue] of Object.entries(valid)) {
    const validated = actionRegistry.validateActionCall({
      name,
      arguments: argumentsValue,
      role: "EDITOR",
    });

    assert.deepEqual(validated.arguments, argumentsValue);
  }

  for (const broken of [
    { name: "create_announcement", arguments: { title: "Solo título" } },
    {
      name: "create_announcement",
      arguments: { title: "Aviso", content: "   " },
    },
    {
      name: "create_announcement",
      arguments: {
        title: "Aviso",
        content: "Texto",
        type: "OTRO",
      },
    },
    {
      name: "create_announcement",
      arguments: {
        title: "Aviso",
        content: "Texto",
        startsAt: "2026-11-02",
      },
    },
    {
      name: "create_announcement",
      arguments: {
        title: "Aviso",
        content: "Texto",
        startsAt: "2026-11-03T10:00:00.000Z",
        endsAt: "2026-11-02T10:00:00.000Z",
      },
    },
    { name: "update_announcement", arguments: { announcementId: 42 } },
    {
      name: "update_announcement",
      arguments: { announcementId: 0, content: "Texto" },
    },
    {
      name: "delete_announcement",
      arguments: { announcementId: 42, title: "Aviso" },
    },
  ]) {
    assert.equal(
      actionRegistry.validateActionCall({
        ...broken,
        role: "EDITOR",
      }),
      null
    );
  }
});

test("confirming an announcement creation keeps the dates and publishes on request", async () => {
  const createCalls = [];
  const statusCalls = [];

  mock.method(
    announcementService,
    "createAnnouncement",
    async (input) => {
      createCalls.push(input);
      return announcementTarget({
        id: 55,
        title: input.title,
        content: input.content,
        type: input.type,
        startsAt: input.startsAt?.toISOString() ?? null,
        endsAt: input.endsAt?.toISOString() ?? null,
        sortOrder: input.sortOrder,
        imageMediaId: input.imageMediaId,
      });
    }
  );
  mock.method(
    announcementService,
    "changeAnnouncementStatus",
    async ({ announcementId, isActive }) => {
      statusCalls.push({ announcementId, isActive });
      return announcementTarget({
        id: announcementId,
        title: "Promo de fin de semana",
        isActive,
      });
    }
  );

  const draft = await executePendingAction({
    action: {
      toolName: "create_announcement",
      targetType: "announcement",
      targetId: 0,
      targetLabel: "Promo de fin de semana",
      arguments: {
        title: "Promo de fin de semana",
        content: "Nacatamales a C$30",
      },
      before: null,
    },
    role: "EDITOR",
  });

  assert.deepEqual(draft, {
    result: {
      target: { id: 55, label: "Promo de fin de semana" },
      isActive: false,
    },
    message:
      "El aviso «Promo de fin de semana» se creó como borrador.",
  });
  assert.deepEqual(createCalls[0], {
    title: "Promo de fin de semana",
    content: "Nacatamales a C$30",
    type: "INFO",
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    imageMediaId: null,
  });
  assert.equal(statusCalls.length, 0);

  const published = await executePendingAction({
    action: {
      toolName: "create_announcement",
      targetType: "announcement",
      targetId: 0,
      targetLabel: "Promo de fin de semana",
      arguments: {
        title: "Promo de fin de semana",
        content: "Nacatamales a C$30",
        type: "PROMOTION",
        startsAt: "2026-11-02T10:00:00.000Z",
        isActive: true,
      },
      before: null,
    },
    role: "EDITOR",
  });

  assert.deepEqual(published, {
    result: {
      target: { id: 55, label: "Promo de fin de semana" },
      isActive: true,
    },
    message:
      "El aviso «Promo de fin de semana» se creó y quedó publicado.",
  });
  assert.ok(createCalls[1].startsAt instanceof Date);
  assert.deepEqual(statusCalls, [
    { announcementId: 55, isActive: true },
  ]);
});

test("confirming an announcement update converts the ISO dates", async () => {
  const updateCalls = [];

  mock.method(
    announcementService,
    "getAnnouncementById",
    async () => announcementTarget()
  );
  mock.method(
    announcementService,
    "updateAnnouncement",
    async (input) => {
      updateCalls.push(input);
      return announcementTarget({
        content: input.updates.content,
        startsAt: input.updates.startsAt.toISOString(),
        updatedAt: new Date("2026-10-27T12:05:00.000Z"),
      });
    }
  );

  const result = await executePendingAction({
    action: {
      toolName: "update_announcement",
      targetType: "announcement",
      targetId: 42,
      targetLabel: "Promo de temporada",
      arguments: {
        announcementId: 42,
        content: "Texto nuevo",
        startsAt: "2026-11-02T10:00:00.000Z",
      },
      before: {
        title: "Promo de temporada",
        content: "Texto original",
        type: "INFO",
        startsAt: null,
        endsAt: null,
        sortOrder: 0,
        imageMediaId: null,
        isActive: false,
        updatedAt: "2026-10-27T12:00:00.000Z",
      },
    },
    role: "ADMIN",
  });

  assert.deepEqual(updateCalls, [
    {
      announcementId: 42,
      updates: {
        content: "Texto nuevo",
        startsAt: new Date("2026-11-02T10:00:00.000Z"),
      },
    },
  ]);
  assert.deepEqual(result, {
    result: {
      target: { id: 42, label: "Promo de temporada" },
      updated: true,
    },
    message: "El aviso «Promo de temporada» se actualizó.",
  });
});

test("announcement schedule rejections happen before confirming", () => {
  const definition = actionRegistry.getActionDefinition(
    "update_announcement"
  );

  assert.equal(
    definition.getProposalRejectionMessage({
      target: announcementTarget(),
      arguments: {
        announcementId: 42,
        endsAt: "2026-10-01T10:00:00.000Z",
      },
    }),
    "La fecha de fin ya pasó: elegí una fecha futura o dejá el aviso sin fecha de fin."
  );
  assert.equal(
    definition.getProposalRejectionMessage({
      target: announcementTarget(),
      arguments: {
        announcementId: 42,
        startsAt: "2026-12-03T10:00:00.000Z",
        endsAt: "2026-12-02T10:00:00.000Z",
      },
    }),
    "La fecha de fin debe ser posterior a la fecha de inicio."
  );
  assert.equal(
    definition.getProposalRejectionMessage({
      target: announcementTarget(),
      arguments: {
        announcementId: 42,
        endsAt: null,
        startsAt: "2099-01-01T10:00:00.000Z",
      },
    }),
    null
  );
});

test("confirming an announcement deletion warns about the image and keeps it", async () => {  const deleteCalls = [];
  const current = announcementTarget({
    isActive: true,
    imageMediaId: 9,
  });

  mock.method(
    announcementService,
    "getAnnouncementById",
    async () => current
  );
  mock.method(
    announcementService,
    "deleteAnnouncement",
    async (announcementId) => {
      deleteCalls.push(announcementId);
      return true;
    }
  );

  const definition = actionRegistry.getActionDefinition(
    "delete_announcement"
  );

  assert.deepEqual(
    definition.getWarnings({ target: current }),
    [
      "Se borrará el aviso «Promo de temporada», que está publicado y dejará de verse en el sitio. La imagen de la galería se conserva.",
    ]
  );

  const result = await executePendingAction({
    action: {
      toolName: "delete_announcement",
      targetType: "announcement",
      targetId: 42,
      targetLabel: "Promo de temporada",
      arguments: { announcementId: 42 },
      before: {
        title: "Promo de temporada",
        isActive: true,
        updatedAt: "2026-10-27T12:00:00.000Z",
      },
    },
    role: "EDITOR",
  });

  assert.deepEqual(deleteCalls, [42]);
  assert.deepEqual(result, {
    result: {
      target: { id: 42, label: "Promo de temporada" },
      deleted: true,
    },
    message: "El aviso «Promo de temporada» se borró.",
  });
});

function visibleAnnouncement(overrides = {}) {
  return announcementTarget({
    isActive: true,
    ...overrides,
  });
}

test("notify_announcement accepts only the announcement id", () => {
  assert.deepEqual(
    actionRegistry.validateActionCall({
      name: "notify_announcement",
      arguments: { announcementId: 42 },
      role: "EDITOR",
    }).arguments,
    { announcementId: 42 }
  );

  for (const broken of [
    {},
    { announcementId: 0 },
    { announcementId: 42, isActive: true },
  ]) {
    assert.equal(
      actionRegistry.validateActionCall({
        name: "notify_announcement",
        arguments: broken,
        role: "EDITOR",
      }),
      null
    );
  }
});

test("notify_announcement is rejected before confirming when push is off or the announcement is not visible", () => {
  const definition = actionRegistry.getActionDefinition(
    "notify_announcement"
  );
  const reject = (target) =>
    definition.getProposalRejectionMessage({ target });

  mock.method(
    notificationService,
    "getPublicKeyConfig",
    () => ({ enabled: false, publicKey: null })
  );

  assert.equal(
    reject(visibleAnnouncement()),
    "Las notificaciones push no están configuradas en el servidor, así que este aviso no se puede notificar."
  );

  mock.restoreAll();
  mock.method(
    notificationService,
    "getPublicKeyConfig",
    () => ({ enabled: true, publicKey: "key" })
  );

  assert.equal(
    reject(announcementTarget({ isActive: false })),
    "El aviso está oculto: publicalo antes de enviar la notificación."
  );
  assert.equal(
    reject(
      visibleAnnouncement({
        startsAt: "2099-01-01T10:00:00.000Z",
      })
    ),
    "El aviso todavía no empezó: esperá a su fecha de inicio para notificarlo."
  );
  assert.equal(
    reject(
      visibleAnnouncement({
        endsAt: "2020-01-01T10:00:00.000Z",
      })
    ),
    "El aviso ya terminó: actualizá sus fechas antes de notificarlo."
  );
  assert.equal(reject(visibleAnnouncement()), null);
});

test("notify_announcement warns that the send cannot be undone", () => {
  const definition = actionRegistry.getActionDefinition(
    "notify_announcement"
  );

  assert.deepEqual(
    definition.getWarnings({
      target: visibleAnnouncement(),
    }),
    [
      "Se enviará una notificación push a todos los suscriptores. No se puede deshacer.",
    ]
  );
  assert.deepEqual(
    definition.getWarnings({
      target: visibleAnnouncement({
        notifiedAt: "2026-10-31T12:00:00.000Z",
      }),
    }),
    [
      "Este aviso ya se notificó antes; se enviará de nuevo a todos los suscriptores.",
    ]
  );
  assert.deepEqual(
    definition.getChanges({
      target: visibleAnnouncement(),
      arguments: { announcementId: 42 },
    }),
    []
  );
});

test("confirming a notification reuses the push service and reports the totals", async () => {
  const sendCalls = [];
  const current = visibleAnnouncement({
    notifiedAt: null,
  });

  mock.method(
    announcementService,
    "getAnnouncementById",
    async () => current
  );
  mock.method(
    notificationService,
    "resendAnnouncement",
    async (announcementId) => {
      sendCalls.push(announcementId);
      return {
        total: 3,
        sent: 2,
        failed: 1,
        removed: 0,
        notifiedAt: "2026-11-01T12:00:00.000Z",
      };
    }
  );

  const result = await executePendingAction({
    action: {
      toolName: "notify_announcement",
      targetType: "announcement",
      targetId: 42,
      targetLabel: "Promo de temporada",
      arguments: { announcementId: 42 },
      before: {
        title: "Promo de temporada",
        isActive: true,
        startsAt: null,
        endsAt: null,
        notifiedAt: null,
        updatedAt: "2026-10-27T12:00:00.000Z",
      },
    },
    role: "EDITOR",
  });

  assert.deepEqual(sendCalls, [42]);
  assert.deepEqual(result, {
    result: {
      target: { id: 42, label: "Promo de temporada" },
      sent: 2,
      failed: 1,
      removed: 0,
    },
    message:
      "Se envió la notificación del aviso «Promo de temporada»: 2 enviadas y 1 con error.",
  });
});

test("a notification proposal with a changed snapshot never sends", async () => {
  mock.method(
    announcementService,
    "getAnnouncementById",
    async () =>
      visibleAnnouncement({
        title: "Promo de temporada editada",
        updatedAt: new Date("2026-10-27T12:05:00.000Z"),
      })
  );
  let sendCalls = 0;
  mock.method(
    notificationService,
    "resendAnnouncement",
    async () => {
      sendCalls += 1;
      return {};
    }
  );

  await assert.rejects(
    executePendingAction({
      action: {
        toolName: "notify_announcement",
        targetType: "announcement",
        targetId: 42,
        targetLabel: "Promo de temporada",
        arguments: { announcementId: 42 },
        before: {
          title: "Promo de temporada",
          isActive: true,
          startsAt: null,
          endsAt: null,
          notifiedAt: null,
          updatedAt: "2026-10-27T12:00:00.000Z",
        },
      },
      role: "EDITOR",
    }),
    (error) =>
      error.code === "ASSISTANT_ACTION_CONFLICT"
  );

  assert.equal(sendCalls, 0);
});

test("delete_media is rejected before confirming when the image is in use", async () => {
  mock.method(
    mediaService,
    "getMediaById",
    async () => media()
  );
  mock.method(
    mediaRepository,
    "countMediaReferences",
    async () => 3
  );

  let insertCalls = 0;
  mock.method(
    actionRepository,
    "createPendingAction",
    async () => {
      insertCalls += 1;
      return {
        status: "CREATED",
        actionId: 1,
        expiresAt: new Date("2026-10-27T12:10:00.000Z"),
      };
    }
  );

  const result = await actionService.proposeAction({
    currentUser: { id: 1, role: "EDITOR" },
    conversationId: 9,
    toolName: "delete_media",
    arguments: { mediaId: 7 },
  });

  assert.equal(result.status, "NOT_APPLICABLE");
  assert.match(result.message, /se usa en 3 publicaciones/);
  assert.equal(insertCalls, 0);
});

test("confirming a media deletion removes it from the gallery", async () => {
  const target = media();
  mock.method(
    mediaService,
    "getMediaById",
    async () => target
  );
  mock.method(
    mediaRepository,
    "countMediaReferences",
    async () => 0
  );
  mock.method(
    mediaService,
    "deleteMedia",
    async () => ({ mediaId: 7, deleted: true })
  );

  const result = await executePendingAction({
    action: {
      toolName: "delete_media",
      targetType: "media",
      targetId: 7,
      targetLabel: "Postre",
      arguments: { mediaId: 7 },
      before: {
        altText: "Postre",
        isActive: true,
        updatedAt: "2026-10-27T12:00:00.000Z",
      },
    },
    role: "EDITOR",
  });

  assert.deepEqual(result, {
    result: {
      target: { id: 7, label: "Postre" },
      deleted: true,
    },
    message: "La imagen «Postre» se borró de la galería.",
  });
});

test("delete_media requires a valid media id", () => {
  assert.equal(
    actionRegistry.validateActionCall({
      name: "delete_media",
      arguments: { mediaId: 7 },
      role: "EDITOR",
    }).arguments.mediaId,
    7
  );

  assert.equal(
    actionRegistry.validateActionCall({
      name: "delete_media",
      arguments: { mediaId: 0 },
      role: "EDITOR",
    }),
    null
  );
});

test("create_photo accepts only the gallery image and optional fields", () => {
  assert.deepEqual(
    actionRegistry.validateActionCall({
      name: "create_photo",
      arguments: {
        imageMediaId: 4,
        caption: "Postre",
        sortOrder: 3,
      },
      role: "EDITOR",
    }).arguments,
    { imageMediaId: 4, caption: "Postre", sortOrder: 3 }
  );

  for (const broken of [
    {},
    { imageMediaId: 0 },
    { imageMediaId: 4, caption: 5 },
    { imageMediaId: 4, extra: true },
  ]) {
    assert.equal(
      actionRegistry.validateActionCall({
        name: "create_photo",
        arguments: broken,
        role: "EDITOR",
      }),
      null
    );
  }
});

test("create_photo accepts an explicit null caption", () => {
  assert.deepEqual(
    actionRegistry.validateActionCall({
      name: "create_photo",
      arguments: { imageMediaId: 4, caption: null },
      role: "EDITOR",
    }).arguments,
    { imageMediaId: 4, caption: null }
  );
});

test("create_photo is rejected before confirming when the gallery image is missing", async () => {
  mock.method(
    mediaService,
    "getMediaById",
    async () => {
      throw new (require("../../src/errors/app-error"))(
        404,
        "MEDIA_NOT_FOUND",
        "missing"
      );
    }
  );

  let insertCalls = 0;
  mock.method(
    actionRepository,
    "createPendingAction",
    async () => {
      insertCalls += 1;
      return {
        status: "CREATED",
        actionId: 1,
        expiresAt: new Date("2026-10-27T12:10:00.000Z"),
      };
    }
  );

  const result = await actionService.proposeAction({
    currentUser: { id: 1, role: "EDITOR" },
    conversationId: 9,
    toolName: "create_photo",
    arguments: { imageMediaId: 999 },
  });

  assert.equal(result.status, "NOT_APPLICABLE");
  assert.match(result.message, /suba desde Administración/);
  assert.equal(insertCalls, 0);
});

test("confirming a photo creation publishes it and returns the id", async () => {
  const created = photo({
    id: 99,
    caption: "Postre",
    isActive: true,
    image: { id: 4, altText: "Postre" },
  });
  const createCalls = [];
  mock.method(
    photosService,
    "createPhoto",
    async (input) => {
      createCalls.push(input);
      return created;
    }
  );

  const result = await executePendingAction({
    action: {
      toolName: "create_photo",
      targetType: "photo",
      targetId: 0,
      targetLabel: "Postre",
      arguments: {
        imageMediaId: 4,
        caption: "Postre",
      },
      before: null,
    },
    role: "EDITOR",
  });

  assert.deepEqual(createCalls, [
    { caption: "Postre", imageMediaId: 4, sortOrder: 0 },
  ]);
  assert.deepEqual(result, {
    result: {
      target: { id: 99, label: "Postre" },
      isActive: true,
    },
    message: "La foto «Postre» se publicó en Día a día.",
  });
});

test("set_photo_active requires a real boolean status", () => {
  assert.equal(
    actionRegistry.validateActionCall({
      name: "set_photo_active",
      arguments: { photoId: 91, isActive: true },
      role: "EDITOR",
    }).arguments.isActive,
    true
  );

  assert.equal(
    actionRegistry.validateActionCall({
      name: "set_photo_active",
      arguments: { photoId: 91, isActive: "true" },
      role: "EDITOR",
    }),
    null
  );
});

test("delete_photo proposes a warning that keeps the gallery image", () => {
  const definition = actionRegistry.getActionDefinition(
    "delete_photo"
  );

  assert.deepEqual(
    definition.getWarnings({
      target: photo(),
      arguments: { photoId: 91 },
    }),
    [
      "Se borrará la foto «Foto de la casa», que está publicada y dejará de verse en Día a día. La imagen de la galería se conserva.",
    ]
  );
});
