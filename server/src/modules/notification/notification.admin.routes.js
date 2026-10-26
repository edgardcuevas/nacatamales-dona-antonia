const express = require("express");

const authenticate = require(
  "../../middlewares/authenticate.middleware"
);
const requireActiveUser = require(
  "../../middlewares/require-active-user.middleware"
);
const authorizeRoles = require(
  "../../middlewares/authorize-roles.middleware"
);

const {
  getSubscriptionStatsController,
} = require("./notification.controller");

const router = express.Router();
const contentAdminOnly = authorizeRoles(
  "ADMIN",
  "EDITOR"
);

router.use(
  authenticate,
  requireActiveUser,
  contentAdminOnly
);

router.get(
  "/stats",
  getSubscriptionStatsController
);

module.exports = router;
