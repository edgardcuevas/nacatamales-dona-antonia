const express = require("express");

const {
  loginController,
  refreshController,
  logoutController,
} = require("./auth.controller");

const router = express.Router();

router.post("/login", loginController);
router.post("/refresh", refreshController);
router.post("/logout", logoutController);

module.exports = router;