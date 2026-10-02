const AppError = require("../errors/app-error");

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_REQUESTS = 8;
const REFRESH_WINDOW_MS = 5 * 60 * 1000;
const REFRESH_MAX_REQUESTS = 30;
// Upper bound on how often a store is swept for expired entries. This
// is a memory-hygiene interval, never a limiting window: a stale entry
// is treated as absent on read, so the limiter stays exact regardless
// of whether the sweep already ran.
const PRUNE_INTERVAL_MS = 30 * 1000;

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

  // Null until the first sweep. Each limiter owns exactly one store, so
  // this is the per-store sweep clock.
  let lastPruneAt = null;

  return function rateLimit(request, response, next) {
    const currentTime = now();

    // Sweeping the whole map on every request is O(n) per request, which
    // becomes a CPU exhaustion vector once trust proxy gives every
    // visitor their own bucket. Sweeping at most once per interval is
    // enough because an expired entry is still treated as absent when
    // it is read below, so limiting never depends on the sweep.
    if (
      lastPruneAt === null ||
      currentTime - lastPruneAt >= PRUNE_INTERVAL_MS
    ) {
      pruneExpiredEntries(store, currentTime);
      lastPruneAt = currentTime;
    }

    const key = keyGenerator(request);
    const currentEntry = store.get(key);

    // An entry that expired but has not been swept yet must behave
    // exactly like a missing one, otherwise a stale counter would keep
    // rejecting a client that already served its window.
    if (!currentEntry || currentEntry.resetAt <= currentTime) {
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

// The stores are intentionally process-local. The decided production
// topology is a single domain behind a reverse proxy, and TRUST_PROXY
// (see src/config/env.js) tells Express how many proxies to trust so
// these limiters see the real client address. A limiter and its store
// live in the same process, so the budget is per instance, not global.
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
