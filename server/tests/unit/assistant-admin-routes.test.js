const test = require("node:test");
const assert = require("node:assert/strict");
const { after, afterEach, before, mock } = require("node:test");

process.env.NODE_ENV = "test";
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_NAME = "assistant_routes_test";
process.env.DB_USER = "test_user";
process.env.DB_PASSWORD = "test_password";
process.env.JWT_ACCESS_TOKEN_SECRET =
  "test-access-secret-with-at-least-32-characters";
process.env.JWT_ACCESS_TOKEN_TTL = "15m";
process.env.JWT_REFRESH_TOKEN_SECRET =
  "test-refresh-secret-with-at-least-32-characters";
process.env.JWT_REFRESH_TOKEN_TTL = "30d";
process.env.IMAGEKIT_PUBLIC_KEY = "test_public_key";
process.env.IMAGEKIT_PRIVATE_KEY = "test_private_key";
process.env.IMAGEKIT_URL_ENDPOINT =
  "https://ik.imagekit.io/test-imagekit-id";
process.env.IMAGEKIT_FOLDER = "test-folder";
process.env.GOOGLE_CLIENT_ID = "test_google_client_id";
process.env.GOOGLE_CLIENT_SECRET = "test_google_client_secret";
process.env.GOOGLE_REDIRECT_URI =
  "https://example.test/api/admin/youtube/callback";
process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.YOUTUBE_CHANNEL_ID = "UC1234567890123456789012";
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.AI_MODEL = "gemini-test";
process.env.AI_MAX_OUTPUT_TOKENS = "1024";
process.env.AI_TIMEOUT_MS = "30000";

const AppError = require("../../src/errors/app-error");
const userService = require(
  "../../src/modules/users/user.service"
);
const assistantService = require(
  "../../src/modules/assistant/assistant.service"
);
const assistantRepository = require(
  "../../src/modules/assistant/assistant.repository"
);
const assistantProvider = require(
  "../../src/modules/assistant/assistant.provider"
);
const productService = require(
  "../../src/modules/products/product.service"
);
const videoService = require(
  "../../src/modules/videos/video.service"
);
const categoryService = require(
  "../../src/modules/categories/category.service"
);
const actionRepository = require(
  "../../src/modules/assistant/assistant.action.repository"
);
const settingsService = require(
  "../../src/modules/settings/settings.service"
);
const {
  AssistantProviderError,
} = require(
  "../../src/modules/assistant/assistant.provider"
);
const {
  resetAssistantRateLimiters,
} = require(
  "../../src/middlewares/assistant-rate-limit.middleware"
);
const {
  generateAccessToken,
} = require("../../src/modules/auth/token.service");

const app = require("../../src/app");

let server;
let baseUrl;

const state = {
  currentUser: {
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    isActive: true,
  },
  conversationById: {},
  conversations: [],
  messageCount: 0,
  recentMessages: [],
  createResult: {
    conversationId: 9,
    prunedConversationIds: [],
  },
  appendResult: { conversationId: 5 },
  deleteResult: true,
  providerResponse: {
    text: "Respuesta del asistente",
    model: "gemini-3.6-flash",
    usage: { inputTokens: 12, outputTokens: 8 },
    finishReason: "STOP",
    blocked: false,
    toolCalls: [],
  },
  providerResponses: null,
  providerInputs: [],
  streamingInputs: [],
  streamingChunks: ["Respuesta ", "del asistente"],
  streamingResponse: null,
  usageAggregates: {
    totals: {
      totalQueries: 3,
      failedQueries: 1,
      inputTokens: 100,
      outputTokens: 40,
    },
    byModel: [
      {
        provider: "gemini",
        model: "gemini-3.6-flash",
        queries: 3,
        inputTokens: 100,
        outputTokens: 40,
      },
    ],
    byDay: [
      {
        day: "2026-10-26",
        queries: 3,
        inputTokens: 100,
        outputTokens: 40,
      },
    ],
  },
};

