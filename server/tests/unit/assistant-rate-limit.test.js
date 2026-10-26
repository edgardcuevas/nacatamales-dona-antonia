const test = require("node:test");
const assert = require("node:assert/strict");
const { afterEach } = require("node:test");

const {
  assistantRateLimiter,
  resetAssistantRateLimiters,
  limits,
} = require(
  "../../src/middlewares/assistant-rate-limit.middleware"
);

function execute(request) {
  let nextError;
  let nextCalls = 0;
  assistantRateLimiter(request, {}, (error) => {
    nextCalls += 1;
    nextError = error;
  });
  return { nextCalls, nextError };
}

afterEach(() => {
  resetAssistantRateLimiters();
});

test("the assistant limiter is keyed by user, not by IP", () => {
  const firstUser = { currentUser: { id: 1 }, ip: "10.0.0.1" };
  const secondUser = { currentUser: { id: 2 }, ip: "10.0.0.1" };

  for (let index = 0; index < limits.short.maxRequests; index += 1) {
    assert.equal(
      execute(firstUser).nextError,
      undefined
    );
  }

  assert.equal(
    execute(firstUser).nextError.code,
    "RATE_LIMIT_EXCEEDED"
  );

  // El segundo usuario comparte IP pero no el bucket.
  assert.equal(
    execute(secondUser).nextError,
    undefined
  );
});

test("the short and daily limits are explicit and frozen", () => {
  assert.deepEqual(limits, {
    short: {
      windowMs: 60000,
      maxRequests: 10,
    },
    daily: {
      windowMs: 86400000,
      maxRequests: 100,
    },
  });
  assert.equal(Object.isFrozen(limits), true);
  assert.equal(Object.isFrozen(limits.short), true);
  assert.equal(Object.isFrozen(limits.daily), true);
});
