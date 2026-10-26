const {
  ASSISTANT_PROVIDERS,
  ASSISTANT_PROVIDER_VALUES,
  DEFAULT_ASSISTANT_MODEL,
  DEFAULT_ASSISTANT_MAX_OUTPUT_TOKENS,
  MIN_ASSISTANT_MAX_OUTPUT_TOKENS,
  MAX_ASSISTANT_MAX_OUTPUT_TOKENS,
  DEFAULT_ASSISTANT_TIMEOUT_MS,
  MIN_ASSISTANT_TIMEOUT_MS,
  MAX_ASSISTANT_TIMEOUT_MS,
} = require(
  "../modules/assistant/assistant.constants"
);

const VALID_NODE_ENVIRONMENTS = new Set([
  "development",
  "test",
  "production",
]);

const ASSISTANT_MODEL_PATTERN =
  /^[A-Za-z0-9._-]{1,80}$/;
const JWT_TTL_PATTERN = /^\d+[smhd]$/;
const VAPID_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const VAPID_SUBJECT_PATTERN =
  /^(?:mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/\S+)$/;
const IMAGEKIT_HOST = "ik.imagekit.io";
const IMAGEKIT_FOLDER_PATTERN =
  /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

function parsePort(value, variableName) {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Environment variable ${variableName} must be an integer between 1 and 65535.`
    );
  }

  return port;
}

function requireEnvironmentVariable(variableName) {
  const value = process.env[variableName];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `Environment variable ${variableName} is required.`
    );
  }

  return value.trim();
}

function validateJwtSecret(secret, variableName) {
  if (secret.length < 32) {
    throw new Error(
      `Environment variable ${variableName} must contain at least 32 characters.`
    );
  }

  return secret;
}

function validateJwtTtl(value, variableName) {
  if (!JWT_TTL_PATTERN.test(value)) {
    throw new Error(
      `Environment variable ${variableName} must use a valid duration such as 15m, 1h, or 30d.`
    );
  }

  return value;
}

function validateImageKitUrlEndpoint(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Environment variable IMAGEKIT_URL_ENDPOINT must be a valid HTTPS ImageKit URL."
    );
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== IMAGEKIT_HOST ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Environment variable IMAGEKIT_URL_ENDPOINT must be a valid HTTPS ImageKit URL."
    );
  }

  const pathSegments = url.pathname
    .split("/")
    .filter(Boolean);

  if (
    pathSegments.length !== 1 ||
    !/^[A-Za-z0-9_-]+$/.test(pathSegments[0])
  ) {
    throw new Error(
      "Environment variable IMAGEKIT_URL_ENDPOINT must be a valid HTTPS ImageKit URL."
    );
  }

  return `https://${IMAGEKIT_HOST}/${pathSegments[0]}`;
}

function validateImageKitFolder(value) {
  const normalizedFolder = value
    .trim()
    .replace(/^\/+|\/+$/g, "");

  if (
    normalizedFolder.length === 0 ||
    normalizedFolder.length > 255 ||
    !IMAGEKIT_FOLDER_PATTERN.test(normalizedFolder) ||
    normalizedFolder.includes("..")
  ) {
    throw new Error(
      "Environment variable IMAGEKIT_FOLDER must be a safe ImageKit folder path."
    );
  }

  return normalizedFolder;
}

function validateGoogleRedirectUri(value, nodeEnv) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Environment variable GOOGLE_REDIRECT_URI must be a valid URL."
    );
  }

  const isLocalDevelopmentUrl =
    nodeEnv !== "production" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(
      url.hostname
    );

  if (
    (url.protocol !== "https:" && !isLocalDevelopmentUrl) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Environment variable GOOGLE_REDIRECT_URI must be a valid callback URL."
    );
  }

  return url.toString();
}

function validateYoutubeTokenEncryptionKey(value) {
  const isHex =
    /^[A-Fa-f0-9]{64}$/.test(value);
  const isBase64 =
    /^[A-Za-z0-9+/]{43}=$/.test(value);
  const key = isHex
    ? Buffer.from(value, "hex")
    : isBase64
      ? Buffer.from(value, "base64")
      : null;

  if (!key || key.length !== 32) {
    throw new Error(
      "Environment variable YOUTUBE_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 or hexadecimal key."
    );
  }

  return value;
}

function validateYoutubeChannelId(value) {
  if (value === undefined) {
    return null;
  }

  if (
    !YOUTUBE_CHANNEL_ID_PATTERN.test(value)
  ) {
    throw new Error(
      "Environment variable YOUTUBE_CHANNEL_ID must be a valid YouTube channel ID."
    );
  }

  return value;
}

function validateVapidPublicKey(value) {
  const isCanonical =
    VAPID_KEY_PATTERN.test(value) &&
    value.length >= 80 &&
    value.length <= 100;

  if (!isCanonical) {
    throw new Error(
      "Environment variable WEB_PUSH_PUBLIC_KEY must be a base64url encoded VAPID public key."
    );
  }

  const key = Buffer.from(value, "base64url");

  // An uncompressed P-256 public key is exactly 65 bytes and starts
  // with 0x04. web-push would reject anything else at send time, so
  // failing at boot is the only way to notice a bad paste early.
  if (key.length !== 65 || key[0] !== 0x04) {
    throw new Error(
      "Environment variable WEB_PUSH_PUBLIC_KEY must be a base64url encoded VAPID public key."
    );
  }

  return value;
}

