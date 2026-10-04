const fs = require("node:fs");
const path = require("node:path");

// The development and production environments keep validating through
// src/config/env.js, which reads .env. That module must stay the single
// source of truth for them.
const env = require("./src/config/env");

const TEST_ENV_FILE = ".env.test";
const DEVELOPMENT_ENV_FILE = ".env";
const TEST_DATABASE_SUFFIX = "_test";
const REQUIRED_TEST_VARIABLES = Object.freeze([
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
]);

const migrations = {
  directory: "./database/migrations",
  tableName: "knex_migrations",
  extension: "js",
};

// Every guard throws before a single connection is opened. Knex turns a
// thrown error into a non-zero exit, so a misconfigured test run can
// never fall through onto a real database.
class TestEnvironmentGuardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TestEnvironmentGuardError";
    this.code = code;
  }
}

function requireTestEnvironment(runtimeEnvironment) {
  if (runtimeEnvironment.NODE_ENV !== "test") {
    throw new TestEnvironmentGuardError(
      "TEST_ENV_NODE_ENV_MISMATCH",
      `The test environment requires NODE_ENV=test but found NODE_ENV=${runtimeEnvironment.NODE_ENV ?? "(unset)"}. Refusing to continue.`
    );
  }
}

// Reading .env here would be the mistake this guard exists to prevent:
// the test environment must never be able to inherit a development
// credential, so the process has to prove which file fed it.
function requireIsolatedTestEnvironmentSource(
  runtimeEnvironment,
  testEnvironmentFile
) {
  if (
    runtimeEnvironment.TEST_ENV_SOURCE !== TEST_ENV_FILE
  ) {
    throw new TestEnvironmentGuardError(
      "TEST_ENV_SOURCE_ISOLATED",
      `The test environment must be launched with --env-file=${TEST_ENV_FILE}. TEST_ENV_SOURCE is ${runtimeEnvironment.TEST_ENV_SOURCE ?? "(unset)"}, which does not identify ${TEST_ENV_FILE}. Refusing to continue.`
    );
  }

  if (!fs.existsSync(testEnvironmentFile)) {
    throw new TestEnvironmentGuardError(
      "TEST_ENV_FILE_MISSING",
      `The test environment file ${TEST_ENV_FILE} does not exist. Refusing to continue.`
    );
  }
}

function requireTestDatabaseSuffix(runtimeEnvironment) {
  const databaseName = normalizeDatabaseName(
    runtimeEnvironment.DB_NAME
  );

  if (
    databaseName === null ||
    !databaseName
      .toLowerCase()
      .endsWith(TEST_DATABASE_SUFFIX)
  ) {
    throw new TestEnvironmentGuardError(
      "TEST_DATABASE_SUFFIX",
      `The test database name must end with ${TEST_DATABASE_SUFFIX} to make accidental writes to a real database impossible. Refusing to continue.`
    );
  }
}

