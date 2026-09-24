const express = require("express");

const {
  listPublicVideosController,
  getPublicVideoController,
} = require("./video.controller");

const {
  validatePublicVideoId,
} = require("./video.validator");

const router = express.Router();

router.get("/", listPublicVideosController);
router.get(
  "/:videoId",
  validatePublicVideoId,
  getPublicVideoController
);

module.exports = router;
