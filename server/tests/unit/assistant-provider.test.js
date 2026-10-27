const test = require("node:test");
const assert = require("node:assert/strict");
const {
  spawnSync,
} = require("node:child_process");
const path = require("node:path");

const {
  ASSISTANT_PROVIDER_ERROR_CODES,
  AssistantProviderError,
  createAssistantProvider,
  PROVIDER_IDS,
} = require(
  "../../src/modules/assistant/assistant.provider"
);

const SERVER_ROOT = path.resolve(__dirname, "../..");

const BASE_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "assistant_config_test",
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
    "http://localhost:3000/api/youtube/oauth/callback",
  YOUTUBE_TOKEN_ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  YOUTUBE_CHANNEL_ID: "UC1234567890123456789012",
});

function runAssistantConfig(
  overrides = {},
  removedKeys = []
) {
  const environment = {
    ...process.env,
    ...BASE_ENVIRONMENT,
    ...overrides,
  };

  for (const key of removedKeys) {
    delete environment[key];
  }

  const result = spawnSync(
    process.execPath,
    [
      "-e",
      [
        'const env = require("./src/config/env");',
        "const assistant = env.assistant;",
        "console.log(JSON.stringify({",
        "keys: Object.keys(assistant).sort(),",
        "frozen: Object.isFrozen(assistant),",
        "enabled: assistant.enabled,",
        "provider: assistant.provider,",
        "model: assistant.model,",
        "maxOutputTokens: assistant.maxOutputTokens,",
        "timeoutMs: assistant.timeoutMs,",
        "hasApiKey: Boolean(assistant.apiKey),",
        "}));",
      ].join("\n"),
    ],
    {
      cwd: SERVER_ROOT,
      env: environment,
      encoding: "utf8",
    }
  );

  return result;
}

function parseConfigOutput(result) {
  return JSON.parse(
    result.stdout.trim().split(/\r?\n/).pop()
  );
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function createProvider(
  fetchImpl,
  overrides = {}
) {
  return createAssistantProvider({
    provider: "gemini",
    apiKey: "test-gemini-key",
    model: "gemini-test",
    maxOutputTokens: 1024,
    timeoutMs: 30_000,
    fetchImpl,
    ...overrides,
  });
}

async function expectProviderError(
  promise,
  code,
  expected = {}
) {
  await assert.rejects(promise, (error) => {
    assert.ok(
      error instanceof AssistantProviderError
    );
    assert.equal(error.code, code);

    if ("retryable" in expected) {
      assert.equal(
        error.retryable,
        expected.retryable
      );
    }

    if ("upstreamStatus" in expected) {
      assert.equal(
        error.upstreamStatus,
        expected.upstreamStatus
      );
    }

    return true;
  });
}

test("assistant configuration is optional, frozen and disabled without an API key", () => {
  const result = runAssistantConfig({}, [
    "GEMINI_API_KEY",
    "AI_PROVIDER",
    "AI_MODEL",
    "AI_MAX_OUTPUT_TOKENS",
    "AI_TIMEOUT_MS",
  ]);

  assert.equal(result.status, 0, result.stderr);

  const output = parseConfigOutput(result);

  assert.deepEqual(output.keys, [
    "apiKey",
    "enabled",
    "maxOutputTokens",
    "model",
    "provider",
    "timeoutMs",
  ]);
  assert.equal(output.frozen, true);
  assert.equal(output.enabled, false);
  assert.equal(output.provider, "gemini");
  assert.equal(output.model, "gemini-3.5-flash");
  assert.equal(output.maxOutputTokens, 1024);
  assert.equal(output.timeoutMs, 30_000);
  assert.equal(output.hasApiKey, false);
});

test("assistant configuration enables Gemini and keeps the key out of the output", () => {
  const result = runAssistantConfig({
    GEMINI_API_KEY: "test-gemini-key",
    AI_PROVIDER: "GEMINI",
    AI_MODEL: "gemini-test",
    AI_MAX_OUTPUT_TOKENS: "512",
    AI_TIMEOUT_MS: "15000",
  });

  assert.equal(result.status, 0, result.stderr);

  const output = parseConfigOutput(result);

  assert.equal(output.enabled, true);
  assert.equal(output.provider, "gemini");
  assert.equal(output.model, "gemini-test");
  assert.equal(output.maxOutputTokens, 512);
  assert.equal(output.timeoutMs, 15_000);
  assert.equal(output.hasApiKey, true);
  assert.equal(
    result.stdout.includes("test-gemini-key"),
    false
  );
});

test("assistant configuration rejects unsupported providers and invalid limits", () => {
  const cases = [
    {
      overrides: { AI_PROVIDER: "openai" },
      variable: "AI_PROVIDER",
    },
    {
      overrides: { AI_MODEL: "bad model" },
      variable: "AI_MODEL",
    },
    {
      overrides: { AI_MODEL: "a/b" },
      variable: "AI_MODEL",
    },
    {
      overrides: { AI_MAX_OUTPUT_TOKENS: "0" },
      variable: "AI_MAX_OUTPUT_TOKENS",
    },
    {
      overrides: { AI_MAX_OUTPUT_TOKENS: "4097" },
      variable: "AI_MAX_OUTPUT_TOKENS",
    },
    {
      overrides: { AI_MAX_OUTPUT_TOKENS: "abc" },
      variable: "AI_MAX_OUTPUT_TOKENS",
    },
    {
      overrides: { AI_TIMEOUT_MS: "4999" },
      variable: "AI_TIMEOUT_MS",
    },
    {
      overrides: { AI_TIMEOUT_MS: "60001" },
      variable: "AI_TIMEOUT_MS",
    },
  ];

  for (const { overrides, variable } of cases) {
    const result = runAssistantConfig(overrides);

    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      new RegExp(variable)
    );
  }
});

