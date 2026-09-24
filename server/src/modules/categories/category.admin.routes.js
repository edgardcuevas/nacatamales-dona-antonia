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
  listAdministrativeCategoriesController,
  getAdministrativeCategoryController,
  createCategoryController,
  updateCategoryController,
  changeCategoryStatusController,
} = require("./category.controller");

const {
  validateCategoryListQuery,
  validateCreateCategory,
  validateCategoryId,
  validateUpdateCategory,
  validateCategoryStatus,
} = require("./category.validator");

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
  validateCategoryListQuery,
  listAdministrativeCategoriesController
);
router.post(
  "/",
  validateCreateCategory,
  createCategoryController
);
router.patch(
  "/:categoryId/status",
  validateCategoryStatus,
  changeCategoryStatusController
);
router.patch(
  "/:categoryId",
  validateUpdateCategory,
  updateCategoryController
);
router.get(
  "/:categoryId",
  validateCategoryId,
  getAdministrativeCategoryController
);

module.exports = router;