function validateVapidPrivateKey(value) {
  const isCanonical =
    VAPID_KEY_PATTERN.test(value) &&
    value.length === 43;

  if (!isCanonical) {
    throw new Error(
      "Environment variable WEB_PUSH_PRIVATE_KEY must be a base64url encoded 32-byte VAPID private key."
    );
  }

  const key = Buffer.from(value, "base64url");

  if (key.length !== 32) {
    throw new Error(
      "Environment variable WEB_PUSH_PRIVATE_KEY must be a base64url encoded 32-byte VAPID private key."
    );
  }

  return value;
}

function validateVapidSubject(value) {
  if (!VAPID_SUBJECT_PATTERN.test(value)) {
    throw new Error(
      "Environment variable WEB_PUSH_SUBJECT must be a mailto: or https: URL."
    );
  }

  return value;
}

function parseWebPushEnvironment() {
  const publicKey =
    process.env.WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey =
    process.env.WEB_PUSH_PRIVATE_KEY?.trim();
  const subject =
    process.env.WEB_PUSH_SUBJECT?.trim();

  const provided = [
    publicKey,
    privateKey,
    subject,
  ].filter(
    (value) =>
      typeof value === "string" && value !== ""
  );

  // Web Push is optional: without keys the API boots normally and the
  // public key endpoint answers { enabled: false }, so the frontend
  // never offers a subscription that the server cannot honour.
  if (provided.length === 0) {
    return Object.freeze({
      enabled: false,
      publicKey: null,
      privateKey: null,
      subject: null,
    });
  }

  // Half a configuration is always a mistake. Sending with a mismatched
  // key pair silently fails for every subscriber, so refuse to boot.
  if (provided.length !== 3) {
    throw new Error(
      "Environment variables WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY and WEB_PUSH_SUBJECT must be configured together."
    );
  }

  return Object.freeze({
    enabled: true,
    publicKey: validateVapidPublicKey(publicKey),
    privateKey:
      validateVapidPrivateKey(privateKey),
    subject: validateVapidSubject(subject),
  });
}

function validateTrustProxy(value) {
  if (value === undefined || value === "") {
    return null;
  }

  if (!/^\d+$/.test(value)) {
    // Express also accepts "true", "*", "loopback" and address
    // lists here. Those trust a client-supplied X-Forwarded-For
    // unconditionally, which lets anyone forge their address and
    // take a fresh rate limiter bucket on every request. Only an
    // explicit hop count is safe to configure.
    throw new Error(
      "Environment variable TRUST_PROXY must be the number of trusted reverse proxies, an integer greater than or equal to 0. Values such as \"true\", \"*\", \"loopback\" or an IP list are rejected because they let a client forge X-Forwarded-For and bypass the rate limiters."
    );
  }

  const hops = Number(value);

  if (!Number.isSafeInteger(hops)) {
    throw new Error(
      "Environment variable TRUST_PROXY must be the number of trusted reverse proxies, an integer greater than or equal to 0."
    );
  }

  return hops;
}

function parseBoundedInteger(
  value,
  variableName,
  { defaultValue, minimum, maximum }
) {
  const trimmed = value?.trim();

  if (trimmed === undefined || trimmed === "") {
    return defaultValue;
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      `Environment variable ${variableName} must be an integer between ${minimum} and ${maximum}.`
    );
  }

  const parsed = Number(trimmed);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new Error(
      `Environment variable ${variableName} must be an integer between ${minimum} and ${maximum}.`
    );
  }

  return parsed;
}

// Optional, like Web Push: without an API key the API still boots and
// the assistant reports itself as disabled. The key never reaches the
// frontend.
function parseAssistantEnvironment() {
  const provider = (
    process.env.AI_PROVIDER?.trim() ||
    ASSISTANT_PROVIDERS.GEMINI
  ).toLowerCase();

  if (!ASSISTANT_PROVIDER_VALUES.includes(provider)) {
    throw new Error(
      `Environment variable AI_PROVIDER must be one of: ${ASSISTANT_PROVIDER_VALUES.join(", ")}.`
    );
  }

  const model =
    process.env.AI_MODEL?.trim() ||
    DEFAULT_ASSISTANT_MODEL;

  if (!ASSISTANT_MODEL_PATTERN.test(model)) {
    throw new Error(
      "Environment variable AI_MODEL must contain only letters, digits, dots, dashes or underscores."
    );
  }

  const maxOutputTokens = parseBoundedInteger(
    process.env.AI_MAX_OUTPUT_TOKENS,
    "AI_MAX_OUTPUT_TOKENS",
    {
      defaultValue:
        DEFAULT_ASSISTANT_MAX_OUTPUT_TOKENS,
      minimum: MIN_ASSISTANT_MAX_OUTPUT_TOKENS,
      maximum: MAX_ASSISTANT_MAX_OUTPUT_TOKENS,
    }
  );

  const timeoutMs = parseBoundedInteger(
    process.env.AI_TIMEOUT_MS,
    "AI_TIMEOUT_MS",
    {
      defaultValue: DEFAULT_ASSISTANT_TIMEOUT_MS,
      minimum: MIN_ASSISTANT_TIMEOUT_MS,
      maximum: MAX_ASSISTANT_TIMEOUT_MS,
    }
  );

  const apiKey =
    provider === ASSISTANT_PROVIDERS.GEMINI
      ? process.env.GEMINI_API_KEY?.trim() ?? ""
      : "";

  return Object.freeze({
    enabled: apiKey.length > 0,
    provider,
    model,
    apiKey: apiKey.length > 0 ? apiKey : null,
    maxOutputTokens,
    timeoutMs,
  });
}