const fakeProvider = {
  id: "gemini",
  model: "gemini-test",
  capabilities: Object.freeze({
    supportsTools: true,
    supportsStreaming: true,
  }),
  chat: async (input) => {
    state.providerInputs.push(input);

    if (state.providerError) {
      throw state.providerError;
    }

    if (state.providerResponses?.length > 0) {
      return state.providerResponses.shift();
    }

    return state.providerResponse;
  },
  chatStream: async (input, onTextChunk) => {
    state.streamingInputs.push(input);

    if (state.providerError) {
      throw state.providerError;
    }

    const result =
      state.streamingResponse ?? state.providerResponse;

    for (const chunk of state.streamingChunks) {
      onTextChunk(chunk);
    }

    return result;
  },
};

mock.method(
  userService,
  "getAuthenticatedUser",
  async () => state.currentUser
);
mock.method(
  assistantProvider,
  "createAssistantProvider",
  () => fakeProvider
);
mock.method(
  assistantRepository,
  "listConversationsByUser",
  async () => state.conversations
);
mock.method(
  assistantRepository,
  "findConversationByIdForUser",
  async ({ conversationId }) =>
    state.conversationById[conversationId] ?? null
);
mock.method(
  assistantRepository,
  "countMessagesByConversation",
  async () => state.messageCount
);
mock.method(
  assistantRepository,
  "listRecentMessages",
  async () => state.recentMessages
);
mock.method(
  assistantRepository,
  "createConversationWithMessages",
  async () => state.createResult
);
mock.method(
  assistantRepository,
  "appendMessagesToConversation",
  async () => state.appendResult
);
mock.method(
  assistantRepository,
  "getUsageAggregates",
  async () => state.usageAggregates
);
mock.method(
  assistantRepository,
  "insertUsageEvent",
  async () => 1
);

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
  const pool = require("../../src/database/pool");
  await pool.end();
});

afterEach(() => {
  resetAssistantRateLimiters();
  state.currentUser = {
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    isActive: true,
  };
  state.conversationById = {};
  state.conversations = [];
  state.messageCount = 0;
  state.recentMessages = [];
  state.createResult = {
    conversationId: 9,
    prunedConversationIds: [],
  };
  state.appendResult = { conversationId: 5 };
  state.deleteResult = true;
  state.usageAggregates = {
    totals: {
      totalQueries: 3,
      failedQueries: 1,
      inputTokens: 100,
      outputTokens: 40,
    },
    byModel: [
      {
        provider: "gemini",
        model: "gemini-3.6-flash",
        queries: 3,
        inputTokens: 100,
        outputTokens: 40,
      },
    ],
    byDay: [
      {
        day: "2026-10-26",
        queries: 3,
        inputTokens: 100,
        outputTokens: 40,
      },
    ],
  };
  state.providerResponse = {
    text: "Respuesta del asistente",
    model: "gemini-3.6-flash",
    usage: { inputTokens: 12, outputTokens: 8 },
    finishReason: "STOP",
    blocked: false,
    toolCalls: [],
  };
  state.providerResponses = null;
  state.providerInputs = [];
  state.streamingInputs = [];
  state.streamingChunks = ["Respuesta ", "del asistente"];
  state.streamingResponse = null;
  state.providerError = null;
  mock.restoreAll();
  mock.method(
    userService,
    "getAuthenticatedUser",
    async () => state.currentUser
  );
  mock.method(
    assistantProvider,
    "createAssistantProvider",
    () => fakeProvider
  );
  mock.method(
    assistantRepository,
    "listConversationsByUser",
    async () => state.conversations
  );
  mock.method(
    assistantRepository,
    "findConversationByIdForUser",
    async ({ conversationId }) =>
      state.conversationById[conversationId] ?? null
  );
  mock.method(
    assistantRepository,
    "countMessagesByConversation",
    async () => state.messageCount
  );
  mock.method(
    assistantRepository,
    "listRecentMessages",
    async () => state.recentMessages
  );
  mock.method(
    assistantRepository,
    "createConversationWithMessages",
    async () => state.createResult
  );
  mock.method(
    assistantRepository,
    "appendMessagesToConversation",
    async () => state.appendResult
  );
  mock.method(
    assistantRepository,
    "deleteConversationByIdForUser",
    async () => state.deleteResult
  );
  mock.method(
    assistantRepository,
    "getUsageAggregates",
    async () => state.usageAggregates
  );
  mock.method(
    assistantRepository,
    "insertUsageEvent",
    async () => 1
  );
});

