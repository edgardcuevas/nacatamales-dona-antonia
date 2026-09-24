const test = require("node:test");
const assert = require("node:assert/strict");
const {
  afterEach,
} = require("node:test");

const {
  mediaUploadAuthRateLimiter,
  mediaConfirmRateLimiter,
  mediaDeleteRateLimiter,
  resetMediaRateLimiters,
  limits,
} = require("../../src/middlewares/media-rate-limit.middleware");

function execute(middleware, request = { ip: "127.0.0.1" }) {
  let nextError;
  let nextCalls = 0;
  middleware(request, {}, (error) => {
    nextCalls += 1;
    nextError = error;
  });
  return { nextCalls, nextError };
}

afterEach(() => {
  resetMediaRateLimiters();
});

test("media upload-auth, confirm, and delete limiters are independent", () => {
  for (let index = 0; index < limits.uploadAuth.maxRequests; index += 1) {
    assert.equal(
      execute(mediaUploadAuthRateLimiter).nextError,
      undefined
    );
  }
  assert.equal(
    execute(mediaUploadAuthRateLimiter).nextError.code,
    "RATE_LIMIT_EXCEEDED"
  );
  assert.equal(
    execute(mediaConfirmRateLimiter).nextError,
    undefined
  );
  assert.equal(
    execute(mediaDeleteRateLimiter).nextError,
    undefined
  );
});

test("media limiter limits are explicit and frozen", () => {
  assert.deepEqual(limits, {
    uploadAuth: {
      windowMs: 900000,
      maxRequests: 20,
    },
    confirm: {
      windowMs: 900000,
      maxRequests: 30,
    },
    delete: {
      windowMs: 900000,
      maxRequests: 10,
    },
  });
  assert.equal(Object.isFrozen(limits), true);
  assert.equal(Object.isFrozen(limits.uploadAuth), true);
  assert.equal(Object.isFrozen(limits.confirm), true);
  assert.equal(Object.isFrozen(limits.delete), true);
});