function loadEnvironment() {
  const nodeEnv = process.env.NODE_ENV ?? "development";

  const port = parsePort(
    process.env.PORT ?? "3000",
    "PORT"
  );

  if (!VALID_NODE_ENVIRONMENTS.has(nodeEnv)) {
    throw new Error(
      "Environment variable NODE_ENV must be development, test, or production."
    );
  }

  const database = Object.freeze({
    host: requireEnvironmentVariable("DB_HOST"),

    port: parsePort(
      requireEnvironmentVariable("DB_PORT"),
      "DB_PORT"
    ),

    name: requireEnvironmentVariable("DB_NAME"),
    user: requireEnvironmentVariable("DB_USER"),
    password: requireEnvironmentVariable("DB_PASSWORD"),
  });

  const jwt = Object.freeze({
    accessTokenSecret: validateJwtSecret(
      requireEnvironmentVariable(
        "JWT_ACCESS_TOKEN_SECRET"
      ),
      "JWT_ACCESS_TOKEN_SECRET"
    ),

    accessTokenTtl: validateJwtTtl(
      requireEnvironmentVariable(
        "JWT_ACCESS_TOKEN_TTL"
      ),
      "JWT_ACCESS_TOKEN_TTL"
    ),

    refreshTokenSecret: validateJwtSecret(
      requireEnvironmentVariable(
        "JWT_REFRESH_TOKEN_SECRET"
      ),
      "JWT_REFRESH_TOKEN_SECRET"
    ),

    refreshTokenTtl: validateJwtTtl(
      requireEnvironmentVariable(
        "JWT_REFRESH_TOKEN_TTL"
      ),
      "JWT_REFRESH_TOKEN_TTL"
    ),
  });

  const imagekit = Object.freeze({
    publicKey: requireEnvironmentVariable(
      "IMAGEKIT_PUBLIC_KEY"
    ),
    privateKey: requireEnvironmentVariable(
      "IMAGEKIT_PRIVATE_KEY"
    ),
    urlEndpoint: validateImageKitUrlEndpoint(
      requireEnvironmentVariable(
        "IMAGEKIT_URL_ENDPOINT"
      )
    ),
    folder: validateImageKitFolder(
      requireEnvironmentVariable("IMAGEKIT_FOLDER")
    ),
  });

  const youtube = Object.freeze({
    clientId: requireEnvironmentVariable(
      "GOOGLE_CLIENT_ID"
    ),
    clientSecret: requireEnvironmentVariable(
      "GOOGLE_CLIENT_SECRET"
    ),
    redirectUri: validateGoogleRedirectUri(
      requireEnvironmentVariable(
        "GOOGLE_REDIRECT_URI"
      ),
      nodeEnv
    ),
    tokenEncryptionKey:
      validateYoutubeTokenEncryptionKey(
        requireEnvironmentVariable(
          "YOUTUBE_TOKEN_ENCRYPTION_KEY"
        )
      ),
    channelId: validateYoutubeChannelId(
      process.env.YOUTUBE_CHANNEL_ID?.trim()
    ),
  });

  if (
    jwt.accessTokenSecret ===
    jwt.refreshTokenSecret
  ) {
    throw new Error(
      "JWT access and refresh token secrets must be different."
    );
  }

  return Object.freeze({
    nodeEnv,
    port,
    database,
    jwt,
    imagekit,
    youtube,
    // Optional. When disabled the API still boots and the public key
    // endpoint reports the feature as unavailable.
    webPush: parseWebPushEnvironment(),
    // Optional. Without GEMINI_API_KEY the assistant stays disabled.
    assistant: parseAssistantEnvironment(),
    // null keeps Express' default of trusting nothing, so request.ip
    // stays the socket address. See validateTrustProxy for why no
    // looser value is accepted.
    trustProxy: validateTrustProxy(
      process.env.TRUST_PROXY?.trim()
    ),
    isDevelopment: nodeEnv === "development",
    isTest: nodeEnv === "test",
    isProduction: nodeEnv === "production",
  });
}

const env = loadEnvironment();

module.exports = env;