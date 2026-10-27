const {
  ASSISTANT_PROVIDERS,
  ASSISTANT_TEMPERATURE,
  ASSISTANT_THINKING_BUDGET,
  MAX_TOOL_ARGUMENT_CHARS,
  MAX_TOOL_CALLS_PER_RESPONSE,
  MAX_TOOL_DECLARATIONS,
  MAX_TOOL_RESULT_CHARS,
  MIN_ASSISTANT_MAX_OUTPUT_TOKENS,
  MAX_ASSISTANT_MAX_OUTPUT_TOKENS,
  MIN_ASSISTANT_TIMEOUT_MS,
  MAX_ASSISTANT_TIMEOUT_MS,
} = require("../assistant.constants");

const {
  ASSISTANT_PROVIDER_ERROR_CODES,
  AssistantProviderError,
} = require("../assistant.provider-error");

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta";
const MODEL_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;
const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const GEMINI_SCHEMA_TYPES = Object.freeze({
  array: "ARRAY",
  boolean: "BOOLEAN",
  integer: "INTEGER",
  number: "NUMBER",
  object: "OBJECT",
  string: "STRING",
});
const BLOCKED_FINISH_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "IMAGE_SAFETY",
]);

function invalidRequest() {
  return new AssistantProviderError(
    ASSISTANT_PROVIDER_ERROR_CODES.INVALID_REQUEST
  );
}

function invalidResponse(upstreamStatus = null) {
  return new AssistantProviderError(
    ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE,
    { upstreamStatus }
  );
}

function assertNonEmptyString(value, name) {
  if (
    typeof value !== "string" ||
    value.trim() === ""
  ) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertIntegerInRange(
  value,
  name,
  minimum,
  maximum
) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new TypeError(
      `${name} must be an integer between ${minimum} and ${maximum}`
    );
  }
}

function isTimeoutError(error) {
  return (
    error?.name === "TimeoutError" ||
    error?.name === "AbortError" ||
    error?.code === "ABORT_ERR"
  );
}

function mapHttpStatus(status) {
  if (!Number.isSafeInteger(status)) {
    return invalidResponse();
  }

  if (status === 401 || status === 403) {
    return new AssistantProviderError(
      ASSISTANT_PROVIDER_ERROR_CODES.AUTH_FAILED,
      { upstreamStatus: status }
    );
  }

  if (status === 408) {
    return new AssistantProviderError(
      ASSISTANT_PROVIDER_ERROR_CODES.TIMEOUT,
      { retryable: true, upstreamStatus: status }
    );
  }

  if (status === 429) {
    return new AssistantProviderError(
      ASSISTANT_PROVIDER_ERROR_CODES.RATE_LIMITED,
      { retryable: true, upstreamStatus: status }
    );
  }

  if (status >= 500) {
    return new AssistantProviderError(
      ASSISTANT_PROVIDER_ERROR_CODES.UNAVAILABLE,
      { retryable: true, upstreamStatus: status }
    );
  }

  return new AssistantProviderError(
    ASSISTANT_PROVIDER_ERROR_CODES.INVALID_REQUEST,
    { upstreamStatus: status }
  );
}

function readTokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function extractText(candidate) {
  const parts = candidate?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .filter(
      (part) =>
        part &&
        part.thought !== true &&
        typeof part.text === "string"
    )
    .map((part) => part.text)
    .join("");
}

function isPlainObject(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function normalizeToolArguments(value) {
  if (!isPlainObject(value)) {
    throw invalidResponse();
  }

  let serialized;

  try {
    serialized = JSON.stringify(value);
  } catch {
    throw invalidResponse();
  }

  if (
    typeof serialized !== "string" ||
    serialized.length > MAX_TOOL_ARGUMENT_CHARS
  ) {
    throw invalidResponse();
  }

  return value;
}

function normalizeToolCalls(candidate) {
  const parts = candidate?.content?.parts;

  if (!Array.isArray(parts)) {
    return [];
  }

  const functionCallParts = parts.filter(
    (part) => part && part.functionCall !== undefined
  );

  if (
    functionCallParts.length >
    MAX_TOOL_CALLS_PER_RESPONSE
  ) {
    throw invalidResponse();
  }

  return functionCallParts.map((part) => {
    const call = part.functionCall;

    if (
      !isPlainObject(call) ||
      typeof call.name !== "string" ||
      !TOOL_NAME_PATTERN.test(call.name) ||
      (call.id !== undefined &&
        (typeof call.id !== "string" ||
          call.id.length === 0 ||
          call.id.length > 128)) ||
      (part.thoughtSignature !== undefined &&
        (typeof part.thoughtSignature !== "string" ||
          part.thoughtSignature.length === 0 ||
          part.thoughtSignature.length > 20_000)) ||
      (call.args !== undefined &&
        !isPlainObject(call.args))
    ) {
      throw invalidResponse();
    }

    return {
      name: call.name,
      arguments: normalizeToolArguments(call.args ?? {}),
      ...(call.id === undefined ? {} : { id: call.id }),
      ...(part.thoughtSignature === undefined
        ? {}
        : { thoughtSignature: part.thoughtSignature }),
    };
  });
}

function normalizeSchema(schema) {
  if (
    !isPlainObject(schema) ||
    !Object.hasOwn(GEMINI_SCHEMA_TYPES, schema.type)
  ) {
    throw invalidRequest();
  }

  const normalized = {
    type: GEMINI_SCHEMA_TYPES[schema.type],
  };

  if (schema.type === "object") {
    if (
      !isPlainObject(schema.properties) ||
      schema.additionalProperties !== false
    ) {
      throw invalidRequest();
    }

    normalized.properties = Object.fromEntries(
      Object.entries(schema.properties).map(
        ([name, propertySchema]) => [
          name,
          normalizeSchema(propertySchema),
        ]
      )
    );

    if (schema.required !== undefined) {
      if (!Array.isArray(schema.required)) {
        throw invalidRequest();
      }
      normalized.required = [...schema.required];
    }
  } else if (schema.type === "array") {
    normalized.items = normalizeSchema(schema.items);
  } else if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum)) {
      throw invalidRequest();
    }
    normalized.enum = [...schema.enum];
  }

  return normalized;
}

