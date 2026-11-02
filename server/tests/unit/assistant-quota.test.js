const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_NAME = "assistant_quota_test";
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
  "http://localhost:3000/api/youtube/oauth/callback";
process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.YOUTUBE_CHANNEL_ID = "UC1234567890123456789012";

const {
  createAssistantQuota,
} = require(
  "../../src/modules/assistant/assistant.quota"
);

function fixedClock(start) {
  let current = start;

  return {
    now: () => current,
    advance: (milliseconds) => {
      current = new Date(
        current.getTime() + milliseconds
      );
    },
  };
}

test("the quota counts provider calls and reports what is left", () => {
  const quota = createAssistantQuota({ limit: 5 });

  assert.deepEqual(quota.current(), {
    limit: 5,
    used: 0,
    remaining: 5,
    exhausted: false,
  });

  quota.record(2);

  assert.deepEqual(quota.current(), {
    limit: 5,
    used: 2,
    remaining: 3,
    exhausted: false,
  });

  quota.record(3);

  assert.deepEqual(quota.current(), {
    limit: 5,
    used: 5,
    remaining: 0,
    exhausted: true,
  });

  assert.equal(quota.record(1).exhausted, true);
});

test("an invalid count neither consumes nor breaks the quota", () => {
  const quota = createAssistantQuota({ limit: 2 });

  for (const count of [0, -1, 1.5, Number.NaN, "2", null]) {
    quota.record(count);
  }

  assert.equal(quota.current().used, 0);
});

test("a zero limit means no limit at all", () => {
  const quota = createAssistantQuota({ limit: 0 });

  quota.record(10_000);

  assert.deepEqual(quota.current(), {
    limit: 0,
    used: 10_000,
    remaining: null,
    exhausted: false,
  });
});

test("the counter restarts when the UTC day changes", () => {
  const clock = fixedClock(
    new Date("2026-10-31T23:59:00Z")
  );
  const quota = createAssistantQuota({
    limit: 3,
    now: clock.now,
  });

  quota.record(3);

  assert.equal(quota.current().exhausted, true);

  clock.advance(2 * 60 * 1000);

  assert.deepEqual(quota.current(), {
    limit: 3,
    used: 0,
    remaining: 3,
    exhausted: false,
  });
});

test("reset clears the counter for the next test", () => {
  const quota = createAssistantQuota({ limit: 4 });

  quota.record(2);
  quota.reset();

  assert.equal(quota.current().used, 0);
});
