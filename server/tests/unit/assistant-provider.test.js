const test = require("node:test");
const { mock } = require("node:test");
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
const {
  MAX_TOOL_DECLARATIONS,
} = require(
  "../../src/modules/assistant/assistant.constants"
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
        "dailyProviderCalls: assistant.dailyProviderCalls,",
        "priceInputPerM: assistant.priceInputPerM,",
        "priceOutputPerM: assistant.priceOutputPerM,",
        "hasApiKey: Boolean(assistant.apiKey),",
        "geminiEnabled: assistant.gemini.enabled,",
        "geminiApiKeyPresent: Boolean(assistant.gemini.apiKey),",
        "geminiModel: assistant.gemini.model,",
        "nvidiaEnabled: assistant.nvidia.enabled,",
        "nvidiaModel: assistant.nvidia.model,",
        "nvidiaMaxOutputTokens: assistant.nvidia.maxOutputTokens,",
        "nvidiaTimeoutMs: assistant.nvidia.timeoutMs,",
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

function sseResponse(payloads, status = 200) {
  const contents = payloads
    .map(
      (payload) =>
        `data: ${JSON.stringify(payload)}\r\n\r\n`
    )
    .join("");
  const encoded = new TextEncoder().encode(contents);

  return {
    ok: status >= 200 && status < 300,
    status,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoded.slice(0, 17));
        controller.enqueue(encoded.slice(17, 48));
        controller.enqueue(encoded.slice(48));
        controller.close();
      },
    }),
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

function createProviderWithNvidia(fetchImpl, overrides = {}) {
  return createAssistantProvider({
    provider: "gemini",
    apiKey: "test-gemini-key",
    model: "gemini-test",
    maxOutputTokens: 1024,
    timeoutMs: 30_000,
    nvidia: {
      apiKey: "test-nvidia-key",
      model: "meta/test-model",
    },
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

    if ("retryAfterMs" in expected) {
      assert.equal(
        error.retryAfterMs,
        expected.retryAfterMs
      );
    }

    if ("providerCalls" in expected) {
      assert.equal(error.providerCalls, expected.providerCalls);
    }

    if ("providers" in expected) {
      assert.deepEqual(error.providers, expected.providers);
    }

    return true;
  });
}

test("assistant configuration is optional, frozen and disabled without an API key", () => {
  const result = runAssistantConfig({}, [
    "GEMINI_API_KEY",
    "NVIDIA_API_KEY",
    "NVIDIA_MODEL",
    "NVIDIA_MAX_OUTPUT_TOKENS",
    "NVIDIA_TIMEOUT_MS",
    "AI_PROVIDER",
    "AI_MODEL",
    "AI_MAX_OUTPUT_TOKENS",
    "AI_TIMEOUT_MS",
    "AI_DAILY_PROVIDER_CALLS",
    "AI_PRICE_INPUT_PER_M",
    "AI_PRICE_OUTPUT_PER_M",
  ]);

  assert.equal(result.status, 0, result.stderr);

  const output = parseConfigOutput(result);

  assert.deepEqual(output.keys, [
    "apiKey",
    "dailyProviderCalls",
    "enabled",
    "gemini",
    "maxOutputTokens",
    "model",
    "nvidia",
    "priceInputPerM",
    "priceOutputPerM",
    "provider",
    "timeoutMs",
  ]);
  assert.equal(output.frozen, true);
  assert.equal(output.enabled, false);
  assert.equal(output.provider, "gemini");
  assert.equal(output.model, "gemini-3.5-flash");
  assert.equal(output.maxOutputTokens, 1024);
  assert.equal(output.timeoutMs, 30_000);
  assert.equal(output.dailyProviderCalls, 120);
  assert.equal(output.priceInputPerM, 0);
  assert.equal(output.priceOutputPerM, 0);
  assert.equal(output.hasApiKey, false);
  assert.equal(output.nvidiaEnabled, false);
  assert.equal(output.nvidiaModel, null);
  assert.equal(output.geminiEnabled, false);
  assert.equal(output.geminiApiKeyPresent, false);
  assert.equal(output.geminiModel, "gemini-3.5-flash");
  assert.equal(output.nvidiaMaxOutputTokens, 2048);
  assert.equal(output.nvidiaTimeoutMs, 30_000);
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
  assert.equal(output.nvidiaEnabled, false);
  assert.equal(output.nvidiaModel, null);
  assert.equal(
    result.stdout.includes("test-gemini-key"),
    false
  );
});

