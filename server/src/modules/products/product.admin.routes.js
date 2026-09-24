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
  listAdministrativeProductsController,
  getAdministrativeProductController,
  createProductController,
  updateProductController,
  changeProductStatusController,
  changeProductAvailabilityController,
} = require("./product.controller");

const {
  validateAdminProductListQuery,
  validateCreateProduct,
  validateProductId,
  validateUpdateProduct,
  validateProductStatus,
  validateProductAvailability,
} = require("./product.validator");

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
  validateAdminProductListQuery,
  listAdministrativeProductsController
);
router.post(
  "/",
  validateCreateProduct,
  createProductController
);
router.patch(
  "/:productId/status",
  validateProductStatus,
  changeProductStatusController
);
router.patch(
  "/:productId/availability",
  validateProductAvailability,
  changeProductAvailabilityController
);
router.patch(
  "/:productId",
  validateUpdateProduct,
  updateProductController
);
router.get(
  "/:productId",
  validateProductId,
  getAdministrativeProductController
);

module.exports = router;
