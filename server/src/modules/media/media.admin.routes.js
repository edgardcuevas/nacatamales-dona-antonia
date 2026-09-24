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
  mediaUploadAuthRateLimiter,
  mediaConfirmRateLimiter,
  mediaDeleteRateLimiter,
} = require("../../middlewares/media-rate-limit.middleware");

const {
  listMediaController,
  getMediaController,
  createUploadAuthController,
  confirmMediaController,
  updateMediaController,
  changeMediaStatusController,
  deleteMediaController,
} = require("./media.controller");

const {
  validateUploadAuth,
  validateConfirmMedia,
  validateMediaListQuery,
  validateMediaId,
  validateUpdateMedia,
  validateMediaStatus,
} = require("./media.validator");

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
  "/",
  validateMediaListQuery,
  listMediaController
);
router.post(
  "/upload-auth",
  mediaUploadAuthRateLimiter,
  validateUploadAuth,
  createUploadAuthController
);
router.post(
  "/confirm",
  mediaConfirmRateLimiter,
  validateConfirmMedia,
  confirmMediaController
);
router.patch(
  "/:mediaId/status",
  validateMediaStatus,
  changeMediaStatusController
);
router.patch(
  "/:mediaId",
  validateUpdateMedia,
  updateMediaController
);
router.get(
  "/:mediaId",
  validateMediaId,
  getMediaController
);
router.delete(
  "/:mediaId",
  mediaDeleteRateLimiter,
  validateMediaId,
  deleteMediaController
);

module.exports = router;