test("assistant configuration enables NVIDIA fallback without exposing its key", () => {
  const result = runAssistantConfig({
    GEMINI_API_KEY: "test-gemini-key",
    NVIDIA_API_KEY: "test-nvidia-key",
    NVIDIA_MODEL: "meta/test-model",
  });

  assert.equal(result.status, 0, result.stderr);
  const output = parseConfigOutput(result);
  assert.equal(output.enabled, true);
  assert.equal(output.nvidiaEnabled, true);
  assert.equal(output.nvidiaModel, "meta/test-model");
  assert.equal(output.nvidiaMaxOutputTokens, 2048);
  assert.equal(output.nvidiaTimeoutMs, 30_000);
  assert.equal(
    result.stdout.includes("test-nvidia-key"),
    false
  );
});

test("assistant configuration can select NVIDIA as primary with Gemini fallback", () => {
  const result = runAssistantConfig({
    AI_PROVIDER: "nvidia",
    GEMINI_API_KEY: "test-gemini-key",
    NVIDIA_API_KEY: "test-nvidia-key",
    NVIDIA_MODEL: "meta/test-model",
  });

  assert.equal(result.status, 0, result.stderr);
  const output = parseConfigOutput(result);
  assert.equal(output.enabled, true);
  assert.equal(output.provider, "nvidia");
  assert.equal(output.model, "meta/test-model");
  assert.equal(output.hasApiKey, true);
  assert.equal(output.nvidiaEnabled, true);
  assert.equal(output.geminiEnabled, true);
  assert.equal(output.geminiApiKeyPresent, true);
  assert.equal(output.geminiModel, "gemini-3.5-flash");
  assert.equal(
    result.stdout.includes("test-nvidia-key"),
    false
  );
  assert.equal(
    result.stdout.includes("test-gemini-key"),
    false
  );

  const nvidiaOnlyResult = runAssistantConfig(
    {
      AI_PROVIDER: "nvidia",
      NVIDIA_API_KEY: "test-nvidia-key",
      NVIDIA_MODEL: "meta/test-model",
    },
    ["GEMINI_API_KEY"]
  );
  assert.equal(nvidiaOnlyResult.status, 0, nvidiaOnlyResult.stderr);
  const nvidiaOnly = parseConfigOutput(nvidiaOnlyResult);
  assert.equal(nvidiaOnly.enabled, true);
  assert.equal(nvidiaOnly.provider, "nvidia");
  assert.equal(nvidiaOnly.geminiEnabled, false);
});

test("assistant configuration gives NVIDIA its own output and timeout budget", () => {
  const result = runAssistantConfig({
    GEMINI_API_KEY: "test-gemini-key",
    AI_MAX_OUTPUT_TOKENS: "512",
    AI_TIMEOUT_MS: "15000",
    NVIDIA_API_KEY: "test-nvidia-key",
    NVIDIA_MODEL: "meta/test-model",
    NVIDIA_MAX_OUTPUT_TOKENS: "3072",
    NVIDIA_TIMEOUT_MS: "20000",
  });

  assert.equal(result.status, 0, result.stderr);
  const output = parseConfigOutput(result);
  assert.equal(output.maxOutputTokens, 512);
  assert.equal(output.timeoutMs, 15_000);
  assert.equal(output.nvidiaMaxOutputTokens, 3072);
  assert.equal(output.nvidiaTimeoutMs, 20_000);
});

