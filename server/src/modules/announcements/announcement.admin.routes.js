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
  listAdministrativeAnnouncementsController,
  getAnnouncementController,
  createAnnouncementController,
  updateAnnouncementController,
  changeAnnouncementStatusController,
  deleteAnnouncementController,
} = require("./announcement.controller");

const {
  validateAdministrativeAnnouncementListQuery,
  validateCreateAnnouncement,
  validateAnnouncementId,
  validateUpdateAnnouncement,
  validateAnnouncementStatus,
} = require("./announcement.validator");

const {
  resendAnnouncementController,
} = require("../notification/notification.controller");

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
  validateAdministrativeAnnouncementListQuery,
  listAdministrativeAnnouncementsController
);
router.post(
  "/",
  validateCreateAnnouncement,
  createAnnouncementController
);
router.patch(
  "/:announcementId/status",
  validateAnnouncementStatus,
  changeAnnouncementStatusController
);
router.post(
  "/:announcementId/notify",
  validateAnnouncementId,
  resendAnnouncementController
);
router.patch(
  "/:announcementId",
  validateUpdateAnnouncement,
  updateAnnouncementController
);
router.get(
  "/:announcementId",
  validateAnnouncementId,
  getAnnouncementController
);
router.delete(
  "/:announcementId",
  validateAnnouncementId,
  deleteAnnouncementController
);

module.exports = router;