function normalizeToolDeclarations(tools) {
  if (tools === undefined) {
    return [];
  }

  if (
    !Array.isArray(tools) ||
    tools.length > MAX_TOOL_DECLARATIONS
  ) {
    throw invalidRequest();
  }

  const names = new Set();

  return tools.map((tool) => {
    if (
      !isPlainObject(tool) ||
      typeof tool.name !== "string" ||
      !TOOL_NAME_PATTERN.test(tool.name) ||
      typeof tool.description !== "string" ||
      tool.description.trim() === "" ||
      !isPlainObject(tool.parameters)
    ) {
      throw invalidRequest();
    }

    if (names.has(tool.name)) {
      throw invalidRequest();
    }
    names.add(tool.name);

    const parameters = normalizeSchema(tool.parameters);
    if (parameters.type !== "OBJECT") {
      throw invalidRequest();
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters,
    };
  });
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw invalidRequest();
  }

  return messages.map((message) => {
    if (!isPlainObject(message)) {
      throw invalidRequest();
    }

    if (
      message.role === "user" ||
      message.role === "assistant"
    ) {
      const isAssistantToolTurn =
        message.role === "assistant" &&
        Array.isArray(message.toolCalls) &&
        message.toolCalls.length > 0;
      const hasText =
        typeof message.content === "string" &&
        message.content.trim() !== "";

      if (!hasText && !isAssistantToolTurn) {
        throw invalidRequest();
      }

      const parts = [];

      if (hasText) {
        parts.push({ text: message.content });
      }

      if (isAssistantToolTurn) {
        if (
          message.toolCalls.length >
          MAX_TOOL_CALLS_PER_RESPONSE
        ) {
          throw invalidRequest();
        }

        for (const call of message.toolCalls) {
          if (
            !isPlainObject(call) ||
            typeof call.name !== "string" ||
            !TOOL_NAME_PATTERN.test(call.name) ||
            (call.id !== undefined &&
              (typeof call.id !== "string" ||
                call.id.length === 0 ||
                call.id.length > 128)) ||
            (call.thoughtSignature !== undefined &&
              (typeof call.thoughtSignature !== "string" ||
                call.thoughtSignature.length === 0 ||
                call.thoughtSignature.length > 20_000))
          ) {
            throw invalidRequest();
          }

          parts.push({
            functionCall: {
              name: call.name,
              args: normalizeToolArguments(
                call.arguments
              ),
              ...(call.id === undefined
                ? {}
                : { id: call.id }),
            },
            ...(call.thoughtSignature === undefined
              ? {}
              : {
                  thoughtSignature:
                    call.thoughtSignature,
                }),
          });
        }
      }

      return {
        role:
          message.role === "assistant"
            ? "model"
            : "user",
        parts,
      };
    }

    if (
      message.role === "tool" &&
      typeof message.name === "string" &&
      TOOL_NAME_PATTERN.test(message.name) &&
      typeof message.content === "string" &&
      message.content.length <= MAX_TOOL_RESULT_CHARS &&
      (message.id === undefined ||
        (typeof message.id === "string" &&
          message.id.length > 0 &&
          message.id.length <= 128))
    ) {
      let toolResult;

      try {
        toolResult = JSON.parse(message.content);
      } catch {
        throw invalidRequest();
      }

      if (!isPlainObject(toolResult)) {
        throw invalidRequest();
      }

      return {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: message.name,
              response: { result: toolResult },
              ...(message.id === undefined
                ? {}
                : { id: message.id }),
            },
          },
        ],
      };
    }

    throw invalidRequest();
  });
}