test("assistant configuration rejects unsupported providers and invalid limits", () => {
  const cases = [
    {
      overrides: { AI_PROVIDER: "openai" },
      variable: "AI_PROVIDER",
    },
    {
      overrides: { AI_PROVIDER: "nvidia" },
      variable: "NVIDIA_API_KEY",
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
      overrides: { NVIDIA_API_KEY: "test-nvidia-key" },
      variable: "NVIDIA_MODEL",
    },
    {
      overrides: { NVIDIA_MODEL: "meta/test-model" },
      removedKeys: ["NVIDIA_API_KEY"],
      variable: "NVIDIA_API_KEY",
    },
    {
      overrides: {
        NVIDIA_API_KEY: "test-nvidia-key",
        NVIDIA_MODEL: "bad model",
      },
      variable: "NVIDIA_MODEL",
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
    {
      overrides: { NVIDIA_MAX_OUTPUT_TOKENS: "0" },
      variable: "NVIDIA_MAX_OUTPUT_TOKENS",
    },
    {
      overrides: { NVIDIA_MAX_OUTPUT_TOKENS: "4097" },
      variable: "NVIDIA_MAX_OUTPUT_TOKENS",
    },
    {
      overrides: { NVIDIA_MAX_OUTPUT_TOKENS: "abc" },
      variable: "NVIDIA_MAX_OUTPUT_TOKENS",
    },
    {
      overrides: { NVIDIA_TIMEOUT_MS: "4999" },
      variable: "NVIDIA_TIMEOUT_MS",
    },
    {
      overrides: { NVIDIA_TIMEOUT_MS: "60001" },
      variable: "NVIDIA_TIMEOUT_MS",
    },
    {
      overrides: { AI_DAILY_PROVIDER_CALLS: "-1" },
      variable: "AI_DAILY_PROVIDER_CALLS",
    },
    {
      overrides: { AI_DAILY_PROVIDER_CALLS: "1.5" },
      variable: "AI_DAILY_PROVIDER_CALLS",
    },
    {
      overrides: { AI_PRICE_INPUT_PER_M: "abc" },
      variable: "AI_PRICE_INPUT_PER_M",
    },
    {
      overrides: { AI_PRICE_INPUT_PER_M: "-1" },
      variable: "AI_PRICE_INPUT_PER_M",
    },
    {
      overrides: { AI_PRICE_OUTPUT_PER_M: "10001" },
      variable: "AI_PRICE_OUTPUT_PER_M",
    },
  ];

  for (const { overrides, removedKeys, variable } of cases) {
    const result = runAssistantConfig(overrides, removedKeys);

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
    provider: "gemini",
    providers: ["gemini"],
    providerCalls: 1,
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

  test("Gemini provider streams final text across split SSE frames", async () => {
    let captured;
    const provider = createProvider(
      async (url, options) => {
        captured = { url, options };
        return sseResponse([
          {
            candidates: [
              {
                content: {
                  parts: [
                    { text: "Hola " },
                    { thought: true, text: "interno" },
                  ],
                },
              },
            ],
          },
          {
            candidates: [
              {
                content: {
                  parts: [{ text: "mundo" }],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 12,
              candidatesTokenCount: 2,
            },
            modelVersion: "gemini-stream-test",
          },
        ]);
      }
    );
    const chunks = [];

    const result = await provider.chatStream(
      {
        systemInstruction: "Sos el asistente.",
        messages: [{ role: "user", content: "Hola" }],
        tools: [],
      },
      (chunk) => chunks.push(chunk)
    );

    assert.match(
      captured.url,
      /\/models\/gemini-test:streamGenerateContent\?alt=sse$/
    );
    assert.equal(
      captured.options.headers.accept,
      "text/event-stream"
    );
    assert.equal(
      JSON.parse(captured.options.body).tools,
      undefined
    );
    assert.deepEqual(chunks, ["Hola ", "mundo"]);
    assert.deepEqual(result, {
      text: "Hola mundo",
      model: "gemini-stream-test",
      provider: "gemini",
      providers: ["gemini"],
      providerCalls: 1,
      usage: { inputTokens: 12, outputTokens: 2 },
      finishReason: "STOP",
      blocked: false,
      toolCalls: [],
    });
    assert.equal(provider.capabilities.supportsStreaming, true);
  });

  test("streaming failover withholds partial chunks until fallback completes", async () => {
    let resolveNvidiaPayload;
    let notifyNvidiaStarted;
    const nvidiaStarted = new Promise((resolve) => {
      notifyNvidiaStarted = resolve;
    });
    const nvidiaPayload = new Promise((resolve) => {
      resolveNvidiaPayload = resolve;
    });
    const partialPayload = {
      candidates: [
        {
          content: {
            parts: [{ text: "Respuesta parcial de Gemini." }],
          },
        },
      ],
    };
    const partialFrame = new TextEncoder().encode(
      `data: ${JSON.stringify(partialPayload)}\r\n\r\n`
    );
    let geminiPulls = 0;
    const provider = createProviderWithNvidia(async (url) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          body: new ReadableStream({
            pull(controller) {
              geminiPulls += 1;
              if (geminiPulls === 1) {
                controller.enqueue(partialFrame);
              } else {
                controller.error(
                  new Error("stream interrupted")
                );
              }
            },
          }),
        };
      }

      notifyNvidiaStarted();
      return {
        ok: true,
        status: 200,
        json: async () => nvidiaPayload,
      };
    });
    const chunks = [];
    const stream = provider.chatStream(
      {
        systemInstruction: "Sistema.",
        messages: [{ role: "user", content: "Hola" }],
        tools: [],
      },
      (chunk) => chunks.push(chunk)
    );

    await nvidiaStarted;
    assert.equal(geminiPulls, 2);
    assert.deepEqual(chunks, []);
    resolveNvidiaPayload({
      choices: [
        {
          message: {
            role: "assistant",
            content: "Respuesta completa de NVIDIA.",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 6,
      },
    });

    const result = await stream;

    assert.deepEqual(chunks, ["Respuesta completa de NVIDIA."]);
    assert.equal(result.text, "Respuesta completa de NVIDIA.");
    assert.deepEqual(result.providers, ["gemini", "nvidia"]);
    assert.equal(result.providerCalls, 2);
  });

  test("Gemini provider streams a function call when tools are declared", async () => {
    let captured;
    const provider = createProvider(async (url, options) => {
      captured = { url, options };

      return sseResponse([
        {
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "search_products",
                      args: { query: "pollo" },
                    },
                  },
                ],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: {
            promptTokenCount: 30,
            candidatesTokenCount: 5,
          },
        },
      ]);
    });
    const chunks = [];

    const result = await provider.chatStream(
      {
        systemInstruction: "Sos el asistente.",
        messages: [{ role: "user", content: "¿Pollo?" }],
        tools: [
          {
            name: "search_products",
            description: "Busca productos",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string" },
              },
              required: ["query"],
              additionalProperties: false,
            },
          },
        ],
      },
      (chunk) => chunks.push(chunk)
    );

    const body = JSON.parse(captured.options.body);

    assert.deepEqual(
      body.tools[0].functionDeclarations.map(
        (tool) => tool.name
      ),
      ["search_products"]
    );
    assert.deepEqual(chunks, []);
    assert.deepEqual(result.toolCalls, [
      {
        name: "search_products",
        arguments: { query: "pollo" },
      },
    ]);
  });

  test("Gemini provider rejects malformed streamed events", async () => {
    const provider = createProvider(async () => ({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode("data: not-json\n\n")
          );
          controller.close();
        },
      }),
    }));

    await expectProviderError(
      provider.chatStream(
        {
          systemInstruction: "Sistema.",
          messages: [{ role: "user", content: "Hola" }],
          tools: [],
        },
        () => {}
      ),
      ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
    );
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

  const validDeclaration = (index) => ({
    name: `tool_${index}`,
    description: "Consulta datos.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  });
  const declarations = Array.from(
    { length: MAX_TOOL_DECLARATIONS },
    (_, index) => validDeclaration(index)
  );

  await provider.chat({
    systemInstruction: "Sistema.",
    messages: [{ role: "user", content: "Hola" }],
    tools: declarations,
  });
  await expectProviderError(
    provider.chat({
      systemInstruction: "Sistema.",
      messages: [{ role: "user", content: "Hola" }],
      tools: [
        ...declarations,
        validDeclaration(MAX_TOOL_DECLARATIONS),
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

test("Gemini provider reads retryDelay from 429 error details", async () => {
  for (const [retryDelay, expectedMs] of [
    ["20s", 20_000],
    ["300s", 300_000],
  ]) {
    const provider = createProvider(async () => ({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          details: [
            {
              "@type":
                "type.googleapis.com/google.rpc.RetryInfo",
              retryDelay,
            },
          ],
        },
      }),
    }));

    await expectProviderError(
      provider.chat({
        systemInstruction: "Sistema.",
        messages: [{ role: "user", content: "Hola" }],
      }),
      ASSISTANT_PROVIDER_ERROR_CODES.RATE_LIMITED,
      { retryAfterMs: expectedMs }
    );
  }

  const malformedProvider = createProvider(async () => ({
    ok: false,
    status: 429,
    json: async () => ({
      error: { details: [{ retryDelay: "later" }] },
    }),
  }));
  await expectProviderError(
    malformedProvider.chat({
      systemInstruction: "Sistema.",
      messages: [{ role: "user", content: "Hola" }],
    }),
    ASSISTANT_PROVIDER_ERROR_CODES.RATE_LIMITED,
    { retryAfterMs: null }
  );

  const headerProvider = createProvider(async () => ({
    ok: false,
    status: 429,
    headers: { get: () => "7" },
    json: async () => ({
      error: {
        details: [{ retryDelay: "20s" }],
      },
    }),
  }));
  await expectProviderError(
    headerProvider.chat({
      systemInstruction: "Sistema.",
      messages: [{ role: "user", content: "Hola" }],
    }),
    ASSISTANT_PROVIDER_ERROR_CODES.RATE_LIMITED,
    { retryAfterMs: 7_000 }
  );
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

test("Gemini quota errors continue on NVIDIA and cool down the limited provider", async () => {
  let now = 1_000;
  let geminiCalls = 0;
  let nvidiaCalls = 0;
  let nvidiaRequest;
  const provider = createProviderWithNvidia(
    async (url, options) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        geminiCalls += 1;
        return {
          ok: false,
          status: 429,
          headers: { get: () => "60" },
        };
      }

      nvidiaCalls += 1;
      nvidiaRequest = { url, options };
      return jsonResponse({
        model: "meta/test-model",
        choices: [
          {
            message: {
              role: "assistant",
              content: "Continué con el contexto.",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 7,
        },
      });
    },
    { now: () => now }
  );
  const input = {
    systemInstruction: "Sos el asistente.",
    messages: [{ role: "user", content: "Continuá" }],
  };

  const first = await provider.chat(input);
  const second = await provider.chat(input);

  assert.equal(first.text, "Continué con el contexto.");
  assert.equal(first.provider, "nvidia");
  assert.deepEqual(first.providers, ["gemini", "nvidia"]);
  assert.equal(first.providerCalls, 2);
  assert.deepEqual(first.usage, {
    inputTokens: 20,
    outputTokens: 7,
  });
  assert.equal(second.provider, "nvidia");
  assert.deepEqual(second.providers, ["nvidia"]);
  assert.equal(geminiCalls, 1);
  assert.equal(nvidiaCalls, 2);
  assert.equal(
    nvidiaRequest.url,
    "https://integrate.api.nvidia.com/v1/chat/completions"
  );
  assert.equal(
    nvidiaRequest.options.headers.authorization,
    "Bearer test-nvidia-key"
  );
  assert.deepEqual(
    JSON.parse(nvidiaRequest.options.body).messages,
    [
      { role: "system", content: "Sos el asistente." },
      { role: "user", content: "Continuá" },
    ]
  );

  now += 60_001;
  const recovered = await provider.chat(input);
  assert.equal(recovered.provider, "nvidia");
  assert.equal(geminiCalls, 2);
});

test("the failover does not hide authentication or request errors", async () => {
  let calls = 0;
  const provider = createProviderWithNvidia(async () => {
    calls += 1;
    return { ok: false, status: 401 };
  });

  await expectProviderError(
    provider.chat({
      systemInstruction: "Sistema",
      messages: [{ role: "user", content: "Hola" }],
    }),
    ASSISTANT_PROVIDER_ERROR_CODES.AUTH_FAILED,
    { upstreamStatus: 401 }
  );
  assert.equal(calls, 1);
});

test("the failover respects the remaining provider-call budget", async () => {
  let geminiCalls = 0;
  let nvidiaCalls = 0;
  const provider = createProviderWithNvidia(
    async (url) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        geminiCalls += 1;
        return { ok: false, status: 429 };
      }

      nvidiaCalls += 1;
      return jsonResponse({
        choices: [
          {
            message: {
              role: "assistant",
              content: "No debe usarse con el presupuesto agotado.",
            },
            finish_reason: "stop",
          },
        ],
      });
    }
  );

  await expectProviderError(
    provider.chat({
      systemInstruction: "Sistema.",
      messages: [{ role: "user", content: "Hola" }],
      providerCallLimit: 1,
    }),
    ASSISTANT_PROVIDER_ERROR_CODES.RATE_LIMITED,
    {
      providerCalls: 1,
      providers: ["gemini"],
    }
  );
  assert.equal(geminiCalls, 1);
  assert.equal(nvidiaCalls, 0);
});

test("a timeout cools a provider for 15 seconds instead of a full minute", async () => {
  let now = 1_000;
  let geminiCalls = 0;
  const provider = createProviderWithNvidia(
    async (url) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        geminiCalls += 1;
        const timeout = new Error("timed out");
        timeout.name = "TimeoutError";
        throw timeout;
      }

      return jsonResponse({
        choices: [
          {
            message: { role: "assistant", content: "ok" },
            finish_reason: "stop",
          },
        ],
      });
    },
    { now: () => now }
  );
  const input = {
    systemInstruction: "Sistema.",
    messages: [{ role: "user", content: "Hola" }],
  };

  await provider.chat(input);
  assert.equal(geminiCalls, 1);

  // A los 14,999 s todavia esta enfriando.
  now += 14_999;
  await provider.chat(input);
  assert.equal(geminiCalls, 1);

  // A los 15 s se reintenta el proveedor principal.
  now += 2;
  await provider.chat(input);
  assert.equal(geminiCalls, 2);
});

test("a rate limit without retry-after cools the provider for a full minute", async () => {
  let now = 1_000;
  let geminiCalls = 0;
  const provider = createProviderWithNvidia(
    async (url) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        geminiCalls += 1;
        return { ok: false, status: 429 };
      }

      return jsonResponse({
        choices: [
          {
            message: { role: "assistant", content: "ok" },
            finish_reason: "stop",
          },
        ],
      });
    },
    { now: () => now }
  );
  const input = {
    systemInstruction: "Sistema.",
    messages: [{ role: "user", content: "Hola" }],
  };

  await provider.chat(input);

  now += 59_999;
  await provider.chat(input);
  assert.equal(geminiCalls, 1);

  now += 2;
  await provider.chat(input);
  assert.equal(geminiCalls, 2);
});