function token(role = "ADMIN") {
  return generateAccessToken({
    id: role === "ADMIN" ? 1 : 2,
    role,
  });
}

async function request(path, options = {}) {
  const headers = {};
  if (options.accessToken !== undefined) {
    headers.authorization = `Bearer ${options.accessToken}`;
  }
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body:
      options.body === undefined
        ? undefined
        : JSON.stringify(options.body),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function requestStream(path, options = {}) {
  const headers = {};

  if (options.accessToken) {
    headers.authorization = `Bearer ${options.accessToken}`;
  }

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    headers.accept = "text/event-stream";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "POST",
    headers,
    body:
      options.body === undefined
        ? undefined
        : JSON.stringify(options.body),
  });

  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    body: await response.text(),
  };
}

function parseAssistantStream(body) {
  return Array.from(
    body.matchAll(
      /event: ([^\r\n]+)\r?\ndata: ([^\r\n]+)\r?\n\r?\n/g
    ),
    ([, event, data]) => ({
      event,
      data: JSON.parse(data),
    })
  );
}

test("assistant routes require authentication", async () => {
  const result = await request("/api/admin/assistant/status");

  assert.equal(result.status, 401);
  assert.equal(
    result.body.error.code,
    "AUTHENTICATION_REQUIRED"
  );
});

test("GET /status reports the provider and capabilities", async () => {
  const result = await request(
    "/api/admin/assistant/status",
    { accessToken: token("EDITOR") }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.data.enabled, true);
  assert.equal(result.body.data.provider, "gemini");
  assert.equal(result.body.data.model, "gemini-test");
  assert.deepEqual(result.body.data.capabilities, {
    supportsTools: true,
    supportsStreaming: true,
  });
});

test("GET /conversations lists the user's conversations", async () => {
  const now = new Date();
  state.conversations = [
    {
      id: 1,
      title: "Hola",
      created_at: now,
      updated_at: now,
    },
  ];

  const result = await request(
    "/api/admin/assistant/conversations",
    { accessToken: token("ADMIN") }
  );

  assert.equal(result.status, 200);
  assert.equal(
    result.body.data.conversations.length,
    1
  );
  assert.equal(
    result.body.data.conversations[0].title,
    "Hola"
  );
});

test("GET /conversations/:id/messages returns 404 for a foreign conversation", async () => {
  state.conversationById = {};

  const result = await request(
    "/api/admin/assistant/conversations/99/messages",
    { accessToken: token("ADMIN") }
  );

  assert.equal(result.status, 404);
  assert.equal(
    result.body.error.code,
    "ASSISTANT_CONVERSATION_NOT_FOUND"
  );
});

test("POST /messages creates a conversation and returns 201", async () => {
  const result = await request("/api/admin/assistant/messages", {
    method: "POST",
    accessToken: token("ADMIN"),
    body: { message: "¿Cómo agrego un producto?" },
  });

  assert.equal(result.status, 201);
  assert.equal(
    result.body.data.conversation.id,
    9
  );
  assert.equal(
    result.body.data.userMessage.content,
    "¿Cómo agrego un producto?"
  );
  assert.equal(
    result.body.data.reply.content,
    "Respuesta del asistente"
  );
  assert.equal(
    result.body.data.prunedConversationId,
    null
  );
});

