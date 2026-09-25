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
  youtubeOAuthRateLimiter,
  youtubeStatusRateLimiter,
} = require("../../middlewares/youtube-rate-limit.middleware");

const {
  connectChannelController,
  channelStatusController,
} = require("./youtube.controller");

const router = express.Router();
const adminOnly = authorizeRoles("ADMIN");

router.get(
  "/connect",
  authenticate,
  requireActiveUser,
  adminOnly,
  youtubeOAuthRateLimiter,
  connectChannelController
);
router.get(
  "/status",
  authenticate,
  requireActiveUser,
  adminOnly,
  youtubeStatusRateLimiter,
  channelStatusController
);

module.exports = router;
