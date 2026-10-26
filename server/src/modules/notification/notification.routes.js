const express = require("express");

const {
  pushSubscriptionRateLimiter,
} = require(
  "../../middlewares/push-rate-limit.middleware"
);

const {
  getPublicKeyController,
  subscribeController,
  unsubscribeController,
} = require("./notification.controller");

const {
  validatePushSubscription,
  validatePushUnsubscribe,
} = require("./notification.validator");

const router = express.Router();

router.get(
  "/public-key",
  getPublicKeyController
);

router.post(
  "/subscriptions",
  pushSubscriptionRateLimiter,
  validatePushSubscription,
  subscribeController
);

// POST instead of DELETE: the endpoint is a long URL and the browser
// client only exposes a body-carrying POST/DELETE pair, so a JSON body
// is the simplest way to identify the subscription without putting the
// URL in the query string (and therefore in every access log).
router.post(
  "/subscriptions/unsubscribe",
  pushSubscriptionRateLimiter,
  validatePushUnsubscribe,
  unsubscribeController
);

module.exports = router;
