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
  listAdministrativeVideosController,
  getAdministrativeVideoController,
  createVideoController,
  updateVideoController,
  changeVideoStatusController,
} = require("./video.controller");

const {
  validateAdministrativeVideoListQuery,
  validateCreateVideo,
  validateVideoId,
  validateUpdateVideo,
  validateVideoStatus,
} = require("./video.validator");
const {
  uploadVideoController,
  getVideoStatusController,
} = require("../youtube/youtube.controller");
const {
  validateVideoUpload,
  validateVideoStatusId,
} = require("../youtube/youtube.validator");
const {
  youtubeUploadRateLimiter,
  youtubeStatusRateLimiter,
} = require("../../middlewares/youtube-rate-limit.middleware");

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
  validateAdministrativeVideoListQuery,
  listAdministrativeVideosController
);
router.post(
  "/upload",
  youtubeUploadRateLimiter,
  validateVideoUpload,
  uploadVideoController
);
router.get(
  "/:videoId/status",
  youtubeStatusRateLimiter,
  validateVideoStatusId,
  getVideoStatusController
);
router.post(
  "/",
  validateCreateVideo,
  createVideoController
);
router.patch(
  "/:videoId/status",
  validateVideoStatus,
  changeVideoStatusController
);
router.patch(
  "/:videoId",
  validateUpdateVideo,
  updateVideoController
);
router.get(
  "/:videoId",
  validateVideoId,
  getAdministrativeVideoController
);

module.exports = router;
