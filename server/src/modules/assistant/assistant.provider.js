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
  ASSISTANT_PROVIDER_STATES,
  DEFAULT_ASSISTANT_PROVIDER_COOLDOWN_MS,
  PROVIDER_COOLDOWN_BY_CODE,
  PROVIDER_PROBE_WINDOW_MS,
} = require("./assistant.constants");

const PROVIDER_FACTORIES = Object.freeze({
  [ASSISTANT_PROVIDERS.GEMINI]:
    createGeminiProvider,
  [ASSISTANT_PROVIDERS.NVIDIA]: (config) =>
    createNvidiaProvider({
      ...config,
      maxOutputTokens:
        config.nvidia?.maxOutputTokens ??
        config.maxOutputTokens,
      timeoutMs:
        config.nvidia?.timeoutMs ?? config.timeoutMs,
    }),
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

  if (
    config.provider === ASSISTANT_PROVIDERS.GEMINI &&
    config.nvidia?.apiKey
  ) {
    providers.push(
      createNvidiaProvider({
        apiKey: config.nvidia.apiKey,
        model: config.nvidia.model,
        // El respaldo puede pedir su propio presupuesto porque su modelo
        // razona; si no lo tiene configurado hereda el general.
        maxOutputTokens:
          config.nvidia.maxOutputTokens ??
          config.maxOutputTokens,
        timeoutMs:
          config.nvidia.timeoutMs ?? config.timeoutMs,
        fetchImpl: config.fetchImpl,
      })
    );
  } else if (
    config.provider === ASSISTANT_PROVIDERS.NVIDIA &&
    config.gemini?.apiKey
  ) {
    providers.push(
      createGeminiProvider({
        apiKey: config.gemini.apiKey,
        model: config.gemini.model,
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
  // Pruebas de recuperacion en curso. El estado es por instancia del servidor y
  // por proveedor: solo la peticion que reclama la prueba intenta al proveedor
  // limitado; las concurrentes usan el respaldo. Nunca se comparte la respuesta.
  const recoveryChecks = new Set();
  const primary = providers[0];
  let lastProbeAt = null;

  function cooldownMsFor(error) {
    if (
      Number.isSafeInteger(error.retryAfterMs) &&
      error.retryAfterMs > 0
    ) {
      return error.retryAfterMs;
    }

    return (
      PROVIDER_COOLDOWN_BY_CODE[error.code] ??
      DEFAULT_ASSISTANT_PROVIDER_COOLDOWN_MS
    );
  }

  function canFailOver(error) {
    return (
      error instanceof AssistantProviderError &&
      error.retryable === true &&
      [
        ASSISTANT_PROVIDER_ERROR_CODES.RATE_LIMITED,
        ASSISTANT_PROVIDER_ERROR_CODES.TIMEOUT,
        ASSISTANT_PROVIDER_ERROR_CODES.UNAVAILABLE,
      ].includes(error.code)
    );
  }

  // Un proveedor limitado por cuota vuelve a ser elegible cuando vence su
  // cooldown, pero esa vuelta es una prueba, no una reapertura general: solo una
  // peticion la ejecuta y las demas esperan su resultado en el respaldo.
  function isRecoveryDue(provider, nowMs) {
    const lastError = lastErrors.get(provider.id);

    return (
      lastError instanceof AssistantProviderError &&
      lastError.code ===
        ASSISTANT_PROVIDER_ERROR_CODES.RATE_LIMITED &&
      (cooldowns.get(provider.id) ?? 0) <= nowMs
    );
  }

  function createNoProviderError() {
    const lastError = [...lastErrors.values()].at(-1);

    if (lastError instanceof AssistantProviderError) {
      return new AssistantProviderError(lastError.code, {
        retryable: lastError.retryable,
        upstreamStatus: lastError.upstreamStatus,
        retryAfterMs: lastError.retryAfterMs,
        provider: lastError.provider,
        model: lastError.model,
        providerCalls: 0,
        providers: [],
      });
    }

    return new AssistantProviderError(
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

  // Con todos los proveedores enfriando se permite un unico sondeo: el del que
  // vence antes entre los que no estan limitados por cuota. Sondear un 429 solo
  // gasta cupo; sondear el resto descubre una recuperacion antes del cooldown.
  function selectProbeProvider(nowMs) {
    if (
      lastProbeAt !== null &&
      nowMs - lastProbeAt < PROVIDER_PROBE_WINDOW_MS
    ) {
      return null;
    }

    const eligible = providers
      .filter(
        (provider) =>
          lastErrors.get(provider.id)?.code !==
          ASSISTANT_PROVIDER_ERROR_CODES.RATE_LIMITED
      )
      .sort(
        (left, right) =>
          (cooldowns.get(left.id) ?? 0) -
          (cooldowns.get(right.id) ?? 0)
      );

    return eligible[0] ?? null;
  }

  function createAttemptFailure(attempted, lastError) {
    if (lastError instanceof AssistantProviderError) {
      return new AssistantProviderError(lastError.code, {
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
      });
    }

    return new AssistantProviderError(
      ASSISTANT_PROVIDER_ERROR_CODES.UNAVAILABLE,
      {
        retryable: true,
        provider: attempted.at(-1),
        providerCalls: attempted.length,
        providers: [...attempted],
      }
    );
  }

  // El cambio de proveedor era invisible: /usage guarda "gemini+nvidia" pero
  // no hay UI que lo muestre. Una sola linea por failover, con el mismo
  // criterio sanitizado que error.middleware.js: ids y codigo estable, nunca
  // cuerpos, headers ni claves.
  function logFailover(from, to, code) {
    console.log(
      `Assistant provider failover: from=${from} to=${to} code=${code}`
    );
  }

  async function attemptCandidates(
    candidates,
    method,
    input,
    onTextChunk
  ) {
    const attempted = [];
    let lastError = null;

    for (
      let index = 0;
      index < candidates.length;
      index += 1
    ) {
      const provider = candidates[index];
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

        if (!canFailOver(error)) {
          break;
        }

        cooldowns.set(
          provider.id,
          now() + cooldownMsFor(error)
        );

        const next = candidates[index + 1];

        if (next) {
          logFailover(
            provider.id,
            next.id,
            error.code
          );
        }
      }
    }

    throw createAttemptFailure(attempted, lastError);
  }

  async function request(method, input, onTextChunk) {
    const nowMs = now();
    const attemptLimit =
      Number.isSafeInteger(input?.providerCallLimit) &&
      input.providerCallLimit > 0
        ? input.providerCallLimit
        : providers.length;
    const candidates = [];
    const claimedChecks = [];

    // El reclamo ocurre en el tramo sincrono previo al primer await, asi que dos
    // peticiones concurrentes no pueden reclamar la misma prueba.
    for (const provider of providers) {
      if (candidates.length >= attemptLimit) {
        break;
      }

      if ((cooldowns.get(provider.id) ?? 0) > nowMs) {
        continue;
      }

      if (isRecoveryDue(provider, nowMs)) {
        if (recoveryChecks.has(provider.id)) {
          continue;
        }

        recoveryChecks.add(provider.id);
        claimedChecks.push(provider.id);
      }

      candidates.push(provider);
    }

    if (candidates.length > 0) {
      try {
        return await attemptCandidates(
          candidates,
          method,
          input,
          onTextChunk
        );
      } finally {
        for (const providerId of claimedChecks) {
          recoveryChecks.delete(providerId);
        }
      }
    }

    const probe = selectProbeProvider(nowMs);

    if (probe === null) {
      throw createNoProviderError();
    }

    lastProbeAt = nowMs;

    return attemptCandidates(
      [probe],
      method,
      input,
      onTextChunk
    );
  }

  // Instantanea de solo lectura calculada en el momento de consultar. El estado
  // nunca declara "sano": tras un cooldown solo una respuesta real confirma la
  // recuperacion, por eso existe RECOVERY_DUE / RECOVERY_CHECK.
  function getProviderStates() {
    const nowMs = now();

    return providers.map((provider, index) =>
      Object.freeze({
        provider: provider.id,
        role: index === 0 ? "primary" : "fallback",
        state: recoveryChecks.has(provider.id)
          ? ASSISTANT_PROVIDER_STATES.RECOVERY_CHECK
          : (cooldowns.get(provider.id) ?? 0) > nowMs
            ? ASSISTANT_PROVIDER_STATES.COOLDOWN
            : isRecoveryDue(provider, nowMs)
              ? ASSISTANT_PROVIDER_STATES.RECOVERY_DUE
              : ASSISTANT_PROVIDER_STATES.ELIGIBLE,
        cooldownUntil:
          (cooldowns.get(provider.id) ?? 0) > nowMs
            ? new Date(
                cooldowns.get(provider.id)
              ).toISOString()
            : null,
        lastErrorCode:
          lastErrors.get(provider.id)?.code ?? null,
      })
    );
  }

  return Object.freeze({
    id: primary.id,
    model: primary.model,
    capabilities: primary.capabilities,
    // Solo el modelo, nunca la clave: el panel lo muestra y la ruta /status
    // es accesible para ADMIN y EDITOR.
    fallback: Object.freeze({
      enabled: providers.length > 1,
      provider: providers[1]?.id ?? null,
      model: providers[1]?.model ?? null,
    }),
    getProviderStates,
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