test("Gemini retryDelay controls the rate-limit cooldown", async () => {
  let now = 1_000;
  let geminiCalls = 0;
  const provider = createProviderWithNvidia(
    async (url) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        geminiCalls += 1;
        if (geminiCalls === 1) {
          return {
            ok: false,
            status: 429,
            json: async () => ({
              error: {
                details: [{ retryDelay: "20s" }],
              },
            }),
          };
        }

        return jsonResponse({
          candidates: [
            {
              content: { parts: [{ text: "ok" }] },
              finishReason: "STOP",
            },
          ],
        });
      }

      return jsonResponse({
        choices: [
          {
            message: { role: "assistant", content: "ok" },
            finish_reason: "stop",
          },
        ],
      });
    },
    { now: () => now }
  );
  const input = {
    systemInstruction: "Sistema.",
    messages: [{ role: "user", content: "Hola" }],
  };

  await provider.chat(input);
  assert.equal(geminiCalls, 1);

  now += 19_999;
  await provider.chat(input);
  assert.equal(geminiCalls, 1);

  now += 1;
  await provider.chat(input);
  assert.equal(geminiCalls, 2);
});

test("a fully cooled chain probes only the provider that is not quota limited", async () => {
  let now = 1_000;
  let geminiCalls = 0;
  let nvidiaCalls = 0;
  let nvidiaHealthy = false;
  const provider = createProviderWithNvidia(
    async (url) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        geminiCalls += 1;
        return { ok: false, status: 429 };
      }

      nvidiaCalls += 1;

      if (!nvidiaHealthy) {
        return { ok: false, status: 500 };
      }

      return jsonResponse({
        choices: [
          {
            message: { role: "assistant", content: "ok" },
            finish_reason: "stop",
          },
        ],
      });
    },
    { now: () => now }
  );
  const input = {
    systemInstruction: "Sistema.",
    messages: [{ role: "user", content: "Hola" }],
  };

  // Gemini queda 60 s y NVIDIA 15 s: los dos enfrian.
  await expectProviderError(
    provider.chat(input),
    ASSISTANT_PROVIDER_ERROR_CODES.UNAVAILABLE,
    { providerCalls: 2, providers: ["gemini", "nvidia"] }
  );
  assert.equal(geminiCalls, 1);
  assert.equal(nvidiaCalls, 1);

  // Pasada la ventana se sondea NVIDIA (el 429 no se sondea nunca).
  now += 1_000;
  await expectProviderError(
    provider.chat(input),
    ASSISTANT_PROVIDER_ERROR_CODES.UNAVAILABLE,
    { providerCalls: 1, providers: ["nvidia"] }
  );
  assert.equal(geminiCalls, 1);
  assert.equal(nvidiaCalls, 2);

  // Dentro de la ventana de 5 s no se repite el sondeo.
  now += 4_000;
  await expectProviderError(
    provider.chat(input),
    ASSISTANT_PROVIDER_ERROR_CODES.UNAVAILABLE,
    { providerCalls: 0, providers: [] }
  );
  assert.equal(nvidiaCalls, 2);

  // Vencida la ventana, el sondeo descubre que NVIDIA ya se recupero.
  now += 1_001;
  nvidiaHealthy = true;
  const recovered = await provider.chat(input);

  assert.equal(recovered.provider, "nvidia");
  assert.deepEqual(recovered.providers, ["nvidia"]);
  assert.equal(recovered.providerCalls, 1);
  assert.equal(nvidiaCalls, 3);
  assert.equal(geminiCalls, 1);
});