test("Gemini provider maps messages, system instruction and generation config", async () => {
  let captured = null;

  const provider = createProvider(
    async (url, options) => {
      captured = { url, options };

      return jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ text: "Para agregar un producto..." }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 120,
          candidatesTokenCount: 30,
        },
        modelVersion: "gemini-test-001",
      });
    }
  );

  const result = await provider.chat({
    systemInstruction: "Sos el asistente.",
    messages: [
      { role: "user", content: "Hola" },
      { role: "assistant", content: "Hola." },
      { role: "user", content: "¿Cómo agrego un producto?" },
    ],
    maxOutputTokens: 256,
    timeoutMs: 15_000,
  });

  assert.match(
    captured.url,
    /\/models\/gemini-test:generateContent$/
  );
  assert.equal(
    captured.options.headers["x-goog-api-key"],
    "test-gemini-key"
  );

  const body = JSON.parse(captured.options.body);

  assert.deepEqual(body.systemInstruction, {
    parts: [{ text: "Sos el asistente." }],
  });
  assert.deepEqual(body.contents, [
    { role: "user", parts: [{ text: "Hola" }] },
    { role: "model", parts: [{ text: "Hola." }] },
    {
      role: "user",
      parts: [{ text: "¿Cómo agrego un producto?" }],
    },
  ]);
  assert.deepEqual(body.generationConfig, {
    maxOutputTokens: 256,
    temperature: 0.2,
    thinkingConfig: { thinkingBudget: 0 },
  });

  assert.deepEqual(result, {
    text: "Para agregar un producto...",
    model: "gemini-test-001",
    usage: {
      inputTokens: 120,
      outputTokens: 30,
    },
    finishReason: "STOP",
    blocked: false,
    toolCalls: [],
  });
});

test("Gemini provider joins text parts, ignores thoughts and tolerates missing usage", async () => {
  const provider = createProvider(async () =>
    jsonResponse({
      candidates: [
        {
          content: {
            parts: [
              { text: "Hola " },
              { thought: true, text: "interno" },
              { text: "mundo" },
            ],
          },
          finishReason: "STOP",
        },
      ],
    })
  );

  const result = await provider.chat({
    systemInstruction: "Sistema",
    messages: [{ role: "user", content: "Hola" }],
  });

  assert.equal(result.text, "Hola mundo");
  assert.deepEqual(result.usage, {
    inputTokens: null,
    outputTokens: null,
  });
});

test("Gemini provider returns a blocked result instead of throwing", async () => {
  const provider = createProvider(async () =>
    jsonResponse({
      promptFeedback: { blockReason: "SAFETY" },
      usageMetadata: { promptTokenCount: 10 },
    })
  );

  const result = await provider.chat({
    systemInstruction: "Sistema",
    messages: [{ role: "user", content: "contenido" }],
  });

  assert.equal(result.blocked, true);
  assert.equal(result.text, "");
  assert.equal(result.finishReason, null);
  assert.deepEqual(result.usage, {
    inputTokens: 10,
    outputTokens: null,
  });
});

