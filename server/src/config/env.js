const VALID_NODE_ENVIRONMENTS = new Set([
  "development",
  "test",
  "production",
]);

const JWT_TTL_PATTERN = /^\d+[smhd]$/;
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
    isDevelopment: nodeEnv === "development",
    isTest: nodeEnv === "test",
    isProduction: nodeEnv === "production",
  });
}

const env = loadEnvironment();

module.exports = env;