test("POST /messages creates a pending action without changing the product", async () => {
  state.providerResponse = {
    text: "Ignorar el texto del modelo.",
    model: "gemini-3.6-flash",
    usage: { inputTokens: 18, outputTokens: 6 },
    finishReason: "STOP",
    blocked: false,
    toolCalls: [
      {
        name: "set_product_availability",
        arguments: {
          productId: 12,
          isAvailable: false,
        },
      },
    ],
  };

  const product = {
    id: 12,
    name: "Nacatamal de pollo",
    isAvailable: true,
    isActive: true,
    updatedAt: new Date("2026-10-27T12:00:00.000Z"),
  };
  let inserted;
  let savedTurn;
  let productWrites = 0;
  mock.method(
    productService,
    "getProductById",
    async () => product
  );
  mock.method(
    productService,
    "changeProductAvailability",
    async () => {
      productWrites += 1;
      return product;
    }
  );
  mock.method(
    actionRepository,
    "createPendingAction",
    async (input) => {
      inserted = input;
      return {
        status: "CREATED",
        actionId: 31,
        expiresAt: new Date("2026-10-27T12:10:00.000Z"),
      };
    }
  );
  mock.method(
    assistantRepository,
    "createConversationShell",
    async () => ({
      conversationId: 9,
      prunedConversationIds: [],
    })
  );
  mock.method(
    assistantRepository,
    "appendActionTurnToConversation",
    async (input) => {
      savedTurn = input;
      return true;
    }
  );

  const result = await request("/api/admin/assistant/messages", {
    method: "POST",
    accessToken: token("ADMIN"),
    body: { message: "Marcá el nacatamal de pollo como agotado." },
  });

  assert.equal(result.status, 201);
  assert.equal(
    result.body.data.reply.content,
    "Preparé la acción. Confirmala para aplicarla."
  );
  assert.equal(result.body.data.pendingAction.tool, "set_product_availability");
  assert.equal(
    result.body.data.pendingAction.summary,
    "Marcar «Nacatamal de pollo» como no disponible"
  );
  assert.deepEqual(result.body.data.pendingAction.changes, [
    { field: "isAvailable", from: true, to: false },
  ]);
  assert.deepEqual(inserted.before, {
    isAvailable: true,
    updatedAt: "2026-10-27T12:00:00.000Z",
  });
  assert.equal(inserted.targetId, 12);
  assert.deepEqual(savedTurn.userMessage, {
    role: "user",
    content: "Marcá el nacatamal de pollo como agotado.",
  });
  assert.equal(
    savedTurn.assistantMessage.content,
    result.body.data.reply.content
  );
  assert.equal(productWrites, 0);
});

test("POST /messages explains why a non-ready video cannot be published", async () => {
  state.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };
  state.providerResponse = {
    text: "Ignorar el texto del modelo.",
    model: "gemini-3.6-flash",
    usage: { inputTokens: 18, outputTokens: 6 },
    finishReason: "STOP",
    blocked: false,
    toolCalls: [
      {
        name: "set_video_active",
        arguments: { videoId: 73, isActive: true },
      },
    ],
  };
  mock.method(
    videoService,
    "getVideoById",
    async () => ({
      id: 73,
      title: "Video en proceso",
      isActive: false,
      uploadStatus: "PROCESSING",
      updatedAt: new Date("2026-10-27T12:00:00.000Z"),
    })
  );
  let actionInsertCalls = 0;
  mock.method(
    actionRepository,
    "createPendingAction",
    async () => {
      actionInsertCalls += 1;
      return {
        status: "CREATED",
        actionId: 31,
        expiresAt: new Date("2026-10-27T12:10:00.000Z"),
      };
    }
  );
  let savedTurn;
  mock.method(
    assistantRepository,
    "createConversationShell",
    async () => ({
      conversationId: 9,
      prunedConversationIds: [],
    })
  );
  mock.method(
    assistantRepository,
    "appendActionTurnToConversation",
    async (input) => {
      savedTurn = input;
      return true;
    }
  );

  const result = await request("/api/admin/assistant/messages", {
    method: "POST",
    accessToken: token("EDITOR"),
    body: { message: "Publicá el video en proceso." },
  });

  assert.equal(result.status, 201);
  assert.match(
    result.body.data.reply.content,
    /Solo se pueden publicar videos cuando la carga está lista/
  );
  assert.equal(result.body.data.pendingAction, undefined);
  assert.equal(actionInsertCalls, 0);
  assert.equal(
    savedTurn.assistantMessage.content,
    result.body.data.reply.content
  );
});

