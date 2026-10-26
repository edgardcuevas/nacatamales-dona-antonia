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

  return factory(config);
}

module.exports = {
  createAssistantProvider,
  PROVIDER_IDS,
  ASSISTANT_PROVIDER_ERROR_CODES,
  AssistantProviderError,
};
