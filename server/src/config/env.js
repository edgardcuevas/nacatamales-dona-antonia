const VALID_NODE_ENVIRONMENTS = new Set([
  "development",
  "test",
  "production",
]);

function parsePort(value) {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      "Environment variable PORT must be an integer between 1 and 65535."
    );
  }

  return port;
}

function loadEnvironment() {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const port = parsePort(process.env.PORT ?? "3000");

  if (!VALID_NODE_ENVIRONMENTS.has(nodeEnv)) {
    throw new Error(
      "Environment variable NODE_ENV must be development, test, or production."
    );
  }

  return Object.freeze({
    nodeEnv,
    port,
    isDevelopment: nodeEnv === "development",
    isTest: nodeEnv === "test",
    isProduction: nodeEnv === "production",
  });
}

const env = loadEnvironment();

module.exports = env;