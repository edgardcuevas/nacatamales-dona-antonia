const express = require("express");

const {
  youtubeOAuthRateLimiter,
} = require("../../middlewares/youtube-rate-limit.middleware");
const {
  oauthCallbackController,
} = require("./youtube.controller");
const {
  validateOAuthCallback,
} = require("./youtube.validator");

const router = express.Router();

router.get(
  "/callback",
  youtubeOAuthRateLimiter,
  validateOAuthCallback,
  oauthCallbackController
);

module.exports = router;
