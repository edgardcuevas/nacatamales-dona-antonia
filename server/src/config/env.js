const VALID_NODE_ENVIRONMENTS = new Set([
  "development",
  "test",
  "production",
]);

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

  return Object.freeze({
    nodeEnv,
    port,
    database,
    isDevelopment: nodeEnv === "development",
    isTest: nodeEnv === "test",
    isProduction: nodeEnv === "production",
  });
}

const env = loadEnvironment();

module.exports = env;