function normalizeResponse(payload, configuredModel) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw invalidResponse();
  }

  const candidate = Array.isArray(payload.candidates)
    ? payload.candidates[0]
    : null;
  const finishReason =
    typeof candidate?.finishReason === "string"
      ? candidate.finishReason
      : null;
  const text = extractText(candidate);
  const toolCalls = normalizeToolCalls(candidate);
  const blocked =
    typeof payload.promptFeedback?.blockReason ===
      "string" ||
    BLOCKED_FINISH_REASONS.has(finishReason);

  if (
    !blocked &&
    text.trim() === "" &&
    toolCalls.length === 0
  ) {
    throw invalidResponse();
  }

  return {
    text,
    model:
      typeof payload.modelVersion === "string" &&
      payload.modelVersion.trim() !== ""
        ? payload.modelVersion
        : configuredModel,
    usage: {
      inputTokens: readTokenCount(
        payload.usageMetadata?.promptTokenCount
      ),
      outputTokens: readTokenCount(
        payload.usageMetadata?.candidatesTokenCount
      ),
    },
    finishReason,
    blocked,
    toolCalls,
  };
}

function createGeminiProvider({
  apiKey,
  model,
  maxOutputTokens,
  timeoutMs,
  fetchImpl = globalThis.fetch,
}) {
  assertNonEmptyString(apiKey, "Gemini API key");

  if (
    typeof model !== "string" ||
    !MODEL_PATTERN.test(model)
  ) {
    throw new TypeError(
      "A valid assistant model is required"
    );
  }

  assertIntegerInRange(
    maxOutputTokens,
    "maxOutputTokens",
    MIN_ASSISTANT_MAX_OUTPUT_TOKENS,
    MAX_ASSISTANT_MAX_OUTPUT_TOKENS
  );
  assertIntegerInRange(
    timeoutMs,
    "timeoutMs",
    MIN_ASSISTANT_TIMEOUT_MS,
    MAX_ASSISTANT_TIMEOUT_MS
  );

  if (typeof fetchImpl !== "function") {
    throw new TypeError(
      "A fetch implementation is required"
    );
  }

  const normalizedApiKey = apiKey.trim();

  async function chat({
    systemInstruction,
    messages,
    tools,
    maxOutputTokens: requestedMaxOutputTokens,
    timeoutMs: requestedTimeoutMs,
  } = {}) {
    assertNonEmptyString(
      systemInstruction,
      "systemInstruction"
    );

    const contents = normalizeMessages(messages);
    const normalizedTools =
      normalizeToolDeclarations(tools);
    const effectiveMaxOutputTokens =
      requestedMaxOutputTokens ?? maxOutputTokens;
    const effectiveTimeoutMs =
      requestedTimeoutMs ?? timeoutMs;

    assertIntegerInRange(
      effectiveMaxOutputTokens,
      "maxOutputTokens",
      MIN_ASSISTANT_MAX_OUTPUT_TOKENS,
      MAX_ASSISTANT_MAX_OUTPUT_TOKENS
    );
    assertIntegerInRange(
      effectiveTimeoutMs,
      "timeoutMs",
      MIN_ASSISTANT_TIMEOUT_MS,
      MAX_ASSISTANT_TIMEOUT_MS
    );

    const requestBody = {
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents,
      generationConfig: {
        maxOutputTokens: effectiveMaxOutputTokens,
        temperature: ASSISTANT_TEMPERATURE,
        thinkingConfig: {
          thinkingBudget: ASSISTANT_THINKING_BUDGET,
        },
      },
    };

    if (normalizedTools.length > 0) {
      requestBody.tools = [
        { functionDeclarations: normalizedTools },
      ];
    }

    let response;

    try {
      response = await fetchImpl(
        `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": normalizedApiKey,
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(
            effectiveTimeoutMs
          ),
        }
      );
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new AssistantProviderError(
          ASSISTANT_PROVIDER_ERROR_CODES.TIMEOUT,
          { retryable: true }
        );
      }

      throw new AssistantProviderError(
        ASSISTANT_PROVIDER_ERROR_CODES.UNAVAILABLE,
        { retryable: true }
      );
    }

    if (
      !response ||
      typeof response !== "object" ||
      typeof response.ok !== "boolean"
    ) {
      throw invalidResponse();
    }

    if (!response.ok) {
      throw mapHttpStatus(response.status);
    }

    let payload;

    try {
      payload = await response.json();
    } catch {
      throw invalidResponse(response.status);
    }

    return normalizeResponse(payload, model);
  }

  return Object.freeze({
    id: ASSISTANT_PROVIDERS.GEMINI,
    model,
    capabilities: Object.freeze({
      supportsTools: true,
      supportsStreaming: false,
    }),
    chat,
  });
}

module.exports = {
  createGeminiProvider,
};
