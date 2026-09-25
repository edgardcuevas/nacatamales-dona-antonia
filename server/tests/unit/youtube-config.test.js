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
  DB_NAME: "youtube_config_test",
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

function runConfig(
  overrides = {},
  removedKeys = []
) {
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
        "keys: Object.keys(env.youtube).sort(),",
        "frozen: Object.isFrozen(env.youtube),",
        "channelId: env.youtube.channelId,",
        "redirectUri: env.youtube.redirectUri,",
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

test("YouTube environment configuration is frozen and validates all required provider settings", () => {
  const result = runConfig();

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout.trim());
  assert.deepEqual(output.keys, [
    "channelId",
    "clientId",
    "clientSecret",
    "redirectUri",
    "tokenEncryptionKey",
  ]);
  assert.equal(output.frozen, true);
  assert.equal(
    output.channelId,
    "UC1234567890123456789012"
  );
  assert.equal(
    output.redirectUri,
    "http://localhost:3000/api/youtube/oauth/callback"
  );
  assert.equal(
    result.stdout.includes("test_google_client_secret"),
    false
  );
});

test("YouTube configuration requires Google credentials, redirect URI, and token encryption key", () => {
  for (const key of [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "YOUTUBE_TOKEN_ENCRYPTION_KEY",
  ]) {
    const result = runConfig({}, [key]);
    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      new RegExp(key)
    );
  }
});

test("YouTube configuration rejects unsafe redirect URLs, channel IDs, and encryption keys", () => {
  const cases = [
    {
      GOOGLE_REDIRECT_URI:
        "http://example.test/api/admin/youtube/callback",
    },
    {
      GOOGLE_REDIRECT_URI:
        "https://example.test/callback?token=secret",
    },
    {
      YOUTUBE_CHANNEL_ID: "not-a-channel",
    },
    {
      YOUTUBE_TOKEN_ENCRYPTION_KEY: "short-key",
    },
  ];

  for (const overrides of cases) {
    const result = runConfig(overrides);
    assert.notEqual(result.status, 0);
  }
});

test("YouTube channel ID remains optional for installations that verify the connected channel dynamically", () => {
  const result = runConfig({}, [
    "YOUTUBE_CHANNEL_ID",
  ]);
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.channelId, null);
});
