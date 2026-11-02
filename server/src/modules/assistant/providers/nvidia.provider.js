const {
  ASSISTANT_PROVIDERS,
  NVIDIA_MODEL_PATTERN,
  MAX_TOOL_ARGUMENT_CHARS,
  MAX_TOOL_CALLS_PER_RESPONSE,
  MIN_ASSISTANT_MAX_OUTPUT_TOKENS,
  MAX_ASSISTANT_MAX_OUTPUT_TOKENS,
  MIN_ASSISTANT_TIMEOUT_MS,
  MAX_ASSISTANT_TIMEOUT_MS,
  ASSISTANT_TEMPERATURE,
} = require("../assistant.constants");
const {
  ASSISTANT_PROVIDER_ERROR_CODES,
  AssistantProviderError,
} = require("../assistant.provider-error");

const NVIDIA_CHAT_COMPLETIONS_URL =
  "https://integrate.api.nvidia.com/v1/chat/completions";
const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertIntegerInRange(value, name, minimum, maximum) {
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

function parseRetryAfterMs(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 86_400_000);
  }

  const date = Date.parse(value);
  return Number.isNaN(date)
    ? null
    : Math.min(Math.max(date - Date.now(), 0), 86_400_000);
}

function mapHttpStatus(status, retryAfterHeader) {
  if (!Number.isSafeInteger(status)) {
    return new AssistantProviderError(
      ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
    );
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
      {
        retryable: true,
        upstreamStatus: status,
        retryAfterMs: parseRetryAfterMs(retryAfterHeader),
      }
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

function normalizeToolArguments(value) {
  let parsed = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new AssistantProviderError(
        ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
      );
    }
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new AssistantProviderError(
      ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
    );
  }

  let serialized;
  try {
    serialized = JSON.stringify(parsed);
  } catch {
    throw new AssistantProviderError(
      ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
    );
  }

  if (
    typeof serialized !== "string" ||
    serialized.length > MAX_TOOL_ARGUMENT_CHARS
  ) {
    throw new AssistantProviderError(
      ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
    );
  }

  return parsed;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AssistantProviderError(
      ASSISTANT_PROVIDER_ERROR_CODES.INVALID_REQUEST
    );
  }

  const normalized = [];
  const pendingToolIds = new Map();

  for (const [messageIndex, message] of messages.entries()) {
    if (!message || typeof message !== "object") {
      throw new AssistantProviderError(
        ASSISTANT_PROVIDER_ERROR_CODES.INVALID_REQUEST
      );
    }

    if (message.role === "user") {
      normalized.push({
        role: "user",
        content: message.content,
      });
      continue;
    }

    if (message.role === "assistant") {
      const toolCalls = Array.isArray(message.toolCalls)
        ? message.toolCalls.map((toolCall, callIndex) => {
            if (
              !toolCall ||
              typeof toolCall.name !== "string" ||
              !TOOL_NAME_PATTERN.test(toolCall.name)
            ) {
              throw new AssistantProviderError(
                ASSISTANT_PROVIDER_ERROR_CODES.INVALID_REQUEST
              );
            }

            const id =
              toolCall.id ??
              `call_${messageIndex}_${callIndex}`;
            const calls =
              pendingToolIds.get(toolCall.name) ?? [];
            calls.push(id);
            pendingToolIds.set(toolCall.name, calls);

            return {
              id,
              type: "function",
              function: {
                name: toolCall.name,
                arguments: JSON.stringify(
                  normalizeToolArguments(toolCall.arguments)
                ),
              },
            };
          })
        : [];

      normalized.push({
        role: "assistant",
        content:
          typeof message.content === "string" &&
          message.content !== ""
            ? message.content
            : null,
        ...(toolCalls.length === 0
          ? {}
          : { tool_calls: toolCalls }),
      });
      continue;
    }

    if (message.role === "tool") {
      if (
        typeof message.name !== "string" ||
        !TOOL_NAME_PATTERN.test(message.name) ||
        typeof message.content !== "string"
      ) {
        throw new AssistantProviderError(
          ASSISTANT_PROVIDER_ERROR_CODES.INVALID_REQUEST
        );
      }

      const ids = pendingToolIds.get(message.name) ?? [];
      let toolCallId = message.id;
      if (toolCallId === undefined) {
        toolCallId = ids.shift();
      } else {
        const matchingIndex = ids.indexOf(toolCallId);
        if (matchingIndex !== -1) {
          ids.splice(matchingIndex, 1);
        }
      }
      pendingToolIds.set(message.name, ids);

      if (typeof toolCallId !== "string") {
        throw new AssistantProviderError(
          ASSISTANT_PROVIDER_ERROR_CODES.INVALID_REQUEST
        );
      }

      normalized.push({
        role: "tool",
        tool_call_id: toolCallId,
        content: message.content,
      });
      continue;
    }

    throw new AssistantProviderError(
      ASSISTANT_PROVIDER_ERROR_CODES.INVALID_REQUEST
    );
  }

  return normalized;
}

function normalizeTools(tools) {
  if (tools === undefined) {
    return [];
  }

  if (!Array.isArray(tools)) {
    throw new AssistantProviderError(
      ASSISTANT_PROVIDER_ERROR_CODES.INVALID_REQUEST
    );
  }

  return tools.map((tool) => {
    if (
      !tool ||
      typeof tool.name !== "string" ||
      !TOOL_NAME_PATTERN.test(tool.name) ||
      typeof tool.description !== "string" ||
      !tool.parameters ||
      typeof tool.parameters !== "object" ||
      Array.isArray(tool.parameters)
    ) {
      throw new AssistantProviderError(
        ASSISTANT_PROVIDER_ERROR_CODES.INVALID_REQUEST
      );
    }

    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  });
}

function readTokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function normalizeResponse(payload, configuredModel) {
  const choice = Array.isArray(payload?.choices)
    ? payload.choices[0]
    : null;
  const message = choice?.message;

  if (!message || typeof message !== "object") {
    throw new AssistantProviderError(
      ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
    );
  }

  if (
    message.tool_calls !== undefined &&
    !Array.isArray(message.tool_calls)
  ) {
    throw new AssistantProviderError(
      ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
    );
  }

  const rawToolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls
    : [];
  if (rawToolCalls.length > MAX_TOOL_CALLS_PER_RESPONSE) {
    throw new AssistantProviderError(
      ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
    );
  }

  const toolCalls = rawToolCalls.map((toolCall) => {
    const name = toolCall?.function?.name;
    const id = toolCall?.id;

    if (
      typeof name !== "string" ||
      !TOOL_NAME_PATTERN.test(name) ||
      (id !== undefined &&
        (typeof id !== "string" ||
          id.length === 0 ||
          id.length > 128))
    ) {
      throw new AssistantProviderError(
        ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
      );
    }

    return {
      name,
      arguments: normalizeToolArguments(
        toolCall.function.arguments ?? "{}"
      ),
      ...(id === undefined ? {} : { id }),
    };
  });
  const text =
    typeof message.content === "string"
      ? message.content
      : "";
  const finishReason =
    typeof choice.finish_reason === "string"
      ? choice.finish_reason
      : null;
  const blocked =
    finishReason === "content_filter" ||
    (typeof message.refusal === "string" &&
      message.refusal !== "");

  if (!blocked && text.trim() === "" && toolCalls.length === 0) {
    throw new AssistantProviderError(
      ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
    );
  }

  return {
    text,
    model:
      typeof payload.model === "string" &&
      payload.model.trim() !== ""
        ? payload.model
        : configuredModel,
    usage: {
      inputTokens: readTokenCount(
        payload.usage?.prompt_tokens
      ),
      outputTokens: readTokenCount(
        payload.usage?.completion_tokens
      ),
    },
    finishReason,
    blocked,
    toolCalls,
  };
}

function isTimeoutError(error) {
  return (
    error?.name === "TimeoutError" ||
    error?.name === "AbortError" ||
    error?.code === "ABORT_ERR"
  );
}

function createNvidiaProvider({
  apiKey,
  model,
  maxOutputTokens,
  timeoutMs,
  fetchImpl = globalThis.fetch,
}) {
  assertNonEmptyString(apiKey, "NVIDIA API key");

  if (
    typeof model !== "string" ||
    !NVIDIA_MODEL_PATTERN.test(model)
  ) {
    throw new TypeError("A valid NVIDIA assistant model is required");
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
    throw new TypeError("A fetch implementation is required");
  }

  async function chat({
    systemInstruction,
    messages,
    tools,
    maxOutputTokens: requestedMaxOutputTokens,
    timeoutMs: requestedTimeoutMs,
  } = {}) {
    assertNonEmptyString(systemInstruction, "systemInstruction");

    const effectiveMaxOutputTokens =
      requestedMaxOutputTokens ?? maxOutputTokens;
    const effectiveTimeoutMs = requestedTimeoutMs ?? timeoutMs;

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

    const body = {
      model,
      messages: [
        { role: "system", content: systemInstruction },
        ...normalizeMessages(messages),
      ],
      max_tokens: effectiveMaxOutputTokens,
      temperature: ASSISTANT_TEMPERATURE,
      stream: false,
    };
    const normalizedTools = normalizeTools(tools);
    if (normalizedTools.length > 0) {
      body.tools = normalizedTools;
      body.tool_choice = "auto";
    }

    let response;
    try {
      response = await fetchImpl(NVIDIA_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey.trim()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(effectiveTimeoutMs),
      });
    } catch (error) {
      throw new AssistantProviderError(
        isTimeoutError(error)
          ? ASSISTANT_PROVIDER_ERROR_CODES.TIMEOUT
          : ASSISTANT_PROVIDER_ERROR_CODES.UNAVAILABLE,
        { retryable: true }
      );
    }

    if (!response || typeof response.ok !== "boolean") {
      throw new AssistantProviderError(
        ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
      );
    }

    if (!response.ok) {
      throw mapHttpStatus(
        response.status,
        response.headers?.get?.("retry-after")
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new AssistantProviderError(
        ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE,
        { upstreamStatus: response.status }
      );
    }

    return normalizeResponse(payload, model);
  }

  async function chatStream(input, onTextChunk) {
    if (typeof onTextChunk !== "function") {
      throw new TypeError("A text chunk callback is required");
    }

    const result = await chat(input);
    if (result.text !== "") {
      onTextChunk(result.text);
    }
    return result;
  }

  return Object.freeze({
    id: ASSISTANT_PROVIDERS.NVIDIA,
    model,
    capabilities: Object.freeze({
      supportsTools: true,
      supportsStreaming: true,
    }),
    chat,
    chatStream,
  });
}

module.exports = {
  createNvidiaProvider,
};
