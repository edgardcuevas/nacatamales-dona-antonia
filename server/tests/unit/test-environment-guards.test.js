const test = require("node:test");
const assert = require("node:assert/strict");
const {
  spawnSync,
} = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SERVER_ROOT = path.resolve(__dirname, "../..");

// knexfile.js requires src/config/env.js, which resolves the development
// database from the ambient environment. These tests must not depend on
// the real .env to decide a unit outcome, so every scenario supplies its
// own temporary dotenv files and injects the resolved development name.
//
// No assertion prints a database name, a credential or a URL: the
// sensitive values live in TEMPORARY_* constants that are never echoed.
const TEMPORARY_DEVELOPMENT_DATABASE =
  "tmp_dev_database_name";
const TEMPORARY_TEST_DATABASE =
  "tmp_dev_database_name_test";

function createValidTestEnvironment(
  overrides = {}
) {
  return {
    NODE_ENV: "test",
    TEST_ENV_SOURCE: ".env.test",
    DB_HOST: "localhost",
    DB_PORT: "3306",
    DB_NAME: TEMPORARY_TEST_DATABASE,
    DB_USER: "test_user",
    DB_PASSWORD: "test_password",
    ...overrides,
  };
}

const DEVELOPMENT_ENVIRONMENT = Object.freeze({
  NODE_ENV: "development",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: TEMPORARY_DEVELOPMENT_DATABASE,
  DB_USER: "test_user",
  DB_PASSWORD: "test_password",
  JWT_ACCESS_TOKEN_SECRET:
    "test-access-secret-with-at-least-32-characters",
  JWT_ACCESS_TOKEN_TTL: "15m",
  JWT_REFRESH_TOKEN_SECRET:
    "test-refresh-secret-with-at-least-32-characters",
  JWT_REFRESH_TOKEN_TTL: "30d",
  IMAGEKIT_PUBLIC_KEY: "test_public_key",
  IMAGEKIT_PRIVATE_KEY: "test_private_key",
  IMAGEKIT_URL_ENDPOINT:
    "https://ik.imagekit.io/test-imagekit-id",
  IMAGEKIT_FOLDER: "test-folder",
  GOOGLE_CLIENT_ID: "test_google_client_id",
  GOOGLE_CLIENT_SECRET: "test_google_client_secret",
  GOOGLE_REDIRECT_URI:
    "http://localhost:3000/api/youtube/oauth/callback",
  YOUTUBE_TOKEN_ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  YOUTUBE_CHANNEL_ID: "UC1234567890123456789012",
});

function createTemporaryDirectory() {
  return fs.mkdtempSync(
    path.join(os.tmpdir(), "knex-guard-test-")
  );
}