test("POST /messages warns that hiding a category only hides its products", async () => {
  state.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };
  state.providerResponse = {
    text: "Ignorar el texto del modelo.",
    model: "gemini-3.6-flash",
    usage: { inputTokens: 18, outputTokens: 6 },
    finishReason: "STOP",
    blocked: false,
    toolCalls: [
      {
        name: "set_category_active",
        arguments: { categoryId: 21, isActive: false },
      },
    ],
  };
  mock.method(
    categoryService,
    "getCategoryById",
    async () => ({
      id: 21,
      name: "Bebidas",
      isActive: true,
      updatedAt: new Date("2026-10-27T12:00:00.000Z"),
    })
  );
  let inserted;
  mock.method(
    actionRepository,
    "createPendingAction",
    async (input) => {
      inserted = input;
      return {
        status: "CREATED",
        actionId: 31,
        expiresAt: new Date("2026-10-27T12:10:00.000Z"),
      };
    }
  );
  let statusChanges = 0;
  mock.method(
    categoryService,
    "changeCategoryStatus",
    async () => {
      statusChanges += 1;
      throw new Error("Status must not change before confirmation");
    }
  );
  mock.method(
    assistantRepository,
    "createConversationShell",
    async () => ({
      conversationId: 9,
      prunedConversationIds: [],
    })
  );
  mock.method(
    assistantRepository,
    "appendActionTurnToConversation",
    async () => true
  );

  const result = await request("/api/admin/assistant/messages", {
    method: "POST",
    accessToken: token("EDITOR"),
    body: { message: "Ocultá la categoría Bebidas." },
  });

  assert.equal(result.status, 201);
  assert.equal(
    result.body.data.pendingAction.tool,
    "set_category_active"
  );
  assert.match(
    result.body.data.pendingAction.warnings.join(" "),
    /sus productos dejarán de mostrarse/
  );
  assert.match(
    result.body.data.pendingAction.warnings.join(" "),
    /no se borran ni se modifican/
  );
  assert.equal(inserted.targetId, 21);
  assert.equal(statusChanges, 0);
});

test("POST /messages/stream emits only final answer chunks and the completed response", async () => {
  state.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };
  state.providerResponse = {
    text: "Este texto de planificación no debe transmitirse.",
    model: "gemini-3.6-flash",
    usage: { inputTokens: 10, outputTokens: 2 },
    finishReason: "STOP",
    blocked: false,
    toolCalls: [],
  };
  state.streamingResponse = {
    text: "Respuesta final.",
    model: "gemini-3.6-flash",
    usage: { inputTokens: 20, outputTokens: 8 },
    finishReason: "STOP",
    blocked: false,
    toolCalls: [],
  };
  state.streamingChunks = ["Respuesta ", "final."];

  const result = await requestStream(
    "/api/admin/assistant/messages/stream",
    {
      accessToken: token("EDITOR"),
      body: { message: "Hola" },
    }
  );
  const events = parseAssistantStream(result.body);

  assert.equal(result.status, 200);
  assert.match(result.contentType, /^text\/event-stream/);
  assert.deepEqual(
    events.map(({ event, data }) => [event, data]),
    [
      ["chunk", { text: "Respuesta " }],
      ["chunk", { text: "final." }],
      [
        "complete",
        {
          success: true,
          message: "Assistant message answered successfully",
          data: {
            conversation: { id: 9, title: "Hola" },
            userMessage: { role: "user", content: "Hola" },
            reply: {
              role: "assistant",
              content: "Respuesta final.",
              provider: "gemini",
              model: "gemini-3.6-flash",
              inputTokens: 30,
              outputTokens: 10,
            },
            prunedConversationId: null,
          },
        },
      ],
    ]
  );
  assert.deepEqual(state.streamingInputs[0].tools, []);
  assert.equal(
    result.body.includes("Este texto de planificación"),
    false
  );
});

test("POST /messages/stream hides read-tool turns until the final answer", async () => {
  state.providerResponses = [
    {
      text: "No transmitir texto interno.",
      model: "gemini-3.6-flash",
      usage: { inputTokens: 10, outputTokens: 2 },
      finishReason: "STOP",
      blocked: false,
      toolCalls: [
        {
          name: "get_current_schedule",
          arguments: {},
        },
      ],
    },
  ];
  state.streamingResponse = {
    text: "El horario es de 8 a 17.",
    model: "gemini-3.6-flash",
    usage: { inputTokens: 20, outputTokens: 8 },
    finishReason: "STOP",
    blocked: false,
    toolCalls: [],
  };
  state.streamingChunks = ["El horario ", "es de 8 a 17."];
  mock.method(
    settingsService,
    "getPublicSettings",
    async () => ({
      scheduleText: "8:00 a 17:00",
      fritangaScheduleText: null,
    })
  );

  const result = await requestStream(
    "/api/admin/assistant/messages/stream",
    {
      accessToken: token("ADMIN"),
      body: { message: "¿Cuál es el horario?" },
    }
  );
  const events = parseAssistantStream(result.body);

  assert.deepEqual(
    events
      .filter(({ event }) => event === "chunk")
      .map(({ data }) => data.text),
    ["El horario ", "es de 8 a 17."]
  );
  assert.equal(
    result.body.includes("No transmitir texto interno"),
    false
  );
  assert.equal(
    state.streamingInputs[0].messages.at(-1).role,
    "tool"
  );
});

