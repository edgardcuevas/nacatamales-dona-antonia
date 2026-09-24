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
  DB_NAME: "imagekit_config_test",
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
  IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/test-imagekit-id",
  IMAGEKIT_FOLDER: "test-folder",
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
        "keys: Object.keys(env.imagekit).sort(),",
        "frozen: Object.isFrozen(env.imagekit),",
        'host: new URL(env.imagekit.urlEndpoint).hostname,',
        "folder: env.imagekit.folder,",
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

test("ImageKit environment configuration is frozen and contains only the approved keys", () => {
  const result = runConfig();

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout.trim());
  assert.deepEqual(output.keys, [
    "folder",
    "privateKey",
    "publicKey",
    "urlEndpoint",
  ]);
  assert.equal(output.frozen, true);
  assert.equal(output.host, "ik.imagekit.io");
  assert.equal(output.folder, "test-folder");
  assert.equal(
    result.stdout.includes("test_private_key"),
    false
  );
});

test("ImageKit configuration rejects missing variables", () => {
  for (const key of [
    "IMAGEKIT_PUBLIC_KEY",
    "IMAGEKIT_PRIVATE_KEY",
    "IMAGEKIT_URL_ENDPOINT",
    "IMAGEKIT_FOLDER",
  ]) {
    const result = runConfig({}, [key]);
    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      new RegExp(key)
    );
  }
});

test("ImageKit configuration rejects non-HTTPS or non-ImageKit URL endpoints", () => {
  for (const urlEndpoint of [
    "http://ik.imagekit.io/test-imagekit-id",
    "https://imagekit.io.evil.example/test-imagekit-id",
    "https://evil.example/test-imagekit-id",
  ]) {
    const result = runConfig({
      IMAGEKIT_URL_ENDPOINT: urlEndpoint,
    });
    assert.notEqual(result.status, 0);
  }
});

test("ImageKit configuration rejects unsafe folders", () => {
  for (const folder of [
    "../outside",
    "folder/../outside",
    "folder//nested",
    "folder\\nested",
    "/",
  ]) {
    const result = runConfig({
      IMAGEKIT_FOLDER: folder,
    });
    assert.notEqual(result.status, 0);
  }
});
