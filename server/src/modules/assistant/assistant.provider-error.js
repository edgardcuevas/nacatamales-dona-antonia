const ASSISTANT_PROVIDER_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: "INVALID_REQUEST",
  AUTH_FAILED: "AUTH_FAILED",
  RATE_LIMITED: "RATE_LIMITED",
  TIMEOUT: "TIMEOUT",
  UNAVAILABLE: "UNAVAILABLE",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  // El proveedor se quedo sin presupuesto de salida antes de escribir texto
  // (en NVIDIA tambien lo consume el razonamiento). No es reintentable.
  OUTPUT_TRUNCATED: "OUTPUT_TRUNCATED",
  TOOL_MISUSE: "TOOL_MISUSE",
});

class AssistantProviderError extends Error {
  constructor(
    code,
    {
      retryable = false,
      upstreamStatus = null,
      retryAfterMs = null,
      provider = null,
      model = null,
      providerCalls = null,
      providers = null,
    } = {}
  ) {
    super(`Assistant provider request failed: ${code}`);

    this.name = "AssistantProviderError";
    this.code = code;
    this.retryable = retryable;
    this.upstreamStatus = upstreamStatus;
    this.retryAfterMs = retryAfterMs;
    this.provider = provider;
    this.model = model;
    this.providerCalls = providerCalls;
    this.providers = providers;

    Error.captureStackTrace(
      this,
      AssistantProviderError
    );
  }
}

module.exports = {
  ASSISTANT_PROVIDER_ERROR_CODES,
  AssistantProviderError,
};
