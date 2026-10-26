const ASSISTANT_PROVIDER_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: "INVALID_REQUEST",
  AUTH_FAILED: "AUTH_FAILED",
  RATE_LIMITED: "RATE_LIMITED",
  TIMEOUT: "TIMEOUT",
  UNAVAILABLE: "UNAVAILABLE",
  INVALID_RESPONSE: "INVALID_RESPONSE",
});

class AssistantProviderError extends Error {
  constructor(
    code,
    { retryable = false, upstreamStatus = null } = {}
  ) {
    super(`Assistant provider request failed: ${code}`);

    this.name = "AssistantProviderError";
    this.code = code;
    this.retryable = retryable;
    this.upstreamStatus = upstreamStatus;

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