test("Gemini provider declares tools and normalizes function-call responses", async () => {
  let capturedBody;
  const provider = createProvider(
    async (_url, options) => {
      capturedBody = JSON.parse(options.body);

      return jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "count_products",
                    id: "call-123",
                    args: { categoryId: 8 },
                  },
                  thoughtSignature: "signature-123",
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
      });
    }
  );

  const result = await provider.chat({
    systemInstruction: "Solo lectura.",
    messages: [{ role: "user", content: "¿Cuántos?" }],
    tools: [
      {
        name: "count_products",
        description: "Cuenta productos.",
        parameters: {
          type: "object",
          properties: {
            categoryId: { type: "integer" },
          },
          required: ["categoryId"],
          additionalProperties: false,
        },
      },
    ],
  });

  assert.deepEqual(capturedBody.tools, [
    {
      functionDeclarations: [
        {
          name: "count_products",
          description: "Cuenta productos.",
          parameters: {
            type: "OBJECT",
            properties: {
              categoryId: { type: "INTEGER" },
            },
            required: ["categoryId"],
          },
        },
      ],
    },
  ]);
  assert.deepEqual(result.toolCalls, [
    {
      name: "count_products",
      arguments: { categoryId: 8 },
      id: "call-123",
      thoughtSignature: "signature-123",
    },
  ]);
  assert.equal(result.text, "");
});

test("Gemini provider sends assistant tool calls and bounded tool results", async () => {
  let capturedBody;
  const provider = createProvider(
    async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ text: "Hay 4 productos." }],
            },
            finishReason: "STOP",
          },
        ],
      });
    }
  );

  await provider.chat({
    systemInstruction: "Sistema.",
    messages: [
      { role: "user", content: "Cuenta." },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            name: "count_products",
            arguments: {},
            id: "call-123",
            thoughtSignature: "signature-123",
          },
        ],
      },
      {
        role: "tool",
        name: "count_products",
        content: '{"total":4}',
        id: "call-123",
      },
    ],
  });

  assert.deepEqual(capturedBody.contents.slice(1), [
    {
      role: "model",
      parts: [
        {
          functionCall: {
            name: "count_products",
            args: {},
            id: "call-123",
          },
          thoughtSignature: "signature-123",
        },
      ],
    },
    {
      role: "user",
      parts: [
        {
          functionResponse: {
            name: "count_products",
            response: { result: { total: 4 } },
            id: "call-123",
          },
        },
      ],
    },
  ]);
});

test("Gemini provider rejects malformed, oversized and excessive tool calls", async () => {
  const responses = [
    {
      functionCall: {
        name: "count_products",
        args: [],
      },
    },
    {
      functionCall: {
        name: "count_products",
        args: { filter: "x".repeat(2_001) },
      },
    },
    {
      functionCall: {
        name: "bad-name",
        args: {},
      },
    },
  ];

  for (const functionCall of responses) {
    const provider = createProvider(async () =>
      jsonResponse({
        candidates: [
          {
            content: { parts: [functionCall] },
            finishReason: "STOP",
          },
        ],
      })
    );

    await expectProviderError(
      provider.chat({
        systemInstruction: "Sistema.",
        messages: [{ role: "user", content: "Consulta." }],
      }),
      ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
    );
  }

  const excessiveProvider = createProvider(async () =>
    jsonResponse({
      candidates: [
        {
          content: {
            parts: [
              { functionCall: { name: "first", args: {} } },
              { functionCall: { name: "second", args: {} } },
              { functionCall: { name: "third", args: {} } },
            ],
          },
          finishReason: "STOP",
        },
      ],
    })
  );

  await expectProviderError(
    excessiveProvider.chat({
      systemInstruction: "Sistema.",
      messages: [{ role: "user", content: "Consulta." }],
    }),
    ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
  );
});

test("Gemini provider rejects invalid tool declarations and tool messages", async () => {
  const provider = createProvider(async () =>
    jsonResponse({
      candidates: [
        {
          content: { parts: [{ text: "ok" }] },
        },
      ],
    })
  );

  await expectProviderError(
    provider.chat({
      systemInstruction: "Sistema.",
      messages: [{ role: "user", content: "Hola" }],
      tools: [
        {
          name: "count_products",
          description: "Cuenta.",
          parameters: {
            type: "object",
            properties: {},
            additionalProperties: true,
          },
        },
      ],
    }),
    ASSISTANT_PROVIDER_ERROR_CODES.INVALID_REQUEST
  );

  for (const content of [
    "{malformed",
    "[]",
    "x".repeat(6_001),
  ]) {
    await expectProviderError(
      provider.chat({
        systemInstruction: "Sistema.",
        messages: [
          { role: "user", content: "Hola" },
          {
            role: "tool",
            name: "count_products",
            content,
          },
        ],
      }),
      ASSISTANT_PROVIDER_ERROR_CODES.INVALID_REQUEST
    );
  }
});

