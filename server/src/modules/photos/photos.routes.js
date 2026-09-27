const express = require("express");

const {
  listPublicPhotosController,
  getPublicPhotoController,
} = require("./photos.controller");

const {
  validatePhotoId,
} = require("./photos.validator");

const router = express.Router();

router.get("/", listPublicPhotosController);
router.get("/:photoId", validatePhotoId, getPublicPhotoController);

module.exports = router;