function writeDotEnvFile(
  directory,
  fileName,
  entries
) {
  const filePath = path.join(directory, fileName);
  fs.writeFileSync(
    filePath,
    `${Object.entries(entries)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
    "utf8"
  );
  return filePath;
}

function runNode(script, environment) {
  const result = spawnSync(
    process.execPath,
    ["-e", script],
    {
      cwd: SERVER_ROOT,
      encoding: "utf8",
      env: environment,
    }
  );

  assert.equal(
    result.status,
    0,
    `the child process failed: ${result.stderr}`
  );

  return JSON.parse(
    result.stdout.trim().split(/\r?\n/).pop()
  );
}

const GUARD_SCRIPT = [
  'const knexfile = require("./knexfile.js");',
  "const testing = knexfile.__testing;",
  "const input = JSON.parse(process.env.GUARD_INPUT);",
  "const result = { guardSucceeded: false, errorCode: null };",
  "try {",
  "  testing.createTestEnvironmentConfig(input, {",
  '    developmentDatabaseName: process.env.GUARD_DEV_NAME || null,',
  "  });",
  "  result.guardSucceeded = true;",
  "} catch (error) {",
  "  result.errorCode = error.code ?? null;",
  '  result.errorMessage = String(error.message);',
  "}",
  "console.log(JSON.stringify(result));",
].join("\n");

function runGuards(
  testEnvironment,
  developmentDatabaseName = TEMPORARY_DEVELOPMENT_DATABASE
) {
  return runNode(GUARD_SCRIPT, {
    ...DEVELOPMENT_ENVIRONMENT,
    GUARD_INPUT: JSON.stringify(testEnvironment),
    GUARD_DEV_NAME: developmentDatabaseName,
  });
}

function assertGuardAccepts(testEnvironment) {
  const result = runGuards(testEnvironment);

  assert.equal(
    result.errorCode,
    null,
    `unexpected guard failure: ${result.errorMessage}`
  );
  assert.equal(result.guardSucceeded, true);

  return result;
}

function assertGuardRejects(
  testEnvironment,
  expectedCode,
  developmentDatabaseName = TEMPORARY_DEVELOPMENT_DATABASE
) {
  const result = runGuards(
    testEnvironment,
    developmentDatabaseName
  );

  assert.equal(
    result.guardSucceeded,
    false,
    "the guard must reject this environment"
  );
  assert.equal(result.errorCode, expectedCode);
  assert.match(result.errorMessage, /Refusing to continue/);

  return result;
}

// 1. Accepts the documented case: development without the suffix and test
//    with it.
test("accepts a development database and its _test counterpart", () => {
  const result = assertGuardAccepts(
    createValidTestEnvironment({
      DB_NAME: "nacatamales_dona_antonia_test",
    }),
  );

  assert.equal(result.guardSucceeded, true);
});

// 2. Rejects identical names.
test("rejects a test database identical to development", () => {
  assertGuardRejects(
    createValidTestEnvironment({
      DB_NAME: TEMPORARY_DEVELOPMENT_DATABASE + "_test",
    }),
    "TEST_DATABASE_DISTINCT_FROM_DEV",
    `${TEMPORARY_DEVELOPMENT_DATABASE}_test`
  );
});

// 3. Rejects names that are equivalent once normalized.
test("rejects a test database equivalent to development after normalization", () => {
  // Whitespace must not create a false separation. Once trimmed the
  // name is identical to development, and both sides carry the suffix,
  // so the collision is caught by the distinctness guard.
  assertGuardRejects(
    createValidTestEnvironment({
      DB_NAME: `  ${TEMPORARY_DEVELOPMENT_DATABASE}_test  `,
    }),
    "TEST_DATABASE_DISTINCT_FROM_DEV",
    `${TEMPORARY_DEVELOPMENT_DATABASE}_test`
  );

  // Case-only differences are treated as a collision, because MySQL
  // schema names are case-insensitive on Windows.
  assertGuardRejects(
    createValidTestEnvironment({
      DB_NAME: `${TEMPORARY_DEVELOPMENT_DATABASE}_TEST`,
    }),
    "TEST_DATABASE_DISTINCT_FROM_DEV",
    `${TEMPORARY_DEVELOPMENT_DATABASE}_test`
  );

  // The same padded name that does NOT collide with development is
  // accepted, proving the whitespace handling does not reject on its
  // own.
  assertGuardAccepts(
    createValidTestEnvironment({
      DB_NAME: `  ${TEMPORARY_TEST_DATABASE}  `,
    }),
  );
});

// 9 and 10. Reading the development name must not touch process.env, and
//      must not bring in any other development variable.
test("reading the development database name leaves process.env untouched", () => {
  const directory = createTemporaryDirectory();
  const developmentFile = writeDotEnvFile(
    directory,
    ".env",
    {
      NODE_ENV: "development",
      DB_HOST: "development-only-host.invalid",
      DB_PORT: "3399",
      DB_NAME: TEMPORARY_DEVELOPMENT_DATABASE,
      DB_USER: "development-only-user",
      DB_PASSWORD: "development-only-password",
      SECRET_MARKER: "must-not-be-loaded",
    }
  );

  const script = [
    'const knexfile = require("./knexfile.js");',
    "const testing = knexfile.__testing;",
    'const file = process.env.PROBE_FILE;',
    "const before = { ...process.env };",
    "const name = testing.readDatabaseNameFromEnvFile(file);",
    "const leaked = [];",
    "for (const key of Object.keys(process.env)) {",
    "  if (before[key] !== process.env[key]) {",
    "    leaked.push(key);",
    "  }",
    "}",
    "console.log(JSON.stringify({",
    "  mutatedKeys: leaked,",
    "  developmentUserLoaded:",
    '    process.env.DB_USER === "development-only-user",',
    "  developmentPasswordLoaded:",
    '    process.env.DB_PASSWORD === "development-only-password",',
    "  developmentHostLoaded:",
    '    process.env.DB_HOST === "development-only-host.invalid",',
    "  secretMarkerLoaded:",
    '    process.env.SECRET_MARKER === "must-not-be-loaded",',
    "  nameMatchesExpectation:",
    `    name === "${TEMPORARY_DEVELOPMENT_DATABASE}",`,
    "  testSourceStillPresent:",
    "    typeof process.env.TEST_ENV_SOURCE === \"string\",",
    "}));",
  ].join("\n");

  const result = runNode(script, {
    ...DEVELOPMENT_ENVIRONMENT,
    PROBE_FILE: developmentFile,
    TEST_ENV_SOURCE: ".env.test",
  });

  assert.deepEqual(result.mutatedKeys, []);
  assert.equal(
    result.developmentUserLoaded,
    false
  );
  assert.equal(
    result.developmentPasswordLoaded,
    false
  );
  assert.equal(result.developmentHostLoaded, false);
  assert.equal(result.secretMarkerLoaded, false);
  assert.equal(result.nameMatchesExpectation, true);
  assert.equal(result.testSourceStillPresent, true);

  fs.rmSync(directory, { recursive: true, force: true });
});

// 4 and 5. The .env file must exist and declare DB_NAME.
test("the development database name is read from the .env file on disk", () => {
  const directory = createTemporaryDirectory();

  const script = [
    'const knexfile = require("./knexfile.js");',
    "const testing = knexfile.__testing;",
    'const missing = testing.readDatabaseNameFromEnvFile(',
    '  process.env.PROBE_MISSING);',
    'const withoutName = testing.readDatabaseNameFromEnvFile(',
    '  process.env.PROBE_WITHOUT_NAME);',
    'const withName = testing.readDatabaseNameFromEnvFile(',
    '  process.env.PROBE_WITH_NAME);',
    'const blank = testing.readDatabaseNameFromEnvFile(',
    '  process.env.PROBE_BLANK);',
    "console.log(JSON.stringify({",
    "  missing, withoutName, withName, blank,",
    "  normalizeHandlesNull: testing.normalizeDatabaseName(null),",
    "  normalizeHandlesNumber: testing.normalizeDatabaseName(42),",
    '  normalizeTrims: testing.normalizeDatabaseName("  padded  "),',
    '  normalizeEmpty: testing.normalizeDatabaseName("   "),',
    "}));",
  ].join("\n");

  const withoutName = writeDotEnvFile(
    directory,
    "without-name",
    { DB_HOST: "localhost", DB_PORT: "3306" }
  );
  const withName = writeDotEnvFile(
    directory,
    "with-name",
    { DB_NAME: TEMPORARY_DEVELOPMENT_DATABASE }
  );
  const blank = writeDotEnvFile(
    directory,
    "blank",
    { DB_NAME: "   " }
  );

  const result = runNode(script, {
    ...DEVELOPMENT_ENVIRONMENT,
    PROBE_MISSING: path.join(directory, "absent"),
    PROBE_WITHOUT_NAME: withoutName,
    PROBE_WITH_NAME: withName,
    PROBE_BLANK: blank,
  });

  assert.equal(result.missing, null);
  assert.equal(result.withoutName, null);
  assert.equal(
    result.withName,
    TEMPORARY_DEVELOPMENT_DATABASE
  );
  assert.equal(result.blank, null);
  assert.equal(
    result.normalizeHandlesNull,
    null
  );
  assert.equal(
    result.normalizeHandlesNumber,
    null
  );
  assert.equal(result.normalizeTrims, "padded");
  assert.equal(result.normalizeEmpty, null);

  fs.rmSync(directory, { recursive: true, force: true });
});

test("the guard aborts when the development .env file is absent or has no DB_NAME", () => {
  const script = [
    'const knexfile = require("./knexfile.js");',
    "const testing = knexfile.__testing;",
    'const input = JSON.parse(process.env.GUARD_INPUT);',
    "const results = {};",
    "for (const [label, file] of [",
    '  ["missingFile", process.env.PROBE_MISSING],',
    '  ["withoutName", process.env.PROBE_WITHOUT_NAME],',
    "]) {",
    "  try {",
    "    testing.createTestEnvironmentConfig(input, {",
    "      developmentEnvironmentFile: file,",
    "    });",
    `    results[label] = "ACCEPTED";`,
    "  } catch (error) {",
    "    results[label] = error.code ?? \"UNKNOWN\";",
    "  }",
    "}",
    "console.log(JSON.stringify(results));",
  ].join("\n");

  const directory = createTemporaryDirectory();
  const withoutName = writeDotEnvFile(
    directory,
    ".env",
    { DB_HOST: "localhost", DB_PORT: "3306" }
  );

  const result = runNode(script, {
    ...DEVELOPMENT_ENVIRONMENT,
    GUARD_INPUT: JSON.stringify(
      createValidTestEnvironment()
    ),
    PROBE_MISSING: path.join(directory, "absent"),
    PROBE_WITHOUT_NAME: withoutName,
  });

  assert.equal(
    result.missingFile,
    "TEST_SEPARATION_UNPROVABLE"
  );
  assert.equal(
    result.withoutName,
    "TEST_SEPARATION_UNPROVABLE"
  );

  fs.rmSync(directory, { recursive: true, force: true });
});

// 6, 7 and 8. The remaining guards must keep holding.
test("the guard rejects a test database without the _test suffix", () => {
  assertGuardRejects(
    createValidTestEnvironment({
      DB_NAME: "database_without_suffix",
    }),
    "TEST_DATABASE_SUFFIX"
  );

  assertGuardRejects(
    createValidTestEnvironment({
      DB_NAME: "database_tests",
    }),
    "TEST_DATABASE_SUFFIX"
  );

  assertGuardRejects(
    createValidTestEnvironment({ DB_NAME: undefined }),
    "TEST_DATABASE_SUFFIX"
  );

  assertGuardRejects(
    createValidTestEnvironment({ DB_NAME: "   " }),
    "TEST_DATABASE_SUFFIX"
  );
});

test("the guard rejects a run that did not load .env.test", () => {
  for (const source of [
    undefined,
    ".env",
    "",
    "env.test",
    ".ENV.TEST",
  ]) {
    assertGuardRejects(
      createValidTestEnvironment({
        TEST_ENV_SOURCE: source,
      }),
      "TEST_ENV_SOURCE_ISOLATED"
    );
  }
});

test("the guard rejects any NODE_ENV other than test", () => {
  for (const nodeEnv of [
    undefined,
    "development",
    "production",
    "Test",
    "",
  ]) {
    assertGuardRejects(
      createValidTestEnvironment({ NODE_ENV: nodeEnv }),
      "TEST_ENV_NODE_ENV_MISMATCH"
    );
  }
});

test("the guard rejects a missing required variable", () => {
  for (const name of [
    "DB_HOST",
    "DB_PORT",
    "DB_USER",
    "DB_PASSWORD",
  ]) {
    assertGuardRejects(
      createValidTestEnvironment({ [name]: undefined }),
      "TEST_ENV_INCOMPLETE"
    );

    assertGuardRejects(
      createValidTestEnvironment({ [name]: "   " }),
      "TEST_ENV_INCOMPLETE"
    );
  }
});

test("the guard names the missing variables in its message", () => {
  const result = runGuards(
    createValidTestEnvironment({
      DB_USER: "",
      DB_PASSWORD: undefined,
    })
  );

  assert.equal(result.errorCode, "TEST_ENV_INCOMPLETE");
  assert.match(result.errorMessage, /DB_USER/);
  assert.match(result.errorMessage, /DB_PASSWORD/);
});

// 11. The test configuration must not reuse the development connection.
//     This exercises the real getter against the provisioned .env.test,
//     exactly as a migration run would. Only booleans are reported back.
//
//     Note: knexfile.development resolves through src/config/env.js,
//     which reads process.env. Under --env-file=.env.test it therefore
//     reports the *test* database, which is precisely why the
//     distinctness guard reads the development name from disk instead
//     of trusting that object. The guard coverage above proves the
//     separation; this test proves the configuration is self-contained.
test("the test connection is not derived from the development connection", () => {
  const testEnvironmentFile = path.join(
    SERVER_ROOT,
    ".env.test"
  );

  if (!fs.existsSync(testEnvironmentFile)) {
    return;
  }

  const script = [
    'const knexfile = require("./knexfile.js");',
    "const config = knexfile.test;",
    "console.log(JSON.stringify({",
    "  client: config.client,",
    "  migrationTable: config.migrations.tableName,",
    "  isOwnConnectionObject:",
    "    config.connection !== knexfile.development.connection,",
    "  testNameEndsWithSuffix:",
    '    String(config.connection.database).endsWith("_test"),',
    "  migrationsSharedByReference:",
    "    config.migrations === knexfile.development.migrations,",
    "}));",
  ].join("\n");

  const result = spawnSync(
    process.execPath,
    ["--env-file=.env.test", "-e", script],
    {
      cwd: SERVER_ROOT,
      encoding: "utf8",
    }
  );

  assert.equal(
    result.status,
    0,
    `the real test environment must load: ${result.stderr}`
  );

  const output = JSON.parse(
    result.stdout.trim().split(/\r?\n/).pop()
  );

  assert.equal(output.client, "mysql2");
  assert.equal(
    output.migrationTable,
    "knex_migrations"
  );
  // The connection is its own object, so mutating one environment can
  // never reach the other.
  assert.equal(output.isOwnConnectionObject, true);
  assert.equal(output.testNameEndsWithSuffix, true);
  // Sharing the immutable migrations descriptor is intentional.
  assert.equal(
    output.migrationsSharedByReference,
    true
  );
});

test("the test environment is resolved lazily and never falls back to development", () => {
  const script = [
    'const knexfile = require("./knexfile.js");',
    "const descriptor = Object.getOwnPropertyDescriptor(knexfile, \"test\");",
    "console.log(JSON.stringify({",
    '  developmentIsObject: typeof knexfile.development === "object",',
    '  productionIsObject: typeof knexfile.production === "object",',
    '  testIsGetter: typeof descriptor.get === "function",',
    "  environments: Object.keys(knexfile)",
    '    .filter((key) => !key.startsWith("__")),',
    "}));",
  ].join("\n");

  const result = runNode(script, {
    ...DEVELOPMENT_ENVIRONMENT,
  });

  assert.equal(result.developmentIsObject, true);
  assert.equal(result.productionIsObject, true);
  assert.equal(result.testIsGetter, true);
  assert.deepEqual(result.environments, [
    "development",
    "production",
    "test",
  ]);
});

// 12. The CLI without --env-file must abort before connecting.
test("a run without --env-file is refused before any connection", () => {
  const script = [
    'process.env.NODE_ENV = "test";',
    'const knexfile = require("./knexfile.js");',
    "try {",
    "  knexfile.test;",
    '  console.log(JSON.stringify({ rejected: false }));',
    "} catch (error) {",
    '  console.log(JSON.stringify({ rejected: true, code: error.code }));',
    "}",
  ].join("\n");

  const result = runNode(script, {
    ...DEVELOPMENT_ENVIRONMENT,
  });

  assert.equal(result.rejected, true);
  assert.equal(result.code, "TEST_ENV_SOURCE_ISOLATED");
});

// 13. No guard message may leak a database name, credential or URL.
test("no guard failure message leaks a database name, credential or URL", () => {
  const sensitiveValues = [
    TEMPORARY_DEVELOPMENT_DATABASE,
    "development-only-password",
    "development-only-user",
    "development-only-host.invalid",
  ];

  const failingScenarios = [
    createValidTestEnvironment({ NODE_ENV: "development" }),
    createValidTestEnvironment({ TEST_ENV_SOURCE: ".env" }),
    createValidTestEnvironment({ DB_NAME: "plain_name" }),
    createValidTestEnvironment({
      DB_NAME: `${TEMPORARY_DEVELOPMENT_DATABASE}_test`,
    }),
    createValidTestEnvironment({ DB_PASSWORD: "" }),
  ];

  for (const scenario of failingScenarios) {
    const result = runGuards(
      scenario,
      TEMPORARY_DEVELOPMENT_DATABASE + "_test"
    );

    assert.equal(result.guardSucceeded, false);
    assert.equal(
      typeof result.errorMessage,
      "string"
    );

    for (const value of sensitiveValues) {
      assert.equal(
        result.errorMessage.includes(value),
        false,
        "a guard message leaked a sensitive value"
      );
    }

    assert.doesNotMatch(
      result.errorMessage,
      /mysql:\/\//i
    );
    assert.doesNotMatch(
      result.errorMessage,
      /:\d{4,5}@/
    );
  }
});

// The real provisioned .env.test must satisfy the guards.
test("the real .env.test is accepted and points at a _test database", () => {
  const environmentFile = path.join(
    SERVER_ROOT,
    ".env.test"
  );

  if (!fs.existsSync(environmentFile)) {
    return;
  }

  const values = {};
  for (const line of fs
    .readFileSync(environmentFile, "utf8")
    .split(/\r?\n/)) {
    const match = line.match(
      /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/
    );
    if (match) {
      values[match[1]] = match[2];
    }
  }

  assert.equal(values.NODE_ENV, "test");
  assert.equal(
    values.TEST_ENV_SOURCE,
    ".env.test"
  );
  assert.match(values.DB_NAME, /_test$/);

  const result = runGuards({ ...values });

  assert.equal(
    result.errorCode,
    null,
    `the provisioned .env.test was rejected: ${result.errorMessage}`
  );
  assert.equal(result.guardSucceeded, true);
});

test("the npm scripts target the test environment explicitly", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(
      path.join(SERVER_ROOT, "package.json"),
      "utf8"
    )
  );

  const databaseScripts = Object.entries(
    packageJson.scripts
  ).filter(([name]) => name.startsWith("test:db:"));

  assert.ok(databaseScripts.length > 0);

  for (const [name, command] of databaseScripts) {
    assert.match(command, /--env-file=\.env\.test/);
    assert.match(command, /--env test/);
    assert.doesNotMatch(
      command,
      /--env-file=\.env(\s|$)/
    );
  }
});