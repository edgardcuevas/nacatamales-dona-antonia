const test = require("node:test");
const assert = require("node:assert/strict");
const {
  spawnSync,
} = require("node:child_process");
const path = require("node:path");

const SERVER_ROOT = path.resolve(__dirname, "../..");

const BASE_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "trust_proxy_test",
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

function runConfig(overrides = {}, removedKeys = []) {
  const environment = {
    ...process.env,
    ...BASE_ENVIRONMENT,
    ...overrides,
  };

  for (const key of removedKeys) {
    delete environment[key];
  }

  return spawnSync(
    process.execPath,
    [
      "-e",
      [
        'const env = require("./src/config/env");',
        "console.log(JSON.stringify({",
        "trustProxy: env.trustProxy,",
        "hasKey: Object.hasOwn(env, \"trustProxy\"),",
        "frozen: Object.isFrozen(env),",
        "}));",
      ].join("\n"),
    ],
    {
      cwd: SERVER_ROOT,
      env: environment,
      encoding: "utf8",
    }
  );
}

function readConfig(result) {
  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`
  );

  return JSON.parse(result.stdout.trim());
}

test("TRUST_PROXY is null when it is not configured", () => {
  const withoutVariable = readConfig(
    runConfig({}, ["TRUST_PROXY"])
  );
  const emptyValue = readConfig(runConfig({ TRUST_PROXY: "" }));

  assert.equal(withoutVariable.trustProxy, null);
  assert.equal(emptyValue.trustProxy, null);
  assert.equal(withoutVariable.hasKey, true);
});

test("TRUST_PROXY accepts an integer number of trusted hops", () => {
  assert.equal(readConfig(runConfig({ TRUST_PROXY: "1" })).trustProxy, 1);
  assert.equal(readConfig(runConfig({ TRUST_PROXY: "0" })).trustProxy, 0);
  assert.equal(
    readConfig(runConfig({ TRUST_PROXY: "2" })).trustProxy,
    2
  );
});

test("TRUST_PROXY accepts surrounding whitespace like the other optional variables", () => {
  assert.equal(
    readConfig(runConfig({ TRUST_PROXY: " 1 " })).trustProxy,
    1
  );
});

test("TRUST_PROXY rejects anything that is not a hop count", () => {
  const rejectedValues = [
    "abc",
    "true",
    "TRUE",
    "false",
    "*",
    "loopback",
    "-1",
    "1.5",
    "1,2",
    "0x1",
    "1 2",
  ];

  for (const value of rejectedValues) {
    const result = runConfig({ TRUST_PROXY: value });

    assert.notEqual(
      result.status,
      0,
      `TRUST_PROXY=${value} was accepted`
    );
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /TRUST_PROXY/
    );
  }
});

test("TRUST_PROXY rejection explains that forged X-Forwarded-For bypasses the rate limiters", () => {
  const result = runConfig({ TRUST_PROXY: "true" });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.match(output, /X-Forwarded-For/);
  assert.match(output, /rate limiter/);
});

test("the exported configuration is frozen", () => {
  assert.equal(
    readConfig(runConfig({ TRUST_PROXY: "1" })).frozen,
    true
  );
});

// The integration behaviour needs a real process because app.js reads
// the configuration once, at require time. The login limiter allows 8
// requests per window, so 10 requests split across two forwarded
// addresses only stay under the limit when each address gets its own
// bucket.
const CLIENT_SCRIPT = [
  'const app = require("./src/app");',
  'const { resetRateLimiters } = require("./src/middlewares/rate-limit.middleware");',
  'const pool = require("./src/database/pool");',
  "(async () => {",
  "  resetRateLimiters();",
  "  const server = app.listen(0);",
  "  await new Promise((resolve) => server.once(\"listening\", resolve));",
  '  const baseUrl = "http://127.0.0.1:" + server.address().port;',
  "  const statuses = [];",
  "  for (let index = 0; index < 10; index += 1) {",
  '    const forwardedFor = index % 2 === 0 ? "203.0.113.10" : "203.0.113.20";',
  "    const response = await fetch(baseUrl + \"/api/auth/login\", {",
  '      method: "POST",',
  "      headers: {",
  '        "content-type": "application/json",',
  '        "x-forwarded-for": forwardedFor,',
  "      },",
  '      body: "{}",',
  "    });",
  "    statuses.push(response.status);",
  "  }",
  '  console.log(JSON.stringify({ statuses }));',
  "  await new Promise((resolve) => server.close(resolve));",
  "  await pool.end();",
  "})();",
].join("\n");

function runClient(overrides = {}, removedKeys = []) {
  const environment = {
    ...process.env,
    ...BASE_ENVIRONMENT,
    ...overrides,
  };

  for (const key of removedKeys) {
    delete environment[key];
  }

  const result = spawnSync(process.execPath, ["-e", CLIENT_SCRIPT], {
    cwd: SERVER_ROOT,
    env: environment,
    encoding: "utf8",
  });

  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`
  );

  return JSON.parse(result.stdout.trim()).statuses;
}

test("without TRUST_PROXY every client shares the proxy bucket and the limiter blocks", () => {
  const statuses = runClient({}, ["TRUST_PROXY"]);

  // One shared bucket of 8: the first eight pass the limiter and the
  // last two are rejected regardless of the forwarded address.
  assert.deepEqual(statuses.slice(0, 8), Array(8).fill(400));
  assert.deepEqual(statuses.slice(8), [429, 429]);
});

test("with TRUST_PROXY=1 each forwarded address gets its own bucket", () => {
  const statuses = runClient({ TRUST_PROXY: "1" });

  // Two buckets of 8 hold 10 requests, so the limiter never trips.
  assert.equal(
    statuses.filter((status) => status === 429).length,
    0
  );
  assert.deepEqual(statuses, Array(10).fill(400));
});

test("without TRUST_PROXY the forwarded address cannot change the observed client", () => {
  const withoutTrust = runClient({}, ["TRUST_PROXY"]);

  assert.equal(withoutTrust.includes(429), true);
});