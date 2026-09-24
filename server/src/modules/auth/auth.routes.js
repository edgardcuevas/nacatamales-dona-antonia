const express = require("express");

const {
  loginController,
  refreshController,
  logoutController,
  logoutAllController,
  meController,
} = require("./auth.controller");

const authenticate = require(
  "../../middlewares/authenticate.middleware"
);
const requireActiveUser = require(
  "../../middlewares/require-active-user.middleware"
);
const {
  loginRateLimiter,
  refreshRateLimiter,
} = require("../../middlewares/rate-limit.middleware");

const router = express.Router();

router.post(
  "/login",
  loginRateLimiter,
  loginController
);
router.post(
  "/refresh",
  refreshRateLimiter,
  refreshController
);
router.post("/logout", logoutController);
router.post(
  "/logout-all",
  authenticate,
  requireActiveUser,
  logoutAllController
);
router.get(
  "/me",
  authenticate,
  requireActiveUser,
  meController
);

module.exports = router;