test("POST /messages/stream reports provider errors as sanitized SSE events", async () => {
  state.providerError = new AssistantProviderError(
    "TIMEOUT",
    { retryable: true }
  );

  const result = await requestStream(
    "/api/admin/assistant/messages/stream",
    {
      accessToken: token("ADMIN"),
      body: { message: "Hola" },
    }
  );

  assert.equal(result.status, 200);
  assert.deepEqual(parseAssistantStream(result.body), [
    {
      event: "error",
      data: {
        success: false,
        error: {
          code: "ASSISTANT_TIMEOUT",
          message: "The assistant took too long to answer",
        },
      },
    },
  ]);
});

test("POST /messages executes a role-authorized read tool and returns only the final answer", async () => {
  state.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };
  state.providerResponses = [
    {
      text: "",
      model: "gemini-3.6-flash",
      usage: { inputTokens: 10, outputTokens: 2 },
      finishReason: "STOP",
      blocked: false,
      toolCalls: [
        {
          name: "get_current_schedule",
          arguments: {},
          id: "call-schedule",
          thoughtSignature: "signature-schedule",
        },
      ],
    },
    {
      text: "El horario general es de lunes a viernes.",
      model: "gemini-3.6-flash",
      usage: { inputTokens: 20, outputTokens: 8 },
      finishReason: "STOP",
      blocked: false,
      toolCalls: [],
    },
  ];
  mock.method(
    settingsService,
    "getPublicSettings",
    async () => ({
      scheduleText: "Lunes a viernes, 8:00 a 17:00",
      fritangaScheduleText: null,
      businessName: "No debe exponerse",
    })
  );

  const result = await request("/api/admin/assistant/messages", {
    method: "POST",
    accessToken: token("EDITOR"),
    body: { message: "¿Cuál es el horario?" },
  });

  assert.equal(result.status, 201);
  assert.equal(
    result.body.data.reply.content,
    "El horario general es de lunes a viernes."
  );
  assert.deepEqual(
    state.providerInputs[0].tools.map((tool) => tool.name),
    [
      "get_current_schedule",
      "count_products",
      "search_products",
      "list_active_announcements",
      "search_announcements",
      "list_videos",
      "search_videos",
      "search_categories",
      "set_product_availability",
      "set_announcement_active",
      "set_video_active",
      "set_category_active",
    ]
  );
  const toolMessage =
    state.providerInputs[1].messages.at(-1);
  assert.equal(toolMessage.role, "tool");
  assert.equal(toolMessage.id, "call-schedule");
  assert.deepEqual(JSON.parse(toolMessage.content), {
    scheduleText: "Lunes a viernes, 8:00 a 17:00",
    fritangaScheduleText: null,
  });
  assert.equal(
    JSON.stringify(result.body).includes("No debe exponerse"),
    false
  );
});

test("POST /messages continues an existing conversation", async () => {
  state.conversationById[5] = {
    id: 5,
    title: "Hola",
    created_at: new Date(),
    updated_at: new Date(),
  };
  state.appendResult = { conversationId: 5 };

  const result = await request("/api/admin/assistant/messages", {
    method: "POST",
    accessToken: token("ADMIN"),
    body: { conversationId: 5, message: "¿Y los videos?" },
  });

  assert.equal(result.status, 201);
  assert.equal(
    result.body.data.conversation.id,
    5
  );
});

test("POST /messages rejects unknown fields", async () => {
  const result = await request("/api/admin/assistant/messages", {
    method: "POST",
    accessToken: token("ADMIN"),
    body: {
      message: "Hola",
      history: [],
    },
  });

  assert.equal(result.status, 400);
  assert.equal(
    result.body.error.code,
    "UNEXPECTED_ASSISTANT_FIELDS"
  );
});

