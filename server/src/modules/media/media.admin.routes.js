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
  listMediaController,
  getMediaController,
  updateMediaController,
  changeMediaStatusController,
} = require("./media.controller");

const {
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

module.exports = router;
