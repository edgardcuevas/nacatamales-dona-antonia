const express = require("express");

const {
  listPublicProductsController,
  getPublicProductController,
} = require("./product.controller");

const {
  validatePublicProductListQuery,
  validatePublicProductSlug,
} = require("./product.validator");

const router = express.Router();

router.get(
  "/",
  validatePublicProductListQuery,
  listPublicProductsController
);
router.get(
  "/:slug",
  validatePublicProductSlug,
  getPublicProductController
);

module.exports = router;