test("NVIDIA converts tool history and normalizes function-call responses", async () => {
  let capturedBody;
  const provider = createProviderWithNvidia(
    async (url, options) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return { ok: false, status: 429 };
      }

      capturedBody = JSON.parse(options.body);
      return jsonResponse({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "nvidia-call-1",
                  type: "function",
                  function: {
                    name: "count_products",
                    arguments: "{}",
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      });
    }
  );
  const result = await provider.chat({
    systemInstruction: "Sistema.",
    messages: [
      { role: "user", content: "Contá productos." },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            name: "count_products",
            arguments: {},
            id: "gemini-call-1",
          },
        ],
      },
      {
        role: "tool",
        name: "count_products",
        content: '{"totalProducts":5}',
      },
    ],
    tools: [
      {
        name: "count_products",
        description: "Cuenta productos.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
    ],
  });

  assert.deepEqual(
    capturedBody.messages.map((message) => message.role),
    ["system", "user", "assistant", "tool"]
  );
  assert.equal(
    capturedBody.messages[2].tool_calls[0].id,
    "gemini-call-1"
  );
  assert.equal(
    capturedBody.messages[3].tool_call_id,
    "gemini-call-1"
  );
  assert.deepEqual(capturedBody.tools[0], {
    type: "function",
    function: {
      name: "count_products",
      description: "Cuenta productos.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  });
  assert.deepEqual(result.toolCalls, [
    {
      name: "count_products",
      arguments: {},
      id: "nvidia-call-1",
    },
  ]);
  assert.deepEqual(result.providers, ["gemini", "nvidia"]);
});

test("NVIDIA reports a truncated answer instead of a generic invalid response", async () => {
  const provider = createProviderWithNvidia(
    async (url) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return { ok: false, status: 429 };
      }

      return jsonResponse({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              reasoning_content:
                "Analizando la consulta antes de responder.",
            },
            finish_reason: "length",
          },
        ],
        usage: {
          prompt_tokens: 40,
          completion_tokens: 1024,
        },
      });
    }
  );

  // reasoning_content no es texto de respuesta: sin content y sin tool_calls
  // el unico error posible es el truncado, y no debe reintentarse.
  await expectProviderError(
    provider.chat({
      systemInstruction: "Sistema.",
      messages: [{ role: "user", content: "Hola" }],
    }),
    ASSISTANT_PROVIDER_ERROR_CODES.OUTPUT_TRUNCATED,
    { retryable: false }
  );
});

