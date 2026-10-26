const {
  ASSISTANT_PROVIDERS,
  ASSISTANT_TEMPERATURE,
  ASSISTANT_THINKING_BUDGET,
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

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw invalidRequest();
  }

  return messages.map((message) => {
    if (
      !message ||
      typeof message !== "object" ||
      Array.isArray(message) ||
      (message.role !== "user" &&
        message.role !== "assistant") ||
      typeof message.content !== "string" ||
      message.content.trim() === ""
    ) {
      throw invalidRequest();
    }

    return {
      role:
        message.role === "assistant"
          ? "model"
          : "user",
      parts: [{ text: message.content }],
    };
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
  const blocked =
    typeof payload.promptFeedback?.blockReason ===
      "string" ||
    BLOCKED_FINISH_REASONS.has(finishReason);

  if (!blocked && text.trim() === "") {
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
    maxOutputTokens: requestedMaxOutputTokens,
    timeoutMs: requestedTimeoutMs,
  } = {}) {
    assertNonEmptyString(
      systemInstruction,
      "systemInstruction"
    );

    const contents = normalizeMessages(messages);
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
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            contents,
            generationConfig: {
              maxOutputTokens:
                effectiveMaxOutputTokens,
              temperature: ASSISTANT_TEMPERATURE,
              thinkingConfig: {
                thinkingBudget:
                  ASSISTANT_THINKING_BUDGET,
              },
            },
          }),
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
      supportsTools: false,
      supportsStreaming: false,
    }),
    chat,
  });
}

module.exports = {
  createGeminiProvider,
};
