const {
  createRateLimiter,
} = require("./rate-limit.middleware");

// Suscribirse es una operacion de visitante anonimo y barata, pero
// escribe en la base: el limite evita que un script llene la tabla.
const PUSH_SUBSCRIPTION_WINDOW_MS =
  15 * 60 * 1000;
const PUSH_SUBSCRIPTION_MAX_REQUESTS = 30;

const pushSubscriptionStore = new Map();

const pushSubscriptionRateLimiter =
  createRateLimiter({
    windowMs: PUSH_SUBSCRIPTION_WINDOW_MS,
    maxRequests:
      PUSH_SUBSCRIPTION_MAX_REQUESTS,
    store: pushSubscriptionStore,
  });

function resetPushRateLimiter() {
  pushSubscriptionStore.clear();
}

module.exports = {
  pushSubscriptionRateLimiter,
  resetPushRateLimiter,
  limits: Object.freeze({
    subscription: Object.freeze({
      windowMs: PUSH_SUBSCRIPTION_WINDOW_MS,
      maxRequests:
        PUSH_SUBSCRIPTION_MAX_REQUESTS,
    }),
  }),
};
