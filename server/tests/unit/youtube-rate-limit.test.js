const test = require("node:test");
const assert = require("node:assert/strict");
const {
  afterEach,
} = require("node:test");

const {
  youtubeOAuthRateLimiter,
  youtubeStatusRateLimiter,
  youtubeUploadRateLimiter,
  resetYoutubeRateLimiters,
  limits,
} = require(
  "../../src/middlewares/youtube-rate-limit.middleware"
);

const request = {
  ip: "127.0.0.1",
  socket: {},
};

function run(middleware) {
  let nextError;
  middleware(
    request,
    {},
    (error) => {
      nextError = error;
    }
  );
  return nextError;
}

afterEach(() => {
  resetYoutubeRateLimiters();
});

test("YouTube OAuth, status, and upload limiters have independent limits", () => {
  for (let index = 0; index < limits.oauth.maxRequests; index += 1) {
    assert.equal(
      run(youtubeOAuthRateLimiter),
      undefined
    );
  }
  assert.equal(
    run(youtubeOAuthRateLimiter).code,
    "RATE_LIMIT_EXCEEDED"
  );

  for (let index = 0; index < limits.status.maxRequests; index += 1) {
    assert.equal(
      run(youtubeStatusRateLimiter),
      undefined
    );
  }
  assert.equal(
    run(youtubeStatusRateLimiter).code,
    "RATE_LIMIT_EXCEEDED"
  );

  for (let index = 0; index < limits.upload.maxRequests; index += 1) {
    assert.equal(
      run(youtubeUploadRateLimiter),
      undefined
    );
  }
  assert.equal(
    run(youtubeUploadRateLimiter).code,
    "RATE_LIMIT_EXCEEDED"
  );
});

test("YouTube limiter configuration is explicit and frozen", () => {
  assert.equal(Object.isFrozen(limits), true);
  assert.equal(limits.oauth.maxRequests, 10);
  assert.equal(limits.status.maxRequests, 120);
  assert.equal(limits.upload.maxRequests, 5);
});

test("the status limiter leaves room for the browser upload poll", () => {
  // The admin list polls MAX_POLLS times while a fresh upload finishes.
  // When the two numbers were within 15 of each other the poll died on
  // a 429 instead of reaching its own TIMEOUT branch, which left the
  // row stuck on "Procesando en YouTube" with no way to unlock the
  // thumbnail editor. Keep the ceiling comfortably above the poll.
  const BROWSER_MAX_POLLS = 60;

  assert.ok(
    limits.status.maxRequests > BROWSER_MAX_POLLS,
    `status limit ${limits.status.maxRequests} must exceed the ${BROWSER_MAX_POLLS} poll attempts`
  );
});
