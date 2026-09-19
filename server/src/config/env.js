const VALID_NODE_ENVIRONMENTS = new Set([
  "development",
  "test",
  "production",
]);

const JWT_TTL_PATTERN = /^\d+[smhd]$/;

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
    isDevelopment: nodeEnv === "development",
    isTest: nodeEnv === "test",
    isProduction: nodeEnv === "production",
  });
}

const env = loadEnvironment();

module.exports = env;