test("Gemini provider maps upstream statuses to stable provider errors", async () => {
  const cases = [
    {
      status: 401,
      code: ASSISTANT_PROVIDER_ERROR_CODES.AUTH_FAILED,
      retryable: false,
    },
    {
      status: 403,
      code: ASSISTANT_PROVIDER_ERROR_CODES.AUTH_FAILED,
      retryable: false,
    },
    {
      status: 408,
      code: ASSISTANT_PROVIDER_ERROR_CODES.TIMEOUT,
      retryable: true,
    },
    {
      status: 429,
      code: ASSISTANT_PROVIDER_ERROR_CODES.RATE_LIMITED,
      retryable: true,
    },
    {
      status: 500,
      code: ASSISTANT_PROVIDER_ERROR_CODES.UNAVAILABLE,
      retryable: true,
    },
    {
      status: 400,
      code: ASSISTANT_PROVIDER_ERROR_CODES.INVALID_REQUEST,
      retryable: false,
    },
  ];

  for (const item of cases) {
    const provider = createProvider(async () =>
      jsonResponse({}, item.status)
    );

    await expectProviderError(
      provider.chat({
        systemInstruction: "Sistema",
        messages: [{ role: "user", content: "Hola" }],
      }),
      item.code,
      {
        retryable: item.retryable,
        upstreamStatus: item.status,
      }
    );
  }
});

test("Gemini provider maps network, timeout and malformed responses", async () => {
  const timeoutError = new Error("timed out");
  timeoutError.name = "TimeoutError";

  const timeoutProvider = createProvider(async () => {
    throw timeoutError;
  });

  await expectProviderError(
    timeoutProvider.chat({
      systemInstruction: "Sistema",
      messages: [{ role: "user", content: "Hola" }],
    }),
    ASSISTANT_PROVIDER_ERROR_CODES.TIMEOUT,
    { retryable: true }
  );

  const networkProvider = createProvider(async () => {
    throw new Error("network down");
  });

  await expectProviderError(
    networkProvider.chat({
      systemInstruction: "Sistema",
      messages: [{ role: "user", content: "Hola" }],
    }),
    ASSISTANT_PROVIDER_ERROR_CODES.UNAVAILABLE,
    { retryable: true }
  );

  const malformedProvider = createProvider(async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error("not json");
    },
  }));

  await expectProviderError(
    malformedProvider.chat({
      systemInstruction: "Sistema",
      messages: [{ role: "user", content: "Hola" }],
    }),
    ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
  );

  const emptyProvider = createProvider(async () =>
    jsonResponse({ candidates: [] })
  );

  await expectProviderError(
    emptyProvider.chat({
      systemInstruction: "Sistema",
      messages: [{ role: "user", content: "Hola" }],
    }),
    ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
  );
});

test("Gemini provider rejects invalid local input", async () => {
  const provider = createProvider(async () =>
    jsonResponse({
      candidates: [
        {
          content: { parts: [{ text: "ok" }] },
        },
      ],
    })
  );

  await assert.rejects(
    provider.chat({
      systemInstruction: " ",
      messages: [{ role: "user", content: "Hola" }],
    }),
    TypeError
  );

  for (const messages of [
    [],
    [{ role: "system", content: "Hola" }],
    [{ role: "user", content: " " }],
    null,
  ]) {
    await expectProviderError(
      provider.chat({
        systemInstruction: "Sistema",
        messages,
      }),
      ASSISTANT_PROVIDER_ERROR_CODES.INVALID_REQUEST
    );
  }
});

test("assistant provider factory exposes capabilities and rejects unknown providers", () => {
  assert.deepEqual(PROVIDER_IDS, ["gemini"]);

  const provider = createProvider(async () => null);

  assert.equal(provider.id, "gemini");
  assert.equal(provider.model, "gemini-test");
  assert.deepEqual(provider.capabilities, {
    supportsTools: true,
    supportsStreaming: false,
  });
  assert.equal(
    Object.isFrozen(provider.capabilities),
    true
  );

  assert.throws(
    () =>
      createAssistantProvider({
        provider: "unknown",
      }),
    /Unsupported AI provider/
  );

  assert.throws(
    () =>
      createAssistantProvider({
        provider: "gemini",
        apiKey: "",
        model: "gemini-test",
        maxOutputTokens: 1024,
        timeoutMs: 30_000,
        fetchImpl: async () => null,
      }),
    TypeError
  );
});
