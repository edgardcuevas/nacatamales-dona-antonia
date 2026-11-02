const {
  ASSISTANT_PROVIDERS,
} = require("./assistant.constants");

const {
  ASSISTANT_PROVIDER_ERROR_CODES,
  AssistantProviderError,
} = require("./assistant.provider-error");

const {
  createGeminiProvider,
} = require("./providers/gemini.provider");
const {
  createNvidiaProvider,
} = require("./providers/nvidia.provider");
const {
  DEFAULT_ASSISTANT_PROVIDER_COOLDOWN_MS,
} = require("./assistant.constants");

const PROVIDER_FACTORIES = Object.freeze({
  [ASSISTANT_PROVIDERS.GEMINI]:
    createGeminiProvider,
});

const PROVIDER_IDS = Object.freeze(
  Object.keys(PROVIDER_FACTORIES)
);

function createAssistantProvider(config) {
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config)
  ) {
    throw new TypeError(
      "Assistant provider configuration is required"
    );
  }

  const factory = PROVIDER_FACTORIES[config.provider];

  if (!factory) {
    throw new Error("Unsupported AI provider");
  }

  const primary = factory(config);
  const providers = [primary];

  if (config.nvidia?.apiKey) {
    providers.push(
      createNvidiaProvider({
        apiKey: config.nvidia.apiKey,
        model: config.nvidia.model,
        maxOutputTokens: config.maxOutputTokens,
        timeoutMs: config.timeoutMs,
        fetchImpl: config.fetchImpl,
      })
    );
  }

  return createFailoverProvider({
    providers,
    now: config.now,
  });
}

function createFailoverProvider({
  providers,
  now = Date.now,
}) {
  if (
    !Array.isArray(providers) ||
    providers.length === 0 ||
    typeof now !== "function"
  ) {
    throw new TypeError("Assistant providers are required");
  }

  const cooldowns = new Map();
  const lastErrors = new Map();
  const primary = providers[0];

  async function request(method, input, onTextChunk) {
    const nowMs = now();
    const available = providers.filter(
      (provider) =>
        (cooldowns.get(provider.id) ?? 0) <= nowMs
    );
    const attemptLimit =
      Number.isSafeInteger(input?.providerCallLimit) &&
      input.providerCallLimit > 0
        ? input.providerCallLimit
        : providers.length;
    const candidates = available.slice(0, attemptLimit);

    if (candidates.length === 0) {
      const lastError = [...lastErrors.values()].at(-1);
      if (lastError instanceof AssistantProviderError) {
        const error = new AssistantProviderError(
          lastError.code,
          {
            retryable: lastError.retryable,
            upstreamStatus: lastError.upstreamStatus,
            retryAfterMs: lastError.retryAfterMs,
            provider: lastError.provider,
            model: lastError.model,
            providerCalls: 0,
            providers: [],
          }
        );
        throw error;
      }

      throw new AssistantProviderError(
        ASSISTANT_PROVIDER_ERROR_CODES.UNAVAILABLE,
        {
          retryable: true,
          provider: primary.id,
          model: primary.model,
          providerCalls: 0,
          providers: [],
        }
      );
    }

    const attempted = [];
    let lastError = null;

    for (const provider of candidates) {
      attempted.push(provider.id);

      try {
        const bufferedChunks = [];
        const result =
          method === "chatStream"
            ? await provider.chatStream(input, (chunk) =>
                bufferedChunks.push(chunk)
              )
            : await provider.chat(input);

        cooldowns.delete(provider.id);
        lastErrors.delete(provider.id);
        if (method === "chatStream") {
          for (const chunk of bufferedChunks) {
            onTextChunk(chunk);
          }
        }

        return {
          ...result,
          provider: provider.id,
          providers: [...attempted],
          providerCalls: attempted.length,
        };
      } catch (error) {
        if (!(error instanceof AssistantProviderError)) {
          throw error;
        }

        lastError = error;
        lastErrors.set(provider.id, error);

        const canFailOver =
          error instanceof AssistantProviderError &&
          error.retryable === true &&
          [
            ASSISTANT_PROVIDER_ERROR_CODES.RATE_LIMITED,
            ASSISTANT_PROVIDER_ERROR_CODES.TIMEOUT,
            ASSISTANT_PROVIDER_ERROR_CODES.UNAVAILABLE,
          ].includes(error.code);

        if (!canFailOver) {
          break;
        }

        const cooldownMs =
          error.retryAfterMs ??
          DEFAULT_ASSISTANT_PROVIDER_COOLDOWN_MS;
        cooldowns.set(provider.id, now() + cooldownMs);
      }
    }

    const failure =
      lastError instanceof AssistantProviderError
        ? new AssistantProviderError(lastError.code, {
            retryable: lastError.retryable,
            upstreamStatus: lastError.upstreamStatus,
            retryAfterMs: lastError.retryAfterMs,
            provider: attempted.at(-1),
            model:
              providers.find(
                (provider) =>
                  provider.id === attempted.at(-1)
              )?.model ?? null,
            providerCalls: attempted.length,
            providers: [...attempted],
          })
        : new AssistantProviderError(
            ASSISTANT_PROVIDER_ERROR_CODES.UNAVAILABLE,
            {
              retryable: true,
              provider: attempted.at(-1),
              providerCalls: attempted.length,
              providers: [...attempted],
            }
          );

    throw failure;
  }

  return Object.freeze({
    id: primary.id,
    model: primary.model,
    capabilities: primary.capabilities,
    chat: (input) => request("chat", input),
    chatStream: (input, onTextChunk) => {
      if (typeof onTextChunk !== "function") {
        throw new TypeError("A text chunk callback is required");
      }
      return request("chatStream", input, onTextChunk);
    },
  });
}

module.exports = {
  createAssistantProvider,
  PROVIDER_IDS,
  ASSISTANT_PROVIDER_ERROR_CODES,
  AssistantProviderError,
};