// Trimmed and type-checked so " value " and "value" cannot be treated as
// two different databases.
function normalizeDatabaseName(value) {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Reads exactly one key from a dotenv file and returns it. The file is
// never loaded into process.env: this exists precisely so that reading
// the development database name cannot contaminate the test run.
//
// Case sensitivity follows the MySQL default on Linux and macOS, where
// database names are compared case-sensitively. On Windows they are not,
// so the comparison is done on a case-folded copy to stay conservative:
// a name that differs only by case is treated as a collision rather than
// as proof of separation.
function readDatabaseNameFromEnvFile(
  environmentFile
) {
  if (!fs.existsSync(environmentFile)) {
    return null;
  }

  const match = fs
    .readFileSync(environmentFile, "utf8")
    .match(/^\s*DB_NAME\s*=\s*(.*?)\s*$/m);

  if (!match) {
    return null;
  }

  const rawValue = match[1].replace(/^["']|["']$/g, "");
  return normalizeDatabaseName(rawValue);
}

// Proves the separation instead of assuming it. The development name
// comes from the .env file on disk rather than from src/config/env.js,
// because that module resolves DB_NAME from process.env, which holds the
// test values once the process starts with --env-file=.env.test.
function requireTestDatabaseIsDistinctFromDevelopment(
  runtimeEnvironment,
  developmentDatabaseName
) {
  const testDatabaseName = normalizeDatabaseName(
    runtimeEnvironment.DB_NAME
  );

  if (
    testDatabaseName === null ||
    developmentDatabaseName === null
  ) {
    throw new TestEnvironmentGuardError(
      "TEST_SEPARATION_UNPROVABLE",
      "The development database name could not be determined, so the separation between test and development cannot be proven. Refusing to continue."
    );
  }

  if (
    testDatabaseName.toLowerCase() ===
    developmentDatabaseName.toLowerCase()
  ) {
    throw new TestEnvironmentGuardError(
      "TEST_DATABASE_DISTINCT_FROM_DEV",
      "The test database name resolves to the same database as development. Refusing to continue because migrations would run against development data."
    );
  }
}

function requireProvableTestDatabaseSeparation(
  runtimeEnvironment,
  developmentDatabaseName
) {
  requireTestDatabaseIsDistinctFromDevelopment(
    runtimeEnvironment,
    developmentDatabaseName
  );
}

function requireCompleteTestEnvironment(
  runtimeEnvironment
) {
  const missing = REQUIRED_TEST_VARIABLES.filter(
    (name) => {
      const value = runtimeEnvironment[name];
      return (
        typeof value !== "string" ||
        value.trim() === ""
      );
    }
  );

  if (missing.length > 0) {
    throw new TestEnvironmentGuardError(
      "TEST_ENV_INCOMPLETE",
      `The test environment is missing required variables: ${missing.join(", ")}. Refusing to continue.`
    );
  }
}

// Built separately and on purpose: the test connection is never derived
// from the shared factory, so editing development cannot change what test
// connects to, and vice versa.
function createTestEnvironmentConfig(
  runtimeEnvironment,
  options = {}
) {
  requireTestEnvironment(runtimeEnvironment);
  requireIsolatedTestEnvironmentSource(
    runtimeEnvironment,
    path.join(__dirname, TEST_ENV_FILE)
  );
  requireTestDatabaseSuffix(runtimeEnvironment);

  // The production file is resolved from disk so the comparison does not
  // depend on process.env, which already holds the test values.
  const developmentEnvironmentFile =
    options.developmentEnvironmentFile ??
    path.join(__dirname, DEVELOPMENT_ENV_FILE);
  const developmentDatabaseName =
    options.developmentDatabaseName ??
    readDatabaseNameFromEnvFile(
      developmentEnvironmentFile
    );

  requireProvableTestDatabaseSeparation(
    runtimeEnvironment,
    developmentDatabaseName
  );
  requireCompleteTestEnvironment(runtimeEnvironment);

  return {
    client: "mysql2",

    connection: {
      host: runtimeEnvironment.DB_HOST,
      port: Number(runtimeEnvironment.DB_PORT),
      database: runtimeEnvironment.DB_NAME,
      user: runtimeEnvironment.DB_USER,
      password: runtimeEnvironment.DB_PASSWORD,
    },

    migrations,
  };
}

function createDevelopmentEnvironmentConfig() {
  return {
    client: "mysql2",

    connection: {
      host: env.database.host,
      port: env.database.port,
      database: env.database.name,
      user: env.database.user,
      password: env.database.password,
    },

    migrations,
  };
}

const development =
  createDevelopmentEnvironmentConfig();
const production =
  createDevelopmentEnvironmentConfig();

// Resolved lazily so that requiring this file for development or
// production never validates the test environment.
function resolveTestEnvironment() {
  return createTestEnvironmentConfig(process.env);
}

module.exports = {
  development,
  production,

  // A getter rather than a value: the guards must run at the moment the
  // test environment is selected, not when this file is loaded.
  get test() {
    return resolveTestEnvironment();
  },

  __testing: {
    TEST_ENV_FILE,
    DEVELOPMENT_ENV_FILE,
    TEST_DATABASE_SUFFIX,
    REQUIRED_TEST_VARIABLES,
    TestEnvironmentGuardError,
    createTestEnvironmentConfig,
    normalizeDatabaseName,
    readDatabaseNameFromEnvFile,
    requireTestEnvironment,
    requireIsolatedTestEnvironmentSource,
    requireTestDatabaseSuffix,
    requireTestDatabaseIsDistinctFromDevelopment,
    requireProvableTestDatabaseSeparation,
    requireCompleteTestEnvironment,
  },
};