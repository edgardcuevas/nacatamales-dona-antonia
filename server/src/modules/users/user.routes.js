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
  listUsersController,
  getUserController,
  createUserController,
  changeUserRoleController,
  changeUserStatusController,
  resetUserPasswordController,
  revokeUserSessionsController,
} = require("./user.controller");

const {
  validateUserListQuery,
  validateCreateUser,
  validateUserId,
  validateRoleUpdate,
  validateStatusUpdate,
  validatePasswordUpdate,
  validateSessionsRequest,
} = require("./user.validator");

const router = express.Router();
const adminOnly = authorizeRoles("ADMIN");

router.use(
  authenticate,
  requireActiveUser,
  adminOnly
);

router.get(
  "/",
  validateUserListQuery,
  listUsersController
);
router.post(
  "/",
  validateCreateUser,
  createUserController
);
router.patch(
  "/:userId/role",
  validateRoleUpdate,
  changeUserRoleController
);
router.patch(
  "/:userId/status",
  validateStatusUpdate,
  changeUserStatusController
);
router.patch(
  "/:userId/password",
  validatePasswordUpdate,
  resetUserPasswordController
);
router.delete(
  "/:userId/sessions",
  validateSessionsRequest,
  revokeUserSessionsController
);
router.get(
  "/:userId",
  validateUserId,
  getUserController
);

module.exports = router;
