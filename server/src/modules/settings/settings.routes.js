const express = require("express");

const {
  getPublicSettingsController,
} = require("./settings.controller");

const router = express.Router();

router.get("/", getPublicSettingsController);

module.exports = router;