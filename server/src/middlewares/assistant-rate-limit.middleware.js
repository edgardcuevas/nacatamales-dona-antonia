const {
  createRateLimiter,
} = require("./rate-limit.middleware");

const ASSISTANT_SHORT_WINDOW_MS = 60 * 1000;
const ASSISTANT_SHORT_MAX_REQUESTS = 10;
const ASSISTANT_DAILY_WINDOW_MS =
  24 * 60 * 60 * 1000;
const ASSISTANT_DAILY_MAX_REQUESTS = 100;

function getAssistantKey(request) {
  const userId = request.currentUser?.id;

  if (
    Number.isSafeInteger(userId) &&
    userId > 0
  ) {
    return `user:${userId}`;
  }

  return `ip:${request.ip || "unknown"}`;
}

const assistantShortStore = new Map();
const assistantDailyStore = new Map();

const assistantShortRateLimiter =
  createRateLimiter({
    windowMs: ASSISTANT_SHORT_WINDOW_MS,
    maxRequests: ASSISTANT_SHORT_MAX_REQUESTS,
    store: assistantShortStore,
    keyGenerator: getAssistantKey,
  });

const assistantDailyRateLimiter =
  createRateLimiter({
    windowMs: ASSISTANT_DAILY_WINDOW_MS,
    maxRequests: ASSISTANT_DAILY_MAX_REQUESTS,
    store: assistantDailyStore,
    keyGenerator: getAssistantKey,
  });

// Both limiters run in series: the short one protects against bursts and
// the daily one against sustained abuse. A request is rejected as soon as
// either of them says no.
function assistantRateLimiter(request, response, next) {
  assistantShortRateLimiter(
    request,
    response,
    (error) => {
      if (error) {
        return next(error);
      }

      return assistantDailyRateLimiter(
        request,
        response,
        next
      );
    }
  );
}

function resetAssistantRateLimiters() {
  assistantShortStore.clear();
  assistantDailyStore.clear();
}

module.exports = {
  assistantRateLimiter,
  assistantShortRateLimiter,
  assistantDailyRateLimiter,
  resetAssistantRateLimiters,
  limits: Object.freeze({
    short: Object.freeze({
      windowMs: ASSISTANT_SHORT_WINDOW_MS,
      maxRequests: ASSISTANT_SHORT_MAX_REQUESTS,
    }),
    daily: Object.freeze({
      windowMs: ASSISTANT_DAILY_WINDOW_MS,
      maxRequests: ASSISTANT_DAILY_MAX_REQUESTS,
    }),
  }),
};
