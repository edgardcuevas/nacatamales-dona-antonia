const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_NAME = "assistant_core_test";
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

const {
  trimHistory,
} = require(
  "../../src/modules/assistant/assistant.service"
);

function makeMessages(count, size) {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: "x".repeat(size),
  }));
}

test("trimHistory keeps at most ten messages", () => {
  const trimmed = trimHistory(makeMessages(15, 10));

  assert.equal(trimmed.length, 10);
});

test("trimHistory drops the oldest until it fits eight thousand characters", () => {
  const messages = makeMessages(9, 1000);
  const trimmed = trimHistory(messages);

  assert.equal(trimmed.length, 8);
  assert.ok(
    trimmed.reduce(
      (total, message) => total + message.content.length,
      0
    ) <= 8000
  );
});

test("trimHistory keeps the newest messages in order", () => {
  const messages = [
    { role: "user", content: "primero" },
    { role: "assistant", content: "segundo" },
    { role: "user", content: "tercero" },
  ];

  const trimmed = trimHistory(messages);

  assert.deepEqual(
    trimmed.map((message) => message.content),
    ["primero", "segundo", "tercero"]
  );
});