test("POST /messages rejects an empty message", async () => {
  const result = await request("/api/admin/assistant/messages", {
    method: "POST",
    accessToken: token("ADMIN"),
    body: { message: "   " },
  });

  assert.equal(result.status, 400);
  assert.equal(
    result.body.error.code,
    "INVALID_ASSISTANT_INPUT"
  );
});

test("POST /messages rejects an overlong message", async () => {
  const result = await request("/api/admin/assistant/messages", {
    method: "POST",
    accessToken: token("ADMIN"),
    body: { message: "a".repeat(2001) },
  });

  assert.equal(result.status, 400);
  assert.equal(
    result.body.error.code,
    "ASSISTANT_MESSAGE_TOO_LONG"
  );
});

test("POST /messages rejects an invalid conversation id", async () => {
  const result = await request("/api/admin/assistant/messages", {
    method: "POST",
    accessToken: token("ADMIN"),
    body: { conversationId: 0, message: "Hola" },
  });

  assert.equal(result.status, 400);
  assert.equal(
    result.body.error.code,
    "INVALID_ASSISTANT_INPUT"
  );
});

test("POST /messages returns 409 when the conversation is full", async () => {
  state.conversationById[7] = {
    id: 7,
    title: "Lleno",
    created_at: new Date(),
    updated_at: new Date(),
  };
  state.messageCount = 100;

  const result = await request("/api/admin/assistant/messages", {
    method: "POST",
    accessToken: token("ADMIN"),
    body: { conversationId: 7, message: "Hola" },
  });

  assert.equal(result.status, 409);
  assert.equal(
    result.body.error.code,
    "ASSISTANT_CONVERSATION_FULL"
  );
});

test("POST /messages maps a provider timeout to 504", async () => {
  state.providerError = new AssistantProviderError(
    "TIMEOUT",
    { retryable: true }
  );

  const result = await request("/api/admin/assistant/messages", {
    method: "POST",
    accessToken: token("ADMIN"),
    body: { message: "Hola" },
  });

  assert.equal(result.status, 504);
  assert.equal(
    result.body.error.code,
    "ASSISTANT_TIMEOUT"
  );
});

test("POST /messages maps other provider errors to 502", async () => {
  state.providerError = new AssistantProviderError(
    "RATE_LIMITED",
    { retryable: true }
  );

  const result = await request("/api/admin/assistant/messages", {
    method: "POST",
    accessToken: token("ADMIN"),
    body: { message: "Hola" },
  });

  assert.equal(result.status, 502);
  assert.equal(
    result.body.error.code,
    "ASSISTANT_PROVIDER_ERROR"
  );
});

test("DELETE /conversations/:id deletes an owned conversation", async () => {
  const result = await request(
    "/api/admin/assistant/conversations/5",
    {
      method: "DELETE",
      accessToken: token("ADMIN"),
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.data.deleted, true);
});

test("DELETE /conversations/:id returns 404 for a foreign conversation", async () => {
  state.deleteResult = false;

  const result = await request(
    "/api/admin/assistant/conversations/5",
    {
      method: "DELETE",
      accessToken: token("ADMIN"),
    }
  );

  assert.equal(result.status, 404);
  assert.equal(
    result.body.error.code,
    "ASSISTANT_CONVERSATION_NOT_FOUND"
  );
});

test("GET /usage returns aggregates for ADMIN", async () => {
  const result = await request(
    "/api/admin/assistant/usage?days=7",
    { accessToken: token("ADMIN") }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.data.days, 7);
  assert.equal(result.body.data.totals.queries, 3);
  assert.equal(result.body.data.totals.failed, 1);
  assert.equal(result.body.data.totals.inputTokens, 100);
  assert.equal(result.body.data.totals.outputTokens, 40);
  assert.equal(result.body.data.byModel.length, 1);
  assert.equal(result.body.data.byDay.length, 1);
});

test("GET /usage rejects an EDITOR", async () => {
  state.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };

  const result = await request(
    "/api/admin/assistant/usage",
    { accessToken: token("EDITOR") }
  );

  assert.equal(result.status, 403);
  assert.equal(result.body.error.code, "FORBIDDEN");
});

test("an EDITOR can use the assistant", async () => {
  state.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };

  const result = await request(
    "/api/admin/assistant/status",
    { accessToken: token("EDITOR") }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.data.enabled, true);
});