test("NVIDIA keeps partial text when the answer is cut by length", async () => {
  const provider = createProviderWithNvidia(
    async (url) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return { ok: false, status: 429 };
      }

      return jsonResponse({
        choices: [
          {
            message: {
              role: "assistant",
              content: "Puedo ayudarte a gestionar",
            },
            finish_reason: "length",
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 1024,
        },
      });
    }
  );

  const result = await provider.chat({
    systemInstruction: "Sistema.",
    messages: [{ role: "user", content: "Hola" }],
  });

  assert.equal(result.text, "Puedo ayudarte a gestionar");
  assert.equal(result.truncated, true);
  assert.deepEqual(result.providers, ["gemini", "nvidia"]);
});

test("the NVIDIA fallback uses its own output budget and inherits the general one", async () => {
  let capturedBody = null;
  const capture = async (url, options) => {
    if (url.includes("generativelanguage.googleapis.com")) {
      return { ok: false, status: 429 };
    }

    capturedBody = JSON.parse(options.body);
    return jsonResponse({
      choices: [
        {
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        },
      ],
    });
  };

  const input = {
    systemInstruction: "Sistema.",
    messages: [{ role: "user", content: "Hola" }],
  };

  const custom = createProviderWithNvidia(capture, {
    nvidia: {
      apiKey: "test-nvidia-key",
      model: "meta/test-model",
      maxOutputTokens: 3072,
      timeoutMs: 20_000,
    },
  });
  await custom.chat(input);
  assert.equal(capturedBody.max_tokens, 3072);

  const inherited = createProviderWithNvidia(capture);
  await inherited.chat(input);
  assert.equal(capturedBody.max_tokens, 1024);
});

