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
  setVideoThumbnailController,
  revertVideoThumbnailController,
} = require("../youtube/youtube.controller");
const {
  validateVideoUpload,
  validateVideoThumbnail,
  validateVideoStatusId,
} = require("../youtube/youtube.validator");
const {
  youtubeUploadRateLimiter,
  youtubeStatusRateLimiter,
  youtubeThumbnailRateLimiter,
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
// Declared before "/:videoId" style routes so the literal path can
// never be captured as a video ID.
router.put(
  "/:videoId/thumbnail",
  youtubeThumbnailRateLimiter,
  validateVideoStatusId,
  validateVideoThumbnail,
  setVideoThumbnailController
);
router.delete(
  "/:videoId/thumbnail",
  youtubeThumbnailRateLimiter,
  validateVideoStatusId,
  revertVideoThumbnailController
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
