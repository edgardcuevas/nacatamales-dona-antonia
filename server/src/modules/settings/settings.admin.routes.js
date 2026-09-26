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
  getAdministrativeSettingsController,
  updateSettingsController,
} = require("./settings.controller");
const {
  validateUpdateSettings,
} = require("./settings.validator");

const router = express.Router();

router.use(
  authenticate,
  requireActiveUser,
  authorizeRoles("ADMIN", "EDITOR")
);

router.get("/", getAdministrativeSettingsController);
router.patch("/", validateUpdateSettings, updateSettingsController);

module.exports = router;