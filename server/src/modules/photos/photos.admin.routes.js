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
  listAdministrativePhotosController,
  getPhotoController,
  createPhotoController,
  updatePhotoController,
  deletePhotoController,
} = require("./photos.controller");

const {
  validateAdministrativePhotoListQuery,
  validateCreatePhoto,
  validatePhotoId,
  validateUpdatePhoto,
} = require("./photos.validator");

const router = express.Router();
const contentAdminOnly = authorizeRoles("ADMIN", "EDITOR");

router.use(authenticate, requireActiveUser, contentAdminOnly);

router.get(
  "/",
  validateAdministrativePhotoListQuery,
  listAdministrativePhotosController
);
router.post("/", validateCreatePhoto, createPhotoController);
router.patch("/:photoId", validateUpdatePhoto, updatePhotoController);
router.get("/:photoId", validatePhotoId, getPhotoController);
router.delete("/:photoId", validatePhotoId, deletePhotoController);

module.exports = router;