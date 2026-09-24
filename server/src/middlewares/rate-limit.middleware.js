const AppError = require("../errors/app-error");

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_REQUESTS = 8;
const REFRESH_WINDOW_MS = 5 * 60 * 1000;
const REFRESH_MAX_REQUESTS = 30;

function createRateLimitError() {
  return new AppError(
    429,
    "RATE_LIMIT_EXCEEDED",
    "Too many requests. Please try again later"
  );
}

function getClientKey(request) {
  return (
    request.ip ||
    request.socket?.remoteAddress ||
    "unknown-client"
  );
}

function validateLimiterConfiguration({
  windowMs,
  maxRequests,
  store,
  now,
}) {
  if (
    !Number.isSafeInteger(windowMs) ||
    windowMs <= 0 ||
    !Number.isSafeInteger(maxRequests) ||
    maxRequests <= 0 ||
    !store ||
    typeof store.get !== "function" ||
    typeof store.set !== "function" ||
    typeof now !== "function"
  ) {
    throw new Error("Invalid rate limiter configuration");
  }
}

function pruneExpiredEntries(store, now) {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

function createRateLimiter({
  windowMs,
  maxRequests,
  store = new Map(),
  now = () => Date.now(),
  keyGenerator = getClientKey,
}) {
  validateLimiterConfiguration({
    windowMs,
    maxRequests,
    store,
    now,
  });

  if (typeof keyGenerator !== "function") {
    throw new Error("Invalid rate limiter configuration");
  }

  return function rateLimit(request, response, next) {
    const currentTime = now();
    pruneExpiredEntries(store, currentTime);

    const key = keyGenerator(request);
    const currentEntry = store.get(key);

    if (!currentEntry) {
      store.set(key, {
        count: 1,
        resetAt: currentTime + windowMs,
      });
      return next();
    }

    currentEntry.count += 1;

    if (currentEntry.count > maxRequests) {
      return next(createRateLimitError());
    }

    return next();
  };
}

// The stores are intentionally process-local; proxy trust remains unset
// until the production topology is confirmed.
const loginStore = new Map();
const refreshStore = new Map();

const loginRateLimiter = createRateLimiter({
  windowMs: LOGIN_WINDOW_MS,
  maxRequests: LOGIN_MAX_REQUESTS,
  store: loginStore,
});

const refreshRateLimiter = createRateLimiter({
  windowMs: REFRESH_WINDOW_MS,
  maxRequests: REFRESH_MAX_REQUESTS,
  store: refreshStore,
});

function resetRateLimiters() {
  loginStore.clear();
  refreshStore.clear();
}

module.exports = {
  createRateLimiter,
  loginRateLimiter,
  refreshRateLimiter,
  resetRateLimiters,
  limits: Object.freeze({
    login: Object.freeze({
      windowMs: LOGIN_WINDOW_MS,
      maxRequests: LOGIN_MAX_REQUESTS,
    }),
    refresh: Object.freeze({
      windowMs: REFRESH_WINDOW_MS,
      maxRequests: REFRESH_MAX_REQUESTS,
    }),
  }),
};
