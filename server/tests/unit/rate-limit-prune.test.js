const test = require("node:test");
const assert = require("node:assert/strict");

const AppError = require("../../src/errors/app-error");
const {
  createRateLimiter,
} = require("../../src/middlewares/rate-limit.middleware");

// The sweep is a memory-hygiene concern only. What must never change is
// the limiting itself: an entry that has expired but has not been
// swept yet has to behave exactly like a missing one, otherwise a stale
// counter would keep rejecting a client that already served its window
// just because the cleanup has not run yet.
function execute(limiter, request = {}) {
  let nextCalls = 0;
  let nextError;

  limiter(request, {}, (error) => {
    nextCalls += 1;
    nextError = error;
  });

  return { nextCalls, nextError };
}

function expectAllowed(result) {
  assert.equal(result.nextCalls, 1);
  assert.equal(result.nextError, undefined);
}

function expectBlocked(result) {
  assert.equal(result.nextCalls, 1);
  assert.ok(result.nextError instanceof AppError);
  assert.equal(result.nextError.statusCode, 429);
  assert.equal(result.nextError.code, "RATE_LIMIT_EXCEEDED");
}

// Wraps a Map so a test can count how many times the limiter walked the
// whole store, which is what the interval is meant to bound.
function createCountingStore(entries = []) {
  const backing = new Map(entries);
  const counters = {
    sweeps: 0,
    entriesVisited: 0,
    deletions: 0,
  };

  const store = {
    get: (key) => backing.get(key),
    set: (key, value) => backing.set(key, value),
    delete: (key) => {
      counters.deletions += 1;
      return backing.delete(key);
    },
    entries() {
      counters.sweeps += 1;
      const visited = counters.entriesVisited;
      return (function* generate() {
        for (const [key, entry] of backing) {
          counters.entriesVisited += 1;
          void visited;
          yield [key, entry];
        }
      })();
    },
    get size() {
      return backing.size;
    },
  };

  return { store, backing, counters };
}

test("an expired entry that has not been swept yet limits exactly like a missing one", () => {
  const store = new Map();
  let currentTime = 0;
  const limiter = createRateLimiter({
    windowMs: 1000,
    maxRequests: 1,
    store,
    now: () => currentTime,
  });
  const request = { ip: "203.0.113.10" };

  // One request inside the window creates the entry and sweeps once.
  expectAllowed(execute(limiter, request));
  expectBlocked(execute(limiter, request));

  // Still inside the same second: the entry is live, so the stale
  // counter must keep rejecting.
  currentTime = 500;
  expectBlocked(execute(limiter, request));

  // The window is over but the sweep has not run (500ms < 30s). The
  // client must be served again anyway, exactly as if the entry had
  // been pruned.
  currentTime = 2000;
  expectAllowed(execute(limiter, request));

  // And the new window starts from scratch.
  expectBlocked(execute(limiter, request));

  currentTime = 3500;
  expectAllowed(execute(limiter, request));
});

test("the sweep runs at most once per interval and eventually removes stale entries", () => {
  const { store, backing, counters } =
    createCountingStore([
      [
        "203.0.113.10",
        { count: 5, resetAt: 1000 },
      ],
    ]);
  let currentTime = 0;
  const limiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 10,
    store,
    now: () => currentTime,
  });

  // The first request triggers the initial sweep, which reclaims the
  // planted entry because its window already closed.
  currentTime = 2_000;
  expectAllowed(
    execute(limiter, { ip: "203.0.113.99" })
  );
  assert.equal(counters.sweeps, 1);
  assert.equal(counters.deletions, 1);
  assert.equal(backing.has("203.0.113.10"), false);

  // Plant a stale entry and confirm it survives the requests that
  // arrive inside the interval.
  backing.set("203.0.113.10", {
    count: 5,
    resetAt: 2_500,
  });

  for (const offset of [3, 4, 5]) {
    currentTime = offset * 1000;
    expectAllowed(
      execute(limiter, { ip: "198.51.100.1" })
    );
  }

  assert.equal(
    counters.sweeps,
    1,
    "no sweep should happen inside the interval"
  );
  assert.equal(
    backing.has("203.0.113.10"),
    true,
    "the stale entry is only waiting to be swept"
  );

  // Crossing the 30s interval counted from the last sweep (t=2000, so
  // the next sweep is due at t=32000) makes the next request sweep.
  currentTime = 40_000;
  expectAllowed(
    execute(limiter, { ip: "198.51.100.1" })
  );

  assert.equal(counters.sweeps, 2);
  assert.ok(counters.deletions >= 2);
  assert.equal(
    backing.has("203.0.113.10"),
    false,
    "the stale entry is finally reclaimed"
  );
});

test("the store is not walked on every request when many clients share the limiter", () => {
  const { store, backing, counters } =
    createCountingStore();
  let currentTime = 0;
  const limiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 100,
    store,
    now: () => currentTime,
  });

  const clientCount = 500;

  for (let index = 0; index < clientCount; index += 1) {
    expectAllowed(
      execute(limiter, {
        ip: `203.0.113.${index % 250}`,
      })
    );
  }

  assert.equal(backing.size, 250);

  // Before the interval existed this was 500 full walks over a growing
  // map. Now only the first request sweeps.
  assert.equal(
    counters.sweeps,
    1,
    `expected 1 sweep for ${clientCount} requests, got ${counters.sweeps}`
  );
  assert.equal(
    counters.entriesVisited,
    0,
    "the first sweep happened on an empty store"
  );
});

test("sweeping still happens on schedule after the interval with a populated store", () => {
  const { store, backing, counters } =
    createCountingStore();
  let currentTime = 0;
  const limiter = createRateLimiter({
    windowMs: 1_000,
    maxRequests: 100,
    store,
    now: () => currentTime,
  });

  for (let index = 0; index < 250; index += 1) {
    expectAllowed(
      execute(limiter, { ip: `203.0.113.${index}` })
    );
  }
  assert.equal(backing.size, 250);
  assert.equal(counters.sweeps, 1);

  // Nothing was swept while the 250 requests arrived inside the
  // interval, so no entry was ever visited.
  assert.equal(counters.entriesVisited, 0);

  // One interval later, everything from the previous window is expired
  // and a single walk reclaims all of it.
  currentTime = 60_000;
  expectAllowed(
    execute(limiter, { ip: "198.51.100.7" })
  );

  assert.equal(counters.sweeps, 2);
  assert.equal(counters.deletions, 250);
  assert.equal(backing.size, 1);
  assert.equal(
    counters.entriesVisited,
    250,
    "one full walk over the 250 expired entries, not one per request"
  );
});