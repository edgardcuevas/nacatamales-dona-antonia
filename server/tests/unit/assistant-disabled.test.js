const test = require("node:test");
const assert = require("node:assert/strict");
const { after, before, mock } = require("node:test");

process.env.NODE_ENV = "test";
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_NAME = "assistant_disabled_test";
process.env.DB_USER = "test_user";
process.env.DB_PASSWORD = "test_password";
process.env.JWT_ACCESS_TOKEN_SECRET =
  "test-access-secret-with-at-least-32-characters";
process.env.JWT_ACCESS_TOKEN_TTL = "15m";
process.env.JWT_REFRESH_TOKEN_SECRET =
  "test-refresh-secret-with-at-least-32-characters";
process.env.JWT_REFRESH_TOKEN_TTL = "30d";
process.env.IMAGEKIT_PUBLIC_KEY = "test_public_key";
process.env.IMAGEKIT_PRIVATE_KEY = "test_private_key";
process.env.IMAGEKIT_URL_ENDPOINT =
  "https://ik.imagekit.io/test-imagekit-id";
process.env.IMAGEKIT_FOLDER = "test-folder";
process.env.GOOGLE_CLIENT_ID = "test_google_client_id";
process.env.GOOGLE_CLIENT_SECRET = "test_google_client_secret";
process.env.GOOGLE_REDIRECT_URI =
  "https://example.test/api/admin/youtube/callback";
process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.YOUTUBE_CHANNEL_ID = "UC1234567890123456789012";

const userService = require(
  "../../src/modules/users/user.service"
);
const {
  generateAccessToken,
} = require("../../src/modules/auth/token.service");
const app = require("../../src/app");

let server;
let baseUrl;

before(async () => {
  mock.method(
    userService,
    "getAuthenticatedUser",
    async () => ({
      id: 1,
      email: "admin@example.com",
      role: "ADMIN",
      isActive: true,
    })
  );

  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  const pool = require("../../src/database/pool");
  await pool.end();
});

function token() {
  return generateAccessToken({
    id: 1,
    role: "ADMIN",
  });
}

async function request(path, options = {}) {
  const headers = {};
  if (options.accessToken) {
    headers.authorization = `Bearer ${options.accessToken}`;
  }
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body:
      options.body === undefined
        ? undefined
        : JSON.stringify(options.body),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

test("the assistant reports itself as disabled without a key", async () => {
  const result = await request(
    "/api/admin/assistant/status",
    { accessToken: token() }
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    success: true,
    message: "Assistant status retrieved successfully",
    data: { enabled: false },
  });
});

test("POST /messages answers 503 ASSISTANT_DISABLED", async () => {
  const result = await request(
    "/api/admin/assistant/messages",
    {
      method: "POST",
      accessToken: token(),
      body: { message: "Hola" },
    }
  );

  assert.equal(result.status, 503);
  assert.equal(
    result.body.error.code,
    "ASSISTANT_DISABLED"
  );
});