test("assistant provider factory exposes both providers and rejects unknown providers", () => {
  assert.deepEqual(PROVIDER_IDS, ["gemini", "nvidia"]);

  const provider = createProvider(async () => null);

  assert.equal(provider.id, "gemini");
  assert.equal(provider.model, "gemini-test");
  assert.deepEqual(provider.capabilities, {
    supportsTools: true,
    supportsStreaming: true,
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

  const nvidiaProvider = createAssistantProvider({
    provider: "nvidia",
    apiKey: "test-nvidia-key",
    model: "meta/test-model",
    maxOutputTokens: 2048,
    timeoutMs: 30_000,
    nvidia: {
      apiKey: "test-nvidia-key",
      model: "meta/test-model",
      maxOutputTokens: 2048,
      timeoutMs: 30_000,
    },
    gemini: {
      apiKey: "test-gemini-key",
      model: "gemini-test",
    },
    fetchImpl: async () => jsonResponse({
      choices: [
        {
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        },
      ],
    }),
  });

  assert.equal(nvidiaProvider.id, "nvidia");
  assert.equal(nvidiaProvider.model, "meta/test-model");
  assert.deepEqual(nvidiaProvider.fallback, {
    enabled: true,
    provider: "gemini",
    model: "gemini-test",
  });
});

test("NVIDIA primary fails over to Gemini when NVIDIA is rate limited", async () => {
  let nvidiaCalls = 0;
  let geminiCalls = 0;
  const provider = createAssistantProvider({
    provider: "nvidia",
    apiKey: "test-nvidia-key",
    model: "meta/test-model",
    maxOutputTokens: 2048,
    timeoutMs: 30_000,
    nvidia: {
      apiKey: "test-nvidia-key",
      model: "meta/test-model",
      maxOutputTokens: 2048,
      timeoutMs: 30_000,
    },
    gemini: {
      apiKey: "test-gemini-key",
      model: "gemini-test",
    },
    fetchImpl: async (url) => {
      if (url.includes("integrate.api.nvidia.com")) {
        nvidiaCalls += 1;
        return jsonResponse({}, 429);
      }

      geminiCalls += 1;
      return jsonResponse({
        candidates: [
          {
            content: { parts: [{ text: "Respuesta de Gemini." }] },
            finishReason: "STOP",
          },
        ],
      });
    },
  });

  const result = await provider.chat({
    systemInstruction: "Sistema.",
    messages: [{ role: "user", content: "Hola" }],
  });

  assert.equal(result.text, "Respuesta de Gemini.");
  assert.deepEqual(result.providers, ["nvidia", "gemini"]);
  assert.equal(result.provider, "gemini");
  assert.equal(result.providerCalls, 2);
  assert.equal(nvidiaCalls, 1);
  assert.equal(geminiCalls, 1);
});

test("the provider exposes whether a fallback model is configured", () => {
  const primary = createProvider(async () => null);
  assert.deepEqual(primary.fallback, {
    enabled: false,
    provider: null,
    model: null,
  });

  const withFallback = createProviderWithNvidia(async () => null);
  assert.deepEqual(withFallback.fallback, {
    enabled: true,
    provider: "nvidia",
    model: "meta/test-model",
  });
  assert.equal(Object.isFrozen(withFallback.fallback), true);
});

test("a failover logs one sanitized line and never the api key", async () => {
  const logged = [];
  const restore = mock.method(console, "log", (line) => {
    logged.push(String(line));
  });

  try {
    const provider = createProviderWithNvidia(async (url) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return { ok: false, status: 429 };
      }

      return jsonResponse({
        choices: [
          {
            message: { role: "assistant", content: "ok" },
            finish_reason: "stop",
          },
        ],
      });
    });

    await provider.chat({
      systemInstruction: "Sistema.",
      messages: [{ role: "user", content: "Hola" }],
    });
  } finally {
    restore.mock.restore();
  }

  assert.deepEqual(logged, [
    "Assistant provider failover: from=gemini to=nvidia code=RATE_LIMITED",
  ]);
  assert.equal(
    logged.some(
      (line) =>
        line.includes("test-nvidia-key") ||
        line.includes("test-gemini-key")
    ),
    false
